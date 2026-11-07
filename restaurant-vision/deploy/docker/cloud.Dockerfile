# Restaurant Vision cloud image: the FastAPI API (rv_cloud) plus the built dashboard (served at /)
# and waiter PWA (served at /waiter/).
#
# Build from restaurant-vision/ (the build context):
#   docker build -f deploy/docker/cloud.Dockerfile -t restaurant-vision/cloud .
# Run (Postgres URL and a real JWT secret are required outside a demo):
#   docker run -p 8000:8000 \
#     -e RV_DATABASE_URL=postgresql+psycopg://rv:secret@db:5432/rv \
#     -e RV_ENVIRONMENT=production -e RV_JWT_SECRET=$(openssl rand -hex 32) \
#     restaurant-vision/cloud
#
# Base images are build args so a registry mirror can be used, for example:
#   --build-arg PYTHON_IMAGE=mirror.gcr.io/library/python:3.12-slim
#   --build-arg NODE_IMAGE=mirror.gcr.io/library/node:22-slim
# Files sent to the build: see cloud.Dockerfile.dockerignore (BuildKit reads it automatically).

ARG NODE_IMAGE=node:22-slim
ARG PYTHON_IMAGE=python:3.12-slim

# ------------------------------------------------------------------ web: dashboard + waiter PWA
FROM ${NODE_IMAGE} AS web
ENV CI=true \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /web
COPY web/ ./
# pnpm version comes from "packageManager" in web/package.json (corepack).
RUN --mount=type=cache,id=rv-pnpm-store,target=/pnpm-store \
    pnpm install --frozen-lockfile --store-dir /pnpm-store
# The cloud serves the waiter PWA under /waiter/, so it is built with that base path.
RUN pnpm --filter @rv/dashboard run build \
 && pnpm --filter @rv/waiter run build --base=/waiter/

# ------------------------------------------------------- compliance templates as PDF downloads
# The dashboard's Compliance page links to /compliance/<name>.pdf (docs/compliance/*.md).
FROM ${PYTHON_IMAGE} AS compliance
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0 fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir --disable-pip-version-check "markdown>=3.5,<4" "weasyprint>=62,<69"
COPY docs/compliance/ /src/docs/compliance/
COPY deploy/scripts/compliance_pdfs.py /src/compliance_pdfs.py
RUN python /src/compliance_pdfs.py /src/docs/compliance /out/compliance

# ------------------------------------------------------------ python: rv_contracts + rv_cloud
FROM ${PYTHON_IMAGE} AS py-build
ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
COPY contracts/ /src/contracts/
COPY cloud/ /src/cloud/
RUN pip install /src/contracts /src/cloud

# ------------------------------------------------------------------------------------ runtime
FROM ${PYTHON_IMAGE} AS runtime
LABEL org.opencontainers.image.title="restaurant-vision-cloud" \
      org.opencontainers.image.description="Restaurant Vision multi-tenant cloud (API, dashboard, waiter PWA)"
RUN groupadd --system --gid 10001 rv \
 && useradd --system --uid 10001 --gid rv --home-dir /app --no-create-home --shell /usr/sbin/nologin rv
COPY --from=py-build /opt/venv /opt/venv
COPY --from=web /web/apps/dashboard/dist /app/web/dashboard
COPY --from=web /web/apps/waiter/dist /app/web/waiter
COPY --from=compliance /out/compliance /app/web/dashboard/compliance
ENV PATH=/opt/venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    RV_DASHBOARD_DIR=/app/web/dashboard \
    RV_WAITER_DIR=/app/web/waiter
WORKDIR /app
USER rv
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=6 \
  CMD ["python", "-c", "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=4).status == 200 else 1)"]
# One worker: realtime fan-out and rate limits are per process (see cloud/README.md).
# Behind a reverse proxy set FORWARDED_ALLOW_IPS to the proxy's address so rate limits see
# client IPs. --no-access-log: the app writes its own access log without client IPs.
CMD ["uvicorn", "rv_cloud.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--no-access-log"]
