"""Local secrets file: pairing (device id, site id, device token), camera connection details
(RTSP URLs with credentials) and other local-only setup state.

The file is ``<data_dir>/secrets.json``, written atomically with user-only permissions (see
:mod:`rv_edge.runtime.fsutil` for the Windows caveat). Nothing in it is ever sent to the cloud:
the cloud only receives ``rv_contracts`` models, which reject unknown fields.

``repr``/``str`` of every object here redact the token and URL credentials, so logging them is
safe. Use :func:`redact_url` for any URL that might carry credentials (and :func:`redact_text`
for free text, such as an exception message, that might contain one).

Camera URLs are typed by installers, so passwords often contain unencoded ``/``, ``#``, ``?``
or ``@``. ``urllib.parse`` splits such URLs in the wrong place (the password ends up in the
host, path, query or fragment), so these helpers parse the authority themselves: after
``scheme://`` the user info ends at the **last** ``@``, and whatever follows must look like
``host[:port]``. When it does not, the result is redacted to ``scheme://***@<host guess>`` or
``scheme://***``; the raw URL is never returned when in doubt.
"""

from __future__ import annotations

import logging
import re
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal
from urllib.parse import quote, unquote

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
_SCHEME_RE = re.compile(r"[A-Za-z][A-Za-z0-9+.\-]*://")
_HOSTPORT_RE = re.compile(r"(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9._~%\-]*)(?::[0-9]{0,5})?")
_HOST_GUESS_RE = re.compile(r"\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.\-]+")
_URL_IN_TEXT_RE = re.compile(r"[A-Za-z][A-Za-z0-9+.\-]*://\S+")

OptionValue = str | int | float | bool


@dataclass(frozen=True, slots=True)
class _Authority:
    """A ``scheme://`` URL split by :func:`_split`. ``hostport`` is None when the text after
    the user info is not a plausible ``host[:port]`` (then ``after`` is that raw text)."""

    scheme: str
    userinfo: str | None
    """Everything between ``scheme://`` and the last ``@`` (None without ``@``)."""
    after: str
    """Everything after the user info (the whole remainder without ``@``)."""
    hostport: str | None
    tail: str
    """Path, query and fragment (empty when ``hostport`` is None)."""


def _split(url: str) -> _Authority | None:
    """Split ``scheme://[userinfo@]host[:port][/path][?query][#fragment]``; None when ``url``
    has no scheme (a file path)."""
    match = _SCHEME_RE.match(url)
    if match is None:
        return None
    scheme = url[: match.end() - 3]
    rest = url[match.end() :]
    at = rest.rfind("@")
    userinfo, after = (rest[:at], rest[at + 1 :]) if at >= 0 else (None, rest)
    end = next((i for i, ch in enumerate(after) if ch in "/?#"), len(after))
    hostport, tail = after[:end], after[end:]
    if _HOSTPORT_RE.fullmatch(hostport) is None:
        return _Authority(scheme, userinfo, after, None, "")
    return _Authority(scheme, userinfo, after, hostport, tail)


def _redact_query(query: str) -> tuple[str, bool]:
    """``query`` with credential-like values replaced; other pairs are kept verbatim."""
    found = False
    pairs = []
    for pair in query.split("&"):
        key, sep, _value = pair.partition("=")
        if unquote(key).strip().lower() in _SENSITIVE_QUERY_KEYS:
            found = True
            pair = f"{key}={REDACTED}" if sep else REDACTED
        pairs.append(pair)
    return "&".join(pairs), found


def _analyze(url: str) -> tuple[str, bool]:
    """``(redacted url, has credentials)``. Never raises; never returns credentials."""
    parts = _split(url)
    if parts is None:  # a file path (no scheme)
        if "@" not in url:
            return url, False
        return f"{REDACTED}@{url.rsplit('@', 1)[1]}", True
    if parts.hostport is None:  # cannot tell where the host starts: hide everything
        guess = _HOST_GUESS_RE.match(parts.after) if parts.userinfo is not None else None
        if guess is None:
            return f"{parts.scheme}://{REDACTED}", True
        return f"{parts.scheme}://{REDACTED}@{guess.group(0)}", True
    found = bool(parts.userinfo)
    userinfo = ""
    if parts.userinfo:
        userinfo = f"{REDACTED}:{REDACTED}@" if ":" in parts.userinfo else f"{REDACTED}@"
    path_query, hash_, fragment = parts.tail.partition("#")
    path, qmark, query = path_query.partition("?")
    if qmark:
        query, in_query = _redact_query(query)
        found = found or in_query
    tail = f"{path}{qmark}{query}{hash_}{fragment}"
    return f"{parts.scheme}://{userinfo}{parts.hostport}{tail}", found


def has_credentials(url: str) -> bool:
    """True if ``url`` carries user info or credential-like query parameters (also True when
    the URL cannot be parsed reliably: it is then treated as secret)."""
    return _analyze(url)[1]


def redact_url(url: str) -> str:
    """``url`` with user info and credential-like query values replaced by ``***``. Robust to
    unencoded ``/ # ? @`` in passwords (see the module docstring); never raises."""
    return _analyze(url)[0]


def redact_text(text: str) -> str:
    """``text`` (e.g. an exception message) with every URL in it passed through
    :func:`redact_url`."""
    return _URL_IN_TEXT_RE.sub(lambda m: redact_url(m.group(0)), text)


def address_url(url: str) -> str | None:
    """``url`` without its user info (for parsing host, port and path), or None when it has no
    scheme or its host cannot be found reliably."""
    parts = _split(url)
    if parts is None or parts.hostport is None:
        return None
    return f"{parts.scheme}://{parts.hostport}{parts.tail}"


def with_credentials(url: str, username: str | None, password: str | None) -> str:
    """``url`` with its user info replaced by ``username[:password]`` (percent-encoded)."""
    if not username:
        return url
    parts = _split(url)
    if parts is None:
        return url
    userinfo = quote(username, safe="")
    if password:
        userinfo += ":" + quote(password, safe="")
    return f"{parts.scheme}://{userinfo}@{parts.after}"


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
