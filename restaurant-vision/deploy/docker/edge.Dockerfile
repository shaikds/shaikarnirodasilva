# Restaurant Vision edge image: rv_edge (+ rv_sim for demos), the YOLOX-tiny model and the
# edge-ui setup wizard. Used by the docker-compose demo (edge-sim) and for the mini-PC appliance.
#
# Build from restaurant-vision/ (the build context):
#   docker build -f deploy/docker/edge.Dockerfile -t restaurant-vision/edge .
#   docker build ... --build-arg FETCH_MODEL=false     # no download; mount the model instead
#
# Run on a mini PC (host network so ONVIF discovery and RTSP reach the cameras):
#   docker run -d --name rv-edge --restart unless-stopped --network host \
#     -v rv-edge-data:/var/lib/rv-edge restaurant-vision/edge
#   docker exec rv-edge rv-edge pair --code ABC123 --cloud https://cloud.example.com
#   docker restart rv-edge
# Custom settings: mount a YAML over /etc/rv-edge/edge.yaml (see deploy/edge/edge.example.yaml).
# Model without a download: -v /path/to/models:/opt/rv-edge/models:ro
#
# Layout (same as the Linux installer): /opt/rv-edge/{venv,models,edge-ui},
# /etc/rv-edge/edge.yaml, /var/lib/rv-edge (secrets, site config, outbox).

ARG NODE_IMAGE=node:22-slim
ARG PYTHON_IMAGE=python:3.12-slim

# ------------------------------------------------------- edge-ui (setup wizard), when present
FROM ${NODE_IMAGE} AS edge-ui
ENV CI=true \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /web
COPY web/ ./
RUN --mount=type=cache,id=rv-pnpm-store,target=/pnpm-store \
    mkdir -p /out \
 && if [ -f apps/edge-ui/package.json ]; then \
      pnpm install --frozen-lockfile --store-dir /pnpm-store --filter "./apps/edge-ui..." \
      && pnpm --filter ./apps/edge-ui run build \
      && cp -r apps/edge-ui/dist/. /out/; \
    else \
      echo "web/apps/edge-ui not found: the image ships without the setup wizard UI"; \
    fi

# ------------------------------------------------------------------- model: YOLOX-tiny (ONNX)
FROM ${PYTHON_IMAGE} AS model
ARG FETCH_MODEL=true
COPY edge/scripts/fetch_models.py /tmp/fetch_models.py
# A model already in edge/models/ is reused (fetch_models.py verifies its SHA-256 and only
# downloads when it is missing or wrong).
RUN --mount=type=bind,source=edge,target=/ctx/edge \
    mkdir -p /models \
 && if [ -f /ctx/edge/models/yolox_tiny.onnx ]; then cp /ctx/edge/models/yolox_tiny.onnx /models/; fi \
 && if [ "$FETCH_MODEL" = "true" ]; then \
      python /tmp/fetch_models.py --model tiny --dest /models; \
    else \
      echo "FETCH_MODEL=false: mount the model at /opt/rv-edge/models"; \
    fi

# ---------------------------------------------------- python: rv_contracts + rv_edge + rv_sim
FROM ${PYTHON_IMAGE} AS py-build
ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /opt/rv-edge/venv
ENV PATH=/opt/rv-edge/venv/bin:$PATH
COPY contracts/ /src/contracts/
COPY edge/pyproject.toml /src/edge/pyproject.toml
COPY edge/rv_edge/ /src/edge/rv_edge/
COPY simulator/ /src/simulator/
RUN pip install /src/contracts /src/edge /src/simulator

# ------------------------------------------------------------------------------------ runtime
FROM ${PYTHON_IMAGE} AS runtime
LABEL org.opencontainers.image.title="restaurant-vision-edge" \
      org.opencontainers.image.description="Restaurant Vision edge engine (anonymous on-site video analytics)"
# Runtime libraries for the OpenCV (headless) and ONNX Runtime wheels.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libglib2.0-0 libgomp1 \
 && rm -rf /var/lib/apt/lists/*
RUN groupadd --system --gid 10002 rv-edge \
 && useradd --system --uid 10002 --gid rv-edge --home-dir /var/lib/rv-edge --no-create-home \
      --shell /usr/sbin/nologin rv-edge \
 && mkdir -p /var/lib/rv-edge /etc/rv-edge \
 && chown rv-edge:rv-edge /var/lib/rv-edge \
 && chmod 0700 /var/lib/rv-edge
COPY --from=py-build /opt/rv-edge/venv /opt/rv-edge/venv
COPY --from=model /models /opt/rv-edge/models
COPY --from=edge-ui /out /opt/rv-edge/edge-ui
COPY simulator/scenarios/ /opt/rv-edge/simulator/scenarios/
COPY deploy/edge/edge.example.yaml /etc/rv-edge/edge.yaml
ENV PATH=/opt/rv-edge/venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    RV_EDGE_CONFIG=/etc/rv-edge/edge.yaml
VOLUME ["/var/lib/rv-edge"]
# Relative scenario paths (simulator/scenarios/...) resolve from here.
WORKDIR /opt/rv-edge
USER rv-edge
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=4 \
  CMD ["python", "-c", "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8787/local/health', timeout=4).status == 200 else 1)"]
ENTRYPOINT ["rv-edge"]
CMD ["run"]
