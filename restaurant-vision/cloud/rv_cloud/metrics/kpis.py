"""Summary KPIs and per-table statistics (architecture 7.3 metrics).

Definitions (all over ``[from_ts, to_ts)``):

* sessions / guests served / dwell: table sessions whose guests *left* in the range;
  guests served = sum of ``max_guests``; dwell = ``left_at - seated_at``.
* turnover per table: sessions / number of configured tables.
* waiter response: ``waiter_needed`` alerts *raised* in the range and resolved
  (any reason), ``resolved_at - raised_at``; p50 and p90.
* bussing delay p50: over the range's sessions with a known bussing delay.
* queue avg/max wait: ``waited_s`` of ``queue.seated`` in the range.
* walkaways and lost revenue: ``queue.walkaway`` count; lost revenue estimate =
  sum(``party_size_est``) x ``avg_check_per_guest`` (None while the check size is unset).
"""

from collections.abc import Sequence

from rv_contracts import (
    AlertKind,
    Currency,
    Estimate,
    MetricsSummary,
    Table,
    TableStats,
)

from .records import AlertRecord, QueueRecord, SessionRecord
from .stats import mean, median, percentile

SEATED = "seated"
WALKAWAY = "walkaway"


def response_times(alerts: Sequence[AlertRecord], kind: str = AlertKind.WAITER_NEEDED) -> list[float]:
    return [a.response_s for a in alerts if a.kind == kind and a.response_s is not None]


def lost_revenue(walkaways: Sequence[QueueRecord], avg_check_per_guest: float) -> Estimate:
    if avg_check_per_guest <= 0:
        return Estimate(value=None)
    guests = sum(w.party_size_est or 1 for w in walkaways)
    return Estimate(value=round(guests * avg_check_per_guest, 2))


def summarize(
    *,
    site_id: str,
    from_ts: float,
    to_ts: float,
    currency: Currency,
    avg_check_per_guest: float,
    table_count: int,
    sessions: Sequence[SessionRecord],
    alerts: Sequence[AlertRecord],
    queue: Sequence[QueueRecord],
) -> MetricsSummary:
    """KPIs of one site. Inputs must already be limited to the range."""
    responses = response_times(alerts)
    seated_waits = [q.waited_s for q in queue if q.kind == SEATED]
    walkaways = [q for q in queue if q.kind == WALKAWAY]
    bussing = [s.bussing_delay_s for s in sessions if s.bussing_delay_s is not None]
    return MetricsSummary(
        site_id=site_id,
        from_ts=from_ts,
        to_ts=to_ts,
        currency=currency,
        sessions=len(sessions),
        guests_served=sum(s.max_guests for s in sessions),
        avg_dwell_s=mean(s.dwell_s for s in sessions),
        turnover_per_table=(len(sessions) / table_count) if table_count > 0 else None,
        waiter_response_p50_s=percentile(responses, 50.0),
        waiter_response_p90_s=percentile(responses, 90.0),
        bussing_delay_p50_s=median(bussing),
        queue_avg_wait_s=mean(seated_waits),
        queue_max_wait_s=max(seated_waits, default=None),
        walkaways=len(walkaways),
        lost_revenue=lost_revenue(walkaways, avg_check_per_guest),
    )


def table_stats(tables: Sequence[Table], sessions: Sequence[SessionRecord]) -> list[TableStats]:
    """One row per configured table, in config order (tables without sessions included)."""
    by_table: dict[str, list[SessionRecord]] = {}
    for s in sessions:
        by_table.setdefault(s.table_id, []).append(s)
    rows: list[TableStats] = []
    for table in tables:
        own = by_table.get(table.table_id, [])
        first_visits = [s.first_visit_delay_s for s in own if s.first_visit_delay_s is not None]
        bussing = [s.bussing_delay_s for s in own if s.bussing_delay_s is not None]
        rows.append(
            TableStats(
                table_id=table.table_id,
                label=table.label,
                seats=table.seats,
                sessions=len(own),
                guests=sum(s.max_guests for s in own),
                avg_dwell_s=mean(s.dwell_s for s in own),
                avg_party_size=mean(float(s.max_guests) for s in own),
                first_visit_delay_p50_s=median(first_visits),
                bussing_delay_p50_s=median(bussing),
            )
        )
    return rows
