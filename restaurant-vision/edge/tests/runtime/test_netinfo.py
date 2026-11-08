from __future__ import annotations

import pytest

from rv_edge.runtime import netinfo
from rv_edge.runtime.settings import EdgeSettings


def test_override_wins() -> None:
    assert netinfo.resolve_local_url("http://rv.local:9000/", "0.0.0.0", 8787) == (
        "http://rv.local:9000"
    )


@pytest.mark.parametrize(
    ("host", "expected"),
    [
        ("127.0.0.1", "http://localhost:8787"),
        ("localhost", "http://localhost:8787"),
        ("192.168.1.20", "http://192.168.1.20:8787"),
        ("fd00::5", "http://[fd00::5]:8787"),
        ("edge-pc.lan", "http://edge-pc.lan:8787"),
    ],
)
def test_specific_bind_address(host: str, expected: str) -> None:
    assert netinfo.resolve_local_url(None, host, 8787) == expected


def test_wildcard_bind_uses_the_lan_ip(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(netinfo, "lan_ip", lambda: "10.0.0.42")
    assert netinfo.resolve_local_url(None, "0.0.0.0", 8788) == "http://10.0.0.42:8788"
    monkeypatch.setattr(netinfo, "lan_ip", lambda: None)
    assert netinfo.resolve_local_url(None, "::", 8788) is None


def test_lan_ip_is_never_loopback_or_raises() -> None:
    ip = netinfo.lan_ip()  # depends on the machine; must not raise
    assert ip is None or not ip.startswith("127.")


@pytest.mark.parametrize("bad", ["192.168.1.2:8787", "ftp://x", "http://a b"])
def test_local_url_setting_is_validated(bad: str) -> None:
    with pytest.raises(ValueError):
        EdgeSettings(local_url=bad)
    assert EdgeSettings(local_url=" http://x:1/ ").local_url == "http://x:1"
    assert EdgeSettings(local_url="").local_url is None
