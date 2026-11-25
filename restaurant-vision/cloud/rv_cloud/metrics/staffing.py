"""Staffing recommendation (contracts 1.3, pure functions): waiters per site-local hour.

Occupancy snapshots are grouped by site-local calendar date and hour. Each (date, hour) with
data yields one sample, the hour's mean guests (and its maximum). Per day type (weekday or
weekend, from ``weekend_days``) and hour:

* ``avg_guests`` / ``p75_guests``: mean / 75th percentile of the samples;
* ``peak_guests``: highest snapshot value;
* ``recommended_waiters = ceil(p75_guests / guests_per_waiter)``, at least 1 when any guest
  was seen in that hour, 0 when the hour has no data or no guests (closed).
"""

import datetime as dt
import math
from collections.abc import Collection, Sequence
from zoneinfo import ZoneInfo

from rv_contracts import DayType, StaffingDay, StaffingHour

from .records import SnapshotPoint
from .stats import mean, percentile


def recommended_waiters(p75_guests: float | None, peak_guests: float | None, per: float) -> int:
    """``ceil(p75 / per)``, minimum 1 when guests were seen; 0 without guests."""
    if p75_guests is None or not peak_guests:
        return 0
    # round first so that 40 / 20 stays 2 despite float noise
    return max(1, math.ceil(round(p75_guests / per, 9)))


def day_type(date: dt.date, weekend_days: Collection[int]) -> DayType:
    return DayType.WEEKEND if date.isoweekday() in weekend_days else DayType.WEEKDAY


def staffing_days(
    points: Sequence[SnapshotPoint],
    tz: ZoneInfo,
    weekend_days: Collection[int],
    guests_per_waiter: float,
) -> list[StaffingDay]:
    """One :class:`StaffingDay` per day type (weekday, weekend), 24 hours each."""
    cells: dict[tuple[dt.date, int], list[float]] = {}
    for p in points:
        local = dt.datetime.fromtimestamp(p.ts, tz)
        cells.setdefault((local.date(), local.hour), []).append(p.value)
    samples: dict[tuple[DayType, int], list[float]] = {}
    peaks: dict[tuple[DayType, int], float] = {}
    for (date, hour), values in cells.items():
        key = (day_type(date, weekend_days), hour)
        hour_mean = mean(values)
        assert hour_mean is not None
        samples.setdefault(key, []).append(hour_mean)
        peaks[key] = max(peaks.get(key, 0.0), max(values))
    days: list[StaffingDay] = []
    for kind in (DayType.WEEKDAY, DayType.WEEKEND):
        hours: list[StaffingHour] = []
        for hour in range(24):
            xs = samples.get((kind, hour), [])
            p75 = percentile(xs, 75.0)
            peak = peaks.get((kind, hour)) if xs else None
            hours.append(
                StaffingHour(
                    hour=hour,
                    days=len(xs),
                    avg_guests=mean(xs),
                    p75_guests=p75,
                    peak_guests=peak,
                    recommended_waiters=recommended_waiters(p75, peak, guests_per_waiter),
                )
            )
        days.append(StaffingDay(day_type=kind, hours=hours))
    return days
