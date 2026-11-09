"""WebSocket broadcast and the in-memory broker."""

import asyncio
import json
import threading

import pytest
from rv_contracts import (
    AlertKind,
    AlertRaised,
    AlertSeverity,
    LiveSnapshotMessage,
    OccupancySnapshot,
    Role,
    WsCloseCode,
    new_uuid7,
    parse_event,
)
from starlette.websockets import WebSocketDisconnect
from support import Account, Api, event

from rv_cloud.realtime import BrokerMessage, InMemoryBroker


def ws_url(token: str, site_id: str) -> str:
    return f"/api/v1/ws?token={token}&site_id={site_id}"


def test_ws_broadcasts_ingested_events_and_cloud_acks(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    t = api.clock.now()
    alert_id = new_uuid7()
    snapshot = event(
        OccupancySnapshot, site, t, guests=5, tables_occupied=2, tables_total=8, staff_on_floor=1
    )
    raised = event(
        AlertRaised,
        site,
        t + 1,
        alert_id=alert_id,
        kind=AlertKind.WAITER_NEEDED,
        table_id="t1",
        severity=AlertSeverity.WARN,
    )
    with api.client.websocket_connect(ws_url(owner.tokens["access_token"], site)) as ws:
        # Owners and managers start with the full state (contracts 1.1 LiveSnapshotMessage).
        state = LiveSnapshotMessage.model_validate_json(ws.receive_text())
        assert state.type == "live.snapshot" and state.snapshot.site_id == site
        assert len(state.snapshot.tables) == 8 and state.snapshot.devices
        api.post_events(device, snapshot, raised)
        first = ws.receive_json()
        second = ws.receive_json()
        assert first == snapshot and second == raised
        parse_event(first)  # every message is a valid EdgeEvent
        # Duplicates are not re-broadcast; a cloud ack is.
        api.post_events(device, raised)
        api.client.post(f"/api/v1/alerts/{alert_id}/ack", headers=owner.headers)
        ack = parse_event(ws.receive_text())
        assert ack.type == "alert.acknowledged"
        assert ack.model_dump()["via"] == "cloud" and ack.model_dump()["alert_id"] == alert_id


def test_ws_waiter_receives_alerts_only(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    waiter = api.add_user(owner, "w@a.test", Role.WAITER, site)
    t = api.clock.now()
    raised = event(
        AlertRaised,
        site,
        t,
        alert_id=new_uuid7(),
        kind=AlertKind.LONG_QUEUE,
        zone_id="z-queue",
        severity=AlertSeverity.URGENT,
    )
    with api.client.websocket_connect(ws_url(waiter.tokens["access_token"], site)) as ws:
        ws.send_text("ping")  # client messages are ignored
        api.post_events(
            device,
            event(
                OccupancySnapshot,
                site,
                t,
                guests=5,
                tables_occupied=2,
                tables_total=8,
                staff_on_floor=1,
            ),
            raised,
        )
        assert json.loads(ws.receive_text()) == raised


def test_ws_only_receives_own_site(api: Api, owner: Account) -> None:
    site_a, device_a = api.site_with_config(owner, "A")
    site_b, device_b = api.site_with_config(owner, "B")
    t = api.clock.now()
    b_event = event(
        OccupancySnapshot, site_b, t, guests=1, tables_occupied=0, tables_total=8, staff_on_floor=0
    )
    with api.client.websocket_connect(ws_url(owner.tokens["access_token"], site_b)) as ws:
        assert ws.receive_json()["snapshot"]["site_id"] == site_b
        api.post_events(
            device_a,
            event(
                OccupancySnapshot,
                site_a,
                t,
                guests=9,
                tables_occupied=0,
                tables_total=8,
                staff_on_floor=0,
            ),
        )
        api.post_events(device_b, b_event)
        assert ws.receive_json() == b_event


@pytest.mark.parametrize(
    ("query", "code"),
    [("", WsCloseCode.BAD_REQUEST), ("token=garbage&site_id=x", WsCloseCode.UNAUTHORIZED)],
)
def test_ws_rejects_bad_credentials(api: Api, query: str, code: int) -> None:
    with (
        pytest.raises(WebSocketDisconnect) as exc,
        api.client.websocket_connect(f"/api/v1/ws?{query}") as ws,
    ):
        ws.receive_text()
    assert exc.value.code == code


def test_ws_rejects_foreign_site(api: Api, owner: Account) -> None:
    other = api.signup("b@b.test", "Org B")
    site_b = api.create_site(other)
    with (
        pytest.raises(WebSocketDisconnect) as exc,
        api.client.websocket_connect(ws_url(owner.tokens["access_token"], site_b)) as ws,
    ):
        ws.receive_text()
    assert exc.value.code == 4403


def test_in_memory_broker_thread_publish_and_backpressure() -> None:
    broker = InMemoryBroker(max_queue=2)

    async def scenario() -> list[str]:
        async with broker.subscribe("s1") as sub:
            assert broker.subscriber_count("s1") == 1
            thread = threading.Thread(
                target=lambda: [broker.publish(BrokerMessage("s1", "x", str(i))) for i in range(3)]
            )
            thread.start()
            thread.join()
            broker.publish(BrokerMessage("other", "x", "ignored"))
            await asyncio.sleep(0.01)
            received = [(await sub.get()).data, (await sub.get()).data]
        assert broker.subscriber_count("s1") == 0
        return received

    # The queue holds 2: the oldest message was dropped for the slow consumer.
    assert asyncio.run(scenario()) == ["1", "2"]
    broker.publish(BrokerMessage("s1", "x", "nobody listening"))


# ------------------------------------------------------------------ revocation of open sockets


def occupancy(site: str, ts: float, guests: int) -> dict[str, object]:
    return event(
        OccupancySnapshot, site, ts, guests=guests, tables_occupied=1, tables_total=8,
        staff_on_floor=1,
    )


def expect_close(ws: object, code: WsCloseCode) -> None:
    with pytest.raises(WebSocketDisconnect) as exc:
        ws.receive_json()  # type: ignore[attr-defined]
    assert exc.value.code == int(code)


def test_ws_closes_for_a_deleted_user(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    manager = api.add_user(owner, "mgr@a.test", Role.MANAGER, site)
    with api.client.websocket_connect(ws_url(manager.tokens["access_token"], site)) as ws:
        ws.receive_text()  # live.snapshot
        r = api.client.delete(
            f"/api/v1/orgs/{owner.org_id}/users/{manager.user_id}", headers=owner.headers
        )
        assert r.status_code == 204
        api.clock.advance(31)  # past the 30 s re-validation cache; the token itself is valid
        api.post_events(device, occupancy(site, api.clock.now(), 7))
        expect_close(ws, WsCloseCode.UNAUTHORIZED)


def test_ws_closes_when_the_access_token_expires(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner)
    manager = api.add_user(owner, "mgr@a.test", Role.MANAGER, site)
    with api.client.websocket_connect(ws_url(manager.tokens["access_token"], site)) as ws:
        ws.receive_text()
        api.clock.advance(api.app.state.rv.settings.access_token_ttl_s + 1)
        api.post_events(device, occupancy(site, api.clock.now(), 7))
        expect_close(ws, WsCloseCode.UNAUTHORIZED)


def test_ws_closes_when_site_access_is_removed(api: Api, owner: Account) -> None:
    site, device = api.site_with_config(owner, name="A")
    other = api.create_site(owner, name="B")
    waiter = api.add_user(owner, "w@a.test", Role.WAITER, site)
    raised = event(
        AlertRaised, site, api.clock.now(), alert_id=new_uuid7(), kind=AlertKind.WAITER_NEEDED,
        table_id="t1", severity=AlertSeverity.URGENT,
    )
    with api.client.websocket_connect(ws_url(waiter.tokens["access_token"], site)) as ws:
        r = api.client.patch(
            f"/api/v1/orgs/{owner.org_id}/users/{waiter.user_id}",
            headers=owner.headers,
            json={"memberships": [{"role": "waiter", "site_id": other}]},
        )
        assert r.status_code == 200
        api.clock.advance(31)
        api.post_events(device, raised)
        expect_close(ws, WsCloseCode.FORBIDDEN)


def test_ws_revalidation_is_cached_and_runs_when_idle(
    api: Api, owner: Account, monkeypatch: pytest.MonkeyPatch
) -> None:
    from rv_cloud.api.routers import ws as ws_router

    calls: list[str] = []
    real = ws_router._site_role

    def counting(*args: object) -> object:
        calls.append("check")
        return real(*args)  # type: ignore[arg-type]

    monkeypatch.setattr(ws_router, "_site_role", counting)
    monkeypatch.setattr(api.app.state.rv.settings, "ws_revalidate_interval_s", 0.2)
    site, device = api.site_with_config(owner)
    manager = api.add_user(owner, "mgr@a.test", Role.MANAGER, site)
    with api.client.websocket_connect(ws_url(manager.tokens["access_token"], site)) as ws:
        ws.receive_text()
        assert calls == ["check"]  # at connect
        for i in range(5):  # within the cache window: no database check per message
            api.post_events(device, occupancy(site, api.clock.now(), i))
            assert ws.receive_json()["guests"] == i
        assert calls == ["check"]
        # Idle socket: the periodic wake-up re-checks and closes it once the user is gone.
        r = api.client.delete(
            f"/api/v1/orgs/{owner.org_id}/users/{manager.user_id}", headers=owner.headers
        )
        assert r.status_code == 204
        api.clock.advance(1.0)
        expect_close(ws, WsCloseCode.UNAUTHORIZED)
        assert len(calls) == 2
