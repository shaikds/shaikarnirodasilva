"""Staffing recommendation (contracts 1.3): hour buckets, time zone, weekend split, rounding,
settings and authorization."""

import datetime as dt
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from rv_contracts import DayType, OccupancySnapshot, Role
from support import Account, Api, event

from rv_cloud.metrics import SnapshotPoint
from rv_cloud.metrics.staffing import recommended_waiters, staffing_days

JLM = ZoneInfo("Asia/Jerusalem")
NYC = ZoneInfo("America/New_York")


def at(y: int, m: int, d: int, h: int, minute: int = 0, tz: ZoneInfo = JLM) -> float:
    return dt.datetime(y, m, d, h, minute, tzinfo=tz).timestamp()


@pytest.mark.parametrize(
    ("p75", "peak", "per", "expected"),
    [
        (40.0, 40.0, 20.0, 2),  # exact multiple: no rounding up
        (40.0000000001, 41.0, 20.0, 2),  # float noise does not add a waiter
        (41.0, 41.0, 20.0, 3),
        (0.5, 1.0, 20.0, 1),  # minimum 1 while open with guests
        (0.0, 3.0, 20.0, 1),
        (0.0, 0.0, 20.0, 0),  # open but empty
        (None, None, 20.0, 0),  # no data: closed
        (30.0, 35.0, 12.5, 3),
    ],
)
def test_rounding(p75: float | None, peak: float | None, per: float, expected: int) -> None:
    assert recommended_waiters(p75, peak, per) == expected


def test_hour_buckets_in_site_timezone_and_weekend_split() -> None:
    # 2026-11-02 is a Monday, 2026-11-06 a Friday (weekend in Israel), 2026-11-08 a Sunday.
    points = [
        # Monday 19:00-20:00 local: mean 30, peak 40
        SnapshotPoint(at(2026, 11, 2, 19, 0), 20.0),
        SnapshotPoint(at(2026, 11, 2, 19, 30), 40.0),
        # Tuesday 19:xx: mean 10
        SnapshotPoint(at(2026, 11, 3, 19, 10), 10.0),
        # Wednesday 19:xx: mean 50
        SnapshotPoint(at(2026, 11, 4, 19, 59), 50.0),
        # Friday 13:xx local (11:xx UTC): weekend
        SnapshotPoint(at(2026, 11, 6, 13, 5), 60.0),
        # Sunday 13:xx: a weekday in Israel
        SnapshotPoint(at(2026, 11, 8, 13, 5), 0.0),
    ]
    weekday, weekend = staffing_days(points, JLM, [5, 6], 20.0)
    assert (weekday.day_type, weekend.day_type) == (DayType.WEEKDAY, DayType.WEEKEND)
    assert len(weekday.hours) == len(weekend.hours) == 24
    h19 = weekday.hours[19]
    assert (h19.days, h19.avg_guests, h19.peak_guests) == (3, 30.0, 50.0)
    assert h19.p75_guests == 40.0  # samples 10, 30, 50
    assert h19.recommended_waiters == 2
    assert weekday.hours[13].days == 1 and weekday.hours[13].recommended_waiters == 0
    assert weekend.hours[13].avg_guests == 60.0 and weekend.hours[13].recommended_waiters == 3
    assert weekend.hours[19].days == 0 and weekend.hours[19].avg_guests is None
    assert weekday.hours[17].recommended_waiters == 0  # no data: closed

    # the same instants in New York fall into other local hours and days
    ny_weekday, ny_weekend = staffing_days(points, NYC, [6, 7], 20.0)
    assert ny_weekday.hours[12].days == 3  # 19:xx Israel = 12:xx New York (EST)
    assert ny_weekday.hours[6].avg_guests == 60.0  # Friday 06:05 is a weekday there
    assert ny_weekend.hours[6].avg_guests == 0.0  # Sunday 06:05: weekend


def test_dst_change_keeps_local_hours() -> None:
    # Israel leaves DST on 2026-10-25: 20:00 local is 17:00 UTC before and 18:00 UTC after.
    points = [SnapshotPoint(at(2026, 10, 22, 20, 15), 10.0),
              SnapshotPoint(at(2026, 10, 29, 20, 15), 30.0)]
    weekday, _ = staffing_days(points, JLM, [5, 6], 20.0)
    assert weekday.hours[20].days == 2 and weekday.hours[20].avg_guests == 20.0


# --------------------------------------------------------------------------- endpoint


def occ(site: str, ts: float, guests: int) -> dict[str, Any]:
    return event(
        OccupancySnapshot,
        site,
        ts,
        guests=guests,
        tables_occupied=0,
        tables_total=8,
        staff_on_floor=1,
    )


def test_staffing_endpoint_and_settings(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)  # Asia/Jerusalem
    settings = api.client.get(f"/api/v1/sites/{site}", headers=owner.headers).json()
    assert settings["guests_per_waiter"] == 20.0
    assert settings["weekend_days"] == [5, 6]  # Friday + Saturday in Israel
    now = api.clock.now()  # Friday 2026-11-06 20:00 local
    api.post_events(
        device,
        occ(site, at(2026, 11, 4, 19, 0), 45),  # Wednesday
        occ(site, at(2026, 11, 6, 12, 0), 10),  # Friday (weekend)
        occ(site, now - 60 * 86400.0, 99),  # older than 4 weeks: ignored
    )
    r = api.client.get(f"/api/v1/sites/{site}/metrics/staffing", headers=owner.headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["weeks"] == 4 and body["is_estimate"] is True
    assert body["timezone"] == "Asia/Jerusalem"
    assert body["to_ts"] - body["from_ts"] == 28 * 86400.0
    weekday, weekend = body["days"]
    assert weekday["hours"][19]["recommended_waiters"] == 3  # ceil(45 / 20)
    assert weekend["hours"][12]["recommended_waiters"] == 1

    manager = api.add_user(owner, "m@a.test", Role.MANAGER, site)
    r = api.client.patch(
        f"/api/v1/sites/{site}",
        headers=manager.headers,
        json={"guests_per_waiter": 15, "weekend_days": [7, 6, 6]},
    )
    assert r.status_code == 200, r.text
    assert (r.json()["guests_per_waiter"], r.json()["weekend_days"]) == (15.0, [6, 7])
    body = api.client.get(
        f"/api/v1/sites/{site}/metrics/staffing", headers=manager.headers, params={"weeks": 1}
    ).json()
    assert body["guests_per_waiter"] == 15.0 and body["weekend_days"] == [6, 7]
    weekday, weekend = body["days"]
    assert weekday["hours"][19]["recommended_waiters"] == 3  # ceil(45 / 15)
    assert weekday["hours"][12]["recommended_waiters"] == 1  # Friday is a weekday now

    bad = api.client.patch(
        f"/api/v1/sites/{site}", headers=owner.headers, json={"guests_per_waiter": 0}
    )
    assert bad.status_code == 422
    bad = api.client.patch(
        f"/api/v1/sites/{site}", headers=owner.headers, json={"weekend_days": [8]}
    )
    assert bad.status_code == 422


def test_default_weekend_outside_israel(api: Api, owner: Account) -> None:
    site = api.create_site(owner, name="NY", timezone="America/New_York")
    settings = api.client.get(f"/api/v1/sites/{site}", headers=owner.headers).json()
    assert settings["weekend_days"] == [6, 7]


def test_staffing_authorization(api: Api, owner: Account) -> None:
    site, _ = api.site_with_config(owner)
    waiter = api.add_user(owner, "w@a.test", Role.WAITER, site)
    url = f"/api/v1/sites/{site}/metrics/staffing"
    assert api.client.get(url, headers=waiter.headers).status_code == 403
    assert api.client.get(url, headers=owner.headers, params={"weeks": 0}).status_code == 422
    assert api.client.get(url, headers=owner.headers, params={"weeks": 53}).status_code == 422
