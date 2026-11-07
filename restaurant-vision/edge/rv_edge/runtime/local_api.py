"""Local LAN API (FastAPI, ``0.0.0.0:8787``): offline alerts for waiters and the setup wizard.

Open on the LAN (waiter phones, no accounts):

* ``GET /local/health`` -> ``HealthStatus``
* ``GET /local/state`` -> ``LiveSnapshot``
* ``GET /local/setup/status`` -> :class:`SetupStatus` (what the setup wizard needs to start)
* ``WS /local/ws``: each event as one ``EdgeEvent`` JSON message, plus every
  ``state_interval_s`` (and on connect) ``{"type": "live.snapshot", "snapshot": LiveSnapshot}``
* ``POST /local/alerts/{alert_id}/ack`` -> ``AlertView`` (``via="local"``, no identity)
* ``POST /local/setup-pin`` ``{pin}``: choose the setup PIN, first time only

Setup (header ``X-Setup-Pin`` required; 401 otherwise, 429 after repeated wrong PINs):
cameras CRUD (credentials are write-only), discovery, blurred snapshot, config, coverage,
uniform calibration and pairing. The custom header also blocks cross-site requests (it forces
a CORS preflight, which this app never allows).

The built edge-ui is served at ``/`` (SPA fallback, e.g. ``/local-alerts``) when
``settings.edge_ui_dir`` exists.
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import (
    APIRouter,
    Depends,
    FastAPI,
    Header,
    HTTPException,
    Request,
    Response,
    WebSocket,
    status,
)
from fastapi import Path as PathParam
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, Field, SecretStr, model_validator
from rv_contracts import (
    ID_PATTERN,
    AckVia,
    AlertView,
    CameraStatus,
    CoverageReport,
    HealthStatus,
    Id,
    LiveSnapshot,
    SiteConfig,
)
from starlette.concurrency import run_in_threadpool

from .pairing import PairingError
from .probes import run_discovery
from .runtime import CalibrationError, ConfigRejected, EdgeRuntime
from .secrets_store import CameraSecret, OptionValue, with_credentials
from .settings import EdgeSettings
from .setup_pin import PIN_MAX_LEN, PIN_MIN_LEN, PinGuard, hash_pin, verify_pin

log = logging.getLogger(__name__)

STATE_MESSAGE_TYPE = "live.snapshot"
NO_STORE = {"Cache-Control": "no-store, max-age=0", "Pragma": "no-cache"}


# ----------------------------------------------------------------------------- local models
class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SetupStatus(_Model):
    version: str
    pin_set: bool
    paired: bool
    site_id: str | None
    device_id: str | None
    cloud_url: str | None
    cloud_online: bool
    last_sync_error: str | None
    configured: bool
    config_version: int
    pending_config_push: bool
    outbox_depth: int
    camera_count: int


class SetupPinIn(_Model):
    pin: str = Field(min_length=PIN_MIN_LEN, max_length=PIN_MAX_LEN)


class CameraIn(_Model):
    """New camera. ``username``/``password`` are merged into the URL and never returned."""

    camera_id: Id
    kind: Literal["rtsp", "file"] = "rtsp"
    url: str = Field(min_length=1, max_length=2048)
    username: str | None = Field(default=None, max_length=256)
    password: str | None = Field(default=None, max_length=256)
    loop: bool = True
    options: dict[str, OptionValue] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _check_url(self) -> CameraIn:
        if self.kind == "rtsp" and not self.url.startswith(
            ("rtsp://", "rtsps://", "http://", "https://")
        ):
            raise ValueError("rtsp cameras need an rtsp:// (or http://) URL")
        return self


class CameraUpdate(_Model):
    """Partial update. Omit ``url`` to keep the stored one (and its credentials)."""

    kind: Literal["rtsp", "file"] | None = None
    url: str | None = Field(default=None, min_length=1, max_length=2048)
    username: str | None = Field(default=None, max_length=256)
    password: str | None = Field(default=None, max_length=256)
    loop: bool | None = None
    options: dict[str, OptionValue] | None = None


class CameraOut(_Model):
    """A camera as listed to the setup wizard. ``url`` is always redacted."""

    camera_id: str
    kind: str
    url: str
    has_credentials: bool
    loop: bool
    in_config: bool
    name: str | None
    enabled: bool | None
    status: CameraStatus | None
    fps: float | None
    last_frame_age_s: float | None


class CalibrateIn(_Model):
    camera_id: Id
    box: tuple[float, float, float, float]
    """Normalized ``x1, y1, x2, y2`` around a staff member's torso."""

    @model_validator(mode="after")
    def _check_box(self) -> CalibrateIn:
        x1, y1, x2, y2 = self.box
        if not (0 <= x1 < x2 <= 1 and 0 <= y1 < y2 <= 1):
            raise ValueError("box must be normalized x1 < x2, y1 < y2 within [0, 1]")
        return self


class CalibrateOut(_Model):
    uniform_hsv: tuple[float, float, float]


class PairIn(_Model):
    code: str = Field(min_length=1, max_length=16)
    cloud_url: str = Field(min_length=1, max_length=2048)


class PairOut(_Model):
    device_id: str
    site_id: str


class DiscoveryOut(_Model):
    available: bool
    devices: list[Any]
    error: str | None


# ----------------------------------------------------------------------------- app factory
def create_local_app(
    runtime: EdgeRuntime,
    settings: EdgeSettings,
    *,
    state_interval_s: float = 5.0,
    pin_guard: PinGuard | None = None,
) -> FastAPI:
    """Build the LAN app for ``runtime``. The runtime is started/stopped by the caller."""
    app = FastAPI(
        title="Restaurant Vision edge (LAN)",
        version=runtime.version,
        docs_url="/local/docs",
        redoc_url=None,
        openapi_url="/local/openapi.json",
    )
    guard = pin_guard or PinGuard()
    pin_lock = threading.Lock()

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Never echo request input back: it may contain camera credentials.
        errors = [
            {"loc": e.get("loc"), "msg": e.get("msg"), "type": e.get("type")} for e in exc.errors()
        ]
        return JSONResponse(status_code=422, content={"detail": jsonable_encoder(errors)})

    def stored_pin_hash() -> str | None:
        return settings.setup_pin_hash or runtime.secrets.setup_pin_hash

    def require_pin(
        request: Request,
        x_setup_pin: Annotated[str | None, Header(alias="X-Setup-Pin")] = None,
    ) -> None:
        client = request.client.host if request.client else "unknown"
        if guard.locked(client):
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "too many wrong PINs; wait")
        stored = stored_pin_hash()
        if stored is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "setup PIN not set")
        if not x_setup_pin or not verify_pin(x_setup_pin, stored):
            guard.failure(client)
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid setup PIN")
        guard.success(client)

    # --------------------------------------------------------------- open endpoints (LAN)
    @app.get("/local/health", response_model=HealthStatus)
    def health() -> HealthStatus:
        return HealthStatus(version=runtime.version)

    @app.get("/local/state", response_model=LiveSnapshot)
    def state() -> LiveSnapshot:
        return runtime.live_snapshot()

    @app.get("/local/setup/status", response_model=SetupStatus)
    def setup_status() -> SetupStatus:
        sync = runtime.sync
        secrets = runtime.secrets
        return SetupStatus(
            version=runtime.version,
            pin_set=stored_pin_hash() is not None,
            paired=secrets.paired,
            site_id=secrets.site_id,
            device_id=secrets.device_id,
            cloud_url=secrets.cloud_url or settings.cloud_url,
            cloud_online=bool(sync and sync.online),
            last_sync_error=sync.last_error if sync else None,
            configured=runtime.config is not None,
            config_version=runtime.config_store.config_version,
            pending_config_push=runtime.config_store.has_pending_push,
            outbox_depth=runtime.outbox_depth(),
            camera_count=len(secrets.cameras()),
        )

    @app.post("/local/alerts/{alert_id}/ack", response_model=AlertView)
    def ack_alert(alert_id: Annotated[str, PathParam(pattern=ID_PATTERN)]) -> AlertView:
        try:
            view = runtime.ack_alert(alert_id, via=AckVia.LOCAL)
        except TimeoutError as exc:
            raise HTTPException(status.HTTP_504_GATEWAY_TIMEOUT, "analytics busy") from exc
        except RuntimeError as exc:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
        if view is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "no open alert with this id")
        return view

    @app.post("/local/setup-pin", status_code=status.HTTP_201_CREATED)
    def set_setup_pin(body: SetupPinIn) -> dict[str, bool]:
        with pin_lock:
            if stored_pin_hash() is not None:
                raise HTTPException(status.HTTP_409_CONFLICT, "setup PIN already set")
            runtime.secrets.set_setup_pin_hash(hash_pin(body.pin))
        log.info("setup PIN set")
        return {"pin_set": True}

    @app.websocket("/local/ws")
    async def events_ws(websocket: WebSocket) -> None:
        await websocket.accept()
        sub = runtime.broadcaster.subscribe()

        async def state_message() -> str:
            snapshot = await run_in_threadpool(runtime.live_snapshot)
            return json.dumps(
                {"type": STATE_MESSAGE_TYPE, "snapshot": snapshot.model_dump(mode="json")}
            )

        async def receiver() -> None:
            while True:
                message = await websocket.receive()
                if message["type"] == "websocket.disconnect":
                    return

        async def sender() -> None:
            loop = asyncio.get_running_loop()
            await websocket.send_text(await state_message())
            next_state = loop.time() + state_interval_s
            while True:
                remaining = next_state - loop.time()
                if remaining <= 0:
                    await websocket.send_text(await state_message())
                    next_state = loop.time() + state_interval_s
                    continue
                try:
                    message = await asyncio.wait_for(sub.queue.get(), timeout=remaining)
                except TimeoutError:
                    continue
                await websocket.send_text(message)

        tasks = {asyncio.create_task(receiver()), asyncio.create_task(sender())}
        try:
            done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
            for task in done:
                if not task.cancelled() and task.exception() is not None:
                    log.debug("local websocket closed: %r", task.exception())
        finally:
            runtime.broadcaster.unsubscribe(sub)

    # --------------------------------------------------------------- setup (PIN required)
    setup = APIRouter(prefix="/local", dependencies=[Depends(require_pin)])

    def camera_out(camera: CameraSecret) -> CameraOut:
        config = runtime.config
        cam_cfg = next(
            (c for c in (config.cameras if config else []) if c.camera_id == camera.camera_id),
            None,
        )
        health = next((h for h in runtime.camera_health() if h.camera_id == camera.camera_id), None)
        return CameraOut(
            camera_id=camera.camera_id,
            kind=camera.kind,
            url=camera.redacted_url,
            has_credentials=camera.has_credentials,
            loop=camera.loop,
            in_config=cam_cfg is not None,
            name=cam_cfg.name if cam_cfg else None,
            enabled=cam_cfg.enabled if cam_cfg else None,
            status=health.status if health else None,
            fps=health.fps if health else None,
            last_frame_age_s=health.last_frame_age_s if health else None,
        )

    @setup.get("/cameras", response_model=list[CameraOut])
    def list_cameras() -> list[CameraOut]:
        return [camera_out(c) for c in runtime.secrets.cameras().values()]

    @setup.post("/cameras", response_model=CameraOut, status_code=status.HTTP_201_CREATED)
    def add_camera(body: CameraIn) -> CameraOut:
        if body.camera_id in runtime.secrets.cameras():
            raise HTTPException(status.HTTP_409_CONFLICT, "camera already exists")
        camera = CameraSecret(
            camera_id=body.camera_id,
            kind=body.kind,
            url=SecretStr(with_credentials(body.url, body.username, body.password)),
            loop=body.loop,
            options=body.options,
        )
        runtime.secrets.upsert_camera(camera)
        runtime.reconcile_cameras()
        return camera_out(camera)

    @setup.post("/cameras/discover", response_model=DiscoveryOut)
    def discover_cameras() -> DiscoveryOut:
        return DiscoveryOut.model_validate(run_discovery())

    @setup.put("/cameras/{camera_id}", response_model=CameraOut)
    def update_camera(
        camera_id: Annotated[str, PathParam(pattern=ID_PATTERN)], body: CameraUpdate
    ) -> CameraOut:
        existing = runtime.secrets.cameras().get(camera_id)
        if existing is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "unknown camera")
        url = body.url if body.url is not None else existing.url.get_secret_value()
        camera = CameraSecret(
            camera_id=camera_id,
            kind=body.kind or existing.kind,
            url=SecretStr(with_credentials(url, body.username, body.password)),
            loop=existing.loop if body.loop is None else body.loop,
            options=existing.options if body.options is None else body.options,
        )
        runtime.secrets.upsert_camera(camera)
        runtime.reconcile_cameras()
        return camera_out(camera)

    @setup.delete("/cameras/{camera_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_camera(camera_id: Annotated[str, PathParam(pattern=ID_PATTERN)]) -> Response:
        if not runtime.secrets.delete_camera(camera_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "unknown camera")
        runtime.reconcile_cameras()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @setup.get("/cameras/{camera_id}/snapshot.jpg", response_class=Response)
    def camera_snapshot(camera_id: Annotated[str, PathParam(pattern=ID_PATTERN)]) -> Response:
        try:
            jpeg = runtime.snapshot_jpeg(camera_id)
        except KeyError as exc:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "unknown camera") from exc
        except Exception as exc:
            log.warning("snapshot of camera %s failed: %s", camera_id, exc)
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "snapshot failed") from exc
        return Response(content=jpeg, media_type="image/jpeg", headers=NO_STORE)

    @setup.get("/config", response_model=SiteConfig)
    def get_config() -> SiteConfig:
        config = runtime.config
        if config is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "no site config yet")
        return config

    @setup.put("/config", response_model=SiteConfig)
    def put_config(body: SiteConfig) -> SiteConfig:
        try:
            return runtime.apply_local_config(body)
        except ConfigRejected as exc:
            raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc

    @setup.get("/coverage", response_model=CoverageReport)
    def coverage() -> CoverageReport:
        config = runtime.config
        uncovered = config.coverage() if config is not None else []
        return CoverageReport(site_id=runtime.site_id, uncovered_table_ids=uncovered)

    @setup.post("/uniform/calibrate", response_model=CalibrateOut)
    def calibrate_uniform(body: CalibrateIn) -> CalibrateOut:
        try:
            hsv = runtime.calibrate_uniform(body.camera_id, body.box)
        except KeyError as exc:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "unknown camera") from exc
        except CalibrationError as exc:
            raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
        return CalibrateOut(uniform_hsv=hsv)

    @setup.post("/pair", response_model=PairOut)
    def pair(body: PairIn) -> PairOut:
        try:
            result = runtime.pair(body.code, body.cloud_url)
        except PairingError as exc:
            code = exc.status_code
            http = (
                status.HTTP_400_BAD_REQUEST
                if code is not None and 400 <= code < 500
                else status.HTTP_502_BAD_GATEWAY
            )
            if code is None and "pairing code" in str(exc):
                http = status.HTTP_400_BAD_REQUEST
            raise HTTPException(http, str(exc)) from exc
        return PairOut(device_id=result.device_id, site_id=result.site_id)

    app.include_router(setup)
    _mount_ui(app, settings.edge_ui_dir)
    return app


def _mount_ui(app: FastAPI, ui_dir: Path) -> None:
    """Serve the built edge-ui with SPA fallback, if it exists."""
    if not ui_dir.is_dir():
        log.info("edge-ui not found at %s; serving the API only", ui_dir)
        return
    root = ui_dir.resolve()
    index = root / "index.html"

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path == "local" or path.startswith("local/"):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")
        if path:
            candidate = (root / path).resolve()
            if candidate.is_file() and candidate.is_relative_to(root):
                return FileResponse(candidate)
        if index.is_file():
            return FileResponse(index, headers={"Cache-Control": "no-cache"})
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")
