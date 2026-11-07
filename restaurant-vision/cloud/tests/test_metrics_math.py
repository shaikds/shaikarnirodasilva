"""Pure metric functions on hand-built records."""

import datetime as dt
from zoneinfo import ZoneInfo

import pytest
from rv_contracts import Bucket, Currency, Table

from rv_cloud.errors import InvalidInput
from rv_cloud.metrics import (
    AlertRecord,
    QueueRecord,
    RoiInputs,
    SessionRecord,
    SnapshotPoint,
    baseline_window,
    bucket_starts,
    business_day_range,
    mean,
    median,
    percentile,
    queued_hours,
    roi_block,
    summarize,
    table_stats,
)
from rv_cloud.metrics import timeseries as ts

T = 1_793_988_000.0  # 2026-11-06 18:00 UTC
JLM = ZoneInfo("Asia/Jerusalem")
SYD = ZoneInfo("Australia/Sydney")


def test_percentile_and_mean() -> None:
    assert percentile([], 50) is None
    assert percentile([7.0], 90) == 7.0
    assert percentile([60.0, 120.0, 300.0], 50) == 120.0
    assert percentile([60.0, 120.0, 300.0], 90) == pytest.approx(264.0)
    assert percentile([1.0, 2.0, 3.0, 4.0], 50) == 2.5
    assert median([5.0, 1.0, 3.0]) == 3.0
    assert mean([]) is None and mean([1.0, 2.0]) == 1.5
    with pytest.raises(ValueError):
        percentile([1.0], 101)


SESSIONS = [
    SessionRecord("t1", T, T + 3600, 2, first_visit_delay_s=240.0, bussing_delay_s=300.0),
    SessionRecord("t2", T + 600, T + 1800, 4, first_visit_delay_s=60.0, bussing_delay_s=100.0),
    SessionRecord("t1", T + 4000, T + 4600, 3),
]
ALERTS = [
    AlertRecord("waiter_needed", T + 100, T + 160),
    AlertRecord("waiter_needed", T + 200, T + 320),
    AlertRecord("waiter_needed", T + 300, T + 600),
    AlertRecord("waiter_needed", T + 400, None),
    AlertRecord("checkin_needed", T + 500, T + 510),
]
QUEUE = [
    QueueRecord("seated", T + 10, 100.0),
    QueueRecord("seated", T + 20, 200.0),
    QueueRecord("walkaway", T + 30, 90.0, party_size_est=2),
    QueueRecord("walkaway", T + 40, 120.0, party_size_est=3),
]


def test_summarize() -> None:
    s = summarize(
        site_id="s", from_ts=T, to_ts=T + 7200, currency=Currency.ILS, avg_check_per_guest=100.0,
        table_count=8, sessions=SESSIONS, alerts=ALERTS, queue=QUEUE,
    )
    assert s.sessions == 3 and s.guests_served == 9
    assert s.avg_dwell_s == pytest.approx((3600 + 1200 + 600) / 3)
    assert s.turnover_per_table == pytest.approx(3 / 8)
    assert s.waiter_response_p50_s == 120.0
    assert s.waiter_response_p90_s == pytest.approx(264.0)
    assert s.bussing_delay_p50_s == 200.0
    assert s.queue_avg_wait_s == 150.0 and s.queue_max_wait_s == 200.0
    assert s.walkaways == 2
    assert s.lost_revenue.value == 500.0 and s.lost_revenue.is_estimate is True


def test_summarize_empty_and_unknown_check() -> None:
    s = summarize(
        site_id="s", from_ts=T, to_ts=T + 1, currency=Currency.AUD, avg_check_per_guest=0.0,
        table_count=0, sessions=[], alerts=[], queue=QUEUE[2:],
    )
    assert s.sessions == 0 and s.avg_dwell_s is None and s.turnover_per_table is None
    assert s.waiter_response_p50_s is None and s.queue_avg_wait_s is None
    assert s.walkaways == 2 and s.lost_revenue.value is None


def test_table_stats() -> None:
    tables = [Table(table_id="t1", label="1", seats=2), Table(table_id="t2", label="2", seats=4),
              Table(table_id="t3", label="3", seats=6)]
    rows = {r.table_id: r for r in table_stats(tables, SESSIONS)}
    assert rows["t1"].sessions == 2 and rows["t1"].guests == 5
    assert rows["t1"].avg_dwell_s == pytest.approx(2100.0)
    assert rows["t1"].avg_party_size == 2.5
    assert rows["t1"].first_visit_delay_p50_s == 240.0 and rows["t1"].bussing_delay_p50_s == 300.0
    assert rows["t3"].sessions == 0 and rows["t3"].avg_dwell_s is None


def test_bucket_starts_follow_local_time() -> None:
    # 15-minute buckets in Jerusalem (UTC+2): aligned to local quarter hours.
    starts = bucket_starts(T + 100, T + 3600, Bucket.MIN_15, JLM)
    assert starts == [T, T + 900, T + 1800, T + 2700]
    # Daily buckets start at local midnight (22:00 UTC the previous day).
    days = bucket_starts(T, T + 2 * 86400, Bucket.DAY_1, JLM)
    first = dt.datetime.fromtimestamp(days[0], JLM)
    assert (first.hour, first.minute, first.date()) == (0, 0, dt.date(2026, 11, 6))
    assert len(days) == 3
    # A half-hour offset zone: hourly buckets start at local :00, i.e. UTC :30.
    adelaide = bucket_starts(T, T + 7200, Bucket.HOUR_1, ZoneInfo("Australia/Adelaide"))
    assert all(dt.datetime.fromtimestamp(s, dt.UTC).minute == 30 for s in adelaide)
    with pytest.raises(InvalidInput):
        bucket_starts(T, T, Bucket.HOUR_1, JLM)
    with pytest.raises(InvalidInput):
        bucket_starts(T, T + 86400 * 30, Bucket.MIN_5, JLM, max_buckets=100)


def test_dst_days_have_23_or_25_hourly_buckets() -> None:
    # Sydney DST starts 2026-10-04 02:00 -> 03:00.
    start = dt.datetime(2026, 10, 4, tzinfo=SYD).timestamp()
    end = dt.datetime(2026, 10, 5, tzinfo=SYD).timestamp()
    assert len(bucket_starts(start, end, Bucket.HOUR_1, SYD)) == 23
    assert len(bucket_starts(start, end, Bucket.DAY_1, SYD)) == 1
    # ...and ends 2026-04-05 03:00 -> 02:00.
    start = dt.datetime(2026, 4, 5, tzinfo=SYD).timestamp()
    end = dt.datetime(2026, 4, 6, tzinfo=SYD).timestamp()
    hourly = bucket_starts(start, end, Bucket.HOUR_1, SYD)
    assert len(hourly) == 25 and len(set(hourly)) == 25


def test_business_day_range() -> None:
    start, end = business_day_range(dt.date(2026, 11, 6), JLM, 5)
    assert dt.datetime.fromtimestamp(start, JLM) == dt.datetime(2026, 11, 6, 5, tzinfo=JLM)
    assert end - start == 86400
    assert start == T - 15 * 3600  # 03:00 UTC
    # The business day that contains Sydney's spring-forward is 23 hours long.
    start, end = business_day_range(dt.date(2026, 10, 3), SYD, 5)
    assert end - start == 23 * 3600


def test_timeseries_functions() -> None:
    starts = [T, T + 900, T + 1800]
    occ = ts.mean_series(starts, T + 2700, [SnapshotPoint(T, 10), SnapshotPoint(T + 300, 20),
                                             SnapshotPoint(T + 960, 30), SnapshotPoint(T + 9999, 1)])
    assert [p.value for p in occ] == [15.0, 30.0, None]
    queue = ts.zone_sum_series(starts, T + 2700, [
        SnapshotPoint(T, 2, "q1"), SnapshotPoint(T + 60, 4, "q1"), SnapshotPoint(T + 30, 1, "q2"),
        SnapshotPoint(T + 1000, 5, "q2"),
    ])
    assert [p.value for p in queue] == [4.0, 5.0, None]
    counts = ts.count_series(starts, T + 2700, [T + 1, T + 2, T + 1801, T - 5])
    assert [p.value for p in counts] == [2.0, 0.0, 1.0]
    resp = ts.response_series(starts, T + 2700, ALERTS)
    assert [p.value for p in resp] == [120.0, None, None]
    assert [p.ts for p in resp] == starts


def test_roi_block_math() -> None:
    first = T - 30 * 86400
    assert baseline_window(None) is None
    assert baseline_window(first) == (first, first + 7 * 86400)
    baseline_sessions = [SessionRecord("t1", first, first + 3600, 2),
                         SessionRecord("t2", first, first + 3000, 2, bussing_delay_s=600.0)]
    current = [
        SessionRecord("t1", T, T + 2700, 4, bussing_delay_s=300.0),  # turn 3000, queued hour
        SessionRecord("t2", T + 3600, T + 6600, 2),  # turn 3000, hour without a queue
    ]
    hours = queued_hours(JLM, [SnapshotPoint(T + 60, 3), SnapshotPoint(T + 3700, 0)], [])
    assert hours == {T}
    roi = roi_block(RoiInputs(
        currency=Currency.ILS, avg_check_per_guest=100.0, tz=JLM, queue=QUEUE,
        alerts=ALERTS[:3],  # responses 60, 120, 300 -> p50 120
        sessions=current,
        baseline_alerts=[AlertRecord("waiter_needed", first, first + 300),
                         AlertRecord("waiter_needed", first, first + 500)],  # p50 400
        baseline_sessions=baseline_sessions, queued_hours=hours,
    ))
    assert roi.is_estimate is True
    assert roi.walkaways == 2 and roi.lost_revenue.value == 500.0
    assert roi.response_time_baseline_p50_s == 400.0
    assert roi.response_time_current_p50_s == 120.0
    assert roi.response_time_improvement_s.value == 280.0
    # Baseline turn 3600, current 3000: 600 s saved = 0.2 extra seatings; only the queued-hour
    # session (4 guests) counts -> 0.8 covers, x 100 = 80.
    assert roi.extra_covers.value == pytest.approx(0.8)
    assert roi.extra_revenue.value == pytest.approx(80.0)


def test_roi_without_baseline_or_check() -> None:
    roi = roi_block(RoiInputs(
        currency=Currency.USD, avg_check_per_guest=0.0, tz=JLM, queue=[], alerts=[],
        sessions=SESSIONS, baseline_alerts=[], baseline_sessions=[], queued_hours={T},
    ))
    assert roi.lost_revenue.value is None
    assert roi.response_time_improvement_s.value is None
    assert roi.extra_covers.value is None and roi.extra_revenue.value is None
    # Slower than baseline: never negative.
    slower = roi_block(RoiInputs(
        currency=Currency.USD, avg_check_per_guest=10.0, tz=JLM, queue=[], alerts=[],
        sessions=[SessionRecord("t1", T, T + 5000, 2)],
        baseline_alerts=[], baseline_sessions=[SessionRecord("t1", 0, 3000, 2)], queued_hours={T},
    ))
    assert slower.extra_covers.value == 0.0 and slower.extra_revenue.value == 0.0
