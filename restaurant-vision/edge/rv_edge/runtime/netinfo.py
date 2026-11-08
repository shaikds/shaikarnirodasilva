"""The edge's LAN address, reported in ``edge.heartbeat.local_url`` so the waiter app can link
to ``<local_url>/local-alerts`` when the cloud is unreachable.

:func:`resolve_local_url` uses, in order: the ``local_url`` setting (for NAT, Docker port
mappings or a DNS name), the bind address when it is a specific LAN address, ``localhost`` when
the API only listens on loopback, and otherwise the IPv4 address of the interface that holds
the default route. Detection sends no packet (a UDP ``connect`` only selects a route).
"""

from __future__ import annotations

import ipaddress
import logging
import socket

log = logging.getLogger(__name__)

_WILDCARD_HOSTS = frozenset({"", "0.0.0.0", "::", "[::]"})
_PROBE_ADDRESS = ("192.0.2.1", 9)
"""TEST-NET-1 (RFC 5737): never routed, so selecting a route to it reveals the LAN interface."""


def lan_ip() -> str | None:
    """IPv4 address of the interface with the default route; None if there is none."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(_PROBE_ADDRESS)
            address = str(sock.getsockname()[0])
    except OSError:
        return None
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return None
    if ip.is_unspecified or ip.is_loopback:
        return None
    return address


def _is_loopback(host: str) -> bool:
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host.strip("[]")).is_loopback
    except ValueError:
        return False


def _url_host(host: str) -> str:
    try:
        if ipaddress.ip_address(host.strip("[]")).version == 6:
            return f"[{host.strip('[]')}]"
    except ValueError:
        pass
    return host


def resolve_local_url(override: str | None, host: str, port: int) -> str | None:
    """The edge's LAN base URL (no trailing slash), or None when it cannot be determined."""
    if override:
        return override.rstrip("/")
    host = host.strip()
    if host not in _WILDCARD_HOSTS:
        if _is_loopback(host):
            return f"http://localhost:{port}"
        return f"http://{_url_host(host)}:{port}"
    ip = lan_ip()
    if ip is None:
        log.debug("no LAN address found; local_url unknown")
        return None
    return f"http://{ip}:{port}"
