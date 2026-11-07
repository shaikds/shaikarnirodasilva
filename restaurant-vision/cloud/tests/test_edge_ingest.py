"""Pairing, device authentication and idempotent event ingest."""

from rv_contracts import (
    AlertKind,
    AlertRaised,
    AlertSeverity,
    OccupancySnapshot,
    QueueSeated,
    new_uuid7,
)
from sqlalchemy import func, select
from support import Account, Api, bearer, event

from rv_cloud.db.models import Device, Event


def _code(api: Api, owner: Account, site_id: str) -> dict[str, object]:
    r = api.client.post(f"/api/v1/sites/{site_id}/devices/pairing-code", headers=owner.headers)
    assert r.status_code == 201
    return dict(r.json())


def test_pairing_is_single_use_and_short_lived(api: Api, owner: Account) -> None:
    site_id = api.create_site(owner)
    info = _code(api, owner, site_id)
    assert info["site_id"] == site_id
    assert len(str(info["code"])) == 6
    assert info["expires_at"] == api.clock.now() + 600
    r = api.client.post("/api/v1/edge/pair", json={"code": info["code"]})
    assert r.status_code == 201
    body = r.json()
    assert body["site_id"] == site_id and body["token"].startswith("rvd_")
    # Single use.
    assert api.client.post("/api/v1/edge/pair", json={"code": info["code"]}).status_code == 401
    # Expired.
    info = _code(api, owner, site_id)
    api.clock.advance(601)
    assert api.client.post("/api/v1/edge/pair", json={"code": info["code"]}).status_code == 401
    # Malformed.
    assert api.client.post("/api/v1/edge/pair", json={"code": "abc"}).status_code == 422


def test_device_token_is_stored_hashed(api: Api, owner: Account) -> None:
    site_id = api.create_site(owner)
    r = api.client.post("/api/v1/edge/pair", json={"code": _code(api, owner, site_id)["code"]})
    token = r.json()["token"]
    with api.app.state.rv.session_factory() as session:
        stored = session.scalars(select(Device.token_hash)).one()
    assert token not in stored and len(stored) == 64


def test_pair_rate_limit(api: Api, owner: Account) -> None:
    for _ in range(10):
        assert api.client.post("/api/v1/edge/pair", json={"code": "ZZZZZZ"}).status_code == 401
    assert api.client.post("/api/v1/edge/pair", json={"code": "ZZZZZZ"}).status_code == 429


def test_device_auth_required_and_revocable(api: Api, owner: Account) -> None:
    site_id = api.create_site(owner)
    device = api.pair(owner, site_id)
    assert api.client.get("/api/v1/edge/config").status_code == 401
    assert api.client.get("/api/v1/edge/config", headers=bearer("rvd_bogus")).status_code == 401
    # A user JWT is not a device token.
    assert api.client.get("/api/v1/edge/config", headers=owner.headers).status_code == 401
    assert api.client.get("/api/v1/edge/config", headers=device).status_code == 200
    devices = api.client.get(f"/api/v1/sites/{site_id}/devices", headers=owner.headers).json()
    assert len(devices) == 1 and devices[0]["online"] is False and devices[0]["cameras"] == []
    device_id = devices[0]["device_id"]
    r = api.client.delete(f"/api/v1/sites/{site_id}/devices/{device_id}", headers=owner.headers)
    assert r.status_code == 204
    assert api.client.get("/api/v1/edge/config", headers=device).status_code == 401
    r = api.client.delete(f"/api/v1/sites/{site_id}/devices/{device_id}", headers=owner.headers)
    assert r.status_code == 404


def test_ingest_is_idempotent(api: Api, owner: Account) -> None:
    site_id, device = api.site_with_config(owner)
    t = api.clock.now()
    a = event(
        OccupancySnapshot, site_id, t, guests=4, tables_occupied=1, tables_total=8, staff_on_floor=1
    )
    b = event(QueueSeated, site_id, t, zone_id="z-queue", waited_s=30.0)
    assert api.post_events(device, a, b) == {"accepted": 2, "duplicates": 0}
    # Retry of the same batch, plus one in-batch duplicate of a new event.
    c = event(QueueSeated, site_id, t + 1, zone_id="z-queue", waited_s=40.0)
    assert api.post_events(device, a, b, c, c) == {"accepted": 1, "duplicates": 3}
    assert api.post_events(device) == {"accepted": 0, "duplicates": 0}
    with api.app.state.rv.session_factory() as session:
        assert session.scalar(select(func.count()).select_from(Event)) == 3
        stored = session.get(Event, a["event_id"])
        assert stored is not None
        assert stored.payload_json["guests"] == 4 and stored.received_at == t


def test_ingest_batch_limit_and_validation(api: Api, owner: Account) -> None:
    site_id, device = api.site_with_config(owner)
    t = api.clock.now()
    batch = [event(QueueSeated, site_id, t, zone_id="z-queue", waited_s=1.0) for _ in range(501)]
    r = api.client.post("/api/v1/edge/events", headers=device, json={"events": batch})
    assert r.status_code == 422
    assert api.post_events(device, *batch[:500]) == {"accepted": 500, "duplicates": 0}
    bad = event(QueueSeated, site_id, t, zone_id="z-queue", waited_s=1.0)
    bad["type"] = "queue.unknown"
    r = api.client.post("/api/v1/edge/events", headers=device, json={"events": [bad]})
    assert r.status_code == 422


def test_ingest_rejects_events_of_another_site(api: Api, owner: Account) -> None:
    site_id, device = api.site_with_config(owner)
    other_site = api.create_site(owner, "Other")
    e = event(
        AlertRaised,
        other_site,
        api.clock.now(),
        alert_id=new_uuid7(),
        kind=AlertKind.LONG_QUEUE,
        zone_id="z-queue",
        severity=AlertSeverity.INFO,
    )
    r = api.client.post("/api/v1/edge/events", headers=device, json={"events": [e]})
    assert r.status_code == 422
    assert "site_id" in r.json()["detail"]
