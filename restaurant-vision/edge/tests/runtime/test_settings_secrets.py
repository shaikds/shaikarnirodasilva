from __future__ import annotations

import os
import stat
from pathlib import Path

import pytest
from pydantic import SecretStr, ValidationError
from rv_contracts import PairResponse
from rv_contracts.fixtures import sample_site_config

from rv_edge.runtime.config_store import ConfigStore
from rv_edge.runtime.secrets_store import (
    CameraSecret,
    SecretsStore,
    redact_url,
    with_credentials,
)
from rv_edge.runtime.settings import load_settings
from rv_edge.runtime.setup_pin import PinGuard, hash_pin, verify_pin


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
