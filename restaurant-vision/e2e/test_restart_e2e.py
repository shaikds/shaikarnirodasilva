"""Edge restart (contracts 1.2): the real edge runtime restarts while the cloud holds open
alerts and occupied tables that only lived in the old runtime's memory. The new runtime's
heartbeat carries a newer ``started_at``; the cloud must expire those alerts and reset those
table states, so the cloud's live view matches the edge again."""

from __future__ import annotations

import random
from pathlib import Path
from typing import Any

from conftest import CLOUD_URL, SMOKE, CloudApi, CloudTransport, RecordingNotifier, TestClient
from conftest import cloud_settings as make_cloud_settings
from rv_cloud.main import create_app
from rv_edge.runtime.cli import build_simulated_runtime, simulation_settings
from rv_edge.runtime.runtime import EdgeRuntime
from rv_edge.runtime.settings import EdgeSettings
from rv_sim.adapter import load_simulation


def test_edge_restart_expires_orphaned_cloud_alerts_and_table_states(tmp_path: Path) -> None:
    sim = load_simulation(SMOKE, manual=True)
    clock = sim.clock
    app = create_app(make_cloud_settings(tmp_path), clock=clock, notifier=RecordingNotifier())
    with TestClient(app) as client:
        cloud = CloudApi(client)
        owner = cloud.signup("owner@restart.test", "Restart")
        site_id = cloud.post(
            owner,
            f"/orgs/{owner.org_id}/sites",
            {"name": "S", "timezone": sim.config.timezone, "avg_check_per_guest": 50.0},
            status=201,
        )["site_id"]
        code = cloud.post(owner, f"/sites/{site_id}/devices/pairing-code", status=201)["code"]
        transport = CloudTransport(client)
        settings = simulation_settings(
            EdgeSettings(edge_ui_dir=tmp_path / "no-ui"),
            data_dir=tmp_path / "edge",
            cloud_url=CLOUD_URL,
        )
        options: dict[str, Any] = {
            "monotonic": clock.now,
            "poll_interval_s": 2.0,
            "backoff_max_s": 4.0,
            "rng": random.Random(7),
        }
        runtime = build_simulated_runtime(
            sim, settings, cloud_url=CLOUD_URL, pair_code=code, transport=transport,
            sync_options=options,
        )
        runtime.start(threaded=False)
        tick = 0

        def run(rt: EdgeRuntime, seconds: float) -> None:
            nonlocal tick
            end = clock.now() + seconds
            assert rt.sync is not None
            while clock.now() < end and not sim.finished:
                rt.step()
                if tick % 5 == 0:
                    rt.sync.run_once()
                sim.step()
                tick += 1

        def open_alerts() -> list[dict[str, Any]]:
            return list(cloud.get(owner, f"/sites/{site_id}/alerts", status="open"))

        for _ in range(600):  # until the cloud holds an open alert
            run(runtime, 1.0)
            if open_alerts():
                break
        before = {a["alert_id"] for a in open_alerts()}
        assert before, "no alert was raised before the restart"
        occupied = [
            t for t in cloud.get(owner, f"/sites/{site_id}/live")["tables"] if t["state"] != "empty"
        ]
        assert occupied

        runtime.stop()
        restarted_at = clock.now()
        runtime = build_simulated_runtime(
            sim, settings, cloud_url=CLOUD_URL, transport=transport, sync_options=options
        )
        runtime.start(threaded=False)
        assert runtime.started_at == restarted_at
        run(runtime, 30.0)
        assert runtime.sync is not None
        for _ in range(10):  # flush the outbox without new frames
            clock.advance(1.0)
            runtime.step()
            runtime.sync.run_once()

        history = {a["alert_id"]: a for a in cloud.get(owner, f"/sites/{site_id}/alerts", status="all")}
        for alert_id in before:
            alert = history[alert_id]
            assert alert["status"] == "resolved" and alert["resolve_reason"] == "expired"
            assert alert["resolved_at"] == restarted_at
        edge_open = {a.alert_id for a in runtime.live_state().open_alerts}
        assert {a["alert_id"] for a in open_alerts()} == edge_open
        edge_tables = {t.table_id: t.state.value for t in runtime.live_state().tables}
        cloud_tables = {t["table_id"]: t["state"] for t in cloud.get(owner, f"/sites/{site_id}/live")["tables"]}
        assert cloud_tables == edge_tables
        runtime.stop()
    sim.close()
