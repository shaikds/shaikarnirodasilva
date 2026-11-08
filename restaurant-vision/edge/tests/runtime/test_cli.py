from __future__ import annotations

import functools
import json
import subprocess
import sys
import time
import types
from pathlib import Path
from typing import Any

import httpx
import pytest
from rv_contracts import PairResponse
from rv_contracts.fixtures import sample_site_config

from rv_edge.runtime import cli
from rv_edge.runtime import runtime as runtime_module
from rv_edge.runtime.config_store import ConfigStore
from rv_edge.runtime.pairing import pair as real_pair
from rv_edge.runtime.secrets_store import SecretsStore

from .fakes import EngineHolder, FakeFactory, ManualClock


def test_module_entry_point_prints_help() -> None:
    result = subprocess.run(
        [sys.executable, "-m", "rv_edge", "--help"], capture_output=True, text=True, timeout=60
    )
    assert result.returncode == 0
    for command in ("run", "pair", "discover", "check", "simulate"):
        assert command in result.stdout


def test_pair_command_stores_the_token(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def cloud(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v1/edge/pair"
        body = PairResponse(device_id="dev-1", site_id="site-demo", token="tok-1")
        return httpx.Response(200, content=body.model_dump_json())

    monkeypatch.setattr(
        cli, "pair", functools.partial(real_pair, transport=httpx.MockTransport(cloud))
    )
    code = cli.main(
        ["pair", "--code", "ABC123", "--cloud", "https://c.test", "--data-dir", str(tmp_path)]
    )
    assert code == 0
    assert "dev-1" in capsys.readouterr().out
    assert SecretsStore(tmp_path).device_token() == "tok-1"

    assert cli.main(["pair", "--code", "!", "--cloud", "https://c", "--data-dir", str(tmp_path)])


def test_discover_and_check_degrade_gracefully(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    import rv_edge.ingest.discovery as discovery

    monkeypatch.setattr(discovery, "discover", lambda timeout=3.0: [])
    assert cli.main(["discover", "--timeout", "0.1", "--data-dir", str(tmp_path)]) == 0
    assert json.loads(capsys.readouterr().out)["devices"] == []

    import rv_edge.vision.capacity as capacity

    seen: dict[str, Any] = {}

    def fake_estimate(**kwargs: Any) -> dict[str, Any]:
        seen.update(kwargs)
        return {"max_cameras_at_5fps": 3}

    monkeypatch.setattr(capacity, "estimate_capacity", fake_estimate)
    assert cli.main(["check", "--data-dir", str(tmp_path)]) == 0
    out = json.loads(capsys.readouterr().out)
    assert out["capacity"] == {"max_cameras_at_5fps": 3} and "system" in out
    assert seen["detector_backend"] == "auto"

    monkeypatch.setitem(sys.modules, "rv_edge.vision.capacity", None)
    assert cli.main(["check", "--data-dir", str(tmp_path)]) == 1
    assert json.loads(capsys.readouterr().out)["available"] is False


def _fake_simulator(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    calls: dict[str, Any] = {}
    config = sample_site_config()

    def load_simulation(
        path: Path, *, speed: float, seed: int, start_ts: float | None = None
    ) -> Any:
        calls.update(path=path, speed=speed, seed=seed, start_ts=start_ts)
        sources = {c.camera_id: object() for c in config.cameras}
        return types.SimpleNamespace(config=config, clock=ManualClock(), sources=sources)

    module = types.ModuleType("rv_sim.adapter")
    module.load_simulation = load_simulation  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "rv_sim.adapter", module)
    factory, holder = FakeFactory(), EngineHolder()
    monkeypatch.setattr(runtime_module, "default_pipeline_factory", lambda: factory)
    monkeypatch.setattr(runtime_module, "default_engine_builder", lambda: holder)
    calls.update(factory=factory, holder=holder)
    return calls


def test_simulate_runs_the_engine_on_a_scenario(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = _fake_simulator(monkeypatch)
    code = cli.main(
        [
            "simulate",
            "--scenario",
            "dinner.yaml",
            "--speed",
            "5",
            "--seed",
            "3",
            "--no-api",
            "--duration",
            "0.3",
            "--data-dir",
            str(tmp_path),
        ]
    )
    assert code == 0
    assert calls["speed"] == 5 and calls["seed"] == 3
    assert abs(calls["start_ts"] - time.time()) < 60  # --rebase-to-now is the default
    assert all(p.spec.options["track_id_ttl_h"] == 24.0 for p in factory_of(calls).built)
    factory: FakeFactory = calls["factory"]
    assert {p.spec.kind for p in factory.built} == {"simulated"}
    assert all("source" in p.spec.options for p in factory.built)
    assert all(kw["detector_backend"] == "simulated" for kw in factory.kwargs)
    assert all(p.stopped for p in factory.built)
    assert calls["holder"].engine.frames
    stored = ConfigStore(tmp_path)
    assert stored.current == sample_site_config() and not stored.has_pending_push


def test_simulate_serves_the_local_api(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _fake_simulator(monkeypatch)
    args = ["simulate", "--scenario", "s.yaml", "--port", "0", "--host", "127.0.0.1"]
    assert cli.main([*args, "--duration", "0.5", "--data-dir", str(tmp_path)]) == 0


def test_simulate_with_cloud_requires_pairing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _fake_simulator(monkeypatch)
    args = ["simulate", "--scenario", "s.yaml", "--cloud", "https://c.test", "--no-api"]
    assert cli.main([*args, "--data-dir", str(tmp_path)]) == 1


def test_simulate_without_simulator(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(sys.modules, "rv_sim.adapter", None)
    assert cli.main(["simulate", "--scenario", "s.yaml", "--data-dir", str(tmp_path)]) == 1


def test_invalid_settings_file(tmp_path: Path) -> None:
    bad = tmp_path / "edge.yaml"
    bad.write_text("local_port: not-a-port\n")
    assert cli.main(["check", "--config", str(bad)]) == 2


def factory_of(calls: dict[str, Any]) -> FakeFactory:
    factory: FakeFactory = calls["factory"]
    return factory


def test_simulate_no_rebase_keeps_the_scenario_time(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = _fake_simulator(monkeypatch)
    args = ["simulate", "--scenario", "s.yaml", "--no-rebase-to-now", "--no-api"]
    assert cli.main([*args, "--duration", "0.1", "--data-dir", str(tmp_path)]) == 0
    assert calls["start_ts"] is None


def test_listen_address_feeds_the_local_url(tmp_path: Path) -> None:
    from rv_edge.runtime.settings import EdgeSettings

    base = EdgeSettings(data_dir=tmp_path)
    assert cli.with_listen_address(base, None, None) is base
    assert cli.with_listen_address(base, None, 0) is base  # ephemeral test port
    moved = cli.with_listen_address(base, "127.0.0.1", 9100)
    assert (moved.local_host, moved.local_port) == ("127.0.0.1", 9100)
