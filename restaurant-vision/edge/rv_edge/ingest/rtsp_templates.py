"""RTSP URL templates per camera brand (Adapter pattern) and credential redaction.

Each brand adapter turns ``(channel, substream)`` into the brand's RTSP path; :func:`rtsp_url`
adds the scheme, URL-encoded credentials, host and port. The analysis uses the **substream**
(low resolution, low bitrate) by default.

Credentials must never be logged: pass every URL through :func:`redact_url` before logging it.
:func:`parse_rtsp_url` is the inverse of :func:`rtsp_url` for display: it returns only the
non-secret parts (brand, host, port, channel, substream), never the user info.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit


@dataclass(frozen=True, slots=True)
class BrandTemplate:
    """RTSP path adapter for one brand. ``{ch}`` is the channel, ``{st}`` the stream token."""

    key: str
    label: str
    path: str
    main_token: str
    sub_token: str
    note: str = ""

    def render(self, channel: int, substream: bool) -> str:
        """The RTSP path (with query, if any) for ``channel``."""
        token = self.sub_token if substream else self.main_token
        return self.path.format(ch=channel, st=token)


BRANDS: dict[str, BrandTemplate] = {
    t.key: t
    for t in (
        BrandTemplate(
            "hikvision",
            "Hikvision",
            "/Streaming/Channels/{ch}0{st}",
            main_token="1",
            sub_token="2",
            note="Also HiLook and most Hikvision OEMs. NVR channel N -> N01 main / N02 sub.",
        ),
        BrandTemplate(
            "dahua",
            "Dahua",
            "/cam/realmonitor?channel={ch}&subtype={st}",
            main_token="0",
            sub_token="1",
            note="Also Amcrest, Lorex and most Dahua OEMs.",
        ),
        BrandTemplate(
            "uniview",
            "Uniview (UNV)",
            "/unicast/c{ch}/s{st}/live",
            main_token="0",
            sub_token="1",
            note="NVRs and recent IPCs. Older IPCs: /media/video1 (main), /media/video2 (sub).",
        ),
        BrandTemplate(
            "axis",
            "Axis",
            "/axis-media/media.amp?camera={ch}{st}",
            main_token="",
            sub_token="&videocodec=h264&resolution=640x360",
            note="Axis has no fixed substream; a low resolution is requested instead.",
        ),
        BrandTemplate(
            "provision_isr",
            "Provision-ISR",
            "/profile{st}",
            main_token="1",
            sub_token="2",
            note="Direct to the camera (Provision-ISR recommends the camera over the NVR). "
            "The channel is ignored.",
        ),
        BrandTemplate(
            "generic",
            "Generic / other",
            "/stream{st}",
            main_token="1",
            sub_token="2",
            note="Fallback guess; prefer the path from the camera's manual or ONVIF.",
        ),
    )
}

GENERIC = "generic"
DEFAULT_PORTS = {"rtsp": 554, "rtsps": 322, "http": 80, "https": 443}

_BRAND_HINTS: tuple[tuple[str, str], ...] = (
    ("hikvision", "hikvision"),
    ("hilook", "hikvision"),
    ("dahua", "dahua"),
    ("amcrest", "dahua"),
    ("lorex", "dahua"),
    ("uniview", "uniview"),
    ("unv", "uniview"),
    ("axis", "axis"),
    ("provision", "provision_isr"),
)


def normalize_brand(brand: str) -> str:
    """Map a free-form brand name to a key of :data:`BRANDS` (unknown -> ``generic``)."""
    key = re.sub(r"[^a-z0-9]+", "_", brand.strip().lower()).strip("_")
    if key in BRANDS:
        return key
    return guess_brand(brand) or GENERIC


def guess_brand(*texts: str | None) -> str | None:
    """Guess a brand key from manufacturer/model/name strings (e.g. from ONVIF discovery)."""
    joined = " ".join(t for t in texts if t).lower()
    words = set(re.split(r"[^a-z0-9]+", joined))
    for needle, key in _BRAND_HINTS:
        if needle in words or (len(needle) > 3 and needle in joined):
            return key
    return None


def rtsp_url(
    brand: str,
    host: str,
    user: str | None,
    password: str | None,
    channel: int = 1,
    substream: bool = True,
    port: int = 554,
    *,
    path: str | None = None,
) -> str:
    """Build the RTSP URL for a camera. Credentials are URL-encoded (``@``, ``:``, ``/`` ...).

    ``path`` overrides the brand template (for cameras whose manual gives another path).
    The result contains credentials: log it only through :func:`redact_url`.
    """
    if channel < 1:
        raise ValueError("channel must be >= 1")
    if not 0 < port < 65536:
        raise ValueError("port must be 1..65535")
    host = host.strip()
    if not host:
        raise ValueError("host is required")
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"  # IPv6 literal
    template = BRANDS[normalize_brand(brand)]
    rendered = path if path is not None else template.render(channel, substream)
    if not rendered.startswith("/"):
        rendered = "/" + rendered
    userinfo = ""
    if user:
        userinfo = quote(user, safe="")
        if password:
            userinfo += ":" + quote(password, safe="")
        userinfo += "@"
    return f"rtsp://{userinfo}{host}:{port}{rendered}"


_SECRET_QUERY_KEYS = frozenset(
    {"user", "username", "usr", "password", "pass", "passwd", "pwd", "token", "auth", "key"}
)
REDACTED = "***"


def redact_url(url: str) -> str:
    """``url`` with user name, password and credential-like query values replaced by ``***``.

    Everything between ``://`` and the last ``@`` is treated as user info, so even a password
    with unencoded ``/`` or ``@`` is hidden (at worst a little too much is redacted). Never
    raises, so it can be used in any log line.
    """
    sep = url.find("://")
    if sep != -1:
        start = sep + 3
        at = url.rfind("@")
        if at >= start:
            url = url[:start] + REDACTED + url[at:]
    try:
        parts = urlsplit(url)
    except ValueError:
        return url
    if not parts.query:
        return url
    pairs = parse_qsl(parts.query, keep_blank_values=True)
    if not any(k.lower() in _SECRET_QUERY_KEYS for k, _ in pairs):
        return url
    query = urlencode(
        [(k, REDACTED if k.lower() in _SECRET_QUERY_KEYS else v) for k, v in pairs], safe="*"
    )
    return urlunsplit((parts.scheme, parts.netloc, parts.path, query, parts.fragment))


@dataclass(frozen=True, slots=True)
class RtspParts:
    """Non-secret parts of a camera URL. ``brand``/``channel``/``substream`` are None when the
    path matches no brand template (a custom path)."""

    host: str
    port: int
    brand: str | None = None
    channel: int | None = None
    substream: bool | None = None


def _template_pattern(template: BrandTemplate) -> re.Pattern[str]:
    tokens = sorted({template.main_token, template.sub_token}, key=len, reverse=True)
    stream = "|".join(re.escape(t) for t in tokens)
    pattern = re.escape(template.path)
    pattern = pattern.replace(re.escape("{ch}"), r"(?P<ch>[1-9]\d*)")
    pattern = pattern.replace(re.escape("{st}"), f"(?P<st>{stream})")
    return re.compile(pattern)


_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (key, _template_pattern(t))
    for key, t in sorted(BRANDS.items(), key=lambda item: item[0] == GENERIC)  # generic last
)


def parse_rtsp_url(url: str) -> RtspParts | None:
    """Host, port and (when the path matches a brand template) brand, channel and substream of
    a camera URL. None for non-network URLs (file paths). Never returns credentials."""
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        return None
    scheme = parts.scheme.lower()
    host = parts.hostname
    if scheme not in DEFAULT_PORTS or not host:
        return None
    port = port or DEFAULT_PORTS[scheme]
    path = parts.path or "/"
    if parts.query:
        path += "?" + parts.query
    for key, pattern in _PATTERNS:
        match = pattern.fullmatch(path)
        if match is None:
            continue
        template = BRANDS[key]
        substream: bool | None = None
        if template.sub_token != template.main_token:
            substream = match.group("st") == template.sub_token
        channel = int(match.group("ch")) if "ch" in match.groupdict() else None
        return RtspParts(host=host, port=port, brand=key, channel=channel, substream=substream)
    return RtspParts(host=host, port=port)
