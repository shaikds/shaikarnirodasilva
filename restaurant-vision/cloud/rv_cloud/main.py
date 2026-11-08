"""Application factory. ``uvicorn rv_cloud.main:app`` serves the API at ``/api/v1``.

``app`` is created lazily on first access (from ``RV_*`` settings), so importing this module
for :func:`create_app` (tests, tools) has no side effects.
"""

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

from . import __version__
from .api.routers import api_router, health
from .clock import Clock, SystemClock
from .config import Settings
from .db import create_db_engine, create_session_factory, upgrade_head
from .errors import DomainError, RateLimited
from .logsetup import AccessLogMiddleware, configure_logging
from .push import Notifier, NullNotifier, WebPushNotifier
from .realtime import EventBroker, InMemoryBroker
from .security import PasswordHasher, RateLimiter, TokenService
from .services.retention import apply_retention
from .state import AppState

API_PREFIX = "/api/v1"
RETENTION_FIRST_RUN_S = 60.0
"""Delay of the first periodic retention run after startup (at most the interval)."""
log = logging.getLogger(__name__)


def run_retention(state: AppState) -> int:
    """Apply the retention policy once with the app's settings and clock. Rows deleted."""
    settings = state.settings
    with state.session_factory() as session:
        result = apply_retention(
            session,
            now=state.clock.now(),
            raw_events_days=settings.retention_raw_events_days,
            metrics_days=settings.retention_metrics_days,
        )
        session.commit()
    if result.total:
        log.info("data retention applied", extra={"deleted": result.deleted})
    return result.total


async def _retention_loop(state: AppState) -> None:
    """Lightweight periodic retention (see ``Settings.retention_interval_s``)."""
    interval = state.settings.retention_interval_s
    delay = min(RETENTION_FIRST_RUN_S, interval)
    while True:
        await asyncio.sleep(delay)
        delay = interval
        try:
            await run_in_threadpool(run_retention, state)
        except Exception:  # keep the loop alive; the next run retries
            log.exception("data retention run failed")


class SPAStaticFiles(StaticFiles):
    """Static files with single-page-app fallback: unknown paths serve ``index.html``
    (except ``api/...``, which stays a 404)."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code != 404 or path.split("/", 1)[0] == "api":
                raise
            return await super().get_response("index.html", scope)


def _default_notifier(settings: Settings) -> Notifier:
    if settings.push_enabled and settings.vapid_private_key is not None:
        return WebPushNotifier(
            settings.vapid_private_key.get_secret_value(), settings.vapid_subject
        )
    return NullNotifier()


def _validation_errors(exc: RequestValidationError) -> list[dict[str, Any]]:
    """Validation errors without echoing submitted values (passwords, tokens)."""
    errors: list[dict[str, Any]] = []
    for err in exc.errors():
        item = {k: v for k, v in err.items() if k in ("type", "loc", "msg")}
        item["loc"] = list(item.get("loc", ()))
        errors.append(item)
    return errors


def _install_error_handlers(app: FastAPI) -> None:
    async def domain_error(request: Request, exc: Exception) -> Response:
        assert isinstance(exc, DomainError)
        headers = None
        if isinstance(exc, RateLimited):
            headers = {"Retry-After": str(int(exc.retry_after_s + 0.999))}
        if exc.status_code == 401:
            headers = {"WWW-Authenticate": "Bearer"}
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code, headers=headers)

    async def validation_error(request: Request, exc: Exception) -> Response:
        assert isinstance(exc, RequestValidationError)
        return JSONResponse({"detail": _validation_errors(exc)}, status_code=422)

    async def unhandled(request: Request, exc: Exception) -> Response:
        request_id = getattr(request.state, "request_id", None)
        log.exception("unhandled error", extra={"request_id": request_id, "path": request.url.path})
        return JSONResponse(
            {"detail": "Internal server error", "request_id": request_id}, status_code=500
        )

    app.add_exception_handler(DomainError, domain_error)
    app.add_exception_handler(RequestValidationError, validation_error)
    app.add_exception_handler(Exception, unhandled)


def _mount_static(app: FastAPI, settings: Settings) -> None:
    for mount_path, directory, name in (
        ("/waiter", settings.waiter_dir, "waiter"),
        ("/", settings.dashboard_dir, "dashboard"),
    ):
        if directory is None:
            continue
        if not Path(directory, "index.html").is_file():
            log.warning("static dir has no index.html; not served", extra={"dir": str(directory)})
            continue
        app.mount(mount_path, SPAStaticFiles(directory=directory, html=True), name=name)


def create_app(
    settings: Settings | None = None,
    *,
    clock: Clock | None = None,
    broker: EventBroker | None = None,
    notifier: Notifier | None = None,
) -> FastAPI:
    """Build the FastAPI app. Collaborators default from ``settings``; tests inject fakes."""
    settings = settings or Settings()
    configure_logging(settings.log_level, settings.log_json)
    clock = clock or SystemClock()
    engine = create_db_engine(settings.database_url)
    state = AppState(
        settings=settings,
        engine=engine,
        session_factory=create_session_factory(engine),
        clock=clock,
        broker=broker or InMemoryBroker(),
        notifier=notifier or _default_notifier(settings),
        hasher=PasswordHasher(settings),
        tokens=TokenService(settings, clock),
        login_limiter=RateLimiter(settings.login_max_attempts, settings.login_window_s, clock),
        pair_limiter=RateLimiter(settings.pair_max_attempts, settings.pair_window_s, clock),
    )

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        if settings.auto_migrate:
            upgrade_head(engine)
        log.info("rv_cloud started", extra={"version": __version__, "env": settings.environment})
        retention = (
            asyncio.create_task(_retention_loop(state))
            if settings.retention_interval_s > 0
            else None
        )
        try:
            yield
        finally:
            if retention is not None:
                retention.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await retention
            engine.dispose()

    app = FastAPI(
        title="Restaurant Vision Cloud",
        version=__version__,
        lifespan=lifespan,
        openapi_url=f"{API_PREFIX}/openapi.json",
        docs_url=f"{API_PREFIX}/docs",
        redoc_url=None,
    )
    app.state.rv = state
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["ETag", "Retry-After", "X-Request-ID"],
    )
    app.add_middleware(AccessLogMiddleware)
    _install_error_handlers(app)
    app.include_router(api_router, prefix=API_PREFIX)
    app.include_router(health.router)  # also at the root: GET /healthz
    _mount_static(app, settings)
    return app


_app: FastAPI | None = None


def __getattr__(name: str) -> Any:
    """Lazily build the module-level ``app`` for ``uvicorn rv_cloud.main:app``."""
    global _app
    if name == "app":
        if _app is None:
            _app = create_app()
        return _app
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
