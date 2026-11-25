"""Host view (contracts 1.3): next-table-to-free prediction, ordering and authorization."""

from typing import Any

import pytest
from rv_contracts import (
    Confidence,
    QueueSnapshot,
    Role,
    TableSessionClosed,
    TableState,
    TableStateChanged,
    new_uuid7,
)
from support import Account, Api, event

from rv_cloud.metrics import SessionRecord
from rv_cloud.metrics.host import (
    DEFAULT_DWELL_S,
    MIN_BUCKET_SESSIONS,
    OVERDUE_GRACE_S,
    DwellModel,
    party_bucket,
    predict_free_at,
)

MIN = 60.0
NOW = 1_800_000_000.0


def sessions(n: int, guests: int, dwell_s: float) -> list[SessionRecord]:
    return [
        SessionRecord(table_id="t1", seated_at=1000.0 * i, left_at=1000.0 * i + dwell_s,
                      max_guests=guests)
        for i in range(n)
    ]


# --------------------------------------------------------------------------- prediction


@pytest.mark.parametrize(
    ("guests", "bucket"), [(0, "1-2"), (1, "1-2"), (2, "1-2"), (3, "3-4"), (4, "3-4"), (5, "5+")]
)
def test_party_buckets(guests: int, bucket: str) -> None:
    assert party_bucket(guests) == bucket


def test_bucket_median_with_enough_sessions_is_high_confidence() -> None:
    model = DwellModel.from_sessions(
        sessions(MIN_BUCKET_SESSIONS, 2, 40 * MIN) + sessions(MIN_BUCKET_SESSIONS, 4, 90 * MIN)
    )
    assert predict_free_at(model, NOW, 2, NOW) == (NOW + 40 * MIN, Confidence.HIGH)
    assert predict_free_at(model, NOW, 3, NOW) == (NOW + 90 * MIN, Confidence.HIGH)


def test_small_bucket_falls_back_to_the_site_median() -> None:
    model = DwellModel.from_sessions(
        sessions(MIN_BUCKET_SESSIONS - 1, 6, 120 * MIN) + sessions(12, 2, 30 * MIN)
    )
    # 5+ has 9 sessions: site-wide median of all 21 (30 min) with medium confidence
    assert predict_free_at(model, NOW, 6, NOW) == (NOW + 30 * MIN, Confidence.MEDIUM)


def test_no_history_uses_the_60_minute_default_with_low_confidence() -> None:
    model = DwellModel.from_sessions([])
    assert DEFAULT_DWELL_S == 60 * MIN
    assert predict_free_at(model, NOW - 10 * MIN, 2, NOW) == (NOW + 50 * MIN, Confidence.LOW)


@pytest.mark.parametrize(
    ("history", "expected"),
    [
        (sessions(MIN_BUCKET_SESSIONS, 2, 30 * MIN), Confidence.MEDIUM),  # high -> medium
        (sessions(3, 2, 30 * MIN), Confidence.LOW),  # medium -> low
        ([], Confidence.LOW),  # low stays low
    ],
)
def test_overstaying_guests_predict_now_plus_5_minutes_and_lower_confidence(
    history: list[SessionRecord], expected: Confidence
) -> None:
    model = DwellModel.from_sessions(history)
    seated = NOW - 2 * 3600.0
    assert predict_free_at(model, seated, 2, NOW) == (NOW + OVERDUE_GRACE_S, expected)


# --------------------------------------------------------------------------- endpoint


def seat(site: str, ts: float, table: str, guests: int, sid: str) -> dict[str, Any]:
    return event(
        TableStateChanged,
        site,
        ts,
        table_id=table,
        from_state=TableState.EMPTY,
        to_state=TableState.SEATED,
        guest_count=guests,
        session_id=sid,
        since_ts=ts - 20,
    )


def change(
    site: str, ts: float, table: str, a: TableState, b: TableState, sid: str, guests: int = 2
) -> dict[str, Any]:
    return event(
        TableStateChanged,
        site,
        ts,
        table_id=table,
        from_state=a,
        to_state=b,
        guest_count=guests,
        session_id=sid,
        since_ts=ts,
    )


def history(site: str, now: float, n: int, guests: int, dwell_s: float) -> list[dict[str, Any]]:
    out = []
    for i in range(n):
        left = now - 86400.0 - i * 3600.0
        out.append(
            event(
                TableSessionClosed,
                site,
                left,
                table_id="t8",
                session_id=new_uuid7(),
                seated_at=left - dwell_s,
                left_at=left,
                max_guests=guests,
                first_visit_delay_s=60.0,
                visits=2,
            )
        )
    return out


def test_host_view_orders_and_predicts(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    now = api.clock.now()
    old = now - 40 * 86400.0  # outside the 28-day window: ignored
    api.post_events(device, *history(site, old + 86400.0, 5, 2, 10 * MIN))
    api.post_events(device, *history(site, now, MIN_BUCKET_SESSIONS, 2, 45 * MIN))
    api.post_events(device, *history(site, now, 2, 4, 80 * MIN))
    s1, s3, s5, s6 = (new_uuid7() for _ in range(4))
    api.post_events(
        device,
        seat(site, now - 30 * MIN, "t1", 2, s1),  # 1-2 bucket: 45 min -> free in ~15 min
        seat(site, now - 20 * MIN, "t3", 4, s3),  # 3-4 bucket too small: site median
        change(site, now - 19 * MIN, "t3", TableState.SEATED, TableState.ATTENDED, s3, 4),
        seat(site, now - 90 * MIN, "t5", 2, s5),
        change(site, now - 5 * MIN, "t5", TableState.SEATED, TableState.NEEDS_BUSSING, s5, 0),
        seat(site, now - 120 * MIN, "t6", 2, s6),  # overstaying
        event(
            QueueSnapshot, site, now - 5, zone_id="z-queue", people=5, parties_est=2,
            longest_wait_s=420.0, avg_wait_s=200.0,
        ),
    )
    r = api.client.get(f"/api/v1/sites/{site}/host", headers=owner.headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["queue"] == {"people": 5, "parties_est": 2, "longest_wait_s": 420.0}
    order = [(t["table_id"], t["state"]) for t in body["tables"]]
    assert order == [
        ("t2", "empty"),
        ("t4", "empty"),
        ("t7", "empty"),
        ("t8", "empty"),
        ("t5", "needs_bussing"),
        ("t6", "seated"),  # overdue: now + 5 min
        ("t1", "seated"),  # now + 15 min
        ("t3", "attended"),  # seated 20 min ago + site median 45 min -> now + 25 min
    ]
    assert body["free_tables"] == 4
    by_id = {t["table_id"]: t for t in body["tables"]}
    assert by_id["t1"]["seated_since"] == now - 30 * MIN - 20
    assert by_id["t1"]["expected_free_at"] == pytest.approx(now + 15 * MIN - 20)
    assert by_id["t1"]["confidence"] == "high"
    assert by_id["t3"]["seated_since"] == now - 20 * MIN - 20  # seating, not the visit
    assert by_id["t3"]["expected_free_at"] == pytest.approx(now + 25 * MIN - 20)
    assert by_id["t3"]["confidence"] == "medium"
    assert by_id["t6"]["expected_free_at"] == now + 5 * MIN
    assert by_id["t6"]["confidence"] == "medium"
    assert by_id["t5"]["expected_free_at"] is None and by_id["t5"]["seated_since"] is None
    assert by_id["t2"]["confidence"] == "high"
    assert body["next_free"]["table_id"] == "t5"


def test_next_free_is_the_soonest_occupied_table_without_bussing(
    api: Api, owner: Account
) -> None:
    site, device = api.site_with_config(owner)
    now = api.clock.now()
    api.post_events(device, seat(site, now - 50 * MIN, "t7", 6, new_uuid7()))
    api.post_events(device, seat(site, now - 10 * MIN, "t2", 2, new_uuid7()))
    body = api.client.get(f"/api/v1/sites/{site}/host", headers=owner.headers).json()
    # no history: 60 min default, low confidence; t7 frees in ~10 min
    assert body["next_free"]["table_id"] == "t7"
    assert body["next_free"]["confidence"] == "low"
    assert body["queue"] == {"people": 0, "parties_est": 0, "longest_wait_s": 0.0}


def test_host_view_with_everything_free(api: Api, owner: Account) -> None:
    site, _ = api.site_with_config(owner)
    body = api.client.get(f"/api/v1/sites/{site}/host", headers=owner.headers).json()
    assert body["next_free"] is None and body["free_tables"] == 8


def test_host_authorization(api: Api, owner: Account) -> None:
    site, _ = api.site_with_config(owner)
    other_site, _ = api.site_with_config(owner, name="Other")
    manager = api.add_user(owner, "m@a.test", Role.MANAGER, site)
    waiter = api.add_user(owner, "w@a.test", Role.WAITER, site)
    for user in (owner, manager, waiter):
        r = api.client.get(f"/api/v1/sites/{site}/host", headers=user.headers)
        assert r.status_code == 200, r.text
    for user in (manager, waiter):
        r = api.client.get(f"/api/v1/sites/{other_site}/host", headers=user.headers)
        assert r.status_code in (403, 404)
    assert api.client.get(f"/api/v1/sites/{site}/host").status_code == 401
    stranger = api.signup("x@b.test", "Org B")
    r = api.client.get(f"/api/v1/sites/{site}/host", headers=stranger.headers)
    assert r.status_code in (403, 404)
