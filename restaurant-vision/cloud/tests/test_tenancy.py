"""Tenancy isolation and role limits (architecture 7.2)."""

from rv_contracts import (
    AlertKind,
    AlertRaised,
    AlertSeverity,
    EdgeHeartbeat,
    Role,
    make_event,
    new_uuid7,
)
from support import Account, Api, event


def test_cross_org_isolation(api: Api, owner: Account) -> None:
    site_a, device_a = api.site_with_config(owner, "A1")
    alert_id = new_uuid7()
    api.post_events(
        device_a,
        event(
            AlertRaised,
            site_a,
            api.clock.now(),
            alert_id=alert_id,
            kind=AlertKind.WAITER_NEEDED,
            table_id="t1",
            severity=AlertSeverity.WARN,
        ),
    )
    other = api.signup("owner@b.test", "Org B")
    site_b = api.create_site(other, "B1")
    h = other.headers
    # Org B cannot see anything of org A: everything is "not found".
    assert api.client.get(f"/api/v1/orgs/{owner.org_id}", headers=h).status_code == 404
    assert api.client.get(f"/api/v1/orgs/{owner.org_id}/sites", headers=h).status_code == 404
    assert api.client.get(f"/api/v1/orgs/{owner.org_id}/users", headers=h).status_code == 404
    for path in (
        "",
        "/live",
        "/config",
        "/alerts",
        "/devices",
        "/metrics/summary",
        "/tables/stats",
    ):
        assert api.client.get(f"/api/v1/sites/{site_a}{path}", headers=h).status_code == 404, path
    assert (
        api.client.patch(f"/api/v1/sites/{site_a}", headers=h, json={"name": "x"}).status_code
        == 404
    )
    assert (
        api.client.post(f"/api/v1/sites/{site_a}/devices/pairing-code", headers=h).status_code
        == 404
    )
    assert api.client.post(f"/api/v1/alerts/{alert_id}/ack", headers=h).status_code == 404
    # A device of org A cannot post events for org B's site.
    r = api.client.post(
        "/api/v1/edge/events",
        headers=device_a,
        json={
            "events": [
                event(
                    AlertRaised,
                    site_b,
                    api.clock.now(),
                    alert_id=new_uuid7(),
                    kind=AlertKind.WAITER_NEEDED,
                    table_id="t1",
                    severity=AlertSeverity.WARN,
                )
            ]
        },
    )
    assert r.status_code == 422
    # Each owner only lists their own sites.
    sites_b = api.client.get(f"/api/v1/orgs/{other.org_id}/sites", headers=h).json()
    assert [s["site_id"] for s in sites_b] == [site_b]
    sites_a = api.client.get(f"/api/v1/orgs/{owner.org_id}/sites", headers=owner.headers).json()
    assert [s["site_id"] for s in sites_a] == [site_a]


def test_manager_limited_to_one_site(api: Api, owner: Account) -> None:
    site_1 = api.create_site(owner, "One")
    site_2 = api.create_site(owner, "Two")
    manager = api.add_user(owner, "m@a.test", Role.MANAGER, site_1)
    h = manager.headers
    me = api.client.get("/api/v1/me", headers=h).json()
    assert [s["site_id"] for s in me["sites"]] == [site_1]
    assert api.client.get(f"/api/v1/sites/{site_1}/live", headers=h).status_code == 200
    assert api.client.get(f"/api/v1/sites/{site_1}/metrics/summary", headers=h).status_code == 200
    assert api.client.get(f"/api/v1/sites/{site_2}", headers=h).status_code == 403
    assert api.client.get(f"/api/v1/sites/{site_2}/live", headers=h).status_code == 403
    sites = api.client.get(f"/api/v1/orgs/{owner.org_id}/sites", headers=h).json()
    assert [s["site_id"] for s in sites] == [site_1]
    # Owner-only operations.
    assert (
        api.client.post(
            f"/api/v1/orgs/{owner.org_id}/sites", headers=h, json={"name": "X", "timezone": "UTC"}
        ).status_code
        == 403
    )
    assert api.client.get(f"/api/v1/orgs/{owner.org_id}/users", headers=h).status_code == 403
    assert (
        api.client.post(f"/api/v1/sites/{site_1}/devices/pairing-code", headers=h).status_code
        == 403
    )
    assert (
        api.client.get(f"/api/v1/orgs/{owner.org_id}/reports/compare", headers=h).status_code == 403
    )
    # Managers can read devices and change thresholds, but not owner-only settings.
    assert api.client.get(f"/api/v1/sites/{site_1}/devices", headers=h).status_code == 200
    r = api.client.patch(
        f"/api/v1/sites/{site_1}", headers=h, json={"thresholds": {"first_visit_timeout_s": 120}}
    )
    assert r.status_code == 200
    assert r.json()["thresholds"]["first_visit_timeout_s"] == 120
    assert (
        api.client.patch(f"/api/v1/sites/{site_1}", headers=h, json={"name": "Renamed"}).status_code
        == 403
    )


def test_waiter_limited_to_alerts(api: Api, owner: Account) -> None:
    site_id, device = api.site_with_config(owner)
    waiter = api.add_user(owner, "w@a.test", Role.WAITER, site_id)
    h = waiter.headers
    alert_id = new_uuid7()
    api.post_events(
        device,
        event(
            AlertRaised,
            site_id,
            api.clock.now(),
            alert_id=alert_id,
            kind=AlertKind.WAITER_NEEDED,
            table_id="t2",
            severity=AlertSeverity.WARN,
        ),
    )
    alerts = api.client.get(f"/api/v1/sites/{site_id}/alerts", headers=h)
    assert alerts.status_code == 200
    assert [a["table_label"] for a in alerts.json()] == ["2"]
    assert api.client.post(f"/api/v1/alerts/{alert_id}/ack", headers=h).status_code == 200
    assert (
        api.client.get(f"/api/v1/sites/{site_id}/alerts?status=all", headers=h).status_code == 403
    )
    # Devices: a reduced view, enough for the waiter app's offline link (contracts 1.1).
    beat = make_event(
        EdgeHeartbeat, site_id, api.clock.now(), device_id="edge-1", version="0.1.0",
        cameras=[], cpu_pct=12.0, mem_mb=300.0, outbox_depth=3,
        local_url="http://192.168.1.20:8787",
    ).model_dump(mode="json")
    api.post_events(device, beat)
    (dev,) = api.client.get(f"/api/v1/sites/{site_id}/devices", headers=h).json()
    assert (dev["online"], dev["local_url"]) == (True, "http://192.168.1.20:8787")
    assert (dev["version"], dev["cpu_pct"], dev["outbox_depth"], dev["cameras"]) == (
        None, None, None, []
    )
    for path in (
        "",
        "/live",
        "/config",
        "/metrics/summary",
        "/tables/stats",
        "/reports/shift?date=2026-11-06",
    ):
        assert api.client.get(f"/api/v1/sites/{site_id}{path}", headers=h).status_code == 403, path
    assert api.client.get(f"/api/v1/orgs/{owner.org_id}/sites", headers=h).status_code == 403
    assert api.client.get(f"/api/v1/orgs/{owner.org_id}", headers=h).status_code == 200
    me = api.client.get("/api/v1/me", headers=h).json()
    assert me["sites"] == [{"site_id": site_id, "name": "Main"}]


def test_user_management(api: Api, owner: Account) -> None:
    site_id = api.create_site(owner)
    base = f"/api/v1/orgs/{owner.org_id}/users"
    r = api.client.post(
        base,
        headers=owner.headers,
        json={
            "email": "x@a.test",
            "name": "X",
            "password": "password-123",
            "memberships": [{"role": "manager", "site_id": "no-such-site"}],
        },
    )
    assert r.status_code == 422
    manager = api.add_user(owner, "m@a.test", Role.MANAGER, site_id)
    r = api.client.post(
        base,
        headers=owner.headers,
        json={
            "email": "M@a.test",
            "name": "Dup",
            "password": "password-123",
            "memberships": [{"role": "waiter", "site_id": site_id}],
        },
    )
    assert r.status_code == 409
    users = api.client.get(base, headers=owner.headers).json()
    assert {u["email"] for u in users} == {"owner@a.test", "m@a.test"}
    # Promote the manager to owner, then demote the original owner.
    r = api.client.patch(
        f"{base}/{manager.user_id}",
        headers=owner.headers,
        json={"memberships": [{"role": "owner"}], "name": "Boss", "locale": "en"},
    )
    assert r.status_code == 200
    assert r.json()["memberships"] == [{"role": "owner", "site_id": None}]
    assert r.json()["locale"] == "en"
    r = api.client.patch(
        f"{base}/{owner.user_id}",
        headers=owner.headers,
        json={"memberships": [{"role": "manager", "site_id": site_id}]},
    )
    assert r.status_code == 200
    # Now the former owner has lost owner powers immediately.
    assert api.client.get(base, headers=owner.headers).status_code == 403
    boss = api.login("m@a.test")
    # The last owner cannot be demoted or delete themselves.
    r = api.client.patch(
        f"{base}/{boss.user_id}",
        headers=boss.headers,
        json={"memberships": [{"role": "waiter", "site_id": site_id}]},
    )
    assert r.status_code == 409
    assert api.client.delete(f"{base}/{boss.user_id}", headers=boss.headers).status_code == 409
    assert api.client.delete(f"{base}/unknown", headers=boss.headers).status_code == 404
    assert api.client.patch(f"{base}/unknown", headers=boss.headers, json={}).status_code == 404
    assert api.client.delete(f"{base}/{owner.user_id}", headers=boss.headers).status_code == 204


def test_site_creation_and_settings(api: Api, owner: Account) -> None:
    base = f"/api/v1/orgs/{owner.org_id}/sites"
    r = api.client.post(base, headers=owner.headers, json={"name": "X", "timezone": "Mars/Base"})
    assert r.status_code == 422
    site_id = api.create_site(owner, "Sydney", "Australia/Sydney", "AUD", 50.0)
    settings = api.client.get(f"/api/v1/sites/{site_id}", headers=owner.headers).json()
    assert settings["timezone"] == "Australia/Sydney"
    assert settings["currency"] == "AUD"
    assert settings["modules"] == {"occupancy": True, "queue": True, "tables": True, "alerts": True}
    assert settings["floor_plan"] == []
    org = api.client.get(f"/api/v1/orgs/{owner.org_id}", headers=owner.headers).json()
    assert org == {"org_id": owner.org_id, "name": "Org A", "plan": "pro"}
    summary = api.client.get(base, headers=owner.headers).json()[0]
    assert summary == {
        "site_id": site_id,
        "org_id": owner.org_id,
        "name": "Sydney",
        "timezone": "Australia/Sydney",
        "locale": "he",
        "currency": "AUD",
        "guests": None,
        "open_alerts": 0,
        "edge_online": False,
    }
