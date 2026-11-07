"""Time buckets in a site's local time zone, and business-day ranges.

Sub-day buckets (5m/15m/1h) start on the local wall-clock grid (e.g. every quarter hour of
local time) and advance in absolute seconds, so DST changes yield a 23- or 25-hour day of
hourly buckets rather than overlapping ones. ``1d`` buckets start at local midnight.
"""

import bisect
import datetime as dt
from collections.abc import Sequence
from zoneinfo import ZoneInfo

from rv_contracts import Bucket

from ..errors import InvalidInput

BUCKET_SECONDS: dict[Bucket, int] = {
    Bucket.MIN_5: 300,
    Bucket.MIN_15: 900,
    Bucket.HOUR_1: 3600,
    Bucket.DAY_1: 86400,
}

MAX_BUCKETS = 5000


def floor_local(ts: float, bucket: Bucket, tz: ZoneInfo) -> float:
    """Start of the local bucket containing ``ts``."""
    local = dt.datetime.fromtimestamp(ts, tz)
    if bucket is Bucket.DAY_1:
        start = dt.datetime.combine(local.date(), dt.time(0, 0), tzinfo=tz)
        return start.timestamp()
    minutes = BUCKET_SECONDS[bucket] // 60
    minute_of_day = local.hour * 60 + local.minute
    floored = minute_of_day - minute_of_day % minutes
    start = local.replace(hour=floored // 60, minute=floored % 60, second=0, microsecond=0)
    return start.timestamp()


def bucket_starts(
    from_ts: float, to_ts: float, bucket: Bucket, tz: ZoneInfo, *, max_buckets: int = MAX_BUCKETS
) -> list[float]:
    """Ascending bucket start times covering ``[from_ts, to_ts)``. The first start may be
    before ``from_ts`` (the bucket containing it)."""
    if to_ts <= from_ts:
        raise InvalidInput("'to' must be after 'from'")
    starts: list[float] = []
    current = floor_local(from_ts, bucket, tz)
    while current < to_ts:
        starts.append(current)
        if len(starts) > max_buckets:
            raise InvalidInput(f"range too long for bucket {bucket.value} (max {max_buckets})")
        current = _next_start(current, bucket, tz)
    return starts


def _next_start(start: float, bucket: Bucket, tz: ZoneInfo) -> float:
    if bucket is Bucket.DAY_1:
        local_date = dt.datetime.fromtimestamp(start, tz).date() + dt.timedelta(days=1)
        return dt.datetime.combine(local_date, dt.time(0, 0), tzinfo=tz).timestamp()
    step = BUCKET_SECONDS[bucket]
    candidate = floor_local(start + step, bucket, tz)
    # Offsets that are not a multiple of the bucket (e.g. a 30-minute DST shift) can floor
    # back to ``start``; never return a start that does not advance.
    return candidate if candidate > start else start + step


def bucket_index(starts: Sequence[float], ts: float) -> int | None:
    """Index of the bucket containing ``ts`` (``starts`` ascending), or None before the first."""
    index = bisect.bisect_right(starts, ts) - 1
    return index if index >= 0 else None


def business_day_range(date: dt.date, tz: ZoneInfo, start_hour: int) -> tuple[float, float]:
    """``[from, to)`` of the business day ``date``: local ``date start_hour:00`` to the next
    day's ``start_hour:00`` (23 or 25 hours long across DST changes)."""
    start = dt.datetime.combine(date, dt.time(start_hour, 0), tzinfo=tz)
    end = dt.datetime.combine(date + dt.timedelta(days=1), dt.time(start_hour, 0), tzinfo=tz)
    return start.timestamp(), end.timestamp()


def site_zone(name: str) -> ZoneInfo:
    """The ``ZoneInfo`` for a stored site time zone (validated on write)."""
    return ZoneInfo(name)
