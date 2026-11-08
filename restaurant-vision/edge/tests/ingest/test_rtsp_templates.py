from __future__ import annotations

import pytest

from rv_edge.ingest.rtsp_templates import (
    BRANDS,
    RtspParts,
    guess_brand,
    normalize_brand,
    parse_rtsp_url,
    redact_url,
    rtsp_url,
)


@pytest.mark.parametrize(
    ("brand", "channel", "substream", "expected_path"),
    [
        ("hikvision", 1, True, "/Streaming/Channels/102"),
        ("hikvision", 1, False, "/Streaming/Channels/101"),
        ("Hikvision", 4, True, "/Streaming/Channels/402"),
        ("dahua", 1, True, "/cam/realmonitor?channel=1&subtype=1"),
        ("dahua", 3, False, "/cam/realmonitor?channel=3&subtype=0"),
        ("uniview", 2, True, "/unicast/c2/s1/live"),
        ("UNV", 1, False, "/unicast/c1/s0/live"),
        ("axis", 1, True, "/axis-media/media.amp?camera=1&videocodec=h264&resolution=640x360"),
        ("axis", 1, False, "/axis-media/media.amp?camera=1"),
        ("Provision-ISR", 1, True, "/profile2"),
        ("provision_isr", 1, False, "/profile1"),
        ("some-unknown-brand", 1, True, "/stream2"),
    ],
)
def test_brand_templates(brand: str, channel: int, substream: bool, expected_path: str) -> None:
    url = rtsp_url(brand, "192.168.1.64", "admin", "pw", channel=channel, substream=substream)
    assert url == f"rtsp://admin:pw@192.168.1.64:554{expected_path}"


def test_every_listed_brand_renders_a_path() -> None:
    assert {"hikvision", "dahua", "uniview", "axis", "provision_isr", "generic"} <= set(BRANDS)
    for key in BRANDS:
        assert rtsp_url(key, "10.0.0.2", None, None).startswith("rtsp://10.0.0.2:554/")


def test_credentials_are_url_encoded() -> None:
    url = rtsp_url("hikvision", "cam.local", "ad@min", "p@ss:w/rd#1", port=8554)
    assert url == "rtsp://ad%40min:p%40ss%3Aw%2Frd%231@cam.local:8554/Streaming/Channels/102"


def test_no_credentials_and_ipv6_and_custom_path() -> None:
    assert rtsp_url("dahua", "fe80::1", "", "x").startswith("rtsp://[fe80::1]:554/cam/")
    assert rtsp_url("generic", "h", "u", None, path="live/ch00_1") == "rtsp://u@h:554/live/ch00_1"


@pytest.mark.parametrize(("channel", "port"), [(0, 554), (1, 0), (1, 70000)])
def test_invalid_arguments(channel: int, port: int) -> None:
    with pytest.raises(ValueError):
        rtsp_url("hikvision", "h", "u", "p", channel=channel, port=port)
    with pytest.raises(ValueError):
        rtsp_url("hikvision", "  ", "u", "p")


def test_guess_and_normalize_brand() -> None:
    assert guess_brand("HIKVISION DS-2CD2143G2-I") == "hikvision"
    assert guess_brand(None, "Dahua", "IPC-HDW") == "dahua"
    assert guess_brand("Provision-ISR", None) == "provision_isr"
    assert guess_brand("Acme Cam") is None
    assert normalize_brand("Uniview") == "uniview"
    assert normalize_brand("Acme") == "generic"


@pytest.mark.parametrize(
    ("url", "secret"),
    [
        ("rtsp://admin:s3cret@192.168.1.64:554/Streaming/Channels/102", "s3cret"),
        ("rtsp://ad%40min:p%40ss@cam:554/x", "p%40ss"),
        ("rtsp://admin:pa/ss@word@10.0.0.5/live", "pa/ss@word"),  # unencoded / and @
        ("rtsp://10.0.0.5/live?user=admin&password=hunter2&channel=1", "hunter2"),
        ("http://admin:topsecret@10.0.0.5/onvif/device_service", "topsecret"),
    ],
)
def test_redact_url_hides_credentials(url: str, secret: str) -> None:
    redacted = redact_url(url)
    assert secret not in redacted
    assert "admin" not in redacted
    assert "***" in redacted


def test_redact_url_keeps_harmless_urls_and_never_raises() -> None:
    plain = "rtsp://192.168.1.64:554/Streaming/Channels/102"
    assert redact_url(plain) == plain
    assert redact_url("rtsp://admin:pw@h/cam?channel=1&subtype=1") == (
        "rtsp://***@h/cam?channel=1&subtype=1"
    )
    assert redact_url("not a url") == "not a url"
    assert redact_url("rtsp://[broken") == "rtsp://[broken"


@pytest.mark.parametrize("brand", sorted(BRANDS))
@pytest.mark.parametrize(("channel", "substream"), [(1, True), (4, False), (12, True)])
def test_parse_rtsp_url_inverts_rtsp_url(brand: str, channel: int, substream: bool) -> None:
    url = rtsp_url(brand, "192.168.1.64", "admin", "p@ss:w/rd", channel, substream, port=8554)
    parts = parse_rtsp_url(url)
    assert parts is not None
    assert (parts.brand, parts.host, parts.port) == (brand, "192.168.1.64", 8554)
    assert parts.channel in (channel, None)  # provision_isr ignores the channel
    assert parts.substream in (substream, None)
    assert "admin" not in repr(parts) and "p@ss" not in repr(parts)


def test_parse_rtsp_url_custom_paths_and_files() -> None:
    assert parse_rtsp_url("rtsp://u:p@cam.local/live/main") == RtspParts("cam.local", 554)
    assert parse_rtsp_url("rtsps://cam.local/x") == RtspParts("cam.local", 322)
    assert parse_rtsp_url("/videos/demo.mp4") is None
    assert parse_rtsp_url("rtsp://cam:notaport/x") is None
