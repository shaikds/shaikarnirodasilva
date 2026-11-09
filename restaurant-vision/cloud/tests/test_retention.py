"""Data retention: the policy, the CLI and the app's periodic task."""

import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from rv_contracts import (
    AlertKind,
    AlertRaised,
    AlertSeverity,
    OccupancySnapshot,
    QueueSeated,
    QueueWalkaway,
    TableSessionClosed,
    new_uuid7,
)
from sqlalchemy import func, select
from support import Account, Api, FakeClock, FakeNotifier, event, make_settings

from rv_cloud.db import create_db_engine, upgrade_head
from rv_cloud.db.models import (
    Alert,
    Event,
    MetricSnapshot,
    OccupancyLatest,
    PairingCode,
    QueueEvent,
    TableSession,
)
from rv_cloud.main import create_app, run_retention
from rv_cloud.services.retention import apply_retention
from rv_cloud.tools import retention as retention_tool

DAY = 86400.0


def occupancy(site: str, ts: float, guests: int = 5) -> dict[str, object]:
    return event(
        OccupancySnapshot, site, ts, guests=guests, tables_occupied=1, tables_total=8,
        staff_on_floor=1,
    )


def old_facts(site: str, ts: float) -> list[dict[str, object]]:
    sid = new_uuid7()
    return [
        occupancy(site, ts),
        event(QueueWalkaway, site, ts, zone_id="z-queue", waited_s=90.0, party_size_est=2),
        event(
            AlertRaised, site, ts, alert_id=new_uuid7(), kind=AlertKind.WAITER_NEEDED,
            table_id="t1", severity=AlertSeverity.URGENT,
        ),
        event(
            TableSessionClosed, site, ts, table_id="t1", session_id=sid, seated_at=ts - 600,
            left_at=ts, max_guests=2, visits=1,
        ),
    ]


def count(api: Api, model: type) -> int:
    with api.app.state.rv.session_factory() as db:
        return int(db.scalar(select(func.count()).select_from(model)) or 0)


def test_policy_deletes_only_past_the_horizons(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    t = api.clock.now()
    # Received back then (retention of raw events counts from the receive time).
    api.post_events_at(t - 500 * DAY, device, *old_facts(site, t - 500 * DAY))  # past both
    api.post_events_at(t - 100 * DAY, device, *old_facts(site, t - 100 * DAY))  # raw gone
    api.post_events(device, occupancy(site, t, guests=7))  # recent
    r = api.client.post(f"/api/v1/sites/{site}/devices/pairing-code", headers=owner.headers)
    assert r.status_code == 201
    api.clock.advance(3600)  # the unused pairing code expires (TTL 600 s)
    now = api.clock.now()
    assert (count(api, Event), count(api, MetricSnapshot), count(api, Alert)) == (9, 3, 2)

    with api.app.state.rv.session_factory() as db:
        dry = apply_retention(db, now=now, raw_events_days=90, metrics_days=400, dry_run=True)
        db.commit()
    assert dry.dry_run and count(api, Event) == 9  # nothing deleted
    with api.app.state.rv.session_factory() as db:
        result = apply_retention(db, now=now, raw_events_days=90, metrics_days=400)
        db.commit()
    assert result.deleted == dry.deleted
    assert result.deleted == {
        "events": 8,
        "commands": 0,
        "pairing_codes": 1,
        "metric_snapshots": 1,
        "queue_events": 1,
        "alerts": 1,
        "table_sessions": 1,
    }
    assert result.raw_cutoff == now - 90 * DAY and result.metrics_cutoff == now - 400 * DAY
    assert count(api, Event) == 1  # the recent snapshot
    assert (count(api, MetricSnapshot), count(api, QueueEvent)) == (2, 1)
    assert (count(api, Alert), count(api, TableSession), count(api, PairingCode)) == (1, 1, 0)
    assert count(api, OccupancyLatest) == 1  # latest-state rows are kept
    # Reports still work on what is left; a second run deletes nothing.
    summary = api.client.get(
        f"/api/v1/sites/{site}/metrics/summary?from={t - 120 * DAY}&to={now}",
        headers=api.login("owner@a.test").headers,
    ).json()
    assert summary["sessions"] == 1 and summary["walkaways"] == 1
    with api.app.state.rv.session_factory() as db:
        assert apply_retention(db, now=now, raw_events_days=90, metrics_days=400).total == 0
    with pytest.raises(ValueError), api.app.state.rv.session_factory() as db:
        apply_retention(db, now=now, raw_events_days=0, metrics_days=400)


def test_run_retention_uses_settings_and_clock(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    t = api.clock.now()
    api.post_events_at(t - 91 * DAY, device, occupancy(site, t - 91 * DAY))
    api.post_events(device, occupancy(site, t))
    assert run_retention(api.app.state.rv) == 1  # defaults: 90 / 400 days
    assert count(api, Event) == 1


def test_cli(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    url = f"sqlite:///{tmp_path / 'r.sqlite3'}"
    engine = create_db_engine(url)
    upgrade_head(engine)
    engine.dispose()
    retention_tool.main(["--database-url", url, "--dry-run"])
    out = capsys.readouterr().out
    assert "would delete        0 events" in out and "rows in total" in out
    retention_tool.main(["--database-url", url, "--raw-events-days", "30", "--metrics-days", "60"])
    assert "deleted        0 rows in total" in capsys.readouterr().out
    result = retention_tool.run(make_settings(database_url=url), dry_run=True, now=0.0)
    assert result.raw_cutoff == -90 * DAY and result.metrics_cutoff == -400 * DAY


def test_app_applies_retention_periodically(tmp_path: Path) -> None:
    clock = FakeClock()
    settings = make_settings(
        database_url=f"sqlite:///{tmp_path / 'p.sqlite3'}",
        auto_migrate=True,
        retention_interval_s=0.05,
    )
    app = create_app(settings, clock=clock, notifier=FakeNotifier())
    with TestClient(app) as client:
        api = Api(client=client, clock=clock, notifier=FakeNotifier(), app=app)
        site, device = api.site_with_config(api.signup())
        then = clock.now() - 200 * DAY
        api.post_events_at(then, device, occupancy(site, then))
        deadline = time.monotonic() + 5.0
        while count(api, Event) and time.monotonic() < deadline:
            time.sleep(0.02)
        assert count(api, Event) == 0
        assert count(api, MetricSnapshot) == 1  # within the metrics horizon
    # disabled: no task
    off = create_app(make_settings(retention_interval_s=0), clock=clock)
    with TestClient(off):
        pass


# ------------------------------------------------------------------ redelivery after retention


def test_redelivery_after_retention_neither_double_counts_nor_fails(
    api: Api, owner: Account
) -> None:
    """At-least-once delivery: a batch whose response was lost comes back after retention
    deleted its raw events. It must count as duplicates: no second snapshot, no 500."""
    site, device = api.site_with_config(owner)
    t = api.clock.now()
    seated = event(QueueSeated, site, t, zone_id="z-queue", waited_s=120.0)
    occ = occupancy(site, t)
    assert api.post_events(device, seated, occ) == {"accepted": 2, "duplicates": 0}
    api.clock.advance(100 * DAY)
    run_retention(api.app.state.rv)  # raw events gone, derived rows kept
    assert count(api, Event) == 0
    client = TestClient(api.app, raise_server_exceptions=False)
    r = client.post("/api/v1/edge/events", headers=device, json={"events": [seated, occ]})
    assert r.status_code == 200, r.text
    assert r.json() == {"accepted": 0, "duplicates": 2}
    assert (count(api, MetricSnapshot), count(api, QueueEvent), count(api, Event)) == (1, 1, 0)


def test_derived_inserts_are_idempotent_on_event_id(api: Api, owner: Account) -> None:
    """Even inside the raw-event window, a lost raw row cannot make a derived insert fail."""
    site, device = api.site_with_config(owner)
    t = api.clock.now()
    seated = event(QueueSeated, site, t, zone_id="z-queue", waited_s=60.0)
    occ = occupancy(site, t)
    api.post_events(device, seated, occ)
    with api.app.state.rv.session_factory() as db:  # e.g. deleted by an older retention rule
        db.execute(Event.__table__.delete())
        db.commit()
    client = TestClient(api.app, raise_server_exceptions=False)
    r = client.post("/api/v1/edge/events", headers=device, json={"events": [seated, occ]})
    assert r.status_code == 200, r.text
    assert (count(api, MetricSnapshot), count(api, QueueEvent)) == (1, 1)


def test_raw_retention_counts_from_receipt_not_edge_ts(api: Api, owner: Account) -> None:
    """An event with an old edge ts (edge clock behind) received today is kept for the full
    raw window, so its redelivery is still recognized."""
    site, device = api.site_with_config(owner)
    t = api.clock.now()
    late = occupancy(site, t - 60 * DAY)
    assert api.post_events(device, late)["accepted"] == 1
    api.clock.advance(45 * DAY)  # edge ts is now 105 days old, received 45 days ago
    assert run_retention(api.app.state.rv) == 0
    assert api.post_events(device, late) == {"accepted": 0, "duplicates": 1}
    assert count(api, MetricSnapshot) == 1


def test_events_older_than_the_raw_window_count_as_processed(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    t = api.clock.now()
    old = [
        occupancy(site, t - 91 * DAY),
        event(QueueSeated, site, t - 91 * DAY, zone_id="z-queue", waited_s=5.0),
    ]
    assert api.post_events(device, *old) == {"accepted": 0, "duplicates": 2}
    assert (count(api, Event), count(api, MetricSnapshot), count(api, QueueEvent)) == (0, 0, 0)
