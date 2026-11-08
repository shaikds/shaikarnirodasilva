"""REST payloads shared by the cloud, the edge and the web apps (architecture 7.3).

Conventions:

* All ids are strings. All timestamps in responses are Unix epoch seconds (UTC, float);
  calendar dates (``ShiftReport.date``) are site-local ``YYYY-MM-DD``. Query parameters
  ``from``/``to`` are epoch seconds too; ranges are half-open ``[from, to)``.
* Durations are seconds (``*_s``). Money is in the site's currency, major units (e.g. shekels),
  as float; every money figure is an estimate and wrapped in :class:`Estimate`.
* Privacy: no alert, ack or metric shape carries a user or employee identity. Metrics are per
  site or per table only.
* WebSockets: the cloud ``WS /ws?token=<access JWT>&site_id=<id>`` and the edge
  ``WS /local/ws`` send one JSON object per message, either an :data:`EdgeEvent` or a
  :class:`LiveSnapshotMessage` (``{"type": "live.snapshot", "snapshot": LiveSnapshot}``, the
  full state; replace the cached snapshot). Dispatch on ``type``. The edge sends a snapshot on
  connect and every few seconds; the cloud sends one on connect to owners and managers
  (waiters receive ``alert.*`` events only). Client messages are ignored. The cloud closes a
  socket it refuses with a :class:`WsCloseCode`: 4400 missing parameters, 4401 bad or expired
  token (refresh and reconnect), 4403 no access to the site (do not retry). The token is
  checked only at connect; after a reconnect, re-sync from the next snapshot or
  ``GET /sites/{id}/live``.
* Web Push: each push message body is an :class:`AlertPush` JSON object.
* ``LiveSnapshot`` is served both by the cloud (``GET /sites/{id}/live``) and by the edge on
  the LAN (``GET /local/state``), so the waiter app's offline mode reuses the same types.

Endpoint -> model map (``/api/v1`` prefix):

=====================================================  =======================================
``POST /auth/signup``                                  ``SignupRequest`` -> ``TokenPair``
``POST /auth/login``                                   ``LoginRequest`` -> ``TokenPair``
``POST /auth/refresh``                                 ``RefreshRequest`` -> ``TokenPair``
``GET /me``                                            ``Me``
``GET /orgs/{org_id}``                                 ``OrgInfo``
``GET|POST /orgs/{org_id}/sites``                      ``list[SiteSummary]`` / ``SiteCreate``
                                                       -> ``SiteSettings``
``GET|PATCH /sites/{site_id}``                         ``SiteSettings`` / ``SiteSettingsPatch``
``GET|POST /orgs/{org_id}/users``                      ``list[OrgUser]`` / ``UserCreate``
``PATCH|DELETE /orgs/{org_id}/users/{user_id}``        ``UserUpdate`` -> ``OrgUser``
``POST /sites/{site_id}/devices/pairing-code``         ``PairingCodeInfo``
``GET /sites/{site_id}/devices``                       ``list[DeviceStatus]`` (waiters: only
                                                       id, online, last_seen_at, local_url)
``DELETE /sites/{site_id}/devices/{device_id}``        204, no body (owner; unpairs the edge)
``POST /edge/pair``                                    ``PairRequest`` -> ``PairResponse``
``POST /edge/events``                                  ``EventBatch`` -> ``EventsAccepted``
``GET|PUT /edge/config``, ``GET /sites/{id}/config``   ``SiteConfig``
``GET /edge/commands?after=<cursor>``                  ``CommandsPage``
``GET /sites/{site_id}/live``, edge ``/local/state``   ``LiveSnapshot``
``GET /sites/{site_id}/alerts?status=open|all``        ``list[AlertView]``
``POST /alerts/{alert_id}/ack`` (no body)              ``AlertView``
``GET /sites/{site_id}/metrics/summary``               ``MetricsSummary``
``GET /sites/{site_id}/metrics/timeseries``            ``Timeseries``
``GET /sites/{site_id}/tables/stats``                  ``list[TableStats]``
``GET /sites/{site_id}/reports/shift?date=``           ``ShiftReport``
``GET /orgs/{org_id}/reports/compare``                 ``BranchComparison``
``GET /push/vapid-public-key``                         ``VapidPublicKey``
``POST /push/subscriptions``                           ``PushSubscriptionIn`` ->
                                                       ``PushSubscriptionOut``
``DELETE /push/subscriptions/{subscription_id}``       204, no body
Web Push message body                                  ``AlertPush``
``WS /ws``, edge ``WS /local/ws``                      ``EdgeEvent | LiveSnapshotMessage``
``GET /healthz`` (also ``/api/v1/healthz``),           ``HealthStatus``
edge ``GET /local/health``
edge ``GET /local/coverage``                           ``CoverageReport``
=====================================================  =======================================

Additions beyond 7.3, kept minimal: ``Me.sites`` (names for the waiter app's site picker) and
``SiteSettings.floor_plan`` (grid positions for the dashboard's schematic floor plan, 8).
"""

import datetime as dt
from enum import IntEnum, StrEnum
from typing import Annotated, Final, Literal, Self

from pydantic import ConfigDict, Field, StringConstraints, TypeAdapter, model_validator

from ._base import ContractModel, Count, EpochSeconds, Id, Label, Seconds
from .config import Locale, Modules, Thresholds, Timezone
from .events import (
    AckVia,
    AlertKind,
    AlertSeverity,
    CameraHealth,
    ResolveReason,
    TableState,
)

PAIRING_CODE_PATTERN: Final = r"^[A-Z0-9]{6}$"

Email = Annotated[str, StringConstraints(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
"""Email address (shape check only)."""

Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]

Money = Annotated[float, Field(ge=0)]
"""Amount in the site's currency, major units."""

NonNegative = Annotated[float, Field(ge=0)]

# --------------------------------------------------------------------------- auth and tenancy


class Role(StrEnum):
    OWNER = "owner"
    """All sites of the org: settings, users, devices, reports, branch comparison."""
    MANAGER = "manager"
    """One site: live view, alerts, reports, thresholds."""
    WAITER = "waiter"
    """One site: open alerts and ack only."""


class Plan(StrEnum):
    STARTER = "starter"
    """occupancy, queue, turnover."""
    PRO = "pro"
    """+ table states, waiter alerts, response times, branch comparison."""


class Currency(StrEnum):
    ILS = "ILS"
    USD = "USD"
    AUD = "AUD"


class LoginRequest(ContractModel):
    email: Email
    password: str = Field(min_length=1, max_length=128)


class SignupRequest(ContractModel):
    """Creates an organization and its owner."""

    org_name: Label
    name: Label
    """Owner's display name."""
    email: Email
    password: Password
    locale: Locale = Locale.HE


class RefreshRequest(ContractModel):
    refresh_token: str = Field(min_length=1)


class TokenPair(ContractModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int = Field(gt=0)
    """Access token lifetime in seconds."""


class UserInfo(ContractModel):
    user_id: Id
    email: Email
    name: Label
    locale: Locale


class OrgInfo(ContractModel):
    org_id: Id
    name: Label
    plan: Plan


class MembershipInfo(ContractModel):
    """A role grant. Owners have ``site_id=None`` (all sites); managers and waiters one site."""

    role: Role
    site_id: Id | None = None

    @model_validator(mode="after")
    def _check_scope(self) -> Self:
        if self.role is Role.OWNER and self.site_id is not None:
            raise ValueError("owner memberships cover all sites; site_id must be None")
        if self.role is not Role.OWNER and self.site_id is None:
            raise ValueError(f"{self.role.value} memberships need a site_id")
        return self


class SiteRef(ContractModel):
    site_id: Id
    name: Label


class Me(ContractModel):
    """``GET /me``: the signed-in user, their org, roles and the sites they can open."""

    user: UserInfo
    org: OrgInfo
    memberships: list[MembershipInfo]
    sites: list[SiteRef]
    """Sites this user can access (all org sites for owners)."""


class OrgUser(ContractModel):
    """A user as listed in user management."""

    user_id: Id
    email: Email
    name: Label
    locale: Locale
    memberships: list[MembershipInfo]


class UserCreate(ContractModel):
    email: Email
    name: Label
    password: Password
    """Initial password, changed by the user later."""
    locale: Locale = Locale.HE
    memberships: list[MembershipInfo] = Field(min_length=1)


class UserUpdate(ContractModel):
    """Partial update; omitted fields are unchanged."""

    model_config = ConfigDict(json_schema_serialization_defaults_required=False)

    name: Label | None = None
    locale: Locale | None = None
    password: Password | None = None
    memberships: list[MembershipInfo] | None = None
    """Replaces all memberships when given."""


# --------------------------------------------------------------------------- sites


class FloorPlanItem(ContractModel):
    """Position of a table on the dashboard's schematic floor-plan grid (not camera space)."""

    table_id: Id
    x: int = Field(ge=0, le=99)
    """Grid column, 0-based, from the start edge (right in RTL)."""
    y: int = Field(ge=0, le=99)
    """Grid row, 0-based, from the top."""
    w: int = Field(default=1, ge=1, le=10)
    """Width in grid cells."""
    h: int = Field(default=1, ge=1, le=10)
    """Height in grid cells."""


class SiteSummary(ContractModel):
    """A site card in the org overview."""

    site_id: Id
    org_id: Id
    name: Label
    timezone: Timezone
    locale: Locale
    currency: Currency
    guests: Count | None
    """Guests now (latest occupancy snapshot); None if no data yet."""
    open_alerts: Count
    """Unresolved alerts."""
    edge_online: bool
    """At least one device sent a heartbeat within ``DEVICE_OFFLINE_AFTER_S``."""


class SiteCreate(ContractModel):
    name: Label
    timezone: Timezone
    locale: Locale = Locale.HE
    currency: Currency = Currency.ILS
    avg_check_per_guest: Money = 0.0


class SiteSettings(ContractModel):
    """``GET /sites/{site_id}``. Thresholds and modules are also part of ``SiteConfig``;
    changing them here bumps ``config_version`` and notifies the edge (``config_changed``)."""

    site_id: Id
    org_id: Id
    name: Label
    timezone: Timezone
    locale: Locale
    currency: Currency
    avg_check_per_guest: Money
    """Average spend per guest, used for ROI estimates."""
    thresholds: Thresholds
    modules: Modules
    floor_plan: list[FloorPlanItem] = Field(default_factory=list)


class SiteSettingsPatch(ContractModel):
    """``PATCH /sites/{site_id}``: omitted fields are unchanged; nested objects are replaced."""

    model_config = ConfigDict(json_schema_serialization_defaults_required=False)

    name: Label | None = None
    timezone: Timezone | None = None
    locale: Locale | None = None
    currency: Currency | None = None
    avg_check_per_guest: Money | None = None
    thresholds: Thresholds | None = None
    modules: Modules | None = None
    floor_plan: list[FloorPlanItem] | None = None


# --------------------------------------------------------------------------- devices and edge


class PairingCodeInfo(ContractModel):
    """A one-time code shown in the dashboard and typed into ``rv-edge pair``."""

    code: str = Field(pattern=PAIRING_CODE_PATTERN)
    """6 characters, ``A-Z`` and ``0-9``."""
    site_id: Id
    expires_at: EpochSeconds


class PairRequest(ContractModel):
    code: str = Field(pattern=PAIRING_CODE_PATTERN)


class PairResponse(ContractModel):
    device_id: Id
    site_id: Id
    token: str = Field(min_length=1)
    """Device bearer token; stored only in the edge's local secrets file."""


class DeviceStatus(ContractModel):
    """An edge device and its latest heartbeat (None fields: no heartbeat yet)."""

    device_id: Id
    version: str | None
    last_seen_at: EpochSeconds | None
    online: bool
    """Heartbeat within ``DEVICE_OFFLINE_AFTER_S``."""
    cameras: list[CameraHealth]
    cpu_pct: NonNegative | None
    mem_mb: NonNegative | None
    outbox_depth: Count | None
    local_url: str | None = None
    """The edge's LAN base URL from its latest heartbeat (e.g. ``http://192.168.1.20:8787``);
    the waiter app links to ``<local_url>/local-alerts`` when the cloud is unreachable. Only
    reachable from the restaurant's network. None if unknown. Since 1.1."""


class EventsAccepted(ContractModel):
    """Response of ``POST /edge/events``. ``accepted + duplicates`` = batch size."""

    accepted: Count
    """Newly stored events."""
    duplicates: Count
    """Events whose ``event_id`` was already stored (ignored, still a success)."""


class CommandKind(StrEnum):
    ALERT_ACK = "alert_ack"
    CONFIG_CHANGED = "config_changed"


class EdgeCommandBase(ContractModel):
    """Fields common to every cloud -> edge command."""

    kind: CommandKind
    command_id: Id
    site_id: Id
    created_at: EpochSeconds


class AlertAckCommand(EdgeCommandBase):
    """An alert was acknowledged in the cloud (waiter app). The edge applies it and emits
    ``alert.acknowledged`` with ``via="cloud"`` and this ``ack_at``."""

    kind: Literal[CommandKind.ALERT_ACK] = CommandKind.ALERT_ACK
    alert_id: Id
    ack_at: EpochSeconds


class ConfigChangedCommand(EdgeCommandBase):
    """The site config changed in the cloud; the edge re-fetches ``GET /edge/config``."""

    kind: Literal[CommandKind.CONFIG_CHANGED] = CommandKind.CONFIG_CHANGED
    config_version: int = Field(ge=0)


EdgeCommand = Annotated[AlertAckCommand | ConfigChangedCommand, Field(discriminator="kind")]
"""Any cloud -> edge command; discriminated on ``kind``."""

EdgeCommandAdapter: TypeAdapter[EdgeCommand] = TypeAdapter(EdgeCommand)


class CommandsPage(ContractModel):
    """``GET /edge/commands?after=<cursor>``: commands created after ``after``, oldest first."""

    cursor: str = Field(min_length=1)
    """Opaque; send as ``after`` on the next poll. Unchanged when there is nothing new."""
    commands: list[EdgeCommand]


# --------------------------------------------------------------------------- live and alerts


class AlertStatus(StrEnum):
    """Derived alert status. ``GET /alerts?status=open`` returns every unresolved alert
    (``open`` and ``acknowledged``)."""

    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"


class AlertView(ContractModel):
    """An alert as shown to staff. Acks carry time and channel only, never a person."""

    alert_id: Id
    site_id: Id
    kind: AlertKind
    severity: AlertSeverity
    status: AlertStatus
    table_id: Id | None
    table_label: Label | None
    """Label of ``table_id`` for display."""
    zone_id: Id | None
    raised_at: EpochSeconds
    acked_at: EpochSeconds | None
    ack_via: AckVia | None
    resolved_at: EpochSeconds | None
    resolve_reason: ResolveReason | None
    condition_since_ts: EpochSeconds | None = None
    """When the underlying condition began (``AlertRaised.condition_since_ts``), e.g. when the
    guests were seated for ``waiter_needed``. Show elapsed time ("waiting 3:20") from here,
    falling back to ``raised_at`` when None. Since 1.1."""


class TableLive(ContractModel):
    table_id: Id
    label: Label
    seats: int = Field(ge=1)
    state: TableState
    guest_count: Count
    since_ts: EpochSeconds | None
    """When the current state really started (backdated to the evidence, see
    ``TableStateChanged.since_ts``; the transition time for 1.0 producers). None if unknown
    (no event yet)."""
    open_alert_ids: list[Id]


class OccupancyLive(ContractModel):
    """Latest ``occupancy.snapshot``."""

    ts: EpochSeconds
    guests: Count
    tables_occupied: Count
    tables_total: Count
    staff_on_floor: Count


class QueueLive(ContractModel):
    """Latest ``queue.snapshot`` of one queue zone."""

    zone_id: Id
    ts: EpochSeconds
    people: Count
    parties_est: Count
    longest_wait_s: Seconds
    avg_wait_s: Seconds


class LiveSnapshot(ContractModel):
    """Live state of one site."""

    site_id: Id
    ts: EpochSeconds
    """When this snapshot was assembled."""
    tables: list[TableLive]
    occupancy: OccupancyLive | None
    queues: list[QueueLive]
    open_alerts: list[AlertView]
    """Unresolved alerts, oldest first."""
    devices: list[DeviceStatus]


LIVE_SNAPSHOT_MESSAGE_TYPE: Final = "live.snapshot"


class LiveSnapshotMessage(ContractModel):
    """WebSocket state message: the full live state, sent alongside ``EdgeEvent`` messages
    (see the module docstring). Replaces the client's cached ``LiveSnapshot``. Since 1.1."""

    type: Literal["live.snapshot"] = LIVE_SNAPSHOT_MESSAGE_TYPE
    snapshot: LiveSnapshot


class WsCloseCode(IntEnum):
    """Close codes of the cloud ``WS /ws`` when it refuses a connection. Since 1.1."""

    BAD_REQUEST = 4400
    """Missing ``token`` or ``site_id``."""
    UNAUTHORIZED = 4401
    """Bad or expired access token: refresh it and reconnect."""
    FORBIDDEN = 4403
    """No access to the site (or it does not exist): do not retry."""


class CoverageReport(ContractModel):
    """Edge ``GET /local/coverage``: tables no camera counts (``SiteConfig.coverage()``)."""

    site_id: Id
    uncovered_table_ids: list[Id]


# --------------------------------------------------------------------------- metrics and reports


class Estimate(ContractModel):
    """A derived figure that the UI must label as an estimate."""

    value: float | None
    """None when there is not enough data."""
    is_estimate: Literal[True] = True


class MetricsSummary(ContractModel):
    """KPIs of one site over ``[from_ts, to_ts)``."""

    site_id: Id
    from_ts: EpochSeconds
    to_ts: EpochSeconds
    currency: Currency
    sessions: Count
    """Table sessions closed in the range."""
    guests_served: Count
    """Sum of ``max_guests`` over those sessions."""
    avg_dwell_s: Seconds | None
    turnover_per_table: NonNegative | None
    """Sessions per table (sessions / number of tables)."""
    waiter_response_p50_s: Seconds | None
    """``waiter_needed`` raised -> resolved, median."""
    waiter_response_p90_s: Seconds | None
    bussing_delay_p50_s: Seconds | None
    queue_avg_wait_s: Seconds | None
    """Mean ``waited_s`` of ``queue.seated``."""
    queue_max_wait_s: Seconds | None
    walkaways: Count
    lost_revenue: Estimate
    """walkaways x party_size_est x avg_check_per_guest."""


class TimeseriesMetric(StrEnum):
    OCCUPANCY = "occupancy"
    """Mean guests in the bucket."""
    QUEUE = "queue"
    """Mean people in queue zones in the bucket."""
    WALKAWAYS = "walkaways"
    """Number of walk-away events in the bucket."""
    RESPONSE_TIME = "response_time"
    """Median ``waiter_needed`` raised -> resolved seconds, by raise time."""
    RESPONSE_TIME_P90 = "response_time_p90"
    """90th percentile ``waiter_needed`` raised -> resolved seconds, by raise time. Since 1.1."""
    QUEUE_WAIT = "queue_wait"
    """Mean wait in seconds of people seated from the queue (``queue.seated`` ``waited_s``) in
    the bucket, by seating time; the per-bucket version of ``MetricsSummary.queue_avg_wait_s``.
    None when nobody was seated from the queue. Since 1.1."""


class Bucket(StrEnum):
    """Time-series bucket width. ``1d`` buckets follow the site's local midnight."""

    MIN_5 = "5m"
    MIN_15 = "15m"
    HOUR_1 = "1h"
    DAY_1 = "1d"


class TimeseriesPoint(ContractModel):
    ts: EpochSeconds
    """Bucket start."""
    value: float | None
    """None when the bucket has no data."""


class Timeseries(ContractModel):
    site_id: Id
    metric: TimeseriesMetric
    bucket: Bucket
    from_ts: EpochSeconds
    to_ts: EpochSeconds
    points: list[TimeseriesPoint]
    """One point per bucket in range, ascending."""


class TableStats(ContractModel):
    """Per-table statistics over a range."""

    table_id: Id
    label: Label
    seats: int = Field(ge=1)
    sessions: Count
    guests: Count
    """Sum of ``max_guests``."""
    avg_dwell_s: Seconds | None
    avg_party_size: NonNegative | None
    first_visit_delay_p50_s: Seconds | None
    bussing_delay_p50_s: Seconds | None


class RoiBlock(ContractModel):
    """ROI figures (architecture 7.4). Everything here is an estimate."""

    is_estimate: Literal[True] = True
    currency: Currency
    avg_check_per_guest: Money
    walkaways: Count
    lost_revenue: Estimate
    """walkaways x party_size_est x avg_check_per_guest."""
    response_time_baseline_p50_s: Seconds | None
    """``waiter_needed`` p50 over the first 7 days after install."""
    response_time_current_p50_s: Seconds | None
    response_time_improvement_s: Estimate
    """baseline p50 - current p50."""
    extra_covers: Estimate
    """Extra guests from faster turns, counted only in hours with a non-empty queue."""
    extra_revenue: Estimate
    """extra_covers x avg_check_per_guest."""


class ShiftReport(ContractModel):
    """``GET /sites/{site_id}/reports/shift?date=YYYY-MM-DD``: one site-local calendar day."""

    site_id: Id
    date: dt.date
    timezone: Timezone
    from_ts: EpochSeconds
    to_ts: EpochSeconds
    summary: MetricsSummary
    tables: list[TableStats]
    occupancy_by_hour: list[TimeseriesPoint]
    roi: RoiBlock


class BranchComparison(ContractModel):
    """``GET /orgs/{org_id}/reports/compare`` (owners): one summary per site."""

    org_id: Id
    from_ts: EpochSeconds
    to_ts: EpochSeconds
    sites: list[MetricsSummary]


# --------------------------------------------------------------------------- push and health


class VapidPublicKey(ContractModel):
    public_key: str
    """URL-safe base64 VAPID application server key."""


class PushKeys(ContractModel):
    p256dh: str = Field(min_length=1)
    auth: str = Field(min_length=1)


class PushSubscriptionIn(ContractModel):
    """``POST /push/subscriptions``. From the browser's ``PushSubscription.toJSON()``:
    ``endpoint`` and ``keys``; ``expirationTime`` is not used."""

    site_id: Id
    endpoint: str = Field(max_length=2048, pattern=r"^https://")
    keys: PushKeys


class PushSubscriptionOut(ContractModel):
    subscription_id: Id
    site_id: Id
    endpoint: str


class AlertPush(ContractModel):
    """Body of a Web Push message, sent for a newly raised alert that is still unresolved
    when its ingest batch completes. Anonymous: no user, no staff identity. Since 1.1."""

    alert_id: Id
    site_id: Id
    kind: AlertKind
    severity: AlertSeverity
    table_label: Label | None
    """Label of the alert's table; None for ``long_queue``."""
    raised_at: EpochSeconds
    condition_since_ts: EpochSeconds | None
    """When the condition began (e.g. guests seated); None if unknown: use ``raised_at``."""


class HealthStatus(ContractModel):
    status: Literal["ok"] = "ok"
    version: str

