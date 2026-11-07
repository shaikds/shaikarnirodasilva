import importlib.util
from typing import Any

import pytest
from rv_contracts import (
    AlertKind,
    AlertRaised,
    AlertSeverity,
    EdgeEvent,
    OccupancySnapshot,
    QueueSeated,
    QueueWalkaway,
    TableSessionClosed,
    TableState,
    TableStateChanged,
    TrackFrame,
    make_event,
)

from conftest import SMOKE
from rv_sim import GroundTruth, World, load_simulation, parse_scenario
from rv_sim.adapter import build_simulation
from rv_sim.evaluate import AnalyticsUnavailable, evaluate, format_report, score_events


def oracle_events(truth: GroundTruth) -> list[EdgeEvent]:
    """The events a perfect analytics engine would emit."""
    th, site, now = truth.thresholds, truth.site_id, truth.now_ts
    events: list[EdgeEvent] = []
    for s in truth.sessions:
        sid = f"s{s.session_no}"
        events.append(
            make_event(
                TableStateChanged,
                site,
                s.seated_at,
                table_id=s.table_id,
                from_state=TableState.EMPTY,
                to_state=TableState.SEATED,
                guest_count=s.guests,
                session_id=sid,
            )
        )
        if s.left_at is not None:
            first = s.first_visit_at(th.staff_visit_min_s, now)
            events.append(
                make_event(
                    TableSessionClosed,
                    site,
                    s.left_at,
                    table_id=s.table_id,
                    session_id=sid,
                    seated_at=s.seated_at,
                    left_at=s.left_at,
                    max_guests=s.guests,
                    first_visit_delay_s=None if first is None else first - s.seated_at,
                    visits=s.visit_count(th.staff_visit_min_s, now),
                )
            )
    for c in truth.waiter_needed_cases():
        if c.positive:
            events.append(
                make_event(
                    AlertRaised,
                    site,
                    c.expected_at,
                    alert_id=f"a{c.session_no}",
                    kind=AlertKind.WAITER_NEEDED,
                    table_id=c.table_id,
                    severity=AlertSeverity.URGENT,
                )
            )
    for w in truth.walkaways:
        assert w.left_at is not None and w.waited_s is not None
        events.append(
            make_event(
                QueueWalkaway,
                site,
                w.left_at,
                zone_id=w.zone_id,
                waited_s=w.waited_s,
                party_size_est=w.size,
            )
        )
    for q in truth.queue_seated:
        events.append(
            make_event(QueueSeated, site, q.crossed_at, zone_id=q.zone_id, waited_s=q.waited_s)
        )
    for p in truth.occupancy[::10]:
        events.append(
            make_event(
                OccupancySnapshot,
                site,
                p.ts,
                guests=p.guests_at_tables,
                tables_occupied=p.tables_occupied,
                tables_total=8,
                staff_on_floor=p.staff_on_floor,
            )
        )
    return events


def test_perfect_events_score_perfectly(smoke_world: World) -> None:
    truth = smoke_world.truth
    report = score_events(oracle_events(truth), truth, scenario="smoke")
    s = report.sessions
    assert (s.truth, s.matched, s.missed, s.false) == (9, 9, 0, 0)
    assert s.seat_latency_mean_s == 0 and s.dwell_mae_s == 0 and s.guests_mae == 0
    w = report.waiter_needed
    assert (w.truth, w.tp, w.fp, w.fn, w.timing_mae_s) == (1, 1, 0, 0, 0)
    wa = report.walkaways
    assert (wa.truth, wa.tp, wa.fp, wa.fn, wa.party_size_mae) == (2, 2, 0, 0, 0)
    assert (report.queue.matched, report.queue.wait_mae_s) == (2, 0)
    assert report.occupancy.guests_mae == 0 and report.occupancy.snapshots == 61
    assert report.turnover.error == 0
    text = format_report(report)
    assert "waiter_needed alerts" in text and "walk-aways" in text
    assert report.to_dict()["sessions"]["matched"] == 9


def test_wrong_events_are_penalized(smoke_world: World) -> None:
    truth = smoke_world.truth
    events = [e for e in oracle_events(truth) if not isinstance(e, QueueWalkaway)]
    events.append(
        make_event(
            AlertRaised,
            truth.site_id,
            truth.sessions[0].seated_at + 200,
            alert_id="bogus",
            kind=AlertKind.WAITER_NEEDED,
            table_id=truth.sessions[0].table_id,
            severity=AlertSeverity.URGENT,
        )
    )
    report = score_events(events, truth)
    assert (report.walkaways.fn, report.walkaways.recall) == (2, 0.0)
    assert report.waiter_needed.fp == 1 and report.waiter_needed.precision == 0.5


class StubEngine:
    def __init__(self) -> None:
        self.frames: list[TrackFrame] = []
        self.ticks: list[float] = []

    def on_track_frame(self, tf: TrackFrame) -> list[EdgeEvent]:
        self.frames.append(tf)
        return []

    def on_tick(self, now: float) -> list[EdgeEvent]:
        self.ticks.append(now)
        return []


TINY = """
run: {start: '18:00', duration: 90}
arrivals: {explicit: [{at: 0, size: 2, dwell: 40, first_visit_delay: 20}]}
noise: {seated_miss_prob: 0, false_positives_per_frame: 0}
"""


@pytest.mark.parametrize("tracker", ["fallback", "bytetrack"])
def test_pipeline_feeds_every_frame(tracker: Any) -> None:
    sim = build_simulation(parse_scenario(TINY, "tiny"), manual=True)
    engine = StubEngine()
    try:
        report, run = evaluate(sim, tracker=tracker, engine=engine)
    except AnalyticsUnavailable as exc:  # edge vision stack (numpy, supervision) not installed
        pytest.skip(str(exc))
    assert run.frames == len(engine.frames) == 2 * 451
    assert len(engine.ticks) == 91
    assert {tf.camera_id for tf in engine.frames} == {"cam-dining", "cam-entrance"}
    staff_tracks: set[str] = set()
    guest_tracks: set[str] = set()
    for tf in engine.frames:
        for t in tf.tracks:
            assert t.hints.uniform_score is not None
            (staff_tracks if t.hints.uniform_score > 0.45 else guest_tracks).add(
                f"{tf.camera_id}/{t.track_id}"
            )
    assert len(staff_tracks) >= 3
    if tracker == "fallback":
        # One track per person and camera appearance: entrance in + out, dining, x2 guests.
        assert len(guest_tracks) == 6
        assert len(staff_tracks) == 3
    assert report.sessions.truth == 1 and report.sessions.emitted == 0


def test_pipeline_needs_a_manual_clock() -> None:
    sim = load_simulation(SMOKE)
    with pytest.raises(ValueError, match="manual clock"):
        evaluate(sim, engine=StubEngine())


HAVE_ANALYTICS = importlib.util.find_spec("rv_edge.analytics.engine") is not None


@pytest.mark.skipif(not HAVE_ANALYTICS, reason="rv_edge.analytics.engine not available yet")
def test_smoke_eval_with_fallback_tracker() -> None:
    sim = load_simulation(SMOKE, manual=True)
    try:
        report, _ = evaluate(sim, tracker="fallback")
    except AnalyticsUnavailable as exc:  # pragma: no cover - partial edge install
        pytest.skip(str(exc))
    print("\n" + format_report(report))
    s = report.sessions
    assert s.recall is not None and s.recall >= 0.8
    assert s.precision is not None and s.precision >= 0.8
    assert report.waiter_needed.recall == 1.0
    assert report.walkaways.recall == 1.0
    assert report.queue.matched == report.queue.truth_seated
