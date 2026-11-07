"""Run a scenario through the edge pipeline and score the emitted events against ground truth.

Pipeline (manual clock, as fast as possible), per frame and camera::

    SimulatedSource -> detector -> tracker -> (+ uniform hints) -> TrackFrame
        -> rv_edge AnalyticsEngine.on_track_frame;   engine.on_tick(now) once per second

* ``tracker="fallback"``: :mod:`rv_sim._fallback` pass-through detector + truth tracker
  (isolates analytics accuracy).
* ``tracker="bytetrack"``: ``rv_edge.vision.tracking.ByteTrackTracker`` with
  ``rv_edge.vision.detectors.simulated.SimulatedDetector`` (zero noise: the frames already carry
  the scenario's noise) and ``rv_edge.vision.hints.SyntheticHints`` for uniform scores.

Edge modules are imported lazily, so this module imports without them.

Scores (see :class:`EvalReport`). Alert and walk-away cases whose truth lies within the
analytics' confirmation lags of a threshold are *ambiguous*: a hit or a miss on them is not
counted either way (their number is reported).
"""

from __future__ import annotations

import dataclasses
import importlib
import statistics
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from functools import partial
from typing import Any, Literal

from rv_contracts import (
    AlertKind,
    AlertRaised,
    Detection,
    EdgeEvent,
    Frame,
    OccupancySnapshot,
    QueueSeated,
    QueueWalkaway,
    TableSessionClosed,
    TableState,
    TableStateChanged,
    Thresholds,
    Track,
    TrackFrame,
)

from ._fallback import PassThroughDetector, TruthTracker
from .adapter import Simulation
from .clock import ManualClock
from .ground_truth import AlertCase, GroundTruth, TrueSession

TrackerName = Literal["fallback", "bytetrack"]
DetectorName = Literal["auto", "edge", "fallback"]

SESSION_MIN_IOU = 0.5
WALKAWAY_TOLERANCE_S = 60.0
QUEUE_SEATED_TOLERANCE_S = 15.0
SLACK_S = 5.0


class AnalyticsUnavailable(RuntimeError):
    """``rv_edge.analytics.engine`` (or another edge piece) cannot be imported yet."""


# --------------------------------------------------------------------------------------
# Pipeline
# --------------------------------------------------------------------------------------


def _import(module: str, name: str) -> Any:
    try:
        return getattr(importlib.import_module(module), name)
    except (ImportError, AttributeError) as exc:
        raise AnalyticsUnavailable(f"{module}.{name} is not available: {exc}") from exc


def build_engine(sim: Simulation) -> Any:
    """``rv_edge.analytics.engine.build_analytics_engine(config, clock=...)``."""
    factory = _import("rv_edge.analytics.engine", "build_analytics_engine")
    return factory(sim.config, clock=sim.clock)


@dataclass
class _CameraPipeline:
    detect: Callable[[Frame], list[Detection]]
    track: Callable[[list[Detection], Frame], list[Track]]
    hints: Callable[[Frame, list[Track]], list[Track]] | None = None


def _build_pipelines(
    sim: Simulation, tracker: TrackerName, detector: DetectorName
) -> tuple[dict[str, _CameraPipeline], str]:
    pipelines: dict[str, _CameraPipeline] = {}
    if tracker == "fallback":
        for cam in sim.sources:
            truth = TruthTracker(partial(sim.observation, cam))
            pipelines[cam] = _CameraPipeline(PassThroughDetector().detect, truth.update)
        return pipelines, "fallback"
    tracker_cls = _import("rv_edge.vision.tracking", "ByteTrackTracker")
    detector_name = "fallback"
    detector_cls: Any = None
    if detector in ("auto", "edge"):
        try:
            detector_cls = _import("rv_edge.vision.detectors.simulated", "SimulatedDetector")
            detector_name = "edge"
        except AnalyticsUnavailable:
            if detector == "edge":
                raise
    try:
        hints_obj: Any = _import("rv_edge.vision.hints", "SyntheticHints")()
    except AnalyticsUnavailable:
        hints_obj = None
    ttl_h = sim.config.thresholds.track_id_ttl_h
    for cam in sim.sources:
        det = detector_cls() if detector_cls is not None else PassThroughDetector()
        trk = tracker_cls(frame_rate=sim.world.fps, track_id_ttl_h=ttl_h)
        pipelines[cam] = _CameraPipeline(det.detect, trk.update, _hint_adder(hints_obj))
    return pipelines, detector_name


def _hint_adder(hints_obj: Any) -> Callable[[Frame, list[Track]], list[Track]] | None:
    if hints_obj is None:
        return None

    def add(frame: Frame, tracks: list[Track]) -> list[Track]:
        return [
            t
            if t.hints.uniform_score is not None
            else dataclasses.replace(t, hints=hints_obj.hints_for(frame, t.box))
            for t in tracks
        ]

    return add


@dataclass
class PipelineRun:
    events: list[EdgeEvent]
    ticks: int
    frames: int
    wall_s: float
    tracker: str
    detector: str


def run_pipeline(
    sim: Simulation,
    *,
    tracker: TrackerName = "fallback",
    detector: DetectorName = "auto",
    engine: Any = None,
    tick_interval_s: float = 1.0,
    progress: Callable[[float], None] | None = None,
) -> PipelineRun:
    """Feed every frame of the run through the pipeline (manual clock, as fast as possible).

    ``engine`` defaults to ``build_engine(sim)``; anything with ``on_track_frame`` and
    ``on_tick`` works (tests use a stub). ``progress(fraction)`` is called every ~5%.
    """
    clock = sim.clock
    if not isinstance(clock, ManualClock):
        raise ValueError("run_pipeline needs a manual clock: load_simulation(..., manual=True)")
    if engine is None:
        engine = build_engine(sim)
    pipelines, detector_name = _build_pipelines(sim, tracker, detector)
    events: list[EdgeEvent] = []
    frames = 0
    last_tick: float | None = None
    end_tick = sim.world.end_tick
    report_every = max(1, end_tick // 20)
    started = time.perf_counter()
    for k in range(end_tick + 1):
        now = clock.now()
        for cam, source in sim.sources.items():
            frame = source.read()
            if frame is None:
                continue
            frames += 1
            pipe = pipelines[cam]
            tracks = pipe.track(pipe.detect(frame), frame)
            if pipe.hints is not None:
                tracks = pipe.hints(frame, tracks)
            tf = TrackFrame(camera_id=cam, ts=frame.ts, index=frame.index, tracks=tuple(tracks))
            events.extend(engine.on_track_frame(tf))
        if last_tick is None or now - last_tick >= tick_interval_s - 1e-6:
            events.extend(engine.on_tick(now))
            last_tick = now
        if progress is not None and k % report_every == 0:
            progress(k / end_tick)
        if k < end_tick:
            clock.advance(sim.dt)
    wall = time.perf_counter() - started
    return PipelineRun(events, end_tick + 1, frames, wall, tracker, detector_name)


# --------------------------------------------------------------------------------------
# Scores
# --------------------------------------------------------------------------------------


@dataclass
class SessionScores:
    truth: int
    emitted: int
    matched: int
    missed: int
    false: int
    precision: float | None
    recall: float | None
    seat_latency_mean_s: float | None
    seat_latency_p50_s: float | None
    seat_latency_p90_s: float | None
    leave_latency_mean_s: float | None
    dwell_mae_s: float | None
    guests_mae: float | None
    first_visit_delay_mae_s: float | None


@dataclass
class AlertScores:
    kind: str
    truth: int
    """Positive, unambiguous true cases."""
    ambiguous: int
    emitted: int
    tp: int
    fp: int
    fn: int
    precision: float | None
    recall: float | None
    timing_error_mean_s: float | None
    """Mean of (alert ts - expected ts) over true positives; positive = late."""
    timing_mae_s: float | None


@dataclass
class WalkawayScores:
    truth: int
    ambiguous: int
    emitted: int
    tp: int
    fp: int
    fn: int
    precision: float | None
    recall: float | None
    waited_mae_s: float | None
    party_size_mae: float | None


@dataclass
class QueueScores:
    truth_seated: int
    emitted_seated: int
    matched: int
    wait_mae_s: float | None
    wait_bias_s: float | None


@dataclass
class OccupancyScores:
    snapshots: int
    guests_mae: float | None
    guests_bias: float | None
    tables_occupied_mae: float | None
    staff_on_floor_mae: float | None


@dataclass
class TurnoverScores:
    truth_sessions: int
    emitted_sessions: int
    error: int
    """emitted - truth completed sessions."""
    per_table_abs_error: int


@dataclass
class EvalReport:
    scenario: str
    seed: int
    tracker: str
    detector: str
    duration_s: float
    ticks: int
    frames: int
    wall_s: float
    events_by_type: dict[str, int]
    sessions: SessionScores
    waiter_needed: AlertScores
    bussing_needed: AlertScores
    walkaways: WalkawayScores
    queue: QueueScores
    occupancy: OccupancyScores
    turnover: TurnoverScores
    truth_summary: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return dataclasses.asdict(self)


@dataclass
class _EmittedSession:
    session_id: str
    table_id: str
    opened_at: float | None = None
    closed: TableSessionClosed | None = None

    def interval(self, end_ts: float) -> tuple[float, float]:
        if self.closed is not None:
            return (self.closed.seated_at, self.closed.left_at)
        assert self.opened_at is not None
        return (self.opened_at, end_ts)


def score_events(
    events: Sequence[EdgeEvent],
    truth: GroundTruth,
    *,
    scenario: str = "",
    seed: int = 0,
    tracker: str = "",
    detector: str = "",
    ticks: int = 0,
    frames: int = 0,
    wall_s: float = 0.0,
) -> EvalReport:
    """Score edge events against ground truth (the truth's ``now_ts`` is the run end)."""
    th = truth.thresholds
    end_ts = truth.now_ts
    by_type: dict[str, int] = {}
    for e in events:
        by_type[e.type.value] = by_type.get(e.type.value, 0) + 1
    alerts = [e for e in events if isinstance(e, AlertRaised)]
    session_scores, emitted_sessions, matches = _score_sessions(events, truth.sessions, th, end_ts)
    return EvalReport(
        scenario=scenario,
        seed=seed,
        tracker=tracker,
        detector=detector,
        duration_s=end_ts - truth.start_ts,
        ticks=ticks,
        frames=frames,
        wall_s=wall_s,
        events_by_type=dict(sorted(by_type.items())),
        sessions=session_scores,
        waiter_needed=_score_alerts(
            AlertKind.WAITER_NEEDED,
            alerts,
            truth.waiter_needed_cases(),
            truth.sessions,
            _waiter_band(th),
            th,
            end_ts,
        ),
        bussing_needed=_score_alerts(
            AlertKind.BUSSING_NEEDED,
            alerts,
            truth.bussing_needed_cases(),
            truth.sessions,
            _bussing_band(th),
            th,
            end_ts,
        ),
        walkaways=_score_walkaways(events, truth, th, end_ts),
        queue=_score_queue(events, truth),
        occupancy=_score_occupancy(events, truth),
        turnover=_score_turnover(emitted_sessions, matches, truth.sessions, th, end_ts),
        truth_summary=truth.summary(),
    )


def _ratio(num: int, den: int) -> float | None:
    return num / den if den else None


def _mean(values: Sequence[float]) -> float | None:
    return statistics.fmean(values) if values else None


def _quantile(values: Sequence[float], q: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, round(q * (len(ordered) - 1)))]


def _iou(a: tuple[float, float], b: tuple[float, float]) -> float:
    inter = max(0.0, min(a[1], b[1]) - max(a[0], b[0]))
    union = max(a[1], b[1]) - min(a[0], b[0])
    return inter / union if union > 0 else 0.0


def _score_sessions(
    events: Sequence[EdgeEvent],
    truth_sessions: list[TrueSession],
    th: Thresholds,
    end_ts: float,
) -> tuple[SessionScores, dict[str, _EmittedSession], list[tuple[TrueSession, _EmittedSession]]]:
    emitted: dict[str, _EmittedSession] = {}
    for e in events:
        if (
            isinstance(e, TableStateChanged)
            and e.from_state is TableState.EMPTY
            and (e.to_state is TableState.SEATED)
        ):
            s = emitted.setdefault(e.session_id, _EmittedSession(e.session_id, e.table_id))
            s.opened_at = e.ts if s.opened_at is None else s.opened_at
        elif isinstance(e, TableSessionClosed):
            s = emitted.setdefault(e.session_id, _EmittedSession(e.session_id, e.table_id))
            s.closed = e
    pairs = []
    for t_i, t in enumerate(truth_sessions):
        t_iv = (t.seated_at, t.left_at if t.left_at is not None else end_ts)
        for sid, s in emitted.items():
            if s.table_id == t.table_id:
                iou = _iou(t_iv, s.interval(end_ts))
                if iou >= SESSION_MIN_IOU:
                    pairs.append((iou, t_i, sid))
    pairs.sort(key=lambda p: -p[0])
    used_t: set[int] = set()
    used_e: set[str] = set()
    matches: list[tuple[TrueSession, _EmittedSession]] = []
    for _, t_i, sid in pairs:
        if t_i in used_t or sid in used_e:
            continue
        used_t.add(t_i)
        used_e.add(sid)
        matches.append((truth_sessions[t_i], emitted[sid]))
    seat_lat, leave_lat, dwell_err, guests_err, visit_err = [], [], [], [], []
    for t, s in matches:
        opened = (
            s.opened_at
            if s.opened_at is not None
            else (s.closed.seated_at if s.closed is not None else None)
        )
        if opened is not None:
            seat_lat.append(opened - t.seated_at)
        c = s.closed
        if c is not None and t.left_at is not None:
            leave_lat.append(c.ts - t.left_at)
            dwell_err.append(abs((c.left_at - c.seated_at) - (t.left_at - t.seated_at)))
        if c is not None:
            guests_err.append(abs(c.max_guests - t.guests))
            first = t.first_visit_at(th.staff_visit_min_s, end_ts)
            if c.first_visit_delay_s is not None and first is not None:
                visit_err.append(abs(c.first_visit_delay_s - (first - t.seated_at)))
    n_t, n_e, n_m = len(truth_sessions), len(emitted), len(matches)
    scores = SessionScores(
        truth=n_t,
        emitted=n_e,
        matched=n_m,
        missed=n_t - n_m,
        false=n_e - n_m,
        precision=_ratio(n_m, n_e),
        recall=_ratio(n_m, n_t),
        seat_latency_mean_s=_mean(seat_lat),
        seat_latency_p50_s=_quantile(seat_lat, 0.5),
        seat_latency_p90_s=_quantile(seat_lat, 0.9),
        leave_latency_mean_s=_mean(leave_lat),
        dwell_mae_s=_mean(dwell_err),
        guests_mae=_mean([float(g) for g in guests_err]),
        first_visit_delay_mae_s=_mean(visit_err),
    )
    return scores, emitted, matches


Band = Callable[[AlertCase], tuple[float, float]]


def _waiter_band(th: Thresholds) -> Band:
    """Observed-time band around the timeout where the analytics may reasonably go either way:
    it confirms seating ``seat_confirm_s`` late, a visit ``staff_visit_min_s`` late and a
    departure ``leave_confirm_s`` late."""

    def band(case: AlertCase) -> tuple[float, float]:
        early = th.staff_visit_min_s if case.delay_s is not None else th.leave_confirm_s
        return (
            th.first_visit_timeout_s - early - SLACK_S,
            th.first_visit_timeout_s + th.seat_confirm_s + SLACK_S,
        )

    return band


def _bussing_band(th: Thresholds) -> Band:
    def band(case: AlertCase) -> tuple[float, float]:
        return (
            th.bussing_timeout_s - th.bussing_visit_min_s - SLACK_S,
            th.bussing_timeout_s + th.leave_confirm_s + SLACK_S,
        )

    return band


def _score_alerts(
    kind: AlertKind,
    alerts: Sequence[AlertRaised],
    cases: list[AlertCase],
    sessions: list[TrueSession],
    band: Band,
    th: Thresholds,
    end_ts: float,
) -> AlertScores:
    by_session = {c.session_no: c for c in cases}
    session_list = sorted(sessions, key=lambda s: s.seated_at)

    def ambiguous(case: AlertCase) -> bool:
        lo, hi = band(case)
        if lo <= case.observed_s <= hi:
            return True
        # Still unresolved at the end of the run and too close to the deadline to judge.
        return case.delay_s is None and case.reference_at + hi > end_ts and case.positive

    emitted = [a for a in alerts if a.kind is kind]
    hit: set[int] = set()
    tp = fp = 0
    timing: list[float] = []
    for alert in sorted(emitted, key=lambda a: a.ts):
        case = None
        for s in session_list:
            c = by_session.get(s.session_no)
            if s.table_id == alert.table_id and c is not None and c.reference_at <= alert.ts + 5:
                case = c
        if case is None:
            fp += 1
            continue
        if ambiguous(case):
            hit.add(case.session_no)
            continue
        if case.positive and case.session_no not in hit:
            hit.add(case.session_no)
            tp += 1
            timing.append(alert.ts - case.expected_at)
        else:
            fp += 1
    positives = [c for c in cases if c.positive and not ambiguous(c)]
    n_amb = sum(1 for c in cases if ambiguous(c))
    fn = sum(1 for c in positives if c.session_no not in hit)
    return AlertScores(
        kind=kind.value,
        truth=len(positives),
        ambiguous=n_amb,
        emitted=len(emitted),
        tp=tp,
        fp=fp,
        fn=fn,
        precision=_ratio(tp, tp + fp),
        recall=_ratio(tp, len(positives)),
        timing_error_mean_s=_mean(timing),
        timing_mae_s=_mean([abs(x) for x in timing]),
    )


def _greedy_by_time(
    truth_ts: Sequence[float], emitted_ts: Sequence[float], tolerance: float
) -> list[tuple[int, int]]:
    pairs = sorted(
        (abs(e - t), ti, ei)
        for ti, t in enumerate(truth_ts)
        for ei, e in enumerate(emitted_ts)
        if abs(e - t) <= tolerance
    )
    used_t: set[int] = set()
    used_e: set[int] = set()
    out: list[tuple[int, int]] = []
    for _, ti, ei in pairs:
        if ti not in used_t and ei not in used_e:
            used_t.add(ti)
            used_e.add(ei)
            out.append((ti, ei))
    return out


def _score_walkaways(
    events: Sequence[EdgeEvent], truth: GroundTruth, th: Thresholds, end_ts: float
) -> WalkawayScores:
    emitted = [e for e in events if isinstance(e, QueueWalkaway)]
    done = [w for w in truth.walkaways if w.left_at is not None and w.waited_s is not None]
    lo = th.walkaway_min_wait_s - 10.0
    hi = th.walkaway_min_wait_s + 10.0
    ambiguous = [w for w in done if w.waited_s is not None and lo <= w.waited_s <= hi]
    positives = [
        w
        for w in done
        if w.waited_s is not None
        and w.waited_s > hi
        and w.left_at is not None
        and w.left_at <= end_ts - WALKAWAY_TOLERANCE_S / 2
    ]
    candidates = positives + ambiguous
    matches = _greedy_by_time(
        [w.left_at or 0.0 for w in candidates], [e.ts for e in emitted], WALKAWAY_TOLERANCE_S
    )
    tp_pairs = [(ti, ei) for ti, ei in matches if ti < len(positives)]
    amb_hits = len(matches) - len(tp_pairs)
    tp = len(tp_pairs)
    fp = len(emitted) - tp - amb_hits
    waited = [abs(emitted[ei].waited_s - (positives[ti].waited_s or 0.0)) for ti, ei in tp_pairs]
    sizes = [abs(emitted[ei].party_size_est - positives[ti].size) for ti, ei in tp_pairs]
    return WalkawayScores(
        truth=len(positives),
        ambiguous=len(ambiguous),
        emitted=len(emitted),
        tp=tp,
        fp=fp,
        fn=len(positives) - tp,
        precision=_ratio(tp, tp + fp),
        recall=_ratio(tp, len(positives)),
        waited_mae_s=_mean(waited),
        party_size_mae=_mean([float(s) for s in sizes]),
    )


def _score_queue(events: Sequence[EdgeEvent], truth: GroundTruth) -> QueueScores:
    emitted = [e for e in events if isinstance(e, QueueSeated)]
    seated = truth.queue_seated
    matches = _greedy_by_time(
        [q.crossed_at for q in seated], [e.ts for e in emitted], QUEUE_SEATED_TOLERANCE_S
    )
    diffs = [emitted[ei].waited_s - seated[ti].waited_s for ti, ei in matches]
    return QueueScores(
        truth_seated=len(seated),
        emitted_seated=len(emitted),
        matched=len(matches),
        wait_mae_s=_mean([abs(d) for d in diffs]),
        wait_bias_s=_mean(diffs),
    )


def _score_occupancy(events: Sequence[EdgeEvent], truth: GroundTruth) -> OccupancyScores:
    guests, tables, staff = [], [], []
    for e in events:
        if not isinstance(e, OccupancySnapshot):
            continue
        point = truth.occupancy_at(e.ts)
        if point is None:
            continue
        guests.append(float(e.guests - point.guests_at_tables))
        tables.append(float(abs(e.tables_occupied - point.tables_occupied)))
        staff.append(float(abs(e.staff_on_floor - point.staff_on_floor)))
    return OccupancyScores(
        snapshots=len(guests),
        guests_mae=_mean([abs(g) for g in guests]),
        guests_bias=_mean(guests),
        tables_occupied_mae=_mean(tables),
        staff_on_floor_mae=_mean(staff),
    )


def _score_turnover(
    emitted: dict[str, _EmittedSession],
    matches: list[tuple[TrueSession, _EmittedSession]],
    sessions: list[TrueSession],
    th: Thresholds,
    end_ts: float,
) -> TurnoverScores:
    """Completed sessions per table. Sessions whose guests left too close to the run end for
    the analytics to confirm the departure (``leave_confirm_s + count_window_s``) are left out
    on both sides."""
    cutoff = end_ts - th.leave_confirm_s - th.count_window_s - SLACK_S
    late = {s.session_id for t, s in matches if t.left_at is None or t.left_at > cutoff}
    counted: dict[str, int] = {}
    for s in emitted.values():
        if s.closed is not None and s.session_id not in late:
            counted[s.table_id] = counted.get(s.table_id, 0) + 1
    true: dict[str, int] = {}
    for t in sessions:
        if t.left_at is not None and t.left_at <= cutoff:
            true[t.table_id] = true.get(t.table_id, 0) + 1
    tables = set(counted) | set(true)
    n_e, n_t = sum(counted.values()), sum(true.values())
    return TurnoverScores(
        truth_sessions=n_t,
        emitted_sessions=n_e,
        error=n_e - n_t,
        per_table_abs_error=sum(abs(counted.get(t, 0) - true.get(t, 0)) for t in tables),
    )


# --------------------------------------------------------------------------------------
# Entry point and formatting
# --------------------------------------------------------------------------------------


def evaluate(
    sim: Simulation,
    *,
    tracker: TrackerName = "fallback",
    detector: DetectorName = "auto",
    engine: Any = None,
    progress: Callable[[float], None] | None = None,
) -> tuple[EvalReport, PipelineRun]:
    """Run ``sim`` (manual clock) through the pipeline and score it."""
    run = run_pipeline(sim, tracker=tracker, detector=detector, engine=engine, progress=progress)
    report = score_events(
        run.events,
        sim.ground_truth,
        scenario=sim.scenario.name,
        seed=sim.world.seed,
        tracker=run.tracker,
        detector=run.detector,
        ticks=run.ticks,
        frames=run.frames,
        wall_s=run.wall_s,
    )
    return report, run


def _f(value: float | None, digits: int = 2, unit: str = "", signed: bool = False) -> str:
    if value is None:
        return "n/a"
    sign = "+" if signed else ""
    return f"{value:{sign}.{digits}f}{unit}"


def format_report(report: EvalReport) -> str:
    """Readable summary table."""
    r = report
    s, w, b, wa, q, o, t = (
        r.sessions,
        r.waiter_needed,
        r.bussing_needed,
        r.walkaways,
        r.queue,
        r.occupancy,
        r.turnover,
    )
    rows: list[tuple[str, str, str, str]] = [
        (
            "table sessions",
            str(s.truth),
            str(s.emitted),
            f"matched {s.matched}, missed {s.missed}, false {s.false}; "
            f"P {_f(s.precision)} R {_f(s.recall)}",
        ),
        (
            "  seat-detection latency",
            "",
            "",
            f"mean {_f(s.seat_latency_mean_s, 1, ' s')}, p50 {_f(s.seat_latency_p50_s, 1, ' s')}, "
            f"p90 {_f(s.seat_latency_p90_s, 1, ' s')}",
        ),
        ("  leave-detection latency", "", "", f"mean {_f(s.leave_latency_mean_s, 1, ' s')}"),
        (
            "  dwell / guests / 1st visit",
            "",
            "",
            f"MAE {_f(s.dwell_mae_s, 1, ' s')} / {_f(s.guests_mae)} / "
            f"{_f(s.first_visit_delay_mae_s, 1, ' s')}",
        ),
    ]
    for a in (w, b):
        rows.append(
            (
                f"{a.kind} alerts",
                str(a.truth),
                str(a.emitted),
                f"TP {a.tp} FP {a.fp} FN {a.fn}; P {_f(a.precision)} R {_f(a.recall)}; "
                f"timing {_f(a.timing_error_mean_s, 1, ' s', signed=True)} "
                f"(MAE {_f(a.timing_mae_s, 1, ' s')}); ambiguous {a.ambiguous}",
            )
        )
    rows += [
        (
            "walk-aways",
            str(wa.truth),
            str(wa.emitted),
            f"TP {wa.tp} FP {wa.fp} FN {wa.fn}; P {_f(wa.precision)} R {_f(wa.recall)}; "
            f"wait MAE {_f(wa.waited_mae_s, 1, ' s')}; size MAE {_f(wa.party_size_mae)}; "
            f"ambiguous {wa.ambiguous}",
        ),
        (
            "queue seated (per person)",
            str(q.truth_seated),
            str(q.emitted_seated),
            f"matched {q.matched}; wait MAE {_f(q.wait_mae_s, 1, ' s')} "
            f"(bias {_f(q.wait_bias_s, 1, ' s', signed=True)})",
        ),
        (
            "occupancy guests",
            "",
            str(o.snapshots),
            f"MAE {_f(o.guests_mae)} (bias {_f(o.guests_bias, 2, '', signed=True)}); "
            f"tables MAE {_f(o.tables_occupied_mae)}; staff MAE {_f(o.staff_on_floor_mae)}",
        ),
        (
            "turnover (completed sessions)",
            str(t.truth_sessions),
            str(t.emitted_sessions),
            f"error {t.error:+d}; per-table abs error {t.per_table_abs_error}",
        ),
    ]
    widths = [
        max(len(row[i]) for row in rows + [("metric", "truth", "emitted", "")]) for i in range(3)
    ]
    header = f"{'metric':<{widths[0]}}  {'truth':>{widths[1]}}  {'emitted':>{widths[2]}}  result"
    lines = [
        f"rv-sim eval: {r.scenario} (seed {r.seed}), tracker={r.tracker}, detector={r.detector}",
        f"{r.duration_s:.0f} s simulated in {r.wall_s:.1f} s wall; {r.frames} frames; "
        f"{sum(r.events_by_type.values())} events",
        "",
        header,
        "-" * len(header),
    ]
    lines += [
        f"{m:<{widths[0]}}  {tr:>{widths[1]}}  {em:>{widths[2]}}  {res}" for m, tr, em, res in rows
    ]
    return "\n".join(lines)
