import json
import uuid
from typing import Any

import pytest
from pydantic import ValidationError

from rv_contracts import (
    EVENT_CLASSES,
    MAX_EVENTS_PER_BATCH,
    SCHEMA_VERSION,
    AckVia,
    AlertAcknowledged,
    AlertKind,
    AlertRaised,
    AlertSeverity,
    EdgeEvent,
    EdgeEventAdapter,
    EventBatch,
    EventType,
    OccupancySnapshot,
    QueueSeated,
    TableSessionClosed,
    TableState,
    TableStateChanged,
    make_event,
    new_event_id,
    parse_event,
)
from rv_contracts.events import EdgeEventBase
from rv_contracts.fixtures import sample_events

SAMPLES = sample_events()


def _base(type_: str, **payload: Any) -> dict[str, Any]:
    return {
        "type": type_,
        "event_id": new_event_id(),
        "site_id": "s1",
        "ts": 1_793_988_000.5,
        **payload,
    }


@pytest.mark.parametrize("event", SAMPLES, ids=lambda e: e.type.value)
def test_json_round_trip_every_type(event: EdgeEvent) -> None:
    wire = event.model_dump_json()
    data = json.loads(wire)
    assert data["type"] == event.type.value
    assert data["schema_version"] == SCHEMA_VERSION
    for parsed in (parse_event(data), parse_event(wire), parse_event(wire.encode())):
        assert type(parsed) is type(event)
        assert parsed == event
    assert EdgeEventAdapter.validate_json(EdgeEventAdapter.dump_json(event)) == event


def test_event_classes_match_union_and_enum() -> None:
    assert set(EVENT_CLASSES) == set(EventType)
    for event_type, cls in EVENT_CLASSES.items():
        assert cls.model_fields["type"].default == event_type
        assert cls.__name__ in {type(e).__name__ for e in SAMPLES}


def test_parse_minimal_dict_with_defaults() -> None:
    event = parse_event(_base("queue.seated", zone_id="z-queue", waited_s=12))
    assert isinstance(event, QueueSeated)
    assert event.schema_version == SCHEMA_VERSION
    assert event.waited_s == 12.0


@pytest.mark.parametrize(
    ("data", "message"),
    [
        (_base("table.exploded", table_id="t1"), "does not match any of the expected tags"),
        ({k: v for k, v in _base("queue.seated", zone_id="z", waited_s=1).items()
          if k != "type"}, "Unable to extract tag"),
        (_base("queue.seated", zone_id="z", waited_s=1, user_id="u1"), "Extra inputs"),
        (_base("queue.seated", zone_id="z", waited_s=-1), "greater than or equal to 0"),
        ({**_base("queue.seated", zone_id="z", waited_s=1), "event_id": str(uuid.uuid4())},
         "String should match pattern"),
        ({**_base("queue.seated", zone_id="z", waited_s=1), "event_id": "not-a-uuid"},
         "String should match pattern"),
        ({**_base("queue.seated", zone_id="z", waited_s=1), "schema_version": "2.0"},
         "unsupported schema_version"),
        ({**_base("queue.seated", zone_id="z", waited_s=1), "ts": float("nan")},
         "finite number"),
    ],
)
def test_invalid_events_rejected(data: dict[str, Any], message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        parse_event(data)


def test_alert_target_validation() -> None:
    with pytest.raises(ValidationError, match="waiter_needed alerts need a table_id"):
        make_event(AlertRaised, "s1", 1.0, alert_id="a1", kind=AlertKind.WAITER_NEEDED,
                   severity=AlertSeverity.WARN)
    with pytest.raises(ValidationError, match="long_queue alerts need a zone_id"):
        make_event(AlertRaised, "s1", 1.0, alert_id="a1", kind=AlertKind.LONG_QUEUE,
                   severity=AlertSeverity.WARN)
    alert = make_event(AlertRaised, "s1", 1.0, alert_id="a1", kind=AlertKind.LONG_QUEUE,
                       zone_id="z-queue", severity=AlertSeverity.URGENT)
    assert alert.table_id is None


def test_table_event_validation() -> None:
    with pytest.raises(ValidationError, match="must differ"):
        make_event(TableStateChanged, "s1", 1.0, table_id="t1", from_state=TableState.SEATED,
                   to_state=TableState.SEATED, guest_count=2, session_id="sess-1")
    with pytest.raises(ValidationError, match="left_at must not be before seated_at"):
        make_event(TableSessionClosed, "s1", 1.0, table_id="t1", session_id="sess-1",
                   seated_at=100.0, left_at=50.0, max_guests=2, visits=1)
    with pytest.raises(ValidationError, match="tables_occupied must not exceed"):
        make_event(OccupancySnapshot, "s1", 1.0, guests=4, tables_occupied=9, tables_total=8,
                   staff_on_floor=1)


def test_make_event() -> None:
    event = make_event(QueueSeated, "s1", 10.0, zone_id="z-queue", waited_s=95.0)
    other = make_event(QueueSeated, "s1", 10.0, zone_id="z-queue", waited_s=95.0)
    assert event.type is EventType.QUEUE_SEATED
    assert event.event_id < other.event_id
    assert (event.site_id, event.ts, event.schema_version) == ("s1", 10.0, SCHEMA_VERSION)


def test_events_are_frozen() -> None:
    with pytest.raises(ValidationError):
        SAMPLES[0].ts = 5.0


def test_ack_carries_no_identity() -> None:
    assert set(AlertAcknowledged.model_fields) == {
        "type", "event_id", "site_id", "ts", "schema_version", "alert_id", "ack_at", "via",
    }
    assert set(AckVia) == {"cloud", "local"}


IDENTITY_WORDS = ("user", "employee", "staff_id", "waiter_id", "name", "email", "face",
                  "embedding", "image", "photo", "person_id", "phone")


@pytest.mark.parametrize("cls", list(EVENT_CLASSES.values()), ids=lambda c: c.__name__)
def test_no_identity_fields_in_events(cls: type[EdgeEventBase]) -> None:
    for name in cls.model_fields:
        assert not any(word in name for word in IDENTITY_WORDS), f"{cls.__name__}.{name}"


def test_event_batch() -> None:
    batch = EventBatch(events=SAMPLES)
    restored = EventBatch.model_validate_json(batch.model_dump_json())
    assert restored == batch
    assert [type(e) for e in restored.events] == [type(e) for e in SAMPLES]
    assert EventBatch(events=[]).events == []


def test_event_batch_max_size() -> None:
    event = SAMPLES[-1].model_dump(mode="json")
    EventBatch.model_validate({"events": [event] * MAX_EVENTS_PER_BATCH})
    with pytest.raises(ValidationError, match="at most 500 items"):
        EventBatch.model_validate({"events": [event] * (MAX_EVENTS_PER_BATCH + 1)})


def test_heartbeat_last_frame_age_may_be_unknown() -> None:
    data = _base(
        "edge.heartbeat", device_id="d1", version="0.1.0", cpu_pct=12.5, mem_mb=300,
        outbox_depth=4,
        cameras=[{"camera_id": "c1", "status": "offline", "fps": 0, "last_frame_age_s": None}],
    )
    event = parse_event(data)
    assert event.type is EventType.EDGE_HEARTBEAT
    assert parse_event(event.model_dump(mode="json")) == event
