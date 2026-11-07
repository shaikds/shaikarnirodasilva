"""WebSocket broadcast and the in-memory broker."""

import asyncio
import json
import threading

import pytest
from rv_contracts import (
    AlertKind,
    AlertRaised,
    AlertSeverity,
    OccupancySnapshot,
    Role,
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
    [("", 4400), ("token=garbage&site_id=x", 4401)],
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
