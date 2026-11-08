"""Bucketed time series (``GET /sites/{id}/metrics/timeseries``)."""

from collections.abc import Callable, Iterable, Sequence

from rv_contracts import AlertKind, TimeseriesPoint

from .records import AlertRecord, QueueRecord, SnapshotPoint
from .stats import mean, median, percentile
from .timebuckets import bucket_index


def _group(
    starts: Sequence[float], to_ts: float, items: Iterable[tuple[float, float]]
) -> list[list[float]]:
    groups: list[list[float]] = [[] for _ in starts]
    for ts, value in items:
        if ts >= to_ts:
            continue
        index = bucket_index(starts, ts)
        if index is not None:
            groups[index].append(value)
    return groups


def _points(starts: Sequence[float], values: Sequence[float | None]) -> list[TimeseriesPoint]:
    return [TimeseriesPoint(ts=s, value=v) for s, v in zip(starts, values, strict=True)]


def mean_series(
    starts: Sequence[float], to_ts: float, points: Iterable[SnapshotPoint]
) -> list[TimeseriesPoint]:
    """Mean value per bucket (occupancy guests). None for empty buckets."""
    groups = _group(starts, to_ts, ((p.ts, p.value) for p in points))
    return _points(starts, [mean(g) for g in groups])


def zone_sum_series(
    starts: Sequence[float], to_ts: float, points: Iterable[SnapshotPoint]
) -> list[TimeseriesPoint]:
    """Per bucket: mean per zone, summed over zones (total people in all queue zones)."""
    by_zone: dict[str | None, list[SnapshotPoint]] = {}
    for p in points:
        by_zone.setdefault(p.zone_id, []).append(p)
    totals: list[float | None] = [None] * len(starts)
    for zone_points in by_zone.values():
        groups = _group(starts, to_ts, ((p.ts, p.value) for p in zone_points))
        for i, group in enumerate(groups):
            zone_mean = mean(group)
            if zone_mean is not None:
                totals[i] = (totals[i] or 0.0) + zone_mean
    return _points(starts, totals)


def count_series(
    starts: Sequence[float], to_ts: float, timestamps: Iterable[float]
) -> list[TimeseriesPoint]:
    """Number of events per bucket (0 for empty buckets)."""
    groups = _group(starts, to_ts, ((ts, 1.0) for ts in timestamps))
    return _points(starts, [float(len(g)) for g in groups])


def queue_wait_series(
    starts: Sequence[float], to_ts: float, seated: Iterable[QueueRecord]
) -> list[TimeseriesPoint]:
    """Mean ``waited_s`` of ``queue.seated`` per bucket, by seating time (the per-bucket
    ``MetricsSummary.queue_avg_wait_s``). None for buckets where nobody was seated."""
    groups = _group(starts, to_ts, ((q.ts, q.waited_s) for q in seated if q.kind == "seated"))
    return _points(starts, [mean(g) for g in groups])


def p90(values: Iterable[float]) -> float | None:
    return percentile(values, 90.0)


def response_series(
    starts: Sequence[float],
    to_ts: float,
    alerts: Iterable[AlertRecord],
    reducer: Callable[[Iterable[float]], float | None] = median,
    kind: str = AlertKind.WAITER_NEEDED.value,
) -> list[TimeseriesPoint]:
    """Raised -> resolved seconds of ``kind`` alerts per bucket (median by default, see
    ``reducer``), by raise time."""
    items = (
        (a.raised_at, a.response_s) for a in alerts if a.kind == kind and a.response_s is not None
    )
    groups = _group(starts, to_ts, ((ts, float(v)) for ts, v in items if v is not None))
    return _points(starts, [reducer(g) for g in groups])
