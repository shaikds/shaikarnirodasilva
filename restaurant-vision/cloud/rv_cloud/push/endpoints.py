"""Which Web Push endpoints the cloud may POST to.

A subscription's ``endpoint`` comes from the browser, but any signed-up tenant can submit any
URL, and the server then POSTs to it on every alert. Only ``https`` URLs on the default port
whose host is on the allowlist (``Settings.push_allowed_hosts``: the browsers' push services)
are accepted, so the endpoint can never point at loopback, private addresses or other internal
services (SSRF).
"""

from collections.abc import Iterable
from urllib.parse import urlsplit


def _normalize(host: str) -> str:
    return host.strip().rstrip(".").lower()


def host_allowed(host: str, allowed_hosts: Iterable[str]) -> bool:
    """``host`` equals an allowed host, or is a subdomain of a ``*.domain`` entry."""
    host = _normalize(host)
    if not host:
        return False
    for entry in allowed_hosts:
        pattern = _normalize(entry)
        if pattern.startswith("*."):
            suffix = pattern[1:]  # ".domain"
            if host.endswith(suffix) and len(host) > len(suffix):
                return True
        elif pattern and host == pattern:
            return True
    return False


def endpoint_allowed(endpoint: str, allowed_hosts: Iterable[str]) -> bool:
    """True if the cloud may send Web Push to ``endpoint``: ``https``, no user info, default
    port, no whitespace/control characters or backslashes, and an allowlisted host."""
    if any(ch.isspace() or ord(ch) < 0x20 or ch in "\\\x7f" for ch in endpoint):
        return False
    try:
        parts = urlsplit(endpoint)
        port = parts.port
    except ValueError:
        return False
    if parts.scheme.lower() != "https" or "@" in parts.netloc or port not in (None, 443):
        return False
    return host_allowed(parts.hostname or "", allowed_hosts)


__all__ = ["endpoint_allowed", "host_allowed"]
