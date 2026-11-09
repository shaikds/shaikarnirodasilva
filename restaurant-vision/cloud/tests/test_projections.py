"""Every projection, and the live snapshot built from them."""

from rv_contracts import (
    AckVia,
    AlertAcknowledged,
    AlertKind,
    AlertRaised,
    AlertResolved,
    AlertSeverity,
    CameraHealth,
    CameraStatus,
    EdgeHeartbeat,
    OccupancySnapshot,
    QueueSeated,
    QueueSnapshot,
    QueueWalkaway,
    ResolveReason,
    TableSessionClosed,
    TableState,
    TableStateChanged,
    new_uuid7,
)
from rv_contracts.fixtures import sample_site_config
from sqlalchemy import select
from support import Account, Api, event

from rv_cloud.db.models import (
    Alert,
    MetricSnapshot,
    OccupancyLatest,
    QueueEvent,
    QueueLatest,
    Site,
    TableSession,
    TableStateCurrent,
)

YEAR = 365 * 86400.0

E, S, A, B = TableState.EMPTY, TableState.SEATED, TableState.ATTENDED, TableState.NEEDS_BUSSING


def state_change(
    site: str, ts: float, table: str, frm: TableState, to: TableState, session: str, guests: int = 2
) -> dict[str, object]:
    return event(
        TableStateChanged,
        site,
        ts,
        table_id=table,
        from_state=frm,
        to_state=to,
        guest_count=guests,
        session_id=session,
    )


def closed(
    site: str,
    ts: float,
    table: str,
    session: str,
    seated: float,
    left: float,
    guests: int = 2,
    bussing: float | None = None,
) -> dict[str, object]:
    return event(
        TableSessionClosed,
        site,
        ts,
        table_id=table,
        session_id=session,
        seated_at=seated,
        left_at=left,
        max_guests=guests,
        first_visit_delay_s=240.0,
        visits=3,
        bussing_delay_s=bussing,
    )


def test_table_state_and_session_projection(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    t = api.clock.now()
    s1 = new_uuid7()
    api.post_events(
        device,
        state_change(site, t, "t1", E, S, s1, guests=2),
        state_change(site, t + 240, "t1", S, A, s1, guests=3),
        state_change(site, t + 3600, "t1", A, B, s1, guests=0),
        closed(site, t + 3600, "t1", s1, t, t + 3600, guests=3),
    )
    api.post_events(device, state_change(site, t + 3900, "t1", B, E, s1, guests=0))
    # A late, older transition must not overwrite the current state.
    api.post_events(device, state_change(site, t + 100, "t1", E, S, new_uuid7()))
    with api.app.state.rv.session_factory() as db:
        current = db.get(TableStateCurrent, (site, "t1"))
        assert current is not None
        assert (current.state, current.since_ts, current.session_id) == ("empty", t + 3900, s1)
        session = db.get(TableSession, (site, s1))
        assert session is not None
        assert session.seated_at == t and session.left_at == t + 3600
        assert session.max_guests == 3 and session.visits == 3
        assert session.first_visit_delay_s == 240.0
        assert session.bussed_at == t + 3900
        assert session.bussing_delay_s == 300.0


def test_bussing_delay_when_bussed_before_close_arrives(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    t = api.clock.now()
    s2, s3 = new_uuid7(), new_uuid7()
    api.post_events(
        device,
        state_change(site, t, "t2", E, S, s2),
        state_change(site, t + 2000, "t2", B, E, s2),
    )
    api.post_events(device, closed(site, t + 1800, "t2", s2, t, t + 1800))
    # A producer that closes after bussing supplies the delay itself; it wins.
    api.post_events(device, closed(site, t + 900, "t3", s3, t, t + 600, bussing=45.0))
    api.post_events(device, state_change(site, t + 650, "t3", B, E, s3))
    with api.app.state.rv.session_factory() as db:
        row2 = db.get(TableSession, (site, s2))
        row3 = db.get(TableSession, (site, s3))
        assert row2 is not None and row2.bussing_delay_s == 200.0
        assert row3 is not None and row3.bussing_delay_s == 45.0


def test_alert_lifecycle_projection(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    t = api.clock.now()
    a1, a2 = new_uuid7(), new_uuid7()
    api.post_events(
        device,
        event(
            AlertRaised,
            site,
            t,
            alert_id=a1,
            kind=AlertKind.WAITER_NEEDED,
            table_id="t4",
            zone_id="z-t4",
            severity=AlertSeverity.WARN,
        ),
        event(
            AlertRaised,
            site,
            t + 1,
            alert_id=a2,
            kind=AlertKind.LONG_QUEUE,
            zone_id="z-queue",
            severity=AlertSeverity.URGENT,
        ),
        event(AlertAcknowledged, site, t + 30, alert_id=a1, ack_at=t + 30, via=AckVia.LOCAL),
    )
    # A later ack keeps the earliest; an earlier one replaces it. Unknown alerts are ignored.
    api.post_events(
        device,
        event(AlertAcknowledged, site, t + 50, alert_id=a1, ack_at=t + 50, via=AckVia.CLOUD),
        event(AlertAcknowledged, site, t + 20, alert_id=a1, ack_at=t + 20, via=AckVia.LOCAL),
        event(
            AlertResolved,
            site,
            t + 90,
            alert_id=a1,
            resolved_at=t + 90,
            reason=ResolveReason.STAFF_VISIT,
        ),
        event(
            AlertResolved,
            site,
            t + 95,
            alert_id=a1,
            resolved_at=t + 95,
            reason=ResolveReason.EXPIRED,
        ),
        event(
            AlertResolved,
            site,
            t + 95,
            alert_id=new_uuid7(),
            resolved_at=t + 95,
            reason=ResolveReason.EXPIRED,
        ),
        event(
            AlertAcknowledged, site, t + 95, alert_id=new_uuid7(), ack_at=t + 95, via=AckVia.LOCAL
        ),
        # Re-raise of an existing alert id is ignored.
        event(
            AlertRaised,
            site,
            t + 99,
            alert_id=a1,
            kind=AlertKind.CHECKIN_NEEDED,
            table_id="t4",
            severity=AlertSeverity.INFO,
        ),
    )
    with api.app.state.rv.session_factory() as db:
        alert = db.get(Alert, (site, a1))
        assert alert is not None
        assert (alert.kind, alert.raised_at) == ("waiter_needed", t)
        assert (alert.acked_at, alert.ack_via) == (t + 20, "local")
        assert (alert.resolved_at, alert.resolve_reason) == (t + 90, "staff_visit")
    views = api.client.get(f"/api/v1/sites/{site}/alerts?status=all", headers=owner.headers).json()
    assert [(v["alert_id"], v["status"]) for v in views] == [(a1, "resolved"), (a2, "open")]
    assert views[0]["table_label"] == "4" and views[1]["table_label"] is None
    assert set(views[0]) >= {"acked_at", "ack_via"} and "user_id" not in views[0]
    open_ = api.client.get(f"/api/v1/sites/{site}/alerts", headers=owner.headers).json()
    assert [v["alert_id"] for v in open_] == [a2]
    ranged = api.client.get(
        f"/api/v1/sites/{site}/alerts?status=all&from={t + 1}&to={t + 2}", headers=owner.headers
    ).json()
    assert [v["alert_id"] for v in ranged] == [a2]


def test_queue_and_occupancy_projection(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    t = api.clock.now()
    api.post_events(
        device,
        event(
            QueueSnapshot,
            site,
            t + 10,
            zone_id="z-queue",
            people=3,
            parties_est=2,
            longest_wait_s=120.0,
            avg_wait_s=60.0,
        ),
        event(
            QueueSnapshot,
            site,
            t + 20,
            zone_id="z-queue",
            people=1,
            parties_est=1,
            longest_wait_s=130.0,
            avg_wait_s=130.0,
        ),
        event(QueueSeated, site, t + 25, zone_id="z-queue", waited_s=130.0),
        event(QueueWalkaway, site, t + 26, zone_id="z-queue", waited_s=200.0, party_size_est=3),
        event(
            OccupancySnapshot,
            site,
            t + 30,
            guests=12,
            tables_occupied=4,
            tables_total=8,
            staff_on_floor=2,
        ),
    )
    # Late, older snapshots are kept for time series but do not replace "latest".
    api.post_events(
        device,
        event(
            QueueSnapshot,
            site,
            t + 5,
            zone_id="z-queue",
            people=9,
            parties_est=4,
            longest_wait_s=10.0,
            avg_wait_s=5.0,
        ),
        event(
            OccupancySnapshot,
            site,
            t + 1,
            guests=99,
            tables_occupied=8,
            tables_total=8,
            staff_on_floor=9,
        ),
    )
    with api.app.state.rv.session_factory() as db:
        kinds = [(q.kind, q.waited_s, q.party_size_est) for q in db.scalars(select(QueueEvent))]
        assert sorted(kinds) == [("seated", 130.0, None), ("walkaway", 200.0, 3)]
        snaps = db.scalars(select(MetricSnapshot).order_by(MetricSnapshot.ts)).all()
        assert [(s.kind, s.value) for s in snaps] == [
            ("occupancy", 99.0),
            ("queue", 9.0),
            ("queue", 3.0),
            ("queue", 1.0),
            ("occupancy", 12.0),
        ]
    live = api.client.get(f"/api/v1/sites/{site}/live", headers=owner.headers).json()
    assert live["occupancy"] == {
        "ts": t + 30,
        "guests": 12,
        "tables_occupied": 4,
        "tables_total": 8,
        "staff_on_floor": 2,
    }
    assert live["queues"] == [
        {
            "zone_id": "z-queue",
            "ts": t + 20,
            "people": 1,
            "parties_est": 1,
            "longest_wait_s": 130.0,
            "avg_wait_s": 130.0,
        }
    ]
    summary = api.client.get(f"/api/v1/orgs/{owner.org_id}/sites", headers=owner.headers).json()
    assert summary[0]["guests"] == 12


def heartbeat(site: str, ts: float) -> dict[str, object]:
    return event(
        EdgeHeartbeat,
        site,
        ts,
        device_id="edge-1",
        version="0.1.0",
        cameras=[
            CameraHealth(
                camera_id="cam-dining", status=CameraStatus.OK, fps=5.0, last_frame_age_s=0.2
            )
        ],
        cpu_pct=30.0,
        mem_mb=500.0,
        outbox_depth=2,
    )


def test_heartbeat_projection_and_online_window(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    t = api.clock.now()
    api.post_events(device, heartbeat(site, t))
    devices = api.client.get(f"/api/v1/sites/{site}/devices", headers=owner.headers).json()
    assert len(devices) == 1
    d = devices[0]
    assert d["online"] is True and d["last_seen_at"] == t and d["version"] == "0.1.0"
    assert d["cameras"] == [
        {"camera_id": "cam-dining", "status": "ok", "fps": 5.0, "last_frame_age_s": 0.2}
    ]
    assert (d["cpu_pct"], d["mem_mb"], d["outbox_depth"]) == (30.0, 500.0, 2)
    # An old buffered heartbeat delivered later does not overwrite newer health.
    api.clock.advance(60)
    old = heartbeat(site, t - 600)
    old["outbox_depth"] = 999
    api.post_events(device, old)
    d = api.client.get(f"/api/v1/sites/{site}/devices", headers=owner.headers).json()[0]
    assert d["outbox_depth"] == 2 and d["last_seen_at"] == t + 60
    api.clock.advance(91)
    d = api.client.get(f"/api/v1/sites/{site}/devices", headers=owner.headers).json()[0]
    assert d["online"] is False
    sites = api.client.get(f"/api/v1/orgs/{owner.org_id}/sites", headers=owner.headers).json()
    assert sites[0]["edge_online"] is False


def test_live_snapshot(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    t = api.clock.now()
    s1, a1, a2 = new_uuid7(), new_uuid7(), new_uuid7()
    api.post_events(
        device,
        heartbeat(site, t),
        state_change(site, t, "t3", E, S, s1, guests=4),
        event(
            AlertRaised,
            site,
            t + 180,
            alert_id=a1,
            kind=AlertKind.WAITER_NEEDED,
            table_id="t3",
            severity=AlertSeverity.WARN,
        ),
        event(
            AlertRaised,
            site,
            t + 200,
            alert_id=a2,
            kind=AlertKind.LONG_QUEUE,
            zone_id="z-queue",
            severity=AlertSeverity.URGENT,
        ),
    )
    api.clock.advance(60)
    live = api.client.get(f"/api/v1/sites/{site}/live", headers=owner.headers).json()
    assert live["site_id"] == site and live["ts"] == t + 60
    tables = {row["table_id"]: row for row in live["tables"]}
    assert len(tables) == 8
    assert tables["t3"] == {
        "table_id": "t3",
        "label": "3",
        "seats": 4,
        "state": "seated",
        "guest_count": 4,
        "since_ts": t,
        "open_alert_ids": [a1],
    }
    assert tables["t1"]["state"] == "empty" and tables["t1"]["since_ts"] is None
    assert [a["alert_id"] for a in live["open_alerts"]] == [a1, a2]
    assert live["occupancy"] is None and live["queues"] == []
    assert live["devices"][0]["online"] is True
    with api.app.state.rv.session_factory() as db:
        stored = db.get(Site, site)
        assert stored is not None and stored.first_event_ts == t


def test_backdated_since_and_condition_times(api: Api, owner: Account) -> None:
    """Contracts 1.1: ``since_ts`` / ``condition_since_ts`` drive the live timers and the
    session start; ordering still follows the transition ``ts``."""
    site, device = api.site_with_config(owner)
    t = api.clock.now()
    s1, a1 = new_uuid7(), new_uuid7()
    seated = event(
        TableStateChanged, site, t + 32, table_id="t3", from_state=E, to_state=S,
        guest_count=3, session_id=s1, since_ts=t,
    )
    raised = event(
        AlertRaised, site, t + 180, alert_id=a1, kind=AlertKind.WAITER_NEEDED, table_id="t3",
        severity=AlertSeverity.URGENT, condition_since_ts=t,
    )
    api.post_events(device, seated, raised)
    # A transition confirmed later but backdated before the stored one still wins (ordering
    # is by ts); an older transition never does, whatever its since_ts.
    attended = event(
        TableStateChanged, site, t + 260, table_id="t3", from_state=S, to_state=A,
        guest_count=3, session_id=s1, since_ts=t + 250,
    )
    stale = event(
        TableStateChanged, site, t + 100, table_id="t3", from_state=E, to_state=S,
        guest_count=1, session_id=new_uuid7(), since_ts=t + 99,
    )
    live = api.client.get(f"/api/v1/sites/{site}/live", headers=owner.headers).json()
    t3 = next(row for row in live["tables"] if row["table_id"] == "t3")
    assert (t3["state"], t3["since_ts"]) == ("seated", t)
    (alert,) = live["open_alerts"]
    assert (alert["raised_at"], alert["condition_since_ts"]) == (t + 180, t)
    listed = api.client.get(f"/api/v1/sites/{site}/alerts?status=open", headers=owner.headers)
    assert listed.json()[0]["condition_since_ts"] == t
    api.post_events(device, attended, stale)
    with api.app.state.rv.session_factory() as db:
        current = db.get(TableStateCurrent, (site, "t3"))
        assert current is not None
        assert (current.state, current.since_ts) == ("attended", t + 250)
        assert current.changed_at == t + 260
        session = db.get(TableSession, (site, s1))
        assert session is not None and session.seated_at == t  # backdated session start
        row = db.get(Alert, (site, a1))
        assert row is not None and row.condition_since_ts == t


def test_1_0_events_fall_back_to_ts(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    t = api.clock.now()
    api.post_events(device, state_change(site, t, "t2", E, S, new_uuid7()))
    live = api.client.get(f"/api/v1/sites/{site}/live", headers=owner.headers).json()
    assert next(r for r in live["tables"] if r["table_id"] == "t2")["since_ts"] == t


def test_device_local_url_from_heartbeat(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    t = api.clock.now()
    beat = heartbeat(site, t)
    beat["local_url"] = "http://192.168.1.20:8787"
    api.post_events(device, beat)
    d = api.client.get(f"/api/v1/sites/{site}/devices", headers=owner.headers).json()[0]
    assert d["local_url"] == "http://192.168.1.20:8787"
    live = api.client.get(f"/api/v1/sites/{site}/live", headers=owner.headers).json()
    assert live["devices"][0]["local_url"] == "http://192.168.1.20:8787"
    # a newer heartbeat without it (1.0 edge) clears it; an older one changes nothing
    newer = heartbeat(site, t + 30)
    api.post_events(device, newer)
    d = api.client.get(f"/api/v1/sites/{site}/devices", headers=owner.headers).json()[0]
    assert d["local_url"] is None


# ------------------------------------------------------------------ stale and poisoned projections


def queue_snapshot(site: str, ts: float, people: int, zone: str = "z-queue") -> dict[str, object]:
    return event(
        QueueSnapshot, site, ts, zone_id=zone, people=people, parties_est=2,
        longest_wait_s=300.0, avg_wait_s=120.0,
    )


def occupancy(site: str, ts: float, guests: int) -> dict[str, object]:
    return event(
        OccupancySnapshot, site, ts, guests=guests, tables_occupied=0, tables_total=8,
        staff_on_floor=0,
    )


def test_removed_queue_zone_and_table_leave_the_live_view(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    t = api.clock.now()
    sid = new_uuid7()
    api.post_events(device, queue_snapshot(site, t, 5), state_change(site, t, "t8", E, S, sid))
    # The installer deletes the queue zone and table t8 in the setup wizard.
    cfg = sample_site_config(site_id=site).model_dump(mode="json")
    cfg["zones"] = [
        z for z in cfg["zones"] if z["zone_id"] != "z-queue" and z.get("table_id") != "t8"
    ]
    cfg["tables"] = [tb for tb in cfg["tables"] if tb["table_id"] != "t8"]
    assert api.client.put("/api/v1/edge/config", headers=device, json=cfg).status_code == 200
    with api.app.state.rv.session_factory() as db:
        assert db.scalars(select(QueueLatest.zone_id)).all() == []
        assert "t8" not in db.scalars(select(TableStateCurrent.table_id)).all()
    # A late snapshot of the removed zone (edge not reconfigured yet) is not shown either.
    api.post_events(device, queue_snapshot(site, t + 1, 6))
    api.clock.advance(7 * 86400)
    live = api.client.get(f"/api/v1/sites/{site}/live", headers=api.login("owner@a.test").headers)
    assert live.status_code == 200
    body = live.json()
    assert body["queues"] == []
    assert "t8" not in {tb["table_id"] for tb in body["tables"]}


def test_far_future_edge_ts_is_rejected_and_cannot_freeze_latest_rows(
    api: Api, owner: Account
) -> None:
    api.app.state.rv.settings.max_event_future_s = 300.0  # the production default
    site, device = api.site_with_config(owner)
    now = api.clock.now()
    r = api.client.post(
        "/api/v1/edge/events",
        headers=device,
        json={"events": [occupancy(site, now + 10, 3), occupancy(site, now + YEAR, 40)]},
    )
    assert r.status_code == 422  # the edge dead-letters the bad event (batch halving)
    assert "ahead of the server clock" in r.text
    assert api.post_events(device, occupancy(site, now + 10, 3)) == {"accepted": 1, "duplicates": 0}
    live = api.client.get(f"/api/v1/sites/{site}/live", headers=owner.headers).json()
    assert live["occupancy"]["guests"] == 3


def test_poisoned_latest_rows_are_replaced_by_newer_events(api: Api, owner: Account) -> None:
    """Rows written by a wrong device clock before such events were rejected never block
    correct events (the "latest" ordering ignores rows beyond the accepted future)."""
    api.app.state.rv.settings.max_event_future_s = 300.0
    site, device = api.site_with_config(owner)
    now = api.clock.now()
    with api.app.state.rv.session_factory() as db:
        db.add(OccupancyLatest(site_id=site, ts=now + YEAR, guests=40, tables_occupied=0,
                               tables_total=8, staff_on_floor=0))
        db.add(QueueLatest(site_id=site, zone_id="z-queue", ts=now + YEAR, people=9,
                           parties_est=3, longest_wait_s=1.0, avg_wait_s=1.0))
        db.add(TableStateCurrent(site_id=site, table_id="t1", state="seated", guest_count=4,
                                 session_id="s-old", since_ts=now + YEAR, changed_at=now + YEAR))
        db.commit()
    api.post_events(
        device,
        occupancy(site, now, 3),
        queue_snapshot(site, now, 1),
        state_change(site, now, "t1", S, A, "s-old"),
    )
    live = api.client.get(f"/api/v1/sites/{site}/live", headers=owner.headers).json()
    assert live["occupancy"]["guests"] == 3
    assert [q["people"] for q in live["queues"]] == [1]
    assert next(tb for tb in live["tables"] if tb["table_id"] == "t1")["state"] == "attended"
    # Ordinary out-of-order delivery is still ordered by edge ts.
    api.post_events(device, occupancy(site, now - 60, 99))
    live = api.client.get(f"/api/v1/sites/{site}/live", headers=owner.headers).json()
    assert live["occupancy"]["guests"] == 3


def test_future_check_can_be_disabled_for_sped_up_demos(api: Api, owner: Account) -> None:
    api.app.state.rv.settings.max_event_future_s = 0
    site, device = api.site_with_config(owner)
    now = api.clock.now()
    api.post_events(device, occupancy(site, now + 3600, 12))  # simulated time, 20x ahead
    api.post_events(device, occupancy(site, now + 1800, 99))  # older: does not replace it
    live = api.client.get(f"/api/v1/sites/{site}/live", headers=owner.headers).json()
    assert live["occupancy"]["guests"] == 12


# ------------------------------------------------------------------ edge restart (contracts 1.2)


def booted(site: str, ts: float, started_at: float | None) -> dict[str, object]:
    hb = heartbeat(site, ts)
    hb["started_at"] = started_at
    return hb


def test_edge_restart_expires_orphaned_alerts_and_resets_table_states(
    api: Api, owner: Account
) -> None:
    site, device = api.site_with_config(owner)
    t = api.clock.now()
    old_alert, new_alert = new_uuid7(), new_uuid7()
    api.post_events(
        device,
        booted(site, t - 600, t - 900),  # first boot
        state_change(site, t - 500, "t1", E, S, new_uuid7(), guests=3),
        state_change(site, t - 400, "t2", E, S, new_uuid7()),
        event(AlertRaised, site, t - 300, alert_id=old_alert, kind=AlertKind.WAITER_NEEDED,
              table_id="t1", severity=AlertSeverity.URGENT),
    )
    restart = t - 100
    with api.client.websocket_connect(
        f"/api/v1/ws?token={owner.tokens['access_token']}&site_id={site}"
    ) as ws:
        ws.receive_text()  # live.snapshot
        api.post_events(
            device,
            state_change(site, t - 50, "t2", S, A, new_uuid7()),  # after the reboot: kept
            event(AlertRaised, site, t - 40, alert_id=new_alert, kind=AlertKind.CHECKIN_NEEDED,
                  table_id="t2", severity=AlertSeverity.WARN),
            booted(site, t - 30, restart),  # the edge restarted at t - 100
        )
        received = [ws.receive_json() for _ in range(5)]
    types = [m["type"] for m in received]
    assert types[:3] == ["table.state_changed", "alert.raised", "edge.heartbeat"]
    resolved = received[3]
    assert (resolved["type"], resolved["alert_id"], resolved["reason"]) == (
        "alert.resolved", old_alert, "expired"
    )
    reset = received[4]
    assert (reset["type"], reset["table_id"], reset["from_state"], reset["to_state"]) == (
        "table.state_changed", "t1", "seated", "empty"
    )
    live = api.client.get(f"/api/v1/sites/{site}/live", headers=owner.headers).json()
    assert [a["alert_id"] for a in live["open_alerts"]] == [new_alert]
    states = {tb["table_id"]: tb["state"] for tb in live["tables"]}
    assert states["t1"] == "empty" and states["t2"] == "attended"
    with api.app.state.rv.session_factory() as db:
        alert = db.scalars(select(Alert).where(Alert.alert_id == old_alert)).one()
        assert (alert.resolved_at, alert.resolve_reason) == (restart, "expired")

    # A late event from before the reboot cannot bring the old state back; an old or repeated
    # boot time changes nothing.
    api.post_events(device, state_change(site, t - 200, "t1", E, S, new_uuid7()))
    api.post_events(device, booted(site, t - 20, restart), booted(site, t - 10, t - 900))
    live = api.client.get(f"/api/v1/sites/{site}/live", headers=owner.headers).json()
    assert {tb["table_id"]: tb["state"] for tb in live["tables"]}["t1"] == "empty"
    assert [a["alert_id"] for a in live["open_alerts"]] == [new_alert]


def test_expired_alerts_have_no_response_time(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    t = api.clock.now()
    api.post_events(
        device,
        event(AlertRaised, site, t - 3000, alert_id=new_uuid7(), kind=AlertKind.WAITER_NEEDED,
              table_id="t1", severity=AlertSeverity.URGENT),
        booted(site, t - 60, t - 120),
    )
    summary = api.client.get(
        f"/api/v1/sites/{site}/metrics/summary?from={t - 3600}&to={t}", headers=owner.headers
    ).json()
    assert summary["waiter_response_p50_s"] is None and summary["waiter_response_p90_s"] is None
