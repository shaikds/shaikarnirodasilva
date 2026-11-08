"""ORM models: the tables of architecture 7.1 plus the live projections.

Raw edge events are stored once (``events``, idempotent on ``event_id``) and projected, in the
same transaction, into read models: ``table_state_current``, ``table_sessions``, ``alerts``,
``queue_events``, ``metric_snapshots``, ``occupancy_latest``, ``queue_latest`` and
``device_health``. Ids are strings (UUIDv7 for cloud-generated ones); edge-generated ids
(alerts, sessions) are keyed together with ``site_id`` so one tenant can never collide with,
or overwrite, another tenant's rows.

Privacy: no table stores who acknowledged an alert, and no metric is keyed by a person.
"""

from typing import Any

from sqlalchemy import ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, BigIntPk

ID = String(64)
EVENT_ID = String(36)
ENUM = String(32)


class Organization(Base):
    """A customer (restaurant group)."""

    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(ID, primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    plan: Mapped[str] = mapped_column(ENUM)
    created_at: Mapped[float]


class Site(Base):
    """A branch. ``config_json`` is the site's ``SiteConfig``; ``command_seq`` is the last
    edge-command sequence number (the commands cursor)."""

    __tablename__ = "sites"

    id: Mapped[str] = mapped_column(ID, primary_key=True)
    org_id: Mapped[str] = mapped_column(
        ID, ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(128))
    timezone: Mapped[str] = mapped_column(String(64))
    locale: Mapped[str] = mapped_column(String(8))
    currency: Mapped[str] = mapped_column(String(8))
    avg_check_per_guest: Mapped[float] = mapped_column(default=0.0)
    config_json: Mapped[dict[str, Any]]
    config_version: Mapped[int] = mapped_column(default=0)
    floor_plan_json: Mapped[list[Any]]
    command_seq: Mapped[int] = mapped_column(default=0)
    first_event_ts: Mapped[float | None]
    """Earliest edge event ts ever received (start of the ROI baseline window)."""
    created_at: Mapped[float]


class User(Base):
    """A person who signs in. ``token_version`` invalidates issued tokens when bumped."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(ID, primary_key=True)
    org_id: Mapped[str] = mapped_column(
        ID, ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(128))
    locale: Mapped[str] = mapped_column(String(8))
    token_version: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[float]

    memberships: Mapped[list["Membership"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )


class Membership(Base):
    """A role grant: owners have ``site_id=None`` (all sites), others exactly one site."""

    __tablename__ = "memberships"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ID, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    org_id: Mapped[str] = mapped_column(
        ID, ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(ENUM)
    site_id: Mapped[str | None] = mapped_column(
        ID, ForeignKey("sites.id", ondelete="CASCADE"), index=True
    )

    user: Mapped[User] = relationship(back_populates="memberships")


class Device(Base):
    """A paired edge device. Only the SHA-256 of its bearer token is stored."""

    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(ID, primary_key=True)
    site_id: Mapped[str] = mapped_column(ID, ForeignKey("sites.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[float]
    last_seen_at: Mapped[float | None]
    """Cloud receive time of the latest ``edge.heartbeat`` from this device."""
    version: Mapped[str | None] = mapped_column(String(64))


class DeviceHealth(Base):
    """Latest heartbeat payload per device (projection of ``edge.heartbeat``)."""

    __tablename__ = "device_health"

    device_id: Mapped[str] = mapped_column(
        ID, ForeignKey("devices.id", ondelete="CASCADE"), primary_key=True
    )
    site_id: Mapped[str] = mapped_column(ID, ForeignKey("sites.id", ondelete="CASCADE"), index=True)
    ts: Mapped[float]
    version: Mapped[str] = mapped_column(String(64))
    cameras_json: Mapped[list[Any]]
    cpu_pct: Mapped[float]
    mem_mb: Mapped[float]
    outbox_depth: Mapped[int]
    local_url: Mapped[str | None] = mapped_column(String(256))
    """The edge's LAN base URL (``EdgeHeartbeat.local_url``)."""


class PairingCode(Base):
    """Short-lived, single-use code that pairs an edge device with a site."""

    __tablename__ = "pairing_codes"

    code: Mapped[str] = mapped_column(String(16), primary_key=True)
    site_id: Mapped[str] = mapped_column(ID, ForeignKey("sites.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[float]
    created_at: Mapped[float]


class Event(Base):
    """Raw edge event, stored once (``event_id`` is the idempotency key)."""

    __tablename__ = "events"
    __table_args__ = (Index("ix_events_site_type_ts", "site_id", "type", "ts"),)

    event_id: Mapped[str] = mapped_column(EVENT_ID, primary_key=True)
    site_id: Mapped[str] = mapped_column(ID, ForeignKey("sites.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(ENUM)
    ts: Mapped[float]
    payload_json: Mapped[dict[str, Any]]
    received_at: Mapped[float]
    device_id: Mapped[str | None] = mapped_column(ID)
    """Device that delivered the event (audit only; not a foreign key)."""


class TableStateCurrent(Base):
    """Current state of each table (projection of ``table.state_changed``)."""

    __tablename__ = "table_state_current"

    site_id: Mapped[str] = mapped_column(
        ID, ForeignKey("sites.id", ondelete="CASCADE"), primary_key=True
    )
    table_id: Mapped[str] = mapped_column(ID, primary_key=True)
    state: Mapped[str] = mapped_column(ENUM)
    guest_count: Mapped[int]
    session_id: Mapped[str | None] = mapped_column(ID)
    since_ts: Mapped[float]
    """When the state really began (``TableStateChanged.since_ts``, else the event ``ts``)."""
    changed_at: Mapped[float | None]
    """``ts`` of the transition (confirmation time): orders late events. None on rows written
    before 0002 (``since_ts`` was the event ``ts`` then)."""


class TableSession(Base):
    """One seating. Opened by ``empty -> seated``, closed by ``table.session_closed`` and
    bussed by ``needs_bussing -> empty`` (which yields the bussing delay)."""

    __tablename__ = "table_sessions"
    __table_args__ = (Index("ix_table_sessions_site_left", "site_id", "left_at"),)

    site_id: Mapped[str] = mapped_column(
        ID, ForeignKey("sites.id", ondelete="CASCADE"), primary_key=True
    )
    session_id: Mapped[str] = mapped_column(ID, primary_key=True)
    table_id: Mapped[str] = mapped_column(ID)
    seated_at: Mapped[float | None]
    left_at: Mapped[float | None]
    bussed_at: Mapped[float | None]
    max_guests: Mapped[int | None]
    first_visit_delay_s: Mapped[float | None]
    visits: Mapped[int | None]
    bussing_delay_s: Mapped[float | None]


class Alert(Base):
    """Alert lifecycle. Acks store time and channel only, never who pressed."""

    __tablename__ = "alerts"
    __table_args__ = (
        Index("ix_alerts_site_raised", "site_id", "raised_at"),
        Index("ix_alerts_site_resolved", "site_id", "resolved_at"),
    )

    site_id: Mapped[str] = mapped_column(
        ID, ForeignKey("sites.id", ondelete="CASCADE"), primary_key=True
    )
    alert_id: Mapped[str] = mapped_column(ID, primary_key=True)
    kind: Mapped[str] = mapped_column(ENUM)
    severity: Mapped[str] = mapped_column(ENUM)
    table_id: Mapped[str | None] = mapped_column(ID)
    zone_id: Mapped[str | None] = mapped_column(ID)
    raised_at: Mapped[float]
    acked_at: Mapped[float | None]
    ack_via: Mapped[str | None] = mapped_column(ENUM)
    resolved_at: Mapped[float | None]
    resolve_reason: Mapped[str | None] = mapped_column(ENUM)
    condition_since_ts: Mapped[float | None]
    """When the alert's condition began (``AlertRaised.condition_since_ts``)."""


class QueueEvent(Base):
    """``queue.seated`` and ``queue.walkaway`` facts."""

    __tablename__ = "queue_events"
    __table_args__ = (Index("ix_queue_events_site_ts", "site_id", "ts"),)

    id: Mapped[int] = mapped_column(BigIntPk, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(EVENT_ID, unique=True)
    site_id: Mapped[str] = mapped_column(ID, ForeignKey("sites.id", ondelete="CASCADE"))
    zone_id: Mapped[str] = mapped_column(ID)
    kind: Mapped[str] = mapped_column(ENUM)
    """``seated`` or ``walkaway``."""
    ts: Mapped[float]
    waited_s: Mapped[float]
    party_size_est: Mapped[int | None]


class MetricSnapshot(Base):
    """Every occupancy/queue snapshot, for time series. ``value`` is guests (occupancy) or
    people (queue); ``payload`` keeps the full snapshot."""

    __tablename__ = "metric_snapshots"
    __table_args__ = (Index("ix_metric_snapshots_site_kind_ts", "site_id", "kind", "ts"),)

    id: Mapped[int] = mapped_column(BigIntPk, primary_key=True, autoincrement=True)
    site_id: Mapped[str] = mapped_column(ID, ForeignKey("sites.id", ondelete="CASCADE"))
    ts: Mapped[float]
    kind: Mapped[str] = mapped_column(ENUM)
    zone_id: Mapped[str | None] = mapped_column(ID)
    value: Mapped[float]
    payload: Mapped[dict[str, Any]]


class OccupancyLatest(Base):
    """Latest ``occupancy.snapshot`` per site."""

    __tablename__ = "occupancy_latest"

    site_id: Mapped[str] = mapped_column(
        ID, ForeignKey("sites.id", ondelete="CASCADE"), primary_key=True
    )
    ts: Mapped[float]
    guests: Mapped[int]
    tables_occupied: Mapped[int]
    tables_total: Mapped[int]
    staff_on_floor: Mapped[int]


class QueueLatest(Base):
    """Latest ``queue.snapshot`` per queue zone."""

    __tablename__ = "queue_latest"

    site_id: Mapped[str] = mapped_column(
        ID, ForeignKey("sites.id", ondelete="CASCADE"), primary_key=True
    )
    zone_id: Mapped[str] = mapped_column(ID, primary_key=True)
    ts: Mapped[float]
    people: Mapped[int]
    parties_est: Mapped[int]
    longest_wait_s: Mapped[float]
    avg_wait_s: Mapped[float]


class PushSubscription(Base):
    """A browser Web Push subscription for a site's alerts. ``user_id`` is ownership only
    (who may delete it); it is never attached to alerts or metrics."""

    __tablename__ = "push_subscriptions"

    id: Mapped[str] = mapped_column(ID, primary_key=True)
    site_id: Mapped[str] = mapped_column(ID, ForeignKey("sites.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ID, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    endpoint: Mapped[str] = mapped_column(String(2048))
    endpoint_hash: Mapped[str] = mapped_column(String(64), unique=True)
    keys_json: Mapped[dict[str, Any]]
    created_at: Mapped[float]


class Command(Base):
    """Cloud -> edge command. ``seq`` increases per site in commit order (see
    ``CommandRepository.append``) and is the polling cursor."""

    __tablename__ = "commands"
    __table_args__ = (UniqueConstraint("site_id", "seq", name="uq_commands_site_seq"),)

    id: Mapped[int] = mapped_column(BigIntPk, primary_key=True, autoincrement=True)
    command_id: Mapped[str] = mapped_column(EVENT_ID, unique=True)
    site_id: Mapped[str] = mapped_column(ID, ForeignKey("sites.id", ondelete="CASCADE"))
    seq: Mapped[int]
    kind: Mapped[str] = mapped_column(ENUM)
    payload_json: Mapped[dict[str, Any]]
    created_at: Mapped[float]


__all__ = [
    "Alert",
    "Base",
    "Command",
    "Device",
    "DeviceHealth",
    "Event",
    "Membership",
    "MetricSnapshot",
    "OccupancyLatest",
    "Organization",
    "PairingCode",
    "PushSubscription",
    "QueueEvent",
    "QueueLatest",
    "Site",
    "TableSession",
    "TableStateCurrent",
    "User",
]
