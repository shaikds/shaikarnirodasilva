"""ROI estimates (architecture 7.4). Every figure is an :class:`~rv_contracts.Estimate`.

* Baseline window: the first :data:`BASELINE_DAYS` days after the site's first event.
* Lost revenue: walkaways x ``party_size_est`` x ``avg_check_per_guest``.
* Response-time improvement: baseline p50 - current p50 of ``waiter_needed``
  raised -> resolved.
* Extra covers (Cornell revenue-management rule: shorter turns only add revenue when demand
  exceeds capacity): only sessions that ended in a local hour with a non-empty queue count.
  ``saved = max(0, baseline mean turn - current mean turn)`` (turn = dwell + bussing delay);
  each such session freed its table ``saved`` seconds earlier, worth ``saved / current turn``
  extra seatings of its party, so ``extra_covers = sum(max_guests) x saved / current turn``
  over those sessions. Extra revenue = extra covers x ``avg_check_per_guest``.
"""

from collections.abc import Collection, Sequence
from dataclasses import dataclass
from zoneinfo import ZoneInfo

from rv_contracts import Bucket, Currency, Estimate, RoiBlock

from .kpis import WALKAWAY, lost_revenue, response_times
from .records import AlertRecord, QueueRecord, SessionRecord, SnapshotPoint
from .stats import mean, median
from .timebuckets import floor_local

BASELINE_DAYS = 7
BASELINE_S = BASELINE_DAYS * 86400.0


def baseline_window(first_event_ts: float | None) -> tuple[float, float] | None:
    """``[first event, first event + 7 days)`` or None when the site has no events yet."""
    if first_event_ts is None:
        return None
    return first_event_ts, first_event_ts + BASELINE_S


def queued_hours(
    tz: ZoneInfo, queue_snapshots: Sequence[SnapshotPoint], queue_events: Sequence[QueueRecord]
) -> set[float]:
    """Local hour starts in which a queue was non-empty: a snapshot with people > 0, or a
    seated/walk-away event (someone was waiting)."""
    hours = {floor_local(p.ts, Bucket.HOUR_1, tz) for p in queue_snapshots if p.value > 0}
    hours.update(floor_local(q.ts, Bucket.HOUR_1, tz) for q in queue_events)
    return hours


@dataclass(frozen=True, slots=True)
class RoiInputs:
    currency: Currency
    avg_check_per_guest: float
    tz: ZoneInfo
    queue: Sequence[QueueRecord]
    """Queue facts in the report range."""
    alerts: Sequence[AlertRecord]
    """Alerts raised in the report range."""
    sessions: Sequence[SessionRecord]
    """Sessions closed in the report range."""
    baseline_alerts: Sequence[AlertRecord]
    baseline_sessions: Sequence[SessionRecord]
    queued_hours: Collection[float]


def extra_covers(
    sessions: Sequence[SessionRecord],
    baseline_sessions: Sequence[SessionRecord],
    hours: Collection[float],
    tz: ZoneInfo,
) -> float | None:
    """See module docstring. None without a baseline or current turn time."""
    baseline_turn = mean(s.turn_s for s in baseline_sessions)
    current_turn = mean(s.turn_s for s in sessions)
    if baseline_turn is None or current_turn is None or current_turn <= 0:
        return None
    saved = max(0.0, baseline_turn - current_turn)
    queued_guests = sum(
        s.max_guests for s in sessions if floor_local(s.left_at, Bucket.HOUR_1, tz) in hours
    )
    return round(queued_guests * saved / current_turn, 2)


def roi_block(inputs: RoiInputs) -> RoiBlock:
    walkaways = [q for q in inputs.queue if q.kind == WALKAWAY]
    baseline_p50 = median(response_times(inputs.baseline_alerts))
    current_p50 = median(response_times(inputs.alerts))
    improvement = (
        baseline_p50 - current_p50 if baseline_p50 is not None and current_p50 is not None else None
    )
    covers = extra_covers(inputs.sessions, inputs.baseline_sessions, inputs.queued_hours, inputs.tz)
    revenue = (
        round(covers * inputs.avg_check_per_guest, 2)
        if covers is not None and inputs.avg_check_per_guest > 0
        else None
    )
    return RoiBlock(
        currency=inputs.currency,
        avg_check_per_guest=inputs.avg_check_per_guest,
        walkaways=len(walkaways),
        lost_revenue=lost_revenue(walkaways, inputs.avg_check_per_guest),
        response_time_baseline_p50_s=baseline_p50,
        response_time_current_p50_s=current_p50,
        response_time_improvement_s=Estimate(value=improvement),
        extra_covers=Estimate(value=covers),
        extra_revenue=Estimate(value=revenue),
    )
