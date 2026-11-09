"""Runtime settings, read from ``RV_*`` environment variables (and an optional ``.env``)."""

from pathlib import Path
from typing import Annotated, Any, Final, Literal, Self

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from rv_contracts import Plan

DEV_JWT_SECRET: Final = "dev-only-insecure-jwt-secret-change-me-0123456789abcdef"
"""Default signing key for local development. Refused when ``RV_ENVIRONMENT=production``."""

DEFAULT_PUSH_ALLOWED_HOSTS: Final = (
    "fcm.googleapis.com",
    "updates.push.services.mozilla.com",
    "*.push.services.mozilla.com",
    "*.notify.windows.com",
    "web.push.apple.com",
    "*.push.apple.com",
)
"""Hosts of the browsers' Web Push services (Chrome/Edge via FCM, Firefox, Windows, Safari)."""


class Settings(BaseSettings):
    """All configuration of the cloud app. Every field maps to ``RV_<NAME>``."""

    model_config = SettingsConfigDict(env_prefix="RV_", env_file=".env", extra="ignore")

    environment: Literal["dev", "test", "production"] = "dev"
    database_url: str = "sqlite:///./rv_cloud.sqlite3"
    """SQLAlchemy URL. Postgres: ``postgresql+psycopg://user:pass@host/db``."""
    auto_migrate: bool = True
    """Run ``alembic upgrade head`` on startup. Disable in multi-worker production deploys and
    run the migration as a release step instead."""

    jwt_secret: SecretStr = SecretStr(DEV_JWT_SECRET)
    jwt_algorithm: Literal["HS256", "HS384", "HS512"] = "HS256"
    access_token_ttl_s: int = Field(default=15 * 60, gt=0)
    refresh_token_ttl_s: int = Field(default=30 * 24 * 3600, gt=0)

    argon2_time_cost: int = Field(default=3, ge=1)
    argon2_memory_cost_kib: int = Field(default=64 * 1024, ge=8)
    argon2_parallelism: int = Field(default=4, ge=1)

    vapid_private_key: SecretStr | None = None
    """URL-safe base64 raw P-256 private key (``python -m rv_cloud.tools.gen_vapid``)."""
    vapid_public_key: str | None = None
    """URL-safe base64 uncompressed P-256 public key, served to browsers."""
    vapid_subject: str = "mailto:ops@example.com"
    push_allowed_hosts: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: list(DEFAULT_PUSH_ALLOWED_HOSTS)
    )
    """Web Push endpoint hosts accepted for subscriptions (comma-separated or JSON list;
    ``*.example.com`` matches subdomains). Anything else is refused with 422, so a tenant
    cannot make the server POST to internal addresses."""
    push_workers: int = Field(default=4, ge=1)
    """Background threads that send Web Push (never on the ingest request path)."""
    push_queue_size: int = Field(default=1000, ge=1)
    """Alert batches waiting to be pushed; more are dropped (logged)."""
    push_max_sends_per_batch: int = Field(default=500, ge=1)
    """Cap on push requests for one ingest batch (alerts x subscriptions)."""
    push_timeout_s: float = Field(default=5.0, gt=0)
    """Timeout of one push request."""
    push_batch_deadline_s: float = Field(default=60.0, gt=0)
    """Sending for one ingest batch stops after this long."""

    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://localhost:5174"]
    )
    """Comma-separated list (or JSON list) of allowed browser origins."""

    business_day_start_hour: int = Field(default=5, ge=0, le=23)
    """Local hour at which a business day (shift report) starts."""

    dashboard_dir: Path | None = None
    """Built dashboard (``web/apps/dashboard/dist``), served at ``/`` when set."""
    waiter_dir: Path | None = None
    """Built waiter PWA (``web/apps/waiter/dist``), served at ``/waiter`` when set."""

    pairing_code_ttl_s: int = Field(default=600, gt=0)
    login_max_attempts: int = Field(default=5, ge=1)
    login_window_s: float = Field(default=300.0, gt=0)
    pair_max_attempts: int = Field(default=10, ge=1)
    pair_window_s: float = Field(default=60.0, gt=0)

    ws_revalidate_interval_s: float = Field(default=30.0, gt=0)
    """Live WebSockets re-check token expiry on every message and, at least this often (cached
    in between), that the user still exists with the same token version and still has access
    to the site; otherwise they are closed with 4401 or 4403."""
    max_event_future_s: float = Field(default=300.0, ge=0)
    """Edge events whose ``ts`` is further ahead of the server clock are rejected (422), so a
    device with a wrong clock cannot freeze the live projections. 0 disables the check (only
    for sped-up demos, whose simulated clock runs ahead of the wall clock)."""

    signup_plan: Plan = Plan.PRO
    """Plan given to organizations created by ``POST /auth/signup``."""

    retention_raw_events_days: int = Field(default=90, ge=1)
    """Raw edge events (by cloud receive time) and processed edge commands are deleted after
    this many days. Events whose ``ts`` is older than this are treated as already processed
    (counted as duplicates, not projected), so a redelivery after retention never double
    counts."""
    retention_metrics_days: int = Field(default=400, ge=1)
    """Derived metrics (snapshots, queue facts, alerts, table sessions) are deleted after this
    many days. Reports cannot reach further back."""
    retention_interval_s: float = Field(default=6 * 3600.0, ge=0)
    """How often the app applies retention (first run shortly after startup); 0 disables it
    (then run ``python -m rv_cloud.tools.retention`` from cron)."""

    log_level: str = "INFO"
    log_json: bool = True

    @field_validator("cors_origins", "push_allowed_hosts", mode="before")
    @classmethod
    def _split_origins(cls, value: Any) -> Any:
        if isinstance(value, str):
            text = value.strip()
            if text.startswith("["):
                import json

                return json.loads(text)
            return [part.strip() for part in text.split(",") if part.strip()]
        return value

    @model_validator(mode="after")
    def _check_production(self) -> Self:
        if self.environment == "production" and self.jwt_secret.get_secret_value() in (
            DEV_JWT_SECRET,
            "",
        ):
            raise ValueError("RV_JWT_SECRET must be set in production")
        return self

    @property
    def push_enabled(self) -> bool:
        """True when both VAPID keys are configured."""
        return self.vapid_private_key is not None and bool(self.vapid_public_key)
