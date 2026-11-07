"""Metrics endpoints on hand-built event sequences."""

import datetime as dt
from zoneinfo import ZoneInfo

import pytest
from rv_contracts import (
    AlertKind,
    AlertRaised,
    AlertResolved,
    AlertSeverity,
    OccupancySnapshot,
    QueueSeated,
    QueueSnapshot,
    QueueWalkaway,
    ResolveReason,
    TableSessionClosed,
    TableState,
    TableStateChanged,
    new_uuid7,
)
from support import Account, Api, event

JLM = ZoneInfo("Asia/Jerusalem")
DAY = 86400.0


def local_ts(y: int, m: int, d: int, h: int, minute: int = 0, tz: ZoneInfo = JLM) -> float:
    return dt.datetime(y, m, d, h, minute, tzinfo=tz).timestamp()


def session(
    site: str, table: str, seated: float, left: float, guests: int, bussing: float | None = None
) -> dict[str, object]:
    return event(
        TableSessionClosed,
        site,
        left,
        table_id=table,
        session_id=new_uuid7(),
        seated_at=seated,
        left_at=left,
        max_guests=guests,
        first_visit_delay_s=120.0,
        visits=2,
        bussing_delay_s=bussing,
    )


def waiter_alert(site: str, raised: float, response: float | None) -> list[dict[str, object]]:
    alert_id = new_uuid7()
    events = [
        event(
            AlertRaised,
            site,
            raised,
            alert_id=alert_id,
            kind=AlertKind.WAITER_NEEDED,
            table_id="t1",
            severity=AlertSeverity.WARN,
        )
    ]
    if response is not None:
        events.append(
            event(
                AlertResolved,
                site,
                raised + response,
                alert_id=alert_id,
                resolved_at=raised + response,
                reason=ResolveReason.STAFF_VISIT,
            )
        )
    return events


def test_summary_timeseries_and_table_stats(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    t = api.clock.now()
    sid = new_uuid7()
    api.post_events(
        device,
        event(
            TableStateChanged,
            site,
            t,
            table_id="t1",
            from_state=TableState.EMPTY,
            to_state=TableState.SEATED,
            guest_count=2,
            session_id=sid,
        ),
        event(
            TableSessionClosed,
            site,
            t + 3600,
            table_id="t1",
            session_id=sid,
            seated_at=t,
            left_at=t + 3600,
            max_guests=2,
            first_visit_delay_s=240.0,
            visits=3,
        ),
        event(
            TableStateChanged,
            site,
            t + 3900,
            table_id="t1",
            from_state=TableState.NEEDS_BUSSING,
            to_state=TableState.EMPTY,
            guest_count=0,
            session_id=sid,
        ),
        session(site, "t2", t + 600, t + 1800, 4, bussing=100.0),
        *waiter_alert(site, t + 100, 60.0),
        *waiter_alert(site, t + 200, 120.0),
        *waiter_alert(site, t + 1000, 300.0),
        *waiter_alert(site, t + 1100, None),
        event(QueueSeated, site, t + 10, zone_id="z-queue", waited_s=100.0),
        event(QueueSeated, site, t + 20, zone_id="z-queue", waited_s=200.0),
        event(QueueWalkaway, site, t + 30, zone_id="z-queue", waited_s=90.0, party_size_est=2),
        event(QueueWalkaway, site, t + 1000, zone_id="z-queue", waited_s=95.0, party_size_est=3),
        event(
            OccupancySnapshot,
            site,
            t,
            guests=10,
            tables_occupied=2,
            tables_total=8,
            staff_on_floor=2,
        ),
        event(
            OccupancySnapshot,
            site,
            t + 300,
            guests=20,
            tables_occupied=3,
            tables_total=8,
            staff_on_floor=2,
        ),
        event(
            OccupancySnapshot,
            site,
            t + 960,
            guests=30,
            tables_occupied=4,
            tables_total=8,
            staff_on_floor=2,
        ),
        event(
            QueueSnapshot,
            site,
            t,
            zone_id="z-queue",
            people=2,
            parties_est=1,
            longest_wait_s=1.0,
            avg_wait_s=1.0,
        ),
        event(
            QueueSnapshot,
            site,
            t + 60,
            zone_id="z-queue",
            people=4,
            parties_est=2,
            longest_wait_s=1.0,
            avg_wait_s=1.0,
        ),
    )
    base = f"/api/v1/sites/{site}"
    h = owner.headers
    s = api.client.get(f"{base}/metrics/summary?from={t}&to={t + 7200}", headers=h).json()
    assert s["from_ts"] == t and s["to_ts"] == t + 7200 and s["currency"] == "ILS"
    assert (s["sessions"], s["guests_served"]) == (2, 6)
    assert s["avg_dwell_s"] == 2400.0
    assert s["turnover_per_table"] == 0.25
    assert s["waiter_response_p50_s"] == 120.0
    assert s["waiter_response_p90_s"] == pytest.approx(264.0)
    assert s["bussing_delay_p50_s"] == 200.0
    assert (s["queue_avg_wait_s"], s["queue_max_wait_s"]) == (150.0, 200.0)
    assert s["walkaways"] == 2
    assert s["lost_revenue"] == {"value": 500.0, "is_estimate": True}
    # Default range is the last 24 h before "now".
    api.clock.advance(7200)
    h = api.login("owner@a.test").headers  # the old access token expired meanwhile
    assert api.client.get(f"{base}/metrics/summary", headers=h).json()["sessions"] == 2
    assert api.client.get(f"{base}/metrics/summary?from={t}&to={t}", headers=h).status_code == 422

    def series(metric: str, bucket: str = "15m") -> list[float | None]:
        r = api.client.get(
            f"{base}/metrics/timeseries?metric={metric}&bucket={bucket}&from={t}&to={t + 3600}",
            headers=h,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert [p["ts"] for p in body["points"]] == [t, t + 900, t + 1800, t + 2700]
        return [p["value"] for p in body["points"]]

    assert series("occupancy") == [15.0, 30.0, None, None]
    assert series("queue") == [3.0, None, None, None]
    assert series("walkaways") == [1.0, 1.0, 0.0, 0.0]
    assert series("response_time") == [90.0, 300.0, None, None]
    r = api.client.get(f"{base}/metrics/timeseries?metric=bogus", headers=h)
    assert r.status_code == 422

    stats = api.client.get(f"{base}/tables/stats?from={t}&to={t + 7200}", headers=h).json()
    assert len(stats) == 8
    t1 = stats[0]
    assert (t1["table_id"], t1["label"], t1["seats"]) == ("t1", "1", 2)
    assert (t1["sessions"], t1["guests"], t1["avg_dwell_s"]) == (1, 2, 3600.0)
    assert t1["first_visit_delay_p50_s"] == 240.0 and t1["bussing_delay_p50_s"] == 300.0


def test_shift_report_uses_site_timezone_and_business_day(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    seat = local_ts(2026, 11, 6, 19)
    api.post_events(
        device,
        session(site, "t1", local_ts(2026, 11, 6, 3), local_ts(2026, 11, 6, 4, 59), 2),  # Nov 5
        session(site, "t2", local_ts(2026, 11, 6, 4), local_ts(2026, 11, 6, 5, 0), 2),  # Nov 6
        session(site, "t3", seat, local_ts(2026, 11, 7, 4, 30), 3),  # after midnight: Nov 6
        session(site, "t4", seat, local_ts(2026, 11, 7, 5, 0), 4),  # Nov 7
        event(
            OccupancySnapshot,
            site,
            local_ts(2026, 11, 6, 20, 10),
            guests=6,
            tables_occupied=2,
            tables_total=8,
            staff_on_floor=1,
        ),
    )

    def report(date: str) -> dict[str, object]:
        r = api.client.get(f"/api/v1/sites/{site}/reports/shift?date={date}", headers=owner.headers)
        assert r.status_code == 200, r.text
        return dict(r.json())

    nov6 = report("2026-11-06")
    assert nov6["date"] == "2026-11-06" and nov6["timezone"] == "Asia/Jerusalem"
    assert nov6["from_ts"] == local_ts(2026, 11, 6, 5) and nov6["to_ts"] == local_ts(2026, 11, 7, 5)
    summary = nov6["summary"]
    assert isinstance(summary, dict) and summary["sessions"] == 2 and summary["guests_served"] == 5
    hours = nov6["occupancy_by_hour"]
    assert isinstance(hours, list) and len(hours) == 24
    assert hours[0]["ts"] == local_ts(2026, 11, 6, 5)
    assert hours[15]["value"] == 6.0 and hours[14]["value"] is None
    tables = nov6["tables"]
    assert isinstance(tables, list) and [t["sessions"] for t in tables[:4]] == [0, 1, 1, 0]
    roi = nov6["roi"]
    assert isinstance(roi, dict) and roi["is_estimate"] is True and roi["currency"] == "ILS"
    assert report("2026-11-05")["summary"]["sessions"] == 1  # type: ignore[index]
    assert report("2026-11-07")["summary"]["sessions"] == 1  # type: ignore[index]
    r = api.client.get(f"/api/v1/sites/{site}/reports/shift?date=06-11-2026", headers=owner.headers)
    assert r.status_code == 422


def test_shift_report_roi_against_baseline(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    first = local_ts(2026, 10, 20, 12)  # first event: baseline = Oct 20-27
    day = local_ts(2026, 11, 6, 19)
    api.post_events(
        device,
        *waiter_alert(site, first, 400.0),
        *waiter_alert(site, first + DAY, 500.0),
        *waiter_alert(site, first + 8 * DAY, 10.0),  # after the baseline window
        session(site, "t1", first, first + 3600, 2),  # baseline turn 3600
        *waiter_alert(site, day, 100.0),
        session(site, "t2", day, day + 2700, 4, bussing=300.0),  # turn 3000, queued hour
        session(site, "t3", day + 7200, day + 10200, 2),  # turn 3000, no queue
        event(
            QueueSnapshot,
            site,
            day + 2700 - 600,
            zone_id="z-queue",
            people=5,
            parties_est=2,
            longest_wait_s=300.0,
            avg_wait_s=200.0,
        ),
        event(QueueWalkaway, site, day + 100, zone_id="z-queue", waited_s=300.0, party_size_est=2),
    )
    roi = api.client.get(
        f"/api/v1/sites/{site}/reports/shift?date=2026-11-06", headers=owner.headers
    ).json()["roi"]
    assert roi["avg_check_per_guest"] == 100.0
    assert roi["walkaways"] == 1 and roi["lost_revenue"]["value"] == 200.0
    assert roi["response_time_baseline_p50_s"] == 450.0
    assert roi["response_time_current_p50_s"] == 100.0
    assert roi["response_time_improvement_s"] == {"value": 350.0, "is_estimate": True}
    # (3600 - 3000) / 3000 = 0.2 extra seatings x 4 guests in the queued hour.
    assert roi["extra_covers"]["value"] == pytest.approx(0.8)
    assert roi["extra_revenue"]["value"] == pytest.approx(80.0)


def test_branch_comparison(api: Api, owner: Account) -> None:
    site_a, device_a = api.site_with_config(owner, "Tel Aviv")
    site_b, device_b = api.site_with_config(owner, "Sydney", "Australia/Sydney")
    t = api.clock.now()
    api.post_events(device_a, session(site_a, "t1", t - 3600, t - 60, 2))
    api.post_events(
        device_b,
        session(site_b, "t1", t - 3600, t - 60, 3),
        session(site_b, "t2", t - 3600, t - 30, 1),
    )
    r = api.client.get(
        f"/api/v1/orgs/{owner.org_id}/reports/compare?from={t - DAY}&to={t}", headers=owner.headers
    )
    assert r.status_code == 200
    body = r.json()
    assert body["org_id"] == owner.org_id
    assert {s["site_id"]: s["sessions"] for s in body["sites"]} == {site_a: 1, site_b: 2}
    other = api.signup("b@b.test", "Org B")
    r = api.client.get(f"/api/v1/orgs/{owner.org_id}/reports/compare", headers=other.headers)
    assert r.status_code == 404
