"""Edge events (architecture 5.3): the only data that leaves the restaurant.

``EdgeEvent`` is a discriminated union on ``type``. Every event carries:

* ``event_id``: UUIDv7 string (:func:`rv_contracts.new_event_id`), the idempotency key; the
  cloud ignores an ``event_id`` it has already stored.
* ``site_id``, ``ts`` (Unix epoch seconds, UTC, float: when the event happened on the edge
  clock) and ``schema_version``.

Events are anonymous by construction: table/zone ids, counts and durations only. There is no
user, employee, face, embedding or image field anywhere, and acknowledgements do not record
who acknowledged.

Semantics where architecture 5.3/6.2 leave room (the edge analytics implements these):

* ``session_id`` (UUIDv7 recommended) identifies one seating at a table, opened by
  ``empty -> seated``. Every ``table.state_changed`` carries the session it belongs to: the new
  one for ``empty -> seated``, the current one for later transitions, and the *just closed*
  one for ``-> needs_bussing`` and ``needs_bussing -> empty``.
* ``table.session_closed`` is emitted when guests leave (``seated|attended -> needs_bussing``),
  as in 6.2, i.e. *before* bussing. Producers following 6.2 therefore send
  ``bussing_delay_s=None``; the cloud derives bussing delay from the later
  ``table.state_changed`` ``needs_bussing -> empty`` with the same ``session_id``
  (``ts - left_at``). The field is kept for producers that close sessions after bussing.
* ``first_visit_delay_s`` = first staff visit time minus ``seated_at`` (None: no visit).
* Alerts: ``waiter_needed``, ``checkin_needed`` and ``bussing_needed`` require ``table_id``;
  ``long_queue`` requires ``zone_id`` (the queue zone). The edge ``AlertManager`` is the source
  of truth. A cloud ack (waiter app) becomes an ``alert_ack`` command; the edge applies it and
  emits ``alert.acknowledged`` with ``via="cloud"`` and the cloud's ``ack_at``. A LAN ack emits
  ``via="local"``.
* ``edge.heartbeat`` every :data:`HEARTBEAT_INTERVAL_S`; the cloud shows a device offline when
  no heartbeat arrived for :data:`DEVICE_OFFLINE_AFTER_S`. ``last_frame_age_s`` is None when a
  camera has not delivered a frame since the edge started (architecture lists it as required;
  a number cannot express "never"). ``local_url`` is the edge's LAN address (waiter app's
  offline link); it is not a secret and carries no credentials.
* Backdated times (1.1). The edge confirms a state only after a delay (e.g. guests must be
  present ``seat_confirm_s``), so ``ts`` is the *confirmation* time. ``since_ts`` /
  ``condition_since_ts`` carry the moment the state or condition really began, taken from the
  evidence (first guest sighting, waiter arrival, last guest sighting). Always ``<= ts``; None
  from 1.0 producers, in which case readers fall back to ``ts``. Use them for timers ("waiting
  3:20" since seating), never for ordering.

Delivery: ``POST /edge/events`` (batches) and the WebSockets. Both the cloud ``WS /ws`` and the
edge ``WS /local/ws`` send one JSON object per message: an :data:`EdgeEvent` or a
:class:`~rv_contracts.api.LiveSnapshotMessage` (``type == "live.snapshot"``, full state), so
clients dispatch on ``type``.
"""

from collections.abc import Mapping
from enum import StrEnum
from typing import Annotated, Any, Final, Literal, Self, TypeVar

from pydantic import Field, TypeAdapter, model_validator

from ._base import (
    SCHEMA_VERSION,
    ContractModel,
    Count,
    EpochSeconds,
    EventId,
    Id,
    SchemaVersion,
    Seconds,
)
from .ids import new_event_id

MAX_EVENTS_PER_BATCH: Final = 500
"""Maximum events in one ``POST /edge/events`` batch."""

HEARTBEAT_INTERVAL_S: Final = 30.0
"""How often the edge emits ``edge.heartbeat``."""

DEVICE_OFFLINE_AFTER_S: Final = 90.0
"""The cloud reports a device offline after this long without a heartbeat (3 missed)."""


class EventType(StrEnum):
    """Value of the ``type`` discriminator of every :data:`EdgeEvent`."""

    TABLE_STATE_CHANGED = "table.state_changed"
    TABLE_SESSION_CLOSED = "table.session_closed"
    ALERT_RAISED = "alert.raised"
    ALERT_ACKNOWLEDGED = "alert.acknowledged"
    ALERT_RESOLVED = "alert.resolved"
    QUEUE_SNAPSHOT = "queue.snapshot"
    QUEUE_SEATED = "queue.seated"
    QUEUE_WALKAWAY = "queue.walkaway"
    OCCUPANCY_SNAPSHOT = "occupancy.snapshot"
    EDGE_HEARTBEAT = "edge.heartbeat"


class TableState(StrEnum):
    """Table state machine states (architecture 6.2)."""

    EMPTY = "empty"
    SEATED = "seated"
    """Guests present, no staff visit yet."""
    ATTENDED = "attended"
    """Guests present and a staff member has visited."""
    NEEDS_BUSSING = "needs_bussing"
    """Guests left; waiting for staff to clear the table."""


class AlertKind(StrEnum):
    WAITER_NEEDED = "waiter_needed"
    """Seated for ``first_visit_timeout_s`` without a staff visit."""
    CHECKIN_NEEDED = "checkin_needed"
    """Attended, but no staff visit for ``checkin_timeout_s``."""
    BUSSING_NEEDED = "bussing_needed"
    """``needs_bussing`` for ``bussing_timeout_s``."""
    LONG_QUEUE = "long_queue"
    """Queue people or longest wait over the ``long_queue_*`` thresholds."""


TABLE_ALERT_KINDS: Final = frozenset(
    {AlertKind.WAITER_NEEDED, AlertKind.CHECKIN_NEEDED, AlertKind.BUSSING_NEEDED}
)
"""Alert kinds that concern one table (``table_id`` required)."""


class AlertSeverity(StrEnum):
    INFO = "info"
    WARN = "warn"
    URGENT = "urgent"


class ResolveReason(StrEnum):
    STAFF_VISIT = "staff_visit"
    """A matching staff visit was observed."""
    STATE_CHANGE = "state_change"
    """The table/queue state made the alert moot (e.g. guests left)."""
    MANUAL = "manual"
    """Closed by a manager."""
    EXPIRED = "expired"
    """Timed out without resolution."""


class AckVia(StrEnum):
    """Where an acknowledgement was pressed. Never who pressed it."""

    CLOUD = "cloud"
    LOCAL = "local"


class CameraStatus(StrEnum):
    OK = "ok"
    DEGRADED = "degraded"
    """Frames arrive, but below target fps or with errors."""
    OFFLINE = "offline"


class EdgeEventBase(ContractModel):
    """Fields common to every edge event."""

    type: EventType
    """Discriminator; fixed per event class."""
    event_id: EventId
    """UUIDv7 string; idempotency key."""
    site_id: Id
    ts: EpochSeconds
    """When it happened, Unix epoch seconds (UTC) on the edge clock."""
    schema_version: SchemaVersion = SCHEMA_VERSION


class TableStateChanged(EdgeEventBase):
    """A table moved to another state."""

    type: Literal[EventType.TABLE_STATE_CHANGED] = EventType.TABLE_STATE_CHANGED
    table_id: Id
    from_state: TableState
    to_state: TableState
    guest_count: Count
    """Smoothed number of guests at the table at transition time."""
    session_id: Id
    """The seating this transition belongs to (see module docstring)."""
    since_ts: EpochSeconds | None = None
    """When ``to_state`` really began (backdated to the evidence, ``<= ts``): first guest
    sighting for ``seated``, waiter arrival for ``attended``, last guest sighting for
    ``needs_bussing``. None if unknown (1.0 producers): use ``ts``. Since 1.1."""

    @model_validator(mode="after")
    def _check_states(self) -> Self:
        if self.from_state is self.to_state:
            raise ValueError("from_state and to_state must differ")
        if self.since_ts is not None and self.since_ts > self.ts:
            raise ValueError("since_ts must not be after ts")
        return self


class TableSessionClosed(EdgeEventBase):
    """A seating ended (guests left). Emitted once per session."""

    type: Literal[EventType.TABLE_SESSION_CLOSED] = EventType.TABLE_SESSION_CLOSED
    table_id: Id
    session_id: Id
    seated_at: EpochSeconds
    left_at: EpochSeconds
    """When guests left (start of ``needs_bussing``). Dwell = ``left_at - seated_at``."""
    max_guests: Count
    first_visit_delay_s: Seconds | None = None
    """Seconds from ``seated_at`` to the first staff visit; None if never visited."""
    visits: Count
    """Number of staff visits during the session."""
    bussing_delay_s: Seconds | None = None
    """Seconds from ``left_at`` to bussed; None if not known when the session closed."""

    @model_validator(mode="after")
    def _check_times(self) -> Self:
        if self.left_at < self.seated_at:
            raise ValueError("left_at must not be before seated_at")
        return self


class AlertRaised(EdgeEventBase):
    """A new alert. Table alerts carry ``table_id``; ``long_queue`` carries ``zone_id``."""

    type: Literal[EventType.ALERT_RAISED] = EventType.ALERT_RAISED
    alert_id: Id
    kind: AlertKind
    table_id: Id | None = None
    zone_id: Id | None = None
    severity: AlertSeverity
    condition_since_ts: EpochSeconds | None = None
    """When the underlying condition began (``<= ts``): ``waiter_needed`` = guests seated,
    ``checkin_needed`` = last staff attention, ``bussing_needed`` = guests left,
    ``long_queue`` = the threshold was crossed. Staff apps show "waiting 3:20" from here, not
    from ``ts``. None if unknown (1.0 producers): use ``ts``. Since 1.1."""

    @model_validator(mode="after")
    def _check_target(self) -> Self:
        if self.kind in TABLE_ALERT_KINDS and self.table_id is None:
            raise ValueError(f"{self.kind.value} alerts need a table_id")
        if self.kind is AlertKind.LONG_QUEUE and self.zone_id is None:
            raise ValueError("long_queue alerts need a zone_id")
        if self.condition_since_ts is not None and self.condition_since_ts > self.ts:
            raise ValueError("condition_since_ts must not be after ts")
        return self


class AlertAcknowledged(EdgeEventBase):
    """Someone pressed "on it". No user identity, by design."""

    type: Literal[EventType.ALERT_ACKNOWLEDGED] = EventType.ALERT_ACKNOWLEDGED
    alert_id: Id
    ack_at: EpochSeconds
    """When the button was pressed (for cloud acks: the cloud's receive time)."""
    via: AckVia


class AlertResolved(EdgeEventBase):
    """An alert closed."""

    type: Literal[EventType.ALERT_RESOLVED] = EventType.ALERT_RESOLVED
    alert_id: Id
    resolved_at: EpochSeconds
    reason: ResolveReason


class QueueSnapshot(EdgeEventBase):
    """Queue zone state, every ``snapshot_interval_s``."""

    type: Literal[EventType.QUEUE_SNAPSHOT] = EventType.QUEUE_SNAPSHOT
    zone_id: Id
    people: Count
    parties_est: Count
    """Estimated number of parties (tracks entering within 5 s and close together)."""
    longest_wait_s: Seconds
    avg_wait_s: Seconds
    """Mean current wait of people in the queue (0 when empty)."""


class QueueSeated(EdgeEventBase):
    """A queued person crossed the entrance line inward."""

    type: Literal[EventType.QUEUE_SEATED] = EventType.QUEUE_SEATED
    zone_id: Id
    """The queue zone they waited in."""
    waited_s: Seconds


class QueueWalkaway(EdgeEventBase):
    """A party left the queue outward after ``walkaway_min_wait_s`` without being seated."""

    type: Literal[EventType.QUEUE_WALKAWAY] = EventType.QUEUE_WALKAWAY
    zone_id: Id
    waited_s: Seconds
    party_size_est: int = Field(ge=1)


class OccupancySnapshot(EdgeEventBase):
    """Site-wide occupancy, every ``snapshot_interval_s``."""

    type: Literal[EventType.OCCUPANCY_SNAPSHOT] = EventType.OCCUPANCY_SNAPSHOT
    guests: Count
    """Guests at tables plus guests in ``area`` zones."""
    tables_occupied: Count
    """Tables in ``seated`` or ``attended``."""
    tables_total: Count
    staff_on_floor: Count
    """Staff tracks currently seen on the floor, summed over cameras (role ``staff``: uniform
    colour or first seen in a ``staff_area``). Anonymous and approximate: a person seen by two
    overlapping cameras counts twice, and staff inside ``staff_area`` zones (kitchen pass,
    service station) are included. Never attributed to a person."""

    @model_validator(mode="after")
    def _check_tables(self) -> Self:
        if self.tables_occupied > self.tables_total:
            raise ValueError("tables_occupied must not exceed tables_total")
        return self


class CameraHealth(ContractModel):
    """Per-camera health inside ``edge.heartbeat``."""

    camera_id: Id
    status: CameraStatus
    fps: float = Field(ge=0)
    """Frames per second actually analysed."""
    last_frame_age_s: Seconds | None = None
    """Seconds since the last frame; None if no frame since the edge started."""


class EdgeHeartbeat(EdgeEventBase):
    """Edge device health, every ``HEARTBEAT_INTERVAL_S``."""

    type: Literal[EventType.EDGE_HEARTBEAT] = EventType.EDGE_HEARTBEAT
    device_id: Id
    version: str = Field(min_length=1, max_length=64)
    """rv_edge version string."""
    cameras: list[CameraHealth]
    cpu_pct: float = Field(ge=0)
    """Process CPU usage in percent of one core (may exceed 100 on multi-core)."""
    mem_mb: float = Field(ge=0)
    """Process resident memory in MiB."""
    outbox_depth: Count
    """Events persisted but not yet delivered to the cloud."""
    local_url: str | None = Field(default=None, max_length=256, pattern=r"^https?://\S+$")
    """The edge's LAN base URL (e.g. ``http://192.168.1.20:8787``), for the waiter app's
    offline link (``<local_url>/local-alerts``). None if unknown. Since 1.1."""


EdgeEvent = Annotated[
    TableStateChanged
    | TableSessionClosed
    | AlertRaised
    | AlertAcknowledged
    | AlertResolved
    | QueueSnapshot
    | QueueSeated
    | QueueWalkaway
    | OccupancySnapshot
    | EdgeHeartbeat,
    Field(discriminator="type"),
]
"""Any edge event; discriminated on ``type``."""

EVENT_CLASSES: Final[Mapping[EventType, type[EdgeEventBase]]] = {
    EventType.TABLE_STATE_CHANGED: TableStateChanged,
    EventType.TABLE_SESSION_CLOSED: TableSessionClosed,
    EventType.ALERT_RAISED: AlertRaised,
    EventType.ALERT_ACKNOWLEDGED: AlertAcknowledged,
    EventType.ALERT_RESOLVED: AlertResolved,
    EventType.QUEUE_SNAPSHOT: QueueSnapshot,
    EventType.QUEUE_SEATED: QueueSeated,
    EventType.QUEUE_WALKAWAY: QueueWalkaway,
    EventType.OCCUPANCY_SNAPSHOT: OccupancySnapshot,
    EventType.EDGE_HEARTBEAT: EdgeHeartbeat,
}
"""Event class for each ``type``."""

EdgeEventAdapter: TypeAdapter[EdgeEvent] = TypeAdapter(EdgeEvent)
"""Validates/serializes any :data:`EdgeEvent` (``validate_python``, ``validate_json``,
``dump_python``, ``dump_json``)."""


class EventBatch(ContractModel):
    """Body of ``POST /api/v1/edge/events``."""

    events: list[EdgeEvent] = Field(max_length=MAX_EVENTS_PER_BATCH)


def parse_event(data: Mapping[str, Any] | str | bytes) -> EdgeEvent:
    """Validate one event from a dict or a JSON string/bytes into its concrete class."""
    if isinstance(data, str | bytes):
        return EdgeEventAdapter.validate_json(data)
    return EdgeEventAdapter.validate_python(data)


E = TypeVar("E", bound=EdgeEventBase)


def make_event(cls: type[E], site_id: str, ts: float, **payload: Any) -> E:
    """Build and validate an event with a fresh ``event_id`` and the current schema version.

    ``make_event(QueueSeated, "site-1", clock.now(), zone_id="z-queue", waited_s=95.0)``
    """
    return cls(event_id=new_event_id(), site_id=site_id, ts=ts, **payload)
