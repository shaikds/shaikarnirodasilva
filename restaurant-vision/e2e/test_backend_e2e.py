"""Backend end to end: the real cloud app and the real edge runtime on ``smoke.yaml``.

One manual simulator clock drives everything (edge frames, analytics timers, heartbeats, the
sync schedule and the cloud's own clock), so the run is deterministic and takes seconds, not
the scenario's 10 minutes. The edge is built exactly as ``rv-edge simulate --cloud ...
--pair-code ...`` builds it (``build_simulated_runtime``) and runs in manual mode
(``start(threaded=False)``): each 0.2 s tick reads one frame per camera, and once per simulated
second the cloud sync runs one round (``CloudSync.run_once``) over an in-process transport into
the cloud app (``TestClient``, SQLite, migrated on startup).

Along the way the test takes the internet down for a minute and loses one response, to check
store-and-forward and idempotent ingest under the conditions they exist for.
"""

from __future__ import annotations

import datetime as dt
import random
import statistics
import time
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from rv_contracts import (
    AlertKind,
    AlertView,
    DeviceStatus,
    LiveSnapshot,
    MetricsSummary,
    ShiftReport,
    TableState,
    Timeseries,
)
from rv_sim.adapter import load_simulation
from rv_sim.clock import ManualClock
from sqlalchemy import select

from conftest import (
    CLOUD_URL,
    PASSWORD,
    SMOKE,
    CloudApi,
    CloudTransport,
    RecordingNotifier,
    RecordingSink,
    TestClient,
    cloud_settings,
)
from rv_cloud.db.models import Command, Event
from rv_cloud.main import create_app
from rv_edge.runtime.cli import build_simulated_runtime, simulation_settings
from rv_edge.runtime.settings import EdgeSettings

LOCAL_URL = "http://192.168.1.50:8787"
TICKS_PER_SYNC = 5
"""One sync round per simulated second (5 fps)."""
OFFLINE = (330.0, 390.0)
"""Seconds after the start during which the cloud is unreachable."""
LOSE_RESPONSE_AT = 450.0
MID_RUN_AT = 150.0
"""When the room is full and two parties wait in the queue."""


def test_backend_end_to_end(tmp_path: Path, notifier: RecordingNotifier) -> None:
    wall_start = time.monotonic()
    sim = load_simulation(SMOKE, manual=True)  # the scenario's own date: reproducible
    clock = sim.clock
    assert isinstance(clock, ManualClock)
    tz = ZoneInfo(sim.config.timezone)
    app = create_app(cloud_settings(tmp_path), clock=clock, notifier=notifier)
    with TestClient(app) as client:
        cloud = CloudApi(client)

        # ------------------------------------------------ tenant, site, staff, pairing code
        owner = cloud.signup("owner@e2e.test", "E2E Restaurants")
        site = cloud.post(
            owner,
            f"/orgs/{owner.org_id}/sites",
            {"name": "Smoke", "timezone": sim.config.timezone, "avg_check_per_guest": 100.0},
            status=201,
        )
        site_id = site["site_id"]
        cloud.post(
            owner,
            f"/orgs/{owner.org_id}/users",
            {
                "email": "waiter@e2e.test",
                "name": "Waiter",
                "password": PASSWORD,
                "memberships": [{"role": "waiter", "site_id": site_id}],
            },
            status=201,
        )
        waiter = cloud.login("waiter@e2e.test")
        cloud.post(
            waiter,
            "/push/subscriptions",
            {
                "site_id": site_id,
                "endpoint": "https://fcm.googleapis.com/fcm/send/waiter-phone",
                "keys": {"p256dh": "BEl62iUYgUivxIkv69yViEuiBIa", "auth": "tBHItJI5svbpez7KI4C"},
            },
            status=201,
        )
        code = cloud.post(owner, f"/sites/{site_id}/devices/pairing-code", status=201)["code"]

        # ------------------------------------------------ the edge, as `rv-edge simulate` builds it
        transport = CloudTransport(client)
        settings = simulation_settings(
            EdgeSettings(edge_ui_dir=tmp_path / "no-ui", local_url=LOCAL_URL),
            data_dir=tmp_path / "edge",
            cloud_url=CLOUD_URL,
        )
        runtime = build_simulated_runtime(
            sim,
            settings,
            cloud_url=CLOUD_URL,
            pair_code=code,
            transport=transport,
            sync_options={
                "monotonic": clock.now,  # poll and back-off on simulated time
                "poll_interval_s": 2.0,
                "backoff_max_s": 4.0,
                "rng": random.Random(7),
            },
        )
        # 1. pairing: the edge holds a token for this site; the cloud knows the device
        assert runtime.secrets.paired and runtime.site_id == site_id
        devices = _devices(cloud, owner, site_id)
        assert [d.device_id for d in devices] == [runtime.device_id]
        assert devices[0].online is False and devices[0].local_url is None  # no heartbeat yet

        edge = RecordingSink()
        runtime.bus.subscribe(edge)
        sync = runtime.sync
        assert sync is not None
        runtime.start(threaded=False)

        mid_cloud: LiveSnapshot | None = None
        mid_edge: Any = None
        acked: AlertView | None = None
        ack_at: float | None = None
        edge_applied_ack_at: float | None = None
        max_offline_depth = 0
        tick = 0
        try:
            while not sim.finished:
                runtime.step()
                elapsed = clock.now() - sim.start_ts
                transport.offline = OFFLINE[0] <= elapsed < OFFLINE[1]
                if elapsed >= LOSE_RESPONSE_AT and transport.lost_responses == 0:
                    transport.lose_next_events_response = True
                if tick % TICKS_PER_SYNC == 0:
                    sync.run_once()
                    if transport.offline:
                        max_offline_depth = max(max_offline_depth, runtime.outbox_depth())
                        assert not sync.online
                    if mid_cloud is None and elapsed >= MID_RUN_AT:
                        mid_cloud = LiveSnapshot.model_validate(
                            cloud.get(owner, f"/sites/{site_id}/live")
                        )
                        mid_edge = runtime.live_state()
                    if acked is None:
                        acked, ack_at = _ack_waiter_alert_in_cloud(cloud, waiter, site_id, runtime)
                    elif edge_applied_ack_at is None:
                        view = runtime.find_alert(acked.alert_id)
                        if view is not None and view.ack_via is not None:
                            assert view.ack_via.value == "cloud" and view.acked_at == ack_at
                            edge_applied_ack_at = clock.now()
                sim.step()
                tick += 1
            # drain the outbox (and let the last heartbeat through)
            for _ in range(30):
                clock.advance(1.0)
                runtime.step()
                sync.run_once()
                if runtime.outbox_depth() == 0 and sync.online:
                    break
        finally:
            runtime.stop()
            sim.close()
        end_ts = clock.now()

        # 2. store-and-forward: nothing lost across the outage, outbox drained
        assert max_offline_depth > 0 and transport.refused > 0
        assert runtime.outbox_depth() == 0

        # 3. idempotent ingest: every edge event stored exactly once, retries are duplicates
        edge_ids = {e.event_id for e in edge.events}
        with app.state.rv.session_factory() as db:
            stored = db.execute(select(Event.event_id, Event.type, Event.device_id)).all()
            commands = db.scalars(select(Command).where(Command.kind == "alert_ack")).all()
        assert {row.event_id for row in stored} == edge_ids and len(stored) == len(edge_ids)
        assert transport.lost_responses == 1
        assert any(r["duplicates"] > 0 for r in transport.event_responses)  # the retried batch
        replay = transport.event_batches[0]
        device_auth = {"Authorization": f"Bearer {runtime.secrets.device_token()}"}
        again = client.post(f"{CLOUD_URL}/api/v1/edge/events", json=replay, headers=device_auth)
        assert again.json() == {"accepted": 0, "duplicates": len(replay["events"])}

        # 4. live view mid-service: table states, occupancy and the queue, as on the edge
        assert mid_cloud is not None and mid_edge is not None
        states = {t.table_id: t for t in mid_cloud.tables}
        assert len(states) == 8
        busy = [t for t in states.values() if t.state in (TableState.SEATED, TableState.ATTENDED)]
        assert len(busy) >= 6
        for table in mid_edge.tables:  # same state and same backdated start as the edge
            assert (states[table.table_id].state, states[table.table_id].since_ts) == (
                table.state,
                table.since_ts,
            )
            if table.state is not TableState.EMPTY:
                assert table.since_ts is not None and table.since_ts < clock.now()
        assert mid_cloud.occupancy is not None and mid_cloud.occupancy.guests >= 15
        assert mid_cloud.occupancy.tables_occupied == len(busy)
        queues = {q.zone_id: q for q in mid_cloud.queues}
        assert queues and max(q.people for q in queues.values()) >= 2

        # 5. waiter_needed reached the cloud with the backdated seating time, and was pushed
        assert acked is not None and ack_at is not None
        assert acked.kind is AlertKind.WAITER_NEEDED and acked.table_id is not None
        since = acked.condition_since_ts
        assert since is not None and since < acked.raised_at - 150  # seated ~180 s before
        truth = [s for s in sim.ground_truth.sessions if s.table_id == acked.table_id]
        seated_truth = min(truth, key=lambda s: abs(s.seated_at - since))
        assert abs(seated_truth.seated_at - since) < 5.0  # backdated to the true seating
        assert app.state.rv.push.drain()  # pushes are sent off the request path
        pushes = [p for _, p in notifier.sent if p["alert_id"] == acked.alert_id]
        assert pushes == [
            {
                "alert_id": acked.alert_id,
                "site_id": site_id,
                "kind": "waiter_needed",
                "severity": "urgent",
                "table_label": acked.table_label,
                "raised_at": acked.raised_at,
                "condition_since_ts": acked.condition_since_ts,
            }
        ]

        # 6. cloud ack -> command -> applied on the edge -> alert.acknowledged back in the cloud
        assert [c.payload_json["alert_id"] for c in commands] == [acked.alert_id]
        assert edge_applied_ack_at is not None and edge_applied_ack_at - ack_at <= 4.0
        edge_acks = [a for a in edge.of_type("alert.acknowledged") if a.alert_id == acked.alert_id]
        assert len(edge_acks) == 1
        assert (edge_acks[0].via.value, edge_acks[0].ack_at) == ("cloud", ack_at)
        assert any(
            row.event_id == edge_acks[0].event_id and row.device_id == runtime.device_id
            for row in stored
        )
        history = [
            AlertView.model_validate(a)
            for a in cloud.get(owner, f"/sites/{site_id}/alerts", status="all")
        ]
        final = next(a for a in history if a.alert_id == acked.alert_id)
        assert final.status.value == "resolved" and final.resolve_reason is not None
        assert (final.acked_at, final.ack_via) == (ack_at, acked.ack_via)
        assert final.resolve_reason.value == "staff_visit"

        # 7. metrics, time series and the shift report agree with what the edge emitted
        _check_metrics(cloud, owner, site_id, edge, sim.start_ts, end_ts, tz)

        # 8. the device is online and advertises its LAN URL for the offline link
        devices = _devices(cloud, owner, site_id)
        assert len(devices) == 1
        device = devices[0]
        assert device.online and device.device_id == runtime.device_id
        assert device.local_url == LOCAL_URL
        (for_waiter,) = _devices(cloud, waiter, site_id)  # the waiter app's offline link
        assert (for_waiter.online, for_waiter.local_url) == (True, LOCAL_URL)
        assert for_waiter.cpu_pct is None and for_waiter.cameras == []
        assert {c.camera_id for c in device.cameras} == {c.camera_id for c in sim.config.cameras}
        heartbeats = edge.of_type("edge.heartbeat")
        assert len(heartbeats) >= 20 and all(h.device_id == runtime.device_id for h in heartbeats)
        config = cloud.get(owner, f"/sites/{site_id}/config")  # pushed by the edge on first sync
        assert len(config["tables"]) == 8 and config["site_id"] == site_id

    print(f"\nbackend e2e: {end_ts - sim.start_ts:.0f} s simulated, {len(edge_ids)} events, "
          f"{time.monotonic() - wall_start:.1f} s wall")


def _devices(cloud: CloudApi, user: Any, site_id: str) -> list[DeviceStatus]:
    return [DeviceStatus.model_validate(d) for d in cloud.get(user, f"/sites/{site_id}/devices")]


def _ack_waiter_alert_in_cloud(
    cloud: CloudApi, waiter: Any, site_id: str, runtime: Any
) -> tuple[AlertView | None, float | None]:
    """Once the edge has an open ``waiter_needed`` alert and it reached the cloud, press
    "On it" in the waiter app. Returns the cloud's view of the alert and the ack time."""
    local = [a for a in runtime.live_state().open_alerts if a.kind is AlertKind.WAITER_NEEDED]
    if not local:
        return None, None
    open_in_cloud = [
        AlertView.model_validate(a)
        for a in cloud.get(waiter, f"/sites/{site_id}/alerts", status="open")
    ]
    match = next((a for a in open_in_cloud if a.alert_id == local[0].alert_id), None)
    if match is None:
        return None, None
    assert match.condition_since_ts == local[0].condition_since_ts  # same on both sides
    view = AlertView.model_validate(cloud.post(waiter, f"/alerts/{match.alert_id}/ack"))
    assert view.status.value == "acknowledged" and view.ack_via is not None
    assert view.ack_via.value == "cloud"
    return view, view.acked_at


def _check_metrics(
    cloud: CloudApi,
    owner: Any,
    site_id: str,
    edge: RecordingSink,
    start: float,
    end: float,
    tz: ZoneInfo,
) -> None:
    closed = edge.of_type("table.session_closed")
    walkaways = edge.of_type("queue.walkaway")
    seated = edge.of_type("queue.seated")
    raised = {a.alert_id: a for a in edge.of_type("alert.raised")}
    resolved = {r.alert_id: r for r in edge.of_type("alert.resolved")}
    responses = [
        resolved[i].resolved_at - a.ts
        for i, a in raised.items()
        if a.kind is AlertKind.WAITER_NEEDED and i in resolved
    ]
    assert closed and seated and responses and len(walkaways) == 2  # the scripted walk-aways

    summary = MetricsSummary.model_validate(
        cloud.get(owner, f"/sites/{site_id}/metrics/summary", **{"from": start, "to": end})
    )
    assert summary.sessions == len(closed) > 0
    assert summary.guests_served == sum(c.max_guests for c in closed)
    assert summary.walkaways == len(walkaways)
    assert summary.queue_avg_wait_s is not None
    assert abs(summary.queue_avg_wait_s - statistics.mean(s.waited_s for s in seated)) < 1e-6
    assert summary.waiter_response_p50_s is not None
    assert abs(summary.waiter_response_p50_s - statistics.median(responses)) < 1e-6
    lost = sum(w.party_size_est for w in walkaways) * 100.0
    assert summary.lost_revenue.value == lost and summary.lost_revenue.is_estimate

    def series(metric: str, bucket: str) -> list[float | None]:
        body = Timeseries.model_validate(
            cloud.get(
                owner,
                f"/sites/{site_id}/metrics/timeseries",
                metric=metric,
                bucket=bucket,
                **{"from": start, "to": end},
            )
        )
        assert body.points and body.points[0].ts <= start
        return [p.value for p in body.points]

    occupancy = [v for v in series("occupancy", "5m") if v is not None]
    assert len(occupancy) >= 2 and max(occupancy) > 10
    assert any(v for v in series("queue", "5m") if v is not None)
    assert sum(v or 0 for v in series("walkaways", "5m")) == summary.walkaways
    daily = {m: [v for v in series(m, "1d") if v is not None] for m in (
        "queue_wait", "response_time", "response_time_p90"
    )}
    assert daily["queue_wait"] == [summary.queue_avg_wait_s]
    assert daily["response_time"] == [summary.waiter_response_p50_s]
    assert daily["response_time_p90"] == [summary.waiter_response_p90_s]

    day = dt.datetime.fromtimestamp(start, tz).date()
    shift = ShiftReport.model_validate(
        cloud.get(owner, f"/sites/{site_id}/reports/shift", date=day.isoformat())
    )
    assert shift.from_ts <= start and shift.to_ts >= end
    same = ("sessions", "guests_served", "walkaways", "queue_avg_wait_s", "waiter_response_p50_s")
    assert {k: getattr(shift.summary, k) for k in same} == {k: getattr(summary, k) for k in same}
    assert sum(t.sessions for t in shift.tables) == summary.sessions
    start_hour = dt.datetime.fromtimestamp(start, tz).replace(minute=0, second=0).timestamp()
    first_hour = {p.ts: p.value for p in shift.occupancy_by_hour}[start_hour]
    assert first_hour is not None and first_hour > 0
    assert shift.roi.walkaways == summary.walkaways
    assert shift.roi.lost_revenue.value == summary.lost_revenue.value
