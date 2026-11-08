"""Table state machine, sessions, table alerts, counting and overlapping cameras."""

from __future__ import annotations

from typing import Any

from analytics_dsl import (
    T0,
    Person,
    Scenario,
    crisp_config,
    of_type,
    person,
)
from rv_contracts import TableSessionClosed, TableState, TableStateChanged
from rv_contracts.fixtures import sample_site_config

GUEST_T3: dict[str, Any] = {"at": "t3", "role": "guest"}


def staff(at: str, from_t: float, to_t: float, **kw: Any) -> Person:
    return person(at=at, role="staff", from_t=from_t, to_t=to_t, offset=(0.03, 0.0), **kw)


def lifecycle() -> Scenario:
    sc = Scenario(crisp_config())
    sc.add(person(**GUEST_T3, from_t=10, to_t=300))
    sc.add(staff("t3", 250, 260))  # first visit (after the waiter_needed alert)
    sc.add(staff("t3", 700, 712))  # bussing
    return sc


def test_full_session_lifecycle_exact_sequence() -> None:
    sc = lifecycle()
    events = sc.run(800)
    # Transitions are confirmed after the thresholds, but the session and the alert timers are
    # backdated to the evidence: guests first seen at 10.0, last seen at 299.75.
    assert sc.summary() == [
        (30.0, "state", "t3", "empty", "seated", 1),
        (190.0, "raised", "waiter_needed", "t3"),  # 10.0 + first_visit_timeout_s
        (255.0, "state", "t3", "seated", "attended", 1),  # visit from 250, confirmed at 255
        (255.0, "resolved", "waiter_needed", "staff_visit"),
        # last seen 299.75 + 3 s hold -> absent from 303.0; + leave_confirm_s 45
        (348.0, "state", "t3", "attended", "needs_bussing", 0),
        (348.0, "closed", "t3", 10.0, 299.75, 1, 240.0, 1),
        (599.75, "raised", "bussing_needed", "t3"),  # 299.75 + bussing_timeout_s
        (710.0, "state", "t3", "needs_bussing", "empty", 0),
        (710.0, "resolved", "bussing_needed", "staff_visit"),
    ]
    changes = of_type(events, TableStateChanged)
    closed = of_type(events, TableSessionClosed)
    assert len({c.session_id for c in changes}) == 1
    assert closed[0].session_id == changes[0].session_id
    assert closed[0].bussing_delay_s is None
    assert all(e.site_id == "site-demo" for e in events)


def test_seat_confirm_boundary() -> None:
    sc = Scenario(crisp_config()).add(person(**GUEST_T3, from_t=10))
    assert sc.summary(sc.run(29.75)) == []
    assert sc.summary(sc.run(30.0)) == [(30.0, "state", "t3", "empty", "seated", 1)]


def test_leave_confirm_boundary() -> None:
    sc = Scenario(crisp_config()).add(person(**GUEST_T3, from_t=10, to_t=100))
    sc.run(147.75)
    m = sc.eng.tables.machine("t3")
    assert m is not None
    # last seen 99.75; the 3 s hold keeps it until 102.75, absent from 103.0
    assert m.signals.absent_since == T0 + 103.0
    assert m.state is TableState.SEATED
    assert sc.summary(sc.run(148.0)) == [
        (148.0, "state", "t3", "seated", "needs_bussing", 0),
        (148.0, "closed", "t3", 10.0, 99.75, 1, None, 0),
    ]
    assert m.state_since == T0 + 99.75  # since_ts: when the guests really left


def test_staff_visit_boundary_and_gap_tolerance() -> None:
    def run(gaps: tuple[tuple[float, float], ...], until: float) -> Scenario:
        sc = Scenario(crisp_config())
        sc.add(person(**GUEST_T3, from_t=10), staff("t3", 100, 120, gaps=gaps))
        sc.run(until)
        return sc

    sc = run((), 104.75)
    assert sc.eng.tables.machine("t3").state is TableState.SEATED  # type: ignore[union-attr]
    assert sc.summary(sc.run(105.0)) == [(105.0, "state", "t3", "seated", "attended", 1)]
    # last seen 101.75, seen again 103.75: a 2.0 s gap keeps the visit going
    sc = run(((102.0, 103.75),), 105.0)
    assert sc.eng.tables.machine("t3").state is TableState.ATTENDED  # type: ignore[union-attr]
    # seen again at 104.0: 2.25 s gap, the visit restarts at 104 and confirms at 109
    sc = run(((102.0, 104.0),), 108.75)
    assert sc.eng.tables.machine("t3").state is TableState.SEATED  # type: ignore[union-attr]
    assert sc.summary(sc.run(109.0)) == [(109.0, "state", "t3", "seated", "attended", 1)]


def test_short_staff_presence_is_not_a_visit_and_staff_is_not_a_guest() -> None:
    sc = Scenario(crisp_config())
    sc.add(person(**GUEST_T3, from_t=10), staff("t3", 100, 104.75))
    sc.add(staff("t1", 0, 60))  # staff alone at an empty table never seats it
    sc.run(150)
    assert sc.summary() == [(30.0, "state", "t3", "empty", "seated", 1)]
    assert sc.eng.tables.guest_counts()["t1"] == 0


def test_unknown_role_counts_as_guest() -> None:
    sc = Scenario(crisp_config()).add(person(at="t2", role="unknown", from_t=0))
    assert sc.summary(sc.run(20)) == [(20.0, "state", "t2", "empty", "seated", 1)]


def test_waiter_needed_boundary_and_once_per_session() -> None:
    sc = Scenario(crisp_config()).add(person(**GUEST_T3, from_t=10))
    # the deadline runs from the backdated seating (10.0), not the confirmation (30.0)
    assert sc.summary(sc.run(189.75)) == [(30.0, "state", "t3", "empty", "seated", 1)]
    m = sc.eng.tables.machine("t3")
    assert m is not None and m.state_since == T0 + 10.0
    assert sc.summary(sc.run(190.0)) == [(190.0, "raised", "waiter_needed", "t3")]
    assert sc.summary(sc.run(2000.0)) == []  # never re-raised while the condition persists


def test_overdue_alert_fires_at_confirmation() -> None:
    """A deadline that passed while seating was still being confirmed fires at once."""
    sc = Scenario(crisp_config(first_visit_timeout_s=15.0)).add(person(**GUEST_T3, from_t=10))
    assert sc.summary(sc.run(29.75)) == []
    assert sc.summary(sc.run(30.0)) == [
        (30.0, "state", "t3", "empty", "seated", 1),
        (30.0, "raised", "waiter_needed", "t3"),  # deadline 25.0 already passed
    ]


def test_visit_between_arrival_and_confirmation_counts() -> None:
    """A waiter who came after the guests but before seating was confirmed attended them."""
    sc = Scenario(crisp_config()).add(person(**GUEST_T3, from_t=10), staff("t3", 15, 22))
    sc.run(40)
    assert sc.summary() == [
        (30.0, "state", "t3", "empty", "seated", 1),
        (30.0, "state", "t3", "seated", "attended", 1),
    ]
    m = sc.eng.tables.machine("t3")
    assert m is not None and m.session is not None
    assert (m.session.first_visit_at, m.state_since) == (T0 + 15.0, T0 + 15.0)


def test_waiter_needed_resolved_by_guests_leaving() -> None:
    sc = Scenario(crisp_config()).add(person(**GUEST_T3, from_t=10, to_t=250))
    sc.run(400)
    assert sc.summary() == [
        (30.0, "state", "t3", "empty", "seated", 1),
        (190.0, "raised", "waiter_needed", "t3"),
        (298.0, "state", "t3", "seated", "needs_bussing", 0),
        (298.0, "closed", "t3", 10.0, 249.75, 1, None, 0),
        (298.0, "resolved", "waiter_needed", "state_change"),
    ]


def test_checkin_needed_episodes() -> None:
    sc = Scenario(crisp_config())
    sc.add(person(**GUEST_T3, from_t=10, to_t=2100))
    sc.add(staff("t3", 100, 110))  # attended at 105; staff last seen 109.75
    sc.add(staff("t3", 1100, 1106))  # visit confirmed at 1105 resolves the check-in alert
    sc.run(1009.5)
    assert [s[1] for s in sc.summary()] == ["state", "state"]
    assert sc.summary(sc.run(1009.75)) == [(1009.75, "raised", "checkin_needed", "t3")]
    assert sc.summary(sc.run(1105.0)) == [(1105.0, "resolved", "checkin_needed", "staff_visit")]
    # a new episode starts at the last staff sighting (1105.75): raised again at 2005.75
    assert sc.summary(sc.run(2005.5)) == []
    assert sc.summary(sc.run(2005.75)) == [(2005.75, "raised", "checkin_needed", "t3")]
    # guests leave (last seen 2099.75 -> absent 2103.0 -> needs_bussing 2148.0)
    assert sc.summary(sc.run(2148.0)) == [
        (2148.0, "state", "t3", "attended", "needs_bussing", 0),
        (2148.0, "closed", "t3", 10.0, 2099.75, 1, 90.0, 2),
        (2148.0, "resolved", "checkin_needed", "state_change"),
    ]


def test_bussing_visit_boundary_and_bussing_alert() -> None:
    sc = Scenario(crisp_config())
    sc.add(person(**GUEST_T3, from_t=10, to_t=300), staff("t3", 100, 110))
    sc.add(staff("t3", 400, 415))
    sc.run(409.75)
    m = sc.eng.tables.machine("t3")
    assert m is not None and m.state is TableState.NEEDS_BUSSING
    # a 5 s regular visit during needs_bussing (at 405) does not bus the table
    assert sc.summary(sc.run(410.0)) == [(410.0, "state", "t3", "needs_bussing", "empty", 0)]
    assert m.session is None and m.state_since == T0 + 410.0


def test_bussing_alert_boundary_and_resolved_by_new_guests() -> None:
    sc = Scenario(crisp_config())
    sc.add(person(**GUEST_T3, from_t=10, to_t=300))
    sc.add(person(**GUEST_T3, from_t=700, to_t=900, offset=(0.02, 0.0)))
    sc.run(599.5)
    assert "bussing_needed" not in {s[2] for s in sc.summary() if s[1] == "raised"}
    events = sc.run(720)
    assert sc.summary(events) == [
        (599.75, "raised", "bussing_needed", "t3"),  # last seen 299.75 + 300
        (720.0, "state", "t3", "needs_bussing", "seated", 1),
        (720.0, "resolved", "bussing_needed", "state_change"),
    ]
    changes = of_type(sc.events, TableStateChanged)
    assert changes[-1].session_id != changes[0].session_id  # a new session
    assert changes[1].session_id == changes[0].session_id  # -> needs_bussing: closed one


def test_turnover_two_sessions() -> None:
    sc = lifecycle()
    sc.add(person(**GUEST_T3, from_t=1000, to_t=1300))
    sc.add(person(**GUEST_T3, from_t=1000, to_t=1300, offset=(0.02, 0.01)))
    sc.run(1400)
    tail = sc.summary()[9:]
    assert tail == [
        (1020.0, "state", "t3", "empty", "seated", 2),
        (1180.0, "raised", "waiter_needed", "t3"),
        (1348.0, "state", "t3", "seated", "needs_bussing", 0),
        (1348.0, "closed", "t3", 1000.0, 1299.75, 2, None, 0),
        (1348.0, "resolved", "waiter_needed", "state_change"),
    ]
    closed = of_type(sc.events, TableSessionClosed)
    assert len(closed) == 2 and closed[0].session_id != closed[1].session_id
    changes = of_type(sc.events, TableStateChanged)
    assert changes[3].session_id == closed[0].session_id  # needs_bussing -> empty: closed one


def test_bussed_while_departure_is_confirmed() -> None:
    """A waiter clears the table right after the guests leave: the table passes through
    needs_bussing and is empty in the same instant."""
    sc = Scenario(crisp_config())
    sc.add(person(**GUEST_T3, from_t=10, to_t=300), staff("t3", 100, 110))
    sc.add(staff("t3", 310, 325))
    sc.run(500)
    assert sc.summary()[2:] == [
        (348.0, "state", "t3", "attended", "needs_bussing", 0),
        (348.0, "closed", "t3", 10.0, 299.75, 1, 90.0, 2),
        (348.0, "state", "t3", "needs_bussing", "empty", 0),
    ]


def test_max_guests_and_first_visit_delay_from_backdated_seating() -> None:
    sc = Scenario(crisp_config())
    sc.add(person(**GUEST_T3, from_t=10, to_t=300))
    sc.add(person(**GUEST_T3, from_t=60, to_t=120, offset=(-0.03, 0.0)))
    sc.add(staff("t3", 27, 40))  # arrives before seat confirmation, confirms at 32
    sc.run(400)
    assert sc.summary()[:2] == [
        (30.0, "state", "t3", "empty", "seated", 1),
        (32.0, "state", "t3", "seated", "attended", 1),
    ]
    closed = of_type(sc.events, TableSessionClosed)[0]
    assert (closed.max_guests, closed.first_visit_delay_s, closed.visits) == (2, 17.0, 1)


def test_staff_visit_while_empty_is_ignored() -> None:
    sc = Scenario(crisp_config()).add(staff("t3", 0, 30), person(**GUEST_T3, from_t=10))
    sc.run(60)
    # the host's 30 s presence confirmed at 5 s, before seating: not a waiter visit
    assert sc.summary() == [(30.0, "state", "t3", "empty", "seated", 1)]


# --------------------------------------------------------------------------------------
# Occlusion and median smoothing
# --------------------------------------------------------------------------------------


def test_occlusion_hold_bridges_short_dropouts() -> None:
    sc = Scenario(crisp_config())
    sc.add(person(**GUEST_T3, from_t=10, gaps=[(50.0, 52.75), (60.0, 64.0)]))
    m = sc.eng.tables.machine("t3")
    assert m is not None
    sc.run(52.75)
    assert m.signals.present_since == T0 + 10.0  # last seen 49.75, 3.0 s hold covers it
    sc.run(63.0)
    assert m.signals.absent_since == T0 + 63.0  # 59.75 + 3.25 s: dropped
    sc.run(64.0)
    assert m.signals.present_since == T0 + 64.0
    sc.run(200)
    assert [s[4] for s in sc.summary() if s[1] == "state"] == ["seated"]


def test_dropout_resets_crisp_seat_confirmation_but_not_the_median() -> None:
    crisp = Scenario(crisp_config()).add(person(**GUEST_T3, from_t=10, gaps=[(20.0, 24.0)]))
    crisp.run(60)
    assert crisp.summary() == [(44.0, "state", "t3", "empty", "seated", 1)]
    smooth = Scenario(sample_site_config())
    smooth.add(person(**GUEST_T3, from_t=10, gaps=[(20.0, 24.0)]))
    smooth.run(60)
    # median over 30 s of 4 fps samples: guests present once they fill more than half the
    # window (from 20.0, 40 empty samples before), seated 20 s later
    assert smooth.summary() == [(40.0, "state", "t3", "empty", "seated", 1)]


def test_median_window_timings_with_default_thresholds() -> None:
    sc = Scenario(sample_site_config()).add(person(**GUEST_T3, from_t=10, to_t=300))
    sc.run(500)
    m = sc.eng.tables.machine("t3")
    assert m is not None
    # held until 302.75; zeros from 303.0 form a majority of the 120-sample window at 317.75.
    # The median's lag only delays the confirmations: times are backdated to the sightings.
    assert sc.summary() == [
        (40.0, "state", "t3", "empty", "seated", 1),
        (190.0, "raised", "waiter_needed", "t3"),
        (362.75, "state", "t3", "seated", "needs_bussing", 0),
        (362.75, "closed", "t3", 10.0, 299.75, 1, None, 0),
        (362.75, "resolved", "waiter_needed", "state_change"),
    ]
    assert (m.signals.arrived_at, m.signals.departed_at) == (T0 + 10.0, T0 + 299.75)


def test_median_ignores_short_false_positives_and_partial_occlusion() -> None:
    sc = Scenario(sample_site_config())
    sc.add(person(at="t1", role="unknown", from_t=100, to_t=105))  # passer-by
    sc.add(person(**GUEST_T3, from_t=10), person(**GUEST_T3, from_t=10, offset=(0.02, 0)))
    sc.add(person(**GUEST_T3, from_t=10, offset=(-0.02, 0), gaps=[(25.0, 33.0)]))
    sc.run(200)
    assert sc.summary() == [
        (40.0, "state", "t3", "empty", "seated", 3),
        (190.0, "raised", "waiter_needed", "t3"),
    ]
    crisp = Scenario(crisp_config())
    crisp.add(person(**GUEST_T3, from_t=10), person(**GUEST_T3, from_t=10, offset=(0.02, 0)))
    crisp.add(person(**GUEST_T3, from_t=10, offset=(-0.02, 0), gaps=[(25.0, 33.0)]))
    crisp.run(40)
    assert crisp.summary() == [(30.0, "state", "t3", "empty", "seated", 2)]


# --------------------------------------------------------------------------------------
# Overlapping cameras, frozen cameras
# --------------------------------------------------------------------------------------


def test_overlapping_cameras_do_not_double_count() -> None:
    sc = Scenario(crisp_config())
    # the same guest seen by the dining camera (primary z-t5) and the entrance camera
    sc.add(person(at="z-t5", from_t=0), person(at="z-t5-entrance", from_t=0))
    sc.run(30)
    assert sc.summary() == [(20.0, "state", "t5", "empty", "seated", 1)]
    assert sc.eng.tables.guest_counts()["t5"] == 1
    sc.run(40)
    occ = sc.eng.live().occupancy
    assert occ is not None and occ.guests == 1


def test_non_primary_view_alone_never_counts() -> None:
    sc = Scenario(crisp_config()).add(person(at="z-t5-entrance", from_t=0))
    sc.run(100)
    assert sc.summary() == []
    assert sc.eng.tables.guest_counts()["t5"] == 0


def test_camera_without_frames_freezes_presence_but_alert_timers_run() -> None:
    sc = Scenario(crisp_config()).add(person(**GUEST_T3, from_t=0))
    sc.run(30)
    for i in range(1, 400):  # the dining camera dies: only ticks from now on
        sc._record(sc.eng.on_tick(T0 + 30 + i))
    assert sc.summary() == [
        (20.0, "state", "t3", "empty", "seated", 1),
        (180.0, "raised", "waiter_needed", "t3"),  # seated at 0.0 + 180 s, raised by a tick
    ]



def test_quick_clearing_counts_as_bussing_despite_the_median_lag() -> None:
    """Default 30 s median: guests are still 'present' (smoothed) until 317.75, but the waiter
    clearing at 305-320 is measured against the held count, which is 0 from 303.0."""
    people = [person(**GUEST_T3, from_t=10, to_t=300), staff("t3", 100, 110),
              staff("t3", 305, 320)]
    sc = Scenario(sample_site_config()).add(*people)
    sc.run(400)
    assert sc.summary()[2:] == [
        (362.75, "state", "t3", "attended", "needs_bussing", 0),
        (362.75, "closed", "t3", 10.0, 299.75, 1, 90.0, 2),
        (362.75, "state", "t3", "needs_bussing", "empty", 0),
    ]
    # someone seen at the cleared table before the departure is confirmed cancels it
    passer = person(at="t3", role="unknown", from_t=330, to_t=331, offset=(0.0, 0.02))
    sc = Scenario(sample_site_config()).add(*people, passer)
    sc.run(400)
    assert [s[4] for s in sc.summary() if s[1] == "state"] == [
        "seated", "attended", "needs_bussing"]


def test_events_carry_backdated_since_and_condition_times() -> None:
    """``since_ts`` / ``condition_since_ts`` (contracts 1.1) carry the evidence times that
    the state machine uses internally, while ``ts`` stays the confirmation time."""
    from rv_contracts import AlertKind, AlertRaised

    sc = lifecycle()
    events = sc.run(800)
    since = [
        (rel(c.ts), c.to_state.value, None if c.since_ts is None else rel(c.since_ts))
        for c in of_type(events, TableStateChanged)
    ]
    assert since == [
        (30.0, "seated", 10.0),  # first guest sighting
        (255.0, "attended", 250.0),  # waiter arrival
        (348.0, "needs_bussing", 299.75),  # last guest sighting
        (710.0, "empty", 710.0),
    ]
    raised = {a.kind: a for a in of_type(events, AlertRaised)}
    waiter = raised[AlertKind.WAITER_NEEDED]
    assert (rel(waiter.ts), rel_or_none(waiter.condition_since_ts)) == (190.0, 10.0)
    bussing = raised[AlertKind.BUSSING_NEEDED]
    assert (rel(bussing.ts), rel_or_none(bussing.condition_since_ts)) == (599.75, 299.75)
    # the live view of the table and of its open alert agree with the events
    sc2 = lifecycle()
    sc2.run(200)
    live = sc2.eng.live()
    table = next(t for t in live.tables if t.table_id == "t3")
    assert table.since_ts is not None and rel(table.since_ts) == 10.0
    (alert,) = live.open_alerts
    assert alert.condition_since_ts is not None and rel(alert.condition_since_ts) == 10.0


def test_checkin_condition_starts_at_last_staff_attention() -> None:
    from rv_contracts import AlertRaised

    sc = Scenario(crisp_config())
    sc.add(person(**GUEST_T3, from_t=10, to_t=2100))
    sc.add(staff("t3", 100, 110))  # attended at 105; staff last seen 109.75
    (alert,) = of_type(sc.run(1009.75), AlertRaised)
    assert alert.kind.value == "checkin_needed"
    assert rel_or_none(alert.condition_since_ts) == 109.75


def rel(ts: float) -> float:
    return round(ts - T0, 6)


def rel_or_none(ts: float | None) -> float | None:
    return None if ts is None else rel(ts)
