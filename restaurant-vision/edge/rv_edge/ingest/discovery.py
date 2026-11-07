"""ONVIF camera discovery with WS-Discovery (stdlib only).

Sends a SOAP ``Probe`` for ``dn:NetworkVideoTransmitter`` to the WS-Discovery multicast group
``239.255.255.250:3702`` and parses the ``ProbeMatches`` replies. LAN only; nothing leaves the
restaurant. Replies come from untrusted devices, so they are size-capped and documents with a
DTD/entities are rejected before parsing.
"""

from __future__ import annotations

import logging
import socket
import time
import uuid
import xml.etree.ElementTree as ET
from collections.abc import Callable
from dataclasses import dataclass
from urllib.parse import unquote, urlsplit

log = logging.getLogger(__name__)

MULTICAST_GROUP = "239.255.255.250"
WS_DISCOVERY_PORT = 3702
MAX_REPLY_BYTES = 65536

_NS_SOAP = "http://www.w3.org/2003/05/soap-envelope"
_NS_WSA = "http://schemas.xmlsoap.org/ws/2004/08/addressing"
_NS_WSD = "http://schemas.xmlsoap.org/ws/2005/04/discovery"

PROBE_TEMPLATE = """<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
 xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
 xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
 xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
 <e:Header>
  <w:MessageID>uuid:{message_id}</w:MessageID>
  <w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
  <w:Action e:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
 </e:Header>
 <e:Body>
  <d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe>
 </e:Body>
</e:Envelope>
"""


@dataclass(frozen=True, slots=True)
class DiscoveredCamera:
    """One ONVIF device that answered the probe."""

    address: str
    """IP address (or host) of the device."""
    xaddrs: tuple[str, ...]
    """ONVIF device service URLs, e.g. ``http://192.168.1.64/onvif/device_service``."""
    manufacturer: str | None
    model: str | None
    name: str | None


def build_probe(message_id: str | None = None) -> bytes:
    """The SOAP Probe message for ONVIF video transmitters."""
    return PROBE_TEMPLATE.format(message_id=message_id or str(uuid.uuid4())).encode("utf-8")


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _scope_values(scopes: list[str], *keys: str) -> str | None:
    """First value of ``onvif://www.onvif.org/<key>/<value>`` scopes, URL-decoded."""
    for key in keys:
        prefix = f"onvif://www.onvif.org/{key}/"
        for scope in scopes:
            if scope.lower().startswith(prefix):
                value = unquote(scope[len(prefix) :]).strip()
                if value:
                    return value
    return None


def parse_probe_matches(payload: bytes | str, sender: str | None = None) -> list[DiscoveredCamera]:
    """Parse a WS-Discovery ``ProbeMatches`` reply. Returns ``[]`` for anything unparseable.

    ``sender`` is the UDP source address; when missing the host of the first XAddr is used.
    """
    data = payload.encode("utf-8") if isinstance(payload, str) else payload
    if len(data) > MAX_REPLY_BYTES or b"<!DOCTYPE" in data or b"<!ENTITY" in data:
        return []
    try:
        root = ET.fromstring(data)
    except ET.ParseError:
        return []
    cameras: list[DiscoveredCamera] = []
    for match in root.iter(f"{{{_NS_WSD}}}ProbeMatch"):
        fields: dict[str, str] = {}
        for child in match:
            fields[_local(child.tag)] = (child.text or "").strip()
        xaddrs = tuple(x for x in fields.get("XAddrs", "").split() if x)
        scopes = fields.get("Scopes", "").split()
        address = sender
        if address is None and xaddrs:
            address = urlsplit(xaddrs[0]).hostname
        cameras.append(
            DiscoveredCamera(
                address=address or "",
                xaddrs=xaddrs,
                manufacturer=_scope_values(scopes, "mfr", "manufacturer"),
                model=_scope_values(scopes, "hardware", "model"),
                name=_scope_values(scopes, "name"),
            )
        )
    return cameras


SocketFactory = Callable[[], socket.socket]


def _udp_socket() -> socket.socket:
    return socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)


def discover(
    timeout: float = 3.0,
    *,
    interface: str | None = None,
    repeats: int = 2,
    socket_factory: SocketFactory = _udp_socket,
) -> list[DiscoveredCamera]:
    """Probe the LAN for ONVIF cameras for ``timeout`` seconds.

    ``interface`` is the local IPv4 address to send from (useful on PCs with a VPN or several
    NICs). The probe is sent ``repeats`` times because UDP multicast is lossy. Results are
    de-duplicated by address.
    """
    sock = socket_factory()
    found: dict[str, DiscoveredCamera] = {}
    try:
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
        if interface:
            sock.setsockopt(
                socket.IPPROTO_IP, socket.IP_MULTICAST_IF, socket.inet_aton(interface)
            )
        sock.bind((interface or "", 0))
        probe = build_probe()
        for _ in range(max(1, repeats)):
            sock.sendto(probe, (MULTICAST_GROUP, WS_DISCOVERY_PORT))
        deadline = time.monotonic() + timeout
        while (remaining := deadline - time.monotonic()) > 0:
            sock.settimeout(remaining)
            try:
                data, (host, _port) = sock.recvfrom(MAX_REPLY_BYTES + 1)
            except TimeoutError:
                break
            for cam in parse_probe_matches(data, sender=host):
                key = cam.address or " ".join(cam.xaddrs)
                found.setdefault(key, cam)
    except OSError as exc:
        log.warning("ONVIF discovery failed: %s", exc)
    finally:
        sock.close()
    return sorted(found.values(), key=lambda c: c.address)
