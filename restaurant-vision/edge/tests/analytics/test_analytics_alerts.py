"""Alert lifecycle: raise, de-duplicate, acknowledge (idempotent), resolve."""

from __future__ import annotations

from analytics_dsl import T0, Scenario, crisp_config, of_type, person
from rv_contracts import (
    AckVia,
    AlertAcknowledged,
    AlertKind,
    AlertSeverity,
    AlertStatus,
    ResolveReason,
)

from rv_edge.analytics import AlertManager


def seated_t3_with_waiter_alert() -> Scenario:
    sc = Scenario(crisp_config())
    sc.add(person(at="t3", from_t=10))
    sc.add(person(at="t3", role="staff", from_t=300, to_t=320, offset=(0.03, 0.0)))
    sc.run(250)
    return sc


def test_local_ack_is_idempotent_and_does_not_resolve() -> None:
    sc = seated_t3_with_waiter_alert()
    alert_id = sc.alert_id("waiter_needed", "t3")
    first = sc.ack(alert_id, at=230.0, via=AckVia.LOCAL)
    assert sc.summary(first) == [(230.0, "acked", "waiter_needed", "local")]
    ack = of_type(first, AlertAcknowledged)[0]
    assert (ack.ack_at, ack.via, ack.ts) == (T0 + 230.0, AckVia.LOCAL, T0 + 230.0)
    assert sc.ack(alert_id, at=231.0, via=AckVia.CLOUD) == []  # acked once only
    view = sc.eng.live().open_alerts[0]
    assert (view.status, view.acked_at, view.ack_via) == (
        AlertStatus.ACKNOWLEDGED,
        T0 + 230.0,
        AckVia.LOCAL,
    )
    assert view.severity is AlertSeverity.URGENT
    # the staff visit resolves it; a late ack after that is a no-op
    assert sc.summary(sc.run(400)) == [
        (305.0, "state", "t3", "seated", "attended", 1),
        (305.0, "resolved", "waiter_needed", "staff_visit"),
    ]
    assert sc.ack(alert_id, at=410.0) == []
    assert sc.eng.live().open_alerts == []


def test_cloud_ack_keeps_cloud_time_and_unknown_alert_is_ignored() -> None:
    sc = seated_t3_with_waiter_alert()
    alert_id = sc.alert_id("waiter_needed")
    assert sc.ack("not-an-alert", at=231.0) == []
    events = sc.ack(alert_id, at=229.5, via=AckVia.CLOUD)
    assert sc.summary(events) == [(229.5, "acked", "waiter_needed", "cloud")]


def test_manager_dedupes_open_alerts_per_kind_and_target() -> None:
    mgr = AlertManager("site-demo")
    rec, events = mgr.raise_alert(AlertKind.WAITER_NEEDED, 1.0, table_id="t1", zone_id="z-t1")
    assert rec is not None and len(events) == 1 and rec.severity is AlertSeverity.URGENT
    again, more = mgr.raise_alert(AlertKind.WAITER_NEEDED, 2.0, table_id="t1", zone_id="z-t1")
    assert again is rec and more == []
    other, _ = mgr.raise_alert(AlertKind.CHECKIN_NEEDED, 3.0, table_id="t1", zone_id="z-t1")
    queue, _ = mgr.raise_alert(AlertKind.LONG_QUEUE, 4.0, zone_id="z-queue")
    assert other is not None and queue is not None
    assert queue.severity is AlertSeverity.WARN
    assert [r.alert_id for r in mgr.open_alerts()] == [rec.alert_id, other.alert_id,
                                                        queue.alert_id]
    assert mgr.open_ids_for_table("t1") == [rec.alert_id, other.alert_id]
    views = mgr.views({"t1": "Window 1"})
    assert [v.table_label for v in views] == ["Window 1", "Window 1", None]
    assert all(v.site_id == "site-demo" and v.status is AlertStatus.OPEN for v in views)
    snap = mgr.snapshot()
    assert snap["enabled"] is True and len(snap["open"]) == 3
    resolved = mgr.resolve_where(5.0, ResolveReason.MANUAL, table_id="t1")
    assert [e.reason for e in resolved] == [ResolveReason.MANUAL] * 2  # type: ignore[union-attr]
    assert mgr.resolve(rec.alert_id, 6.0, ResolveReason.MANUAL) == []
    assert len(mgr.resolve_where(7.0, ResolveReason.EXPIRED, zone_id="z-queue")) == 1
    assert mgr.open_alerts() == [] and mgr.get(rec.alert_id) is None


def test_manager_disabled_raises_nothing_and_resolve_all() -> None:
    mgr = AlertManager("site-demo", enabled=False)
    assert mgr.raise_alert(AlertKind.BUSSING_NEEDED, 1.0, table_id="t1") == (None, [])
    mgr.configure("site-2", enabled=True)
    rec, _ = mgr.raise_alert(AlertKind.BUSSING_NEEDED, 1.0, table_id="t1")
    assert rec is not None and rec.severity is AlertSeverity.INFO
    assert mgr.is_open(rec.alert_id)
    [event] = mgr.resolve_all(2.0, ResolveReason.STATE_CHANGE)
    assert event.site_id == "site-2" and not mgr.is_open(rec.alert_id)
