"""Cloud acks -> commands -> edge poll; site config ETag, edge uploads and dashboard edits."""

from rv_contracts import (
    AlertKind,
    AlertRaised,
    AlertResolved,
    AlertSeverity,
    ResolveReason,
    Role,
    new_uuid7,
)
from rv_contracts.fixtures import sample_site_config
from sqlalchemy import select
from sqlalchemy.orm import Session
from support import Account, Api, event

from rv_cloud.db.models import Alert, Organization


def _poll(api: Api, device: dict[str, str], after: str | None = None) -> dict[str, object]:
    url = "/api/v1/edge/commands" + (f"?after={after}" if after is not None else "")
    r = api.client.get(url, headers=device)
    assert r.status_code == 200, r.text
    return dict(r.json())


def test_ack_creates_command_for_edge(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    waiter = api.add_user(owner, "w@a.test", Role.WAITER, site)
    t = api.clock.now()
    alert_id = new_uuid7()
    api.post_events(
        device,
        event(AlertRaised, site, t, alert_id=alert_id, kind=AlertKind.WAITER_NEEDED,
              table_id="t5", severity=AlertSeverity.WARN),
    )
    first = _poll(api, device)
    # The sample config upload already produced one config_changed command.
    assert [c["kind"] for c in first["commands"]] == ["config_changed"]  # type: ignore[index, union-attr]
    cursor = str(first["cursor"])
    assert _poll(api, device, cursor) == {"cursor": cursor, "commands": []}

    api.clock.advance(12)
    r = api.client.post(f"/api/v1/alerts/{alert_id}/ack", headers=waiter.headers)
    assert r.status_code == 200
    view = r.json()
    assert view["status"] == "acknowledged" and view["ack_via"] == "cloud"
    assert view["acked_at"] == t + 12 and view["table_label"] == "5"
    with api.app.state.rv.session_factory() as db:
        assert isinstance(db, Session)
        row = db.get(Alert, (site, alert_id))
        assert row is not None and (row.acked_at, row.ack_via) == (t + 12, "cloud")
        assert not any("user" in c.name for c in Alert.__table__.columns)

    page = _poll(api, device, cursor)
    commands = page["commands"]
    assert isinstance(commands, list) and len(commands) == 1
    command = commands[0]
    assert command["kind"] == "alert_ack" and command["alert_id"] == alert_id
    assert command["ack_at"] == t + 12 and command["site_id"] == site
    assert int(str(page["cursor"])) > int(cursor)
    # Idempotent: a second ack (or acking a resolved alert) adds no command.
    assert api.client.post(f"/api/v1/alerts/{alert_id}/ack", headers=owner.headers).status_code == 200
    api.post_events(
        device,
        event(AlertResolved, site, t + 60, alert_id=alert_id, resolved_at=t + 60,
              reason=ResolveReason.STAFF_VISIT),
    )
    r = api.client.post(f"/api/v1/alerts/{alert_id}/ack", headers=owner.headers)
    assert r.json()["status"] == "resolved"
    assert _poll(api, device, str(page["cursor"]))["commands"] == []
    assert api.client.post(f"/api/v1/alerts/{new_uuid7()}/ack", headers=owner.headers).status_code == 404


def test_command_cursor_validation_and_reset(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    assert api.client.get("/api/v1/edge/commands?after=abc", headers=device).status_code == 422
    # A cursor beyond this site's commands (e.g. from an earlier pairing) restarts at 0.
    page = _poll(api, device, "9999")
    assert len(page["commands"]) == 1 and page["cursor"] == "1"  # type: ignore[arg-type]
    # Paging with limit.
    for _ in range(3):
        api.client.patch(f"/api/v1/sites/{site}", headers=owner.headers,
                         json={"locale": "en" if _ % 2 == 0 else "he"})
    r = api.client.get("/api/v1/edge/commands?after=1&limit=2", headers=device).json()
    assert [c["config_version"] for c in r["commands"]] == [3, 4]
    assert r["cursor"] == "3"


def test_edge_config_etag(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    r = api.client.get("/api/v1/edge/config", headers=device)
    assert r.status_code == 200
    assert r.headers["etag"] == '"2"'
    assert r.json()["config_version"] == 2 and len(r.json()["tables"]) == 8
    for header in ('"2"', 'W/"2"', '"1", "2"', "*"):
        r = api.client.get("/api/v1/edge/config", headers={**device, "If-None-Match": header})
        assert r.status_code == 304, header
        assert r.content == b""
    r = api.client.get("/api/v1/edge/config", headers={**device, "If-None-Match": '"1"'})
    assert r.status_code == 200
    dashboard = api.client.get(f"/api/v1/sites/{site}/config", headers=owner.headers)
    assert dashboard.json() == r.json() and dashboard.headers["etag"] == '"2"'


def test_edge_put_config_merges_and_versions(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    api.client.patch(
        f"/api/v1/sites/{site}", headers=owner.headers,
        json={"thresholds": {"first_visit_timeout_s": 90}},
    )
    stale = sample_site_config(site_id=site).model_dump(mode="json")  # version 1, old thresholds
    stale["tables"] = stale["tables"][:7]
    stale["zones"] = [z for z in stale["zones"] if z.get("table_id") != "t8"]
    stale["timezone"] = "UTC"
    r = api.client.put("/api/v1/edge/config", headers=device, json=stale)
    assert r.status_code == 200
    saved = r.json()
    assert saved["config_version"] == 4 and r.headers["etag"] == '"4"'
    assert len(saved["tables"]) == 7
    # Dashboard-owned fields keep the cloud's values.
    assert saved["thresholds"]["first_visit_timeout_s"] == 90
    assert saved["timezone"] == "Asia/Jerusalem"
    # Floor plan follows the tables (t8 removed, others auto-placed).
    plan = api.client.get(f"/api/v1/sites/{site}", headers=owner.headers).json()["floor_plan"]
    assert sorted(item["table_id"] for item in plan) == [f"t{i}" for i in range(1, 8)]
    assert len({(i["x"], i["y"]) for i in plan}) == 7
    # Unchanged upload: no new version.
    r = api.client.put("/api/v1/edge/config", headers=device, json=saved)
    assert r.json()["config_version"] == 4
    # Wrong site and invalid references are rejected.
    other = {**saved, "site_id": "another-site"}
    assert api.client.put("/api/v1/edge/config", headers=device, json=other).status_code == 422
    broken = {**saved, "zones": [*saved["zones"], {**saved["zones"][0], "zone_id": "z-dup"}]}
    assert api.client.put("/api/v1/edge/config", headers=device, json=broken).status_code == 422


def test_patch_site_bumps_config_and_notifies_edge(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    cursor = str(_poll(api, device)["cursor"])
    r = api.client.patch(
        f"/api/v1/sites/{site}", headers=owner.headers,
        json={"name": "Renamed", "currency": "USD", "avg_check_per_guest": 30.5},
    )
    assert r.status_code == 200
    assert (r.json()["name"], r.json()["currency"]) == ("Renamed", "USD")
    assert _poll(api, device, cursor)["commands"] == []  # not part of SiteConfig
    r = api.client.patch(
        f"/api/v1/sites/{site}", headers=owner.headers,
        json={"thresholds": {"seat_confirm_s": 15}, "modules": {"queue": False},
              "timezone": "Europe/London", "locale": "en"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["thresholds"]["seat_confirm_s"] == 15 and body["modules"]["queue"] is False
    page = _poll(api, device, cursor)
    assert [(c["kind"], c["config_version"]) for c in page["commands"]] == [  # type: ignore[union-attr]
        ("config_changed", 3)
    ]
    config = api.client.get("/api/v1/edge/config", headers=device).json()
    assert config["config_version"] == 3
    assert (config["timezone"], config["locale"]) == ("Europe/London", "en")
    assert config["thresholds"]["seat_confirm_s"] == 15
    # Identical values do not bump the version.
    api.client.patch(f"/api/v1/sites/{site}", headers=owner.headers, json={"locale": "en"})
    assert api.client.get("/api/v1/edge/config", headers=device).json()["config_version"] == 3
    # Validation.
    bad = [
        {"timezone": "Nowhere/Land"},
        {"floor_plan": [{"table_id": "nope", "x": 0, "y": 0}]},
        {"floor_plan": [{"table_id": "t1", "x": 0, "y": 0}, {"table_id": "t1", "x": 1, "y": 0}]},
    ]
    for body in bad:
        assert api.client.patch(f"/api/v1/sites/{site}", headers=owner.headers, json=body).status_code == 422
    r = api.client.patch(f"/api/v1/sites/{site}", headers=owner.headers,
                         json={"floor_plan": [{"table_id": "t1", "x": 5, "y": 6, "w": 2}]})
    assert r.json()["floor_plan"] == [{"table_id": "t1", "x": 5, "y": 6, "w": 2, "h": 1}]


def test_starter_plan_gates_pro_modules(api: Api, owner: Account) -> None:
    with api.app.state.rv.session_factory() as db:
        org = db.scalars(select(Organization)).one()
        org.plan = "starter"
        db.commit()
    site = api.create_site(owner)
    modules = api.client.get(f"/api/v1/sites/{site}", headers=owner.headers).json()["modules"]
    assert modules == {"occupancy": True, "queue": True, "tables": False, "alerts": False}
    r = api.client.patch(f"/api/v1/sites/{site}", headers=owner.headers,
                         json={"modules": {"tables": True}})
    assert r.status_code == 403
    r = api.client.get(f"/api/v1/orgs/{owner.org_id}/reports/compare", headers=owner.headers)
    assert r.status_code == 403
