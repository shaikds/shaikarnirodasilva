from __future__ import annotations

import socket
from pathlib import Path
from typing import Any

from rv_edge.ingest.discovery import (
    MULTICAST_GROUP,
    WS_DISCOVERY_PORT,
    DiscoveredCamera,
    build_probe,
    discover,
    parse_probe_matches,
)

DATA = Path(__file__).parent / "data"
HIKVISION_REPLY = (DATA / "onvif_probe_matches_hikvision.xml").read_bytes()

DAHUA_REPLY = b"""<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
 xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing"
 xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
 xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
<s:Header><a:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/ProbeMatches</a:Action></s:Header>
<s:Body><d:ProbeMatches><d:ProbeMatch>
<a:EndpointReference><a:Address>uuid:4a8f2b1e-0000-0000-0000-3ce36b8a2f10</a:Address></a:EndpointReference>
<d:Types>dn:NetworkVideoTransmitter</d:Types>
<d:Scopes>onvif://www.onvif.org/location/country/china onvif://www.onvif.org/name/Front%20Door
 onvif://www.onvif.org/hardware/IPC-HDW2431T-AS-S2 onvif://www.onvif.org/mfr/Dahua
 onvif://www.onvif.org/Profile/Streaming</d:Scopes>
<d:XAddrs>http://192.168.1.108/onvif/device_service</d:XAddrs>
<d:MetadataVersion>1</d:MetadataVersion>
</d:ProbeMatch></d:ProbeMatches></s:Body></s:Envelope>"""


def test_probe_message_asks_for_video_transmitters() -> None:
    probe = build_probe("1234").decode()
    assert "dn:NetworkVideoTransmitter" in probe
    assert "uuid:1234" in probe
    assert "http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe<" in probe


def test_parse_recorded_hikvision_reply() -> None:
    cams = parse_probe_matches(HIKVISION_REPLY)
    assert cams == [
        DiscoveredCamera(
            address="192.168.1.64",
            xaddrs=(
                "http://192.168.1.64/onvif/device_service",
                "http://[fe80::bebc:c2ff:fee7:f1aa]/onvif/device_service",
            ),
            manufacturer=None,
            model="DS-2CD2143G2-I",
            name="HIKVISION DS-2CD2143G2-I",
        )
    ]


def test_parse_reply_with_manufacturer_scope_and_sender() -> None:
    (cam,) = parse_probe_matches(DAHUA_REPLY, sender="192.168.1.108")
    assert cam.address == "192.168.1.108"
    assert cam.manufacturer == "Dahua"
    assert cam.model == "IPC-HDW2431T-AS-S2"
    assert cam.name == "Front Door"
    assert cam.xaddrs == ("http://192.168.1.108/onvif/device_service",)


def test_parse_rejects_garbage_and_entity_tricks() -> None:
    assert parse_probe_matches(b"not xml") == []
    assert parse_probe_matches(b"<a><b></a>") == []
    assert parse_probe_matches(b"<x/>") == []
    evil = b'<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><x>&a;</x>'
    assert parse_probe_matches(evil) == []
    assert parse_probe_matches(b" " * 70000) == []


class FakeSocket:
    """Records what was sent; replies with the queued datagrams, then times out."""

    def __init__(self, replies: list[tuple[bytes, tuple[str, int]]]) -> None:
        self.replies = list(replies)
        self.sent: list[tuple[bytes, tuple[str, int]]] = []
        self.options: list[tuple[int, int, Any]] = []
        self.closed = False

    def setsockopt(self, level: int, name: int, value: Any) -> None:
        self.options.append((level, name, value))

    def bind(self, addr: tuple[str, int]) -> None:
        self.bound = addr

    def sendto(self, data: bytes, addr: tuple[str, int]) -> int:
        self.sent.append((data, addr))
        return len(data)

    def settimeout(self, timeout: float) -> None:
        pass

    def recvfrom(self, size: int) -> tuple[bytes, tuple[str, int]]:
        if not self.replies:
            raise TimeoutError
        return self.replies.pop(0)

    def close(self) -> None:
        self.closed = True


def test_discover_sends_multicast_probe_and_deduplicates() -> None:
    fake = FakeSocket(
        [
            (HIKVISION_REPLY, ("192.168.1.64", 3702)),
            (HIKVISION_REPLY, ("192.168.1.64", 3702)),  # answer to the repeated probe
            (DAHUA_REPLY, ("192.168.1.108", 3702)),
            (b"junk", ("192.168.1.99", 3702)),
        ]
    )
    cams = discover(timeout=1.0, interface="192.168.1.10", socket_factory=lambda: fake)  # type: ignore[arg-type,return-value]
    assert [c.address for c in cams] == ["192.168.1.108", "192.168.1.64"]
    assert len(fake.sent) == 2
    assert all(addr == (MULTICAST_GROUP, WS_DISCOVERY_PORT) for _, addr in fake.sent)
    assert (socket.IPPROTO_IP, socket.IP_MULTICAST_IF, socket.inet_aton("192.168.1.10")) in (
        fake.options
    )
    assert fake.closed


def test_discover_survives_socket_errors() -> None:
    class Broken(FakeSocket):
        def bind(self, addr: tuple[str, int]) -> None:
            raise OSError("no network")

    broken = Broken([])
    assert discover(timeout=0.1, socket_factory=lambda: broken) == []  # type: ignore[arg-type,return-value]
    assert broken.closed
