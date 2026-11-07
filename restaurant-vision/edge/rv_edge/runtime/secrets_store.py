"""Local secrets file: pairing (device id, site id, device token), camera connection details
(RTSP URLs with credentials) and other local-only setup state.

The file is ``<data_dir>/secrets.json``, written atomically with user-only permissions (see
:mod:`rv_edge.runtime.fsutil` for the Windows caveat). Nothing in it is ever sent to the cloud:
the cloud only receives ``rv_contracts`` models, which reject unknown fields.

``repr``/``str`` of every object here redact the token and URL credentials, so logging them is
safe. Use :func:`redact_url` for any URL that might carry credentials.
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Any, Literal
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_serializer
from rv_contracts import Id, PairResponse

from rv_edge.interfaces import SourceSpec

from .fsutil import ensure_private_dir, read_json, write_private_json

log = logging.getLogger(__name__)

SECRETS_FILE = "secrets.json"
REDACTED = "***"
_SENSITIVE_QUERY_KEYS = frozenset(
    {"user", "username", "password", "pass", "pwd", "passwd", "token", "auth", "key", "secret"}
)

OptionValue = str | int | float | bool


def has_credentials(url: str) -> bool:
    """True if ``url`` carries user info or credential-like query parameters."""
    parts = urlsplit(url)
    if "@" in parts.netloc:
        return True
    return any(k.lower() in _SENSITIVE_QUERY_KEYS for k, _ in parse_qsl(parts.query))


def redact_url(url: str) -> str:
    """``url`` with user info and credential-like query values replaced by ``***``."""
    parts = urlsplit(url)
    if not parts.scheme:
        return url  # a file path
    netloc = parts.netloc
    if "@" in netloc:
        userinfo, host = netloc.rsplit("@", 1)
        netloc = f"{REDACTED}:{REDACTED}@{host}" if ":" in userinfo else f"{REDACTED}@{host}"
    query = parts.query
    if query:
        pairs = [
            (k, REDACTED if k.lower() in _SENSITIVE_QUERY_KEYS else v)
            for k, v in parse_qsl(query, keep_blank_values=True)
        ]
        query = urlencode(pairs, safe="*")
    return urlunsplit((parts.scheme, netloc, parts.path, query, parts.fragment))


def with_credentials(url: str, username: str | None, password: str | None) -> str:
    """``url`` with its user info replaced by ``username[:password]`` (percent-encoded)."""
    if not username:
        return url
    parts = urlsplit(url)
    host = parts.netloc.rsplit("@", 1)[-1]
    userinfo = quote(username, safe="")
    if password:
        userinfo += ":" + quote(password, safe="")
    return urlunsplit((parts.scheme, f"{userinfo}@{host}", parts.path, parts.query, parts.fragment))


class CameraSecret(BaseModel):
    """How to open one camera (stored locally only). ``url`` may contain credentials."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    camera_id: Id
    kind: Literal["rtsp", "file"]
    url: SecretStr
    loop: bool = True
    options: dict[str, OptionValue] = Field(default_factory=dict)

    @field_serializer("url", when_used="json")
    def _reveal_url(self, value: SecretStr) -> str:
        return value.get_secret_value()

    @property
    def redacted_url(self) -> str:
        return redact_url(self.url.get_secret_value())

    @property
    def has_credentials(self) -> bool:
        return has_credentials(self.url.get_secret_value())

    def to_spec(self) -> SourceSpec:
        """The vision ``SourceSpec`` (contains the real URL: never log or serialize it)."""
        return SourceSpec(
            camera_id=self.camera_id,
            kind=self.kind,
            url=self.url.get_secret_value(),
            loop=self.loop,
            options=dict(self.options),
        )

    def __repr__(self) -> str:
        return (
            f"CameraSecret(camera_id={self.camera_id!r}, kind={self.kind!r}, "
            f"url={self.redacted_url!r}, loop={self.loop!r})"
        )

    __str__ = __repr__


class LocalSecrets(BaseModel):
    """Contents of ``secrets.json``."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    device_id: Id | None = None
    site_id: Id | None = None
    device_token: SecretStr | None = None
    cloud_url: str | None = None
    """Cloud base URL the device was paired with (the token is only valid there)."""
    setup_pin_hash: str | None = Field(default=None, repr=False)
    uniform_hsv: tuple[float, float, float] | None = None
    """Site staff-uniform colour (HSV) from calibration."""
    cameras: dict[str, CameraSecret] = Field(default_factory=dict)

    @field_serializer("device_token", when_used="json")
    def _reveal_token(self, value: SecretStr | None) -> str | None:
        return None if value is None else value.get_secret_value()

    @property
    def paired(self) -> bool:
        return bool(self.device_id and self.site_id and self.device_token and self.cloud_url)


class SecretsStore:
    """Thread-safe accessor for ``<data_dir>/secrets.json``. Loaded once, kept in memory, and
    rewritten atomically on every change."""

    def __init__(self, data_dir: Path) -> None:
        self._path = ensure_private_dir(Path(data_dir)) / SECRETS_FILE
        self._lock = threading.Lock()
        raw = read_json(self._path)
        self._data = LocalSecrets.model_validate(raw) if raw is not None else LocalSecrets()

    @property
    def path(self) -> Path:
        return self._path

    @property
    def data(self) -> LocalSecrets:
        with self._lock:
            return self._data

    # pairing ----------------------------------------------------------------------------
    @property
    def paired(self) -> bool:
        return self.data.paired

    @property
    def device_id(self) -> str | None:
        return self.data.device_id

    @property
    def site_id(self) -> str | None:
        return self.data.site_id

    @property
    def cloud_url(self) -> str | None:
        return self.data.cloud_url

    def device_token(self) -> str | None:
        """The bearer token (secret). Only the cloud sync and pairing use it."""
        token = self.data.device_token
        return None if token is None else token.get_secret_value()

    def set_pairing(self, response: PairResponse, cloud_url: str) -> None:
        self._update(
            device_id=response.device_id,
            site_id=response.site_id,
            device_token=SecretStr(response.token),
            cloud_url=cloud_url.rstrip("/"),
        )
        log.info("paired as device %s for site %s", response.device_id, response.site_id)

    # setup PIN and calibration -------------------------------------------------------------
    @property
    def setup_pin_hash(self) -> str | None:
        return self.data.setup_pin_hash

    def set_setup_pin_hash(self, value: str) -> None:
        self._update(setup_pin_hash=value)

    @property
    def uniform_hsv(self) -> tuple[float, float, float] | None:
        return self.data.uniform_hsv

    def set_uniform_hsv(self, hsv: tuple[float, float, float]) -> None:
        self._update(uniform_hsv=hsv)

    # cameras -------------------------------------------------------------------------------
    def cameras(self) -> dict[str, CameraSecret]:
        return dict(self.data.cameras)

    def camera_specs(self) -> dict[str, SourceSpec]:
        return {cid: cam.to_spec() for cid, cam in self.data.cameras.items()}

    def upsert_camera(self, camera: CameraSecret) -> None:
        with self._lock:
            cameras = {**self._data.cameras, camera.camera_id: camera}
            self._write(self._data.model_copy(update={"cameras": cameras}))
        log.info("stored camera %r", camera)

    def delete_camera(self, camera_id: str) -> bool:
        with self._lock:
            if camera_id not in self._data.cameras:
                return False
            cameras = {k: v for k, v in self._data.cameras.items() if k != camera_id}
            self._write(self._data.model_copy(update={"cameras": cameras}))
        return True

    # internals -----------------------------------------------------------------------------
    def _update(self, **changes: Any) -> None:
        with self._lock:
            self._write(self._data.model_copy(update=changes))

    def _write(self, data: LocalSecrets) -> None:
        # Re-validate so a bad update can never be persisted.
        validated = LocalSecrets.model_validate(data.model_dump())
        write_private_json(self._path, validated.model_dump(mode="json"))
        self._data = validated

    def __repr__(self) -> str:
        data = self.data
        return (
            f"SecretsStore(path={str(self._path)!r}, device_id={data.device_id!r}, "
            f"site_id={data.site_id!r}, paired={data.paired}, cameras={list(data.cameras)!r})"
        )
