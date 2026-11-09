from __future__ import annotations

import os
import stat
import threading
from pathlib import Path

import pytest
from pydantic import SecretStr, ValidationError
from rv_contracts import PairResponse, SiteConfig
from rv_contracts.fixtures import sample_site_config

from rv_edge.runtime.config_store import ConfigStore
from rv_edge.ingest.rtsp_templates import redact_url as ingest_redact_url
from rv_edge.runtime.secrets_store import (
    CameraSecret,
    SecretsStore,
    address_url,
    has_credentials,
    redact_text,
    redact_url,
    with_credentials,
)
from rv_edge.runtime.settings import load_settings
from rv_edge.runtime.setup_pin import BUSY_RETRY_S, PinGuard, hash_pin, verify_pin

SPECIAL_PASSWORDS = ["pa/ss", "P@ss/w0rd", "pa#ss", "pa?ss"]
"""Unencoded characters that ``urllib.parse`` splits on (they leaked before the fix)."""
ENCODED_PASSWORDS = ["pa%2Fss", "P%40ss%2Fw0rd", "pa%23ss", "pa%3Fss", "s3cret"]


def test_settings_yaml_and_env_overrides(tmp_path: Path) -> None:
    cfg = tmp_path / "edge.yaml"
    cfg.write_text(
        "data_dir: data\nlocal_port: 9000\ncloud_url: https://c.test/\ncpu_limit_pct: 50\n"
    )
    settings = load_settings(cfg, env={"RV_EDGE_LOCAL_PORT": "9100", "RV_EDGE_LOG_LEVEL": "debug"})
    assert settings.data_dir == tmp_path / "data"
    assert settings.local_port == 9100
    assert settings.cloud_url == "https://c.test"
    assert settings.cpu_limit_pct == 50
    assert settings.log_level == "DEBUG"
    assert settings.local_host == "0.0.0.0"


def test_settings_reject_unknown_keys(tmp_path: Path) -> None:
    cfg = tmp_path / "edge.yaml"
    cfg.write_text("lokal_port: 1\n")
    with pytest.raises(ValidationError):
        load_settings(cfg, env={})


def test_settings_defaults_without_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)
    settings = load_settings(None, env={"RV_EDGE_CLOUD_URL": ""})
    assert settings.local_port == 8787
    assert settings.cloud_url is None
    assert settings.cpu_limit_pct == 70


def test_redaction_helpers() -> None:
    url = "rtsp://admin:s3cret@192.168.1.10:554/Streaming/Channels/102"
    assert redact_url(url) == "rtsp://***:***@192.168.1.10:554/Streaming/Channels/102"
    assert "s3cret" not in redact_url("rtsp://10.0.0.2/cam?user=admin&password=s3cret")
    assert redact_url("/videos/demo.mp4") == "/videos/demo.mp4"
    assert with_credentials("rtsp://old:x@h/s", "ad min", "p@ss") == "rtsp://ad%20min:p%40ss@h/s"


@pytest.mark.parametrize("password", SPECIAL_PASSWORDS + ENCODED_PASSWORDS)
@pytest.mark.parametrize(
    ("host", "path"),
    [("192.168.1.10:554", "/Streaming/Channels/102"), ("[fe80::1]", "/stream?channel=1")],
)
def test_redaction_survives_special_characters_in_passwords(
    password: str, host: str, path: str
) -> None:
    url = f"rtsp://admin:{password}@{host}{path}"
    expected = f"rtsp://***:***@{host}{path}"
    camera = CameraSecret(camera_id="c1", kind="rtsp", url=SecretStr(url))
    assert redact_url(url) == expected
    assert has_credentials(url) and camera.has_credentials
    assert camera.redacted_url == expected
    for text in (repr(camera), str(camera), redact_text(f"cannot open {url}: timeout")):
        assert password not in text and "admin" not in text
    assert address_url(url) == f"rtsp://{host}{path}"  # host and port parse cleanly
    # The ingest helper (used by the RTSP source's log lines) hides them too.
    assert password not in ingest_redact_url(url)


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("rtsp://admin:pa/ss", "rtsp://***"),  # no "@": the host cannot be found
        ("rtsp://[broken", "rtsp://***"),
        ("rtsp://admin:pw@host:port/x", "rtsp://***@host"),  # not a host[:port]: host guess
        ("rtsp://h/cam?email=a@b.example", "rtsp://***@b.example"),  # over-redacts, never leaks
        ("rtsp://admin@10.0.0.2/live", "rtsp://***@10.0.0.2/live"),
        ("rtsp://10.0.0.2/cam?channel=1&subtype=1", "rtsp://10.0.0.2/cam?channel=1&subtype=1"),
        ("/videos/demo.mp4", "/videos/demo.mp4"),
    ],
)
def test_redaction_falls_back_when_unsure(url: str, expected: str) -> None:
    assert redact_url(url) == expected
    assert has_credentials(url) is (expected != url)


def test_with_credentials_handles_unencoded_passwords_in_the_url() -> None:
    url = "rtsp://admin:pa/ss@192.168.1.10:554/s"
    assert with_credentials(url, "u", "p/w") == "rtsp://u:p%2Fw@192.168.1.10:554/s"
    assert with_credentials(url, None, None) == url


def test_secrets_file_is_private_and_redacted(tmp_path: Path) -> None:
    store = SecretsStore(tmp_path)
    store.set_pairing(PairResponse(device_id="dev-1", site_id="s1", token="tok-123"), "https://c")
    camera = CameraSecret(
        camera_id="cam-1", kind="rtsp", url=SecretStr("rtsp://admin:s3cret@10.0.0.5/live")
    )
    store.upsert_camera(camera)

    if os.name == "posix":
        assert stat.S_IMODE(store.path.stat().st_mode) == 0o600
        assert stat.S_IMODE(tmp_path.stat().st_mode) == 0o700
    for text in (repr(store), repr(store.data), repr(camera), str(camera)):
        assert "s3cret" not in text and "tok-123" not in text

    reopened = SecretsStore(tmp_path)
    assert reopened.paired
    assert reopened.device_token() == "tok-123"
    assert reopened.camera_specs()["cam-1"].url == "rtsp://admin:s3cret@10.0.0.5/live"
    assert reopened.delete_camera("cam-1")
    assert not reopened.delete_camera("cam-1")


def test_config_store_pending_push_and_revisions(tmp_path: Path) -> None:
    config = sample_site_config()
    store = ConfigStore(tmp_path)
    assert store.current is None and store.config_version == 0
    store.save_local(config)
    pending = store.pending_push()
    assert pending is not None
    assert not store.save_from_cloud(config, '"1"')  # local edit wins until pushed

    store.save_local(config)  # edited again while the first push was in flight
    assert not store.mark_pushed(pending.revision, None, '"2"')
    assert store.has_pending_push

    latest = store.pending_push()
    assert latest is not None
    pushed = config.model_validate({**config.model_dump(), "config_version": 7})
    assert store.mark_pushed(latest.revision, pushed, '"7"')
    reopened = ConfigStore(tmp_path)
    assert reopened.config_version == 7
    assert reopened.etag == '"7"'
    assert not reopened.has_pending_push


def test_config_store_notifies_listeners_on_every_change(tmp_path: Path) -> None:
    store = ConfigStore(tmp_path)
    seen: list[SiteConfig] = []
    store.add_listener(seen.append)
    config = sample_site_config()
    store.replace(config)
    store.replace(config)  # unchanged: no notification
    assert seen == [config]

    local = config.model_dump()
    local["tables"][0]["label"] = "Window 1"
    edited = SiteConfig.model_validate(local)
    store.save_local(edited)
    assert seen[-1] == edited
    assert not store.save_from_cloud(config, '"1"')  # refused while the edit is pending
    assert len(seen) == 2

    pending = store.pending_push()
    assert pending is not None
    merged_data = edited.model_dump()
    merged_data["thresholds"]["first_visit_timeout_s"] = 60.0
    merged_data["config_version"] = 2
    merged = SiteConfig.model_validate(merged_data)
    assert store.mark_pushed(pending.revision, merged, '"2"')  # the cloud's merged answer
    assert seen[-1] == merged and len(seen) == 3
    assert store.save_from_cloud(merged, '"2"')  # same config: no notification
    assert len(seen) == 3

    store.remove_listener(seen.append)
    store.replace(config)
    assert len(seen) == 3


def test_pin_hash_and_guard() -> None:
    stored = hash_pin("2468", iterations=1000)
    assert verify_pin("2468", stored)
    assert not verify_pin("2469", stored)
    assert not verify_pin("2468", "garbage")
    with pytest.raises(ValueError):
        hash_pin("12")

    now = [0.0]
    guard = PinGuard(max_failures=2, lockout_s=10, monotonic=lambda: now[0])
    guard.failure("a")
    assert not guard.locked("a")
    guard.failure("a")
    assert guard.locked("a") and not guard.locked("b")
    now[0] = 11.0
    assert not guard.locked("a")


def test_pin_guard_reserves_attempts_before_they_are_checked() -> None:
    now = [0.0]
    guard = PinGuard(max_failures=3, lockout_s=10, monotonic=lambda: now[0])
    assert [guard.acquire("a") for _ in range(3)] == [0.0, 0.0, 0.0]
    assert guard.acquire("a") == BUSY_RETRY_S  # in-flight attempts count against the limit
    assert guard.acquire("b") == 0.0  # other clients are not affected
    guard.release("a")  # e.g. the PIN could not be checked
    assert guard.acquire("a") == 0.0
    for _ in range(3):
        guard.failure("a")
    assert guard.acquire("a") == pytest.approx(10.0)  # locked out
    now[0] = 10.5
    assert guard.acquire("a") == 0.0
    guard.success("a")
    assert not guard.locked("a") and guard.acquire("a") == 0.0


def test_pin_guard_is_atomic_under_concurrency() -> None:
    guard = PinGuard(max_failures=5, lockout_s=30)
    barrier = threading.Barrier(40)
    granted: list[bool] = []
    lock = threading.Lock()

    def attempt() -> None:
        barrier.wait()
        ok = guard.acquire("lan-client") == 0.0
        with lock:
            granted.append(ok)

    threads = [threading.Thread(target=attempt) for _ in range(40)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert granted.count(True) == 5
    for _ in range(5):
        guard.failure("lan-client")
    assert guard.locked("lan-client")
