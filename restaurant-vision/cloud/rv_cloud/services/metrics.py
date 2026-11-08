"""Metrics, shift report and branch comparison: load records, call :mod:`rv_cloud.metrics`."""

import datetime as dt
from collections.abc import Sequence
from zoneinfo import ZoneInfo

from rv_contracts import (
    BranchComparison,
    Bucket,
    Currency,
    MetricsSummary,
    Plan,
    ShiftReport,
    TableStats,
    Timeseries,
    TimeseriesMetric,
)
from sqlalchemy.orm import Session

from ..clock import Clock
from ..db.models import Site
from ..errors import Forbidden, InvalidInput, NotFound
from ..metrics import (
    AlertRecord,
    QueueRecord,
    RoiInputs,
    SessionRecord,
    SnapshotPoint,
    baseline_window,
    bucket_starts,
    business_day_range,
    queued_hours,
    roi_block,
    summarize,
    table_stats,
)
from ..metrics import timeseries as ts_fn
from ..repositories import (
    AlertRepository,
    OrgRepository,
    QueueRepository,
    ScopedSiteRepository,
    SiteRepository,
    SnapshotRepository,
    TableRepository,
)
from ..repositories.queues import (
    QUEUE_SEATED,
    QUEUE_WALKAWAY,
    SNAPSHOT_OCCUPANCY,
    SNAPSHOT_QUEUE,
)
from ..tenancy import SiteScope
from . import views
from .auth import CurrentUser
from .orgs import require_own_org

DEFAULT_RANGE_S = 86400.0
MAX_RANGE_S = 400 * 86400.0


def resolve_range(from_ts: float | None, to_ts: float | None, now: float) -> tuple[float, float]:
    """Default: the last 24 hours. ``to`` must be after ``from``; at most 400 days."""
    end = to_ts if to_ts is not None else now
    start = from_ts if from_ts is not None else end - DEFAULT_RANGE_S
    if end <= start:
        raise InvalidInput("'to' must be after 'from'")
    if end - start > MAX_RANGE_S:
        raise InvalidInput("Range too long (max 400 days)")
    return start, end


class MetricsService:
    def __init__(self, session: Session, clock: Clock, business_day_start_hour: int = 5) -> None:
        self._session = session
        self._clock = clock
        self._day_start_hour = business_day_start_hour

    # ------------------------------------------------------------------ loaders

    def _sessions(self, scope: SiteScope, start: float, end: float) -> list[SessionRecord]:
        return [
            SessionRecord(
                table_id=s.table_id,
                seated_at=s.seated_at,
                left_at=s.left_at,
                max_guests=s.max_guests or 0,
                first_visit_delay_s=s.first_visit_delay_s,
                bussing_delay_s=s.bussing_delay_s,
            )
            for s in TableRepository(self._session, scope).closed_sessions(start, end)
            if s.seated_at is not None and s.left_at is not None
        ]

    def _alerts(self, scope: SiteScope, start: float, end: float) -> list[AlertRecord]:
        rows = AlertRepository(self._session, scope).list(
            open_only=False, from_ts=start, to_ts=end, limit=1_000_000
        )
        return [
            AlertRecord(kind=a.kind, raised_at=a.raised_at, resolved_at=a.resolved_at) for a in rows
        ]

    def _queue(self, scope: SiteScope, start: float, end: float) -> list[QueueRecord]:
        return [
            QueueRecord(
                kind=q.kind,
                ts=q.ts,
                waited_s=q.waited_s,
                zone_id=q.zone_id,
                party_size_est=q.party_size_est,
            )
            for q in QueueRepository(self._session, scope).events(start, end)
        ]

    def _snapshots(
        self, scope: SiteScope, kind: str, start: float, end: float
    ) -> list[SnapshotPoint]:
        return [
            SnapshotPoint(ts=t, value=v, zone_id=z)
            for t, v, z in SnapshotRepository(self._session, scope).between(kind, start, end)
        ]

    # ------------------------------------------------------------------ endpoints

    def summary(
        self, scope: SiteScope, from_ts: float | None, to_ts: float | None
    ) -> MetricsSummary:
        start, end = resolve_range(from_ts, to_ts, self._clock.now())
        site = ScopedSiteRepository(self._session, scope).get()
        return self._summary(site, scope, start, end)

    def _summary(self, site: Site, scope: SiteScope, start: float, end: float) -> MetricsSummary:
        config = views.load_config(site)
        return summarize(
            site_id=site.id,
            from_ts=start,
            to_ts=end,
            currency=Currency(site.currency),
            avg_check_per_guest=site.avg_check_per_guest,
            table_count=len(config.tables),
            sessions=self._sessions(scope, start, end),
            alerts=self._alerts(scope, start, end),
            queue=self._queue(scope, start, end),
        )

    def timeseries(
        self,
        scope: SiteScope,
        metric: TimeseriesMetric,
        bucket: Bucket,
        from_ts: float | None,
        to_ts: float | None,
    ) -> Timeseries:
        start, end = resolve_range(from_ts, to_ts, self._clock.now())
        site = ScopedSiteRepository(self._session, scope).get()
        tz = ZoneInfo(site.timezone)
        starts = bucket_starts(start, end, bucket, tz)
        if metric is TimeseriesMetric.OCCUPANCY:
            points = ts_fn.mean_series(
                starts, end, self._snapshots(scope, SNAPSHOT_OCCUPANCY, start, end)
            )
        elif metric is TimeseriesMetric.QUEUE:
            points = ts_fn.zone_sum_series(
                starts, end, self._snapshots(scope, SNAPSHOT_QUEUE, start, end)
            )
        elif metric is TimeseriesMetric.WALKAWAYS:
            walkaways = QueueRepository(self._session, scope).events(start, end, QUEUE_WALKAWAY)
            points = ts_fn.count_series(starts, end, (w.ts for w in walkaways))
        elif metric is TimeseriesMetric.QUEUE_WAIT:
            seated = [q for q in self._queue(scope, start, end) if q.kind == QUEUE_SEATED]
            points = ts_fn.queue_wait_series(starts, end, seated)
        elif metric is TimeseriesMetric.RESPONSE_TIME_P90:
            points = ts_fn.response_series(
                starts, end, self._alerts(scope, start, end), reducer=ts_fn.p90
            )
        else:
            points = ts_fn.response_series(starts, end, self._alerts(scope, start, end))
        return Timeseries(
            site_id=site.id, metric=metric, bucket=bucket, from_ts=start, to_ts=end, points=points
        )

    def table_stats(
        self, scope: SiteScope, from_ts: float | None, to_ts: float | None
    ) -> list[TableStats]:
        start, end = resolve_range(from_ts, to_ts, self._clock.now())
        site = ScopedSiteRepository(self._session, scope).get()
        return table_stats(views.load_config(site).tables, self._sessions(scope, start, end))

    def shift_report(self, scope: SiteScope, date: dt.date) -> ShiftReport:
        """One business day in the site's time zone, from ``business_day_start_hour`` local to
        the same hour the next day."""
        site = ScopedSiteRepository(self._session, scope).get()
        tz = ZoneInfo(site.timezone)
        start, end = business_day_range(date, tz, self._day_start_hour)
        config = views.load_config(site)
        sessions = self._sessions(scope, start, end)
        alerts = self._alerts(scope, start, end)
        queue = self._queue(scope, start, end)
        summary = summarize(
            site_id=site.id,
            from_ts=start,
            to_ts=end,
            currency=Currency(site.currency),
            avg_check_per_guest=site.avg_check_per_guest,
            table_count=len(config.tables),
            sessions=sessions,
            alerts=alerts,
            queue=queue,
        )
        hours = bucket_starts(start, end, Bucket.HOUR_1, tz)
        occupancy = ts_fn.mean_series(
            hours, end, self._snapshots(scope, SNAPSHOT_OCCUPANCY, start, end)
        )
        window = baseline_window(site.first_event_ts)
        baseline_alerts: Sequence[AlertRecord] = []
        baseline_sessions: Sequence[SessionRecord] = []
        if window is not None:
            baseline_alerts = self._alerts(scope, *window)
            baseline_sessions = self._sessions(scope, *window)
        roi = roi_block(
            RoiInputs(
                currency=Currency(site.currency),
                avg_check_per_guest=site.avg_check_per_guest,
                tz=tz,
                queue=queue,
                alerts=alerts,
                sessions=sessions,
                baseline_alerts=baseline_alerts,
                baseline_sessions=baseline_sessions,
                queued_hours=queued_hours(
                    tz, self._snapshots(scope, SNAPSHOT_QUEUE, start, end), queue
                ),
            )
        )
        return ShiftReport(
            site_id=site.id,
            date=date,
            timezone=site.timezone,
            from_ts=start,
            to_ts=end,
            summary=summary,
            tables=table_stats(config.tables, sessions),
            occupancy_by_hour=occupancy,
            roi=roi,
        )

    def compare(
        self, user: CurrentUser, org_id: str, from_ts: float | None, to_ts: float | None
    ) -> BranchComparison:
        """One summary per site of the org (owners; Pro plan)."""
        require_own_org(user, org_id)
        org = OrgRepository(self._session, org_id).get()
        if org is None:
            raise NotFound("Organization not found")
        if org.plan != Plan.PRO.value:
            raise Forbidden("Branch comparison requires the Pro plan")
        start, end = resolve_range(from_ts, to_ts, self._clock.now())
        sites = SiteRepository(self._session, user.scope).list_accessible()
        summaries = [
            self._summary(site, SiteScope(org_id=site.org_id, site_id=site.id), start, end)
            for site in sites
        ]
        return BranchComparison(org_id=org_id, from_ts=start, to_ts=end, sites=summaries)
