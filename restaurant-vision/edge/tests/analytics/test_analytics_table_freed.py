"""``table_freed`` (1.3): raised the moment a table enters ``needs_bussing``."""

from __future__ import annotations

from typing import Any

from analytics_dsl import T0, Person, Scenario, crisp_config, of_type, person, with_modules
from rv_contracts import AlertKind, AlertRaised, AlertSeverity, Modules, TableState

GUEST_T3: dict[str, Any] = {"at": "t3", "role": "guest"}


def staff(at: str, from_t: float, to_t: float) -> Person:
    return person(at=at, role="staff", from_t=from_t, to_t=to_t, offset=(0.03, 0.0))


def lifecycle(**modules: bool) -> Scenario:
    sc = Scenario(with_modules(crisp_config(), **modules), table_freed=True)
    sc.add(person(**GUEST_T3, from_t=10, to_t=300))
    sc.add(staff("t3", 250, 260))
    sc.add(staff("t3", 700, 712))  # bussing
    return sc


def test_module_default_is_on() -> None:
    assert Modules().table_freed_alerts is True


def test_raised_immediately_and_resolved_by_the_bussing_visit() -> None:
    sc = lifecycle()
    sc.run(800)
    assert sc.summary() == [
        (30.0, "state", "t3", "empty", "seated", 1),
        (190.0, "raised", "waiter_needed", "t3"),
        (255.0, "state", "t3", "seated", "attended", 1),
        (255.0, "resolved", "waiter_needed", "staff_visit"),
        (348.0, "state", "t3", "attended", "needs_bussing", 0),
        (348.0, "closed", "t3", 10.0, 299.75, 1, 240.0, 1),
        (348.0, "raised", "table_freed", "t3"),  # at once, not after bussing_timeout_s
        (599.75, "raised", "bussing_needed", "t3"),  # the escalation is unchanged
        (710.0, "state", "t3", "needs_bussing", "empty", 0),
        (710.0, "resolved", "table_freed", "staff_visit"),
        (710.0, "resolved", "bussing_needed", "staff_visit"),
    ]
    freed = next(e for e in of_type(sc.events, AlertRaised) if e.kind is AlertKind.TABLE_FREED)
    assert freed.severity is AlertSeverity.INFO
    assert freed.table_id == "t3"
    assert freed.condition_since_ts == T0 + 299.75  # backdated: when the guests left


def test_only_adds_events_compared_with_the_module_off() -> None:
    on = lifecycle()
    on.run(800)
    off = lifecycle(table_freed_alerts=False)
    off.run(800)
    without = [s for s in on.summary() if "table_freed" not in s]
    assert without == off.summary()
    assert all("table_freed" not in s for s in off.summary())


def test_resolved_by_new_guests_and_open_while_needs_bussing() -> None:
    sc = Scenario(crisp_config(), table_freed=True)
    sc.add(person(**GUEST_T3, from_t=10, to_t=300))
    sc.add(person(**GUEST_T3, from_t=400, to_t=600, offset=(0.02, 0.0)))
    sc.run(399)
    m = sc.eng.tables.machine("t3")
    assert m is not None and m.state is TableState.NEEDS_BUSSING
    live = {t.table_id: t for t in sc.eng.live().tables}["t3"]
    (alert,) = [a for a in sc.eng.live().open_alerts if a.table_id == "t3"]
    assert alert.kind is AlertKind.TABLE_FREED and alert.alert_id in live.open_alert_ids
    events = sc.run(430)
    assert sc.summary(events) == [
        (420.0, "state", "t3", "needs_bussing", "seated", 1),
        (420.0, "resolved", "table_freed", "state_change"),
    ]


def test_not_raised_when_already_bussed_or_alerts_off() -> None:
    sc = Scenario(crisp_config(), table_freed=True)
    sc.add(person(**GUEST_T3, from_t=10, to_t=300), staff("t3", 100, 110))
    sc.add(staff("t3", 310, 325))  # cleared while the departure is being confirmed
    sc.run(500)
    assert all("table_freed" not in s for s in sc.summary())

    off = Scenario(with_modules(crisp_config(), alerts=False), table_freed=True)
    off.add(person(**GUEST_T3, from_t=10, to_t=300))
    off.run(500)
    assert not of_type(off.events, AlertRaised)


def test_once_per_departure_and_again_for_the_next_one() -> None:
    sc = Scenario(crisp_config(), table_freed=True)
    sc.add(person(**GUEST_T3, from_t=10, to_t=300))
    sc.add(person(**GUEST_T3, from_t=400, to_t=600, offset=(0.02, 0.0)))
    sc.run(900)
    raised = [s for s in sc.summary() if s[1] == "raised" and s[2] == "table_freed"]
    assert [s[0] for s in raised] == [348.0, 648.0]
