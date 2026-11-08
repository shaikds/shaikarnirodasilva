"""Edge process settings: a YAML file plus ``RV_EDGE_*`` environment overrides.

Example ``edge.yaml``::

    data_dir: /var/lib/rv-edge
    cloud_url: https://app.example.com
    local_port: 8787
    detector_backend: auto
    model_path: /opt/rv-edge/models/yolox_tiny.onnx
    cpu_limit_pct: 70

Every field can be overridden by an environment variable named ``RV_EDGE_<FIELD>`` (for
example ``RV_EDGE_LOCAL_PORT=9000``); an empty value resets an optional field to None.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, field_validator

ENV_PREFIX = "RV_EDGE_"
CONFIG_ENV = "RV_EDGE_CONFIG"
"""Environment variable naming the YAML settings file (used when ``--config`` is absent)."""

DEFAULT_CONFIG_FILE = Path("edge.yaml")

_REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_UI_DIR = _REPO_ROOT / "web" / "apps" / "edge-ui" / "dist"

DetectorBackend = Literal["auto", "yolox", "simulated"]


def default_data_dir() -> Path:
    """Per-user data directory: ``%LOCALAPPDATA%\\RestaurantVision\\edge`` on Windows,
    ``~/.local/share/rv-edge`` elsewhere. Services should set ``data_dir`` explicitly."""
    local_app_data = os.environ.get("LOCALAPPDATA")
    if os.name == "nt" and local_app_data:
        return Path(local_app_data) / "RestaurantVision" / "edge"
    return Path.home() / ".local" / "share" / "rv-edge"


class EdgeSettings(BaseModel):
    """Settings of one edge process. Not secret: tokens and camera URLs live in the secrets
    store (:mod:`rv_edge.runtime.secrets_store`)."""

    model_config = ConfigDict(extra="forbid", validate_assignment=True)

    data_dir: Path = Field(default_factory=default_data_dir)
    """Secrets, site config and the outbox database."""
    cloud_url: str | None = None
    """Cloud base URL, e.g. ``https://app.example.com``. Pairing stores the URL it used,
    which then takes precedence."""
    local_host: str = "0.0.0.0"
    local_port: int = Field(default=8787, ge=1, le=65535)
    local_url: str | None = None
    """The LAN base URL waiter phones use for offline alerts, reported to the cloud in every
    heartbeat (``DeviceStatus.local_url``). Default: derived from the LAN IP and
    ``local_port`` (:mod:`rv_edge.runtime.netinfo`); set it behind NAT or Docker port mappings
    or to use a DNS name, e.g. ``http://rv-edge.local:8787``."""
    setup_pin_hash: str | None = None
    """Pre-provisioned setup PIN hash (see :func:`rv_edge.runtime.setup_pin.hash_pin`).
    When unset, the PIN is chosen once through ``POST /local/setup-pin``."""
    detector_backend: DetectorBackend = "auto"
    model_path: Path | None = None
    """YOLOX model; default ``edge/models/yolox_tiny.onnx`` (or ``$RV_EDGE_MODEL``)."""
    cpu_limit_pct: float = Field(default=70.0, gt=0, le=100)
    """Back off frame processing when this process uses more than this share of the machine's
    total CPU (percent)."""
    edge_ui_dir: Path = DEFAULT_UI_DIR
    """Built edge-ui (served at ``/`` when the directory exists)."""
    log_level: str = "INFO"

    @field_validator("cloud_url")
    @classmethod
    def _normalize_cloud_url(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        value = value.strip().rstrip("/")
        if not value.startswith(("http://", "https://")):
            raise ValueError("cloud_url must start with http:// or https://")
        return value

    @field_validator("local_url")
    @classmethod
    def _normalize_local_url(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        value = value.strip().rstrip("/")
        if not value.startswith(("http://", "https://")) or any(c.isspace() for c in value):
            raise ValueError("local_url must be an http:// or https:// URL")
        if len(value) > 256:
            raise ValueError("local_url is too long")
        return value

    @field_validator("log_level")
    @classmethod
    def _upper_level(cls, value: str) -> str:
        return value.upper()


def _env_overrides(env: Mapping[str, str]) -> dict[str, Any]:
    overrides: dict[str, Any] = {}
    for name, field in EdgeSettings.model_fields.items():
        key = ENV_PREFIX + name.upper()
        if key in env:
            raw = env[key]
            optional = field.default is None
            overrides[name] = None if optional and raw == "" else raw
    return overrides


def resolve_config_path(path: Path | None, env: Mapping[str, str] | None = None) -> Path | None:
    """The settings file to load: ``path``, else ``$RV_EDGE_CONFIG``, else ``./edge.yaml``
    if it exists, else None (defaults only)."""
    env = os.environ if env is None else env
    if path is not None:
        return path
    if env.get(CONFIG_ENV):
        return Path(env[CONFIG_ENV])
    return DEFAULT_CONFIG_FILE if DEFAULT_CONFIG_FILE.is_file() else None


def load_settings(
    path: Path | None = None,
    *,
    env: Mapping[str, str] | None = None,
    overrides: Mapping[str, Any] | None = None,
) -> EdgeSettings:
    """Load settings from YAML (if any), then ``RV_EDGE_*`` env vars, then ``overrides``
    (CLI flags). Relative paths in the YAML are relative to the YAML file's directory."""
    env = os.environ if env is None else env
    config_path = resolve_config_path(path, env)
    data: dict[str, Any] = {}
    if config_path is not None:
        loaded = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
        if not isinstance(loaded, dict):
            raise ValueError(f"{config_path}: expected a mapping at the top level")
        base = config_path.resolve().parent
        for key in ("data_dir", "model_path", "edge_ui_dir"):
            value = loaded.get(key)
            if isinstance(value, str) and value and not Path(value).is_absolute():
                loaded[key] = str(base / value)
        data.update(loaded)
    data.update(_env_overrides(env))
    if overrides:
        data.update({k: v for k, v in overrides.items() if v is not None})
    return EdgeSettings.model_validate(data)
