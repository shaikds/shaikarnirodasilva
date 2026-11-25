"""``table_freed`` (contracts 1.3): projected and pushed like other alerts, never counted as a
waiter response time."""

from typing import Any

from rv_contracts import (
    AlertKind,
    AlertPush,
    AlertRaised,
    AlertResolved,
    AlertSeverity,
    ResolveReason,
    Role,
    TableState,
    TableStateChanged,
    new_uuid7,
)
from support import Account, Api, event

KEYS = {"p256dh": "BEl62iUYgUivxIkv69yViEuiBIa", "auth": "tBHItJI5svbpez7KI4CCXg"}


def freed(site: str, ts: float, alert_id: str, since: float) -> dict[str, Any]:
    return event(
        AlertRaised,
        site,
        ts,
        alert_id=alert_id,
        kind=AlertKind.TABLE_FREED,
        table_id="t5",
        zone_id="z-t5",
        severity=AlertSeverity.INFO,
        condition_since_ts=since,
    )


def needs_bussing(site: str, ts: float, sid: str, since: float) -> dict[str, Any]:
    return event(
        TableStateChanged,
        site,
        ts,
        table_id="t5",
        from_state=TableState.ATTENDED,
        to_state=TableState.NEEDS_BUSSING,
        guest_count=0,
        session_id=sid,
        since_ts=since,
    )


def test_projected_listed_live_and_pushed(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    waiter = api.add_user(owner, "w@a.test", Role.WAITER, site)
    r = api.client.post(
        "/api/v1/push/subscriptions",
        headers=waiter.headers,
        json={"site_id": site, "endpoint": "https://push.example.com/w1", "keys": KEYS},
    )
    assert r.status_code == 201, r.text
    t = api.clock.now()
    alert_id = new_uuid7()
    api.post_events(
        device, needs_bussing(site, t, new_uuid7(), t - 45), freed(site, t, alert_id, t - 45)
    )
    ((target, payload),) = api.notifier.sent
    assert target.endpoint == "https://push.example.com/w1"
    push = AlertPush.model_validate(payload)
    assert (push.kind, push.severity, push.table_label) == (
        AlertKind.TABLE_FREED,
        AlertSeverity.INFO,
        "5",
    )
    assert push.condition_since_ts == t - 45

    r = api.client.get(f"/api/v1/sites/{site}/alerts", headers=waiter.headers)
    (view,) = r.json()
    assert view["kind"] == "table_freed" and view["table_label"] == "5"
    live = api.client.get(f"/api/v1/sites/{site}/live", headers=owner.headers).json()
    t5 = next(x for x in live["tables"] if x["table_id"] == "t5")
    assert t5["state"] == "needs_bussing" and t5["open_alert_ids"] == [alert_id]

    # the bussing visit resolves it
    api.post_events(
        device,
        event(
            AlertResolved,
            site,
            t + 60,
            alert_id=alert_id,
            resolved_at=t + 60,
            reason=ResolveReason.STAFF_VISIT,
        ),
    )
    r = api.client.get(f"/api/v1/sites/{site}/alerts", headers=owner.headers)
    assert r.json() == []


def test_excluded_from_waiter_response_time_metrics(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    t = api.clock.now() - 3600
    alert_id = new_uuid7()
    api.post_events(
        device,
        freed(site, t, alert_id, t),
        event(
            AlertResolved,
            site,
            t + 600,
            alert_id=alert_id,
            resolved_at=t + 600,
            reason=ResolveReason.STAFF_VISIT,
        ),
    )
    summary = api.client.get(
        f"/api/v1/sites/{site}/metrics/summary", headers=owner.headers
    ).json()
    assert summary["waiter_response_p50_s"] is None
    assert summary["waiter_response_p90_s"] is None
    series = api.client.get(
        f"/api/v1/sites/{site}/metrics/timeseries",
        headers=owner.headers,
        params={"metric": "response_time", "bucket": "1h"},
    ).json()
    assert all(p["value"] is None for p in series["points"])


def test_table_freed_alerts_module_can_be_switched_off(api: Api, owner: Account) -> None:
    site, _ = api.site_with_config(owner)
    settings = api.client.get(f"/api/v1/sites/{site}", headers=owner.headers).json()
    assert settings["modules"]["table_freed_alerts"] is True
    modules = {**settings["modules"], "table_freed_alerts": False}
    r = api.client.patch(f"/api/v1/sites/{site}", headers=owner.headers, json={"modules": modules})
    assert r.status_code == 200, r.text
    config = api.client.get(f"/api/v1/sites/{site}/config", headers=owner.headers).json()
    assert config["modules"]["table_freed_alerts"] is False
