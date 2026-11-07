"""Runtime settings, read from ``RV_*`` environment variables (and an optional ``.env``)."""

from pathlib import Path
from typing import Annotated, Any, Final, Literal, Self

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from rv_contracts import Plan

DEV_JWT_SECRET: Final = "dev-only-insecure-jwt-secret-change-me-0123456789abcdef"
"""Default signing key for local development. Refused when ``RV_ENVIRONMENT=production``."""


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

    signup_plan: Plan = Plan.PRO
    """Plan given to organizations created by ``POST /auth/signup``."""

    log_level: str = "INFO"
    log_json: bool = True

    @field_validator("cors_origins", mode="before")
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
