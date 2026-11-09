"""Projection of edge events into read models, inside the ingest transaction.

Rules (robust to retries and to old events arriving late):

* ``table.state_changed``: current state is replaced only by a transition with a later ``ts``;
  the stored ``since_ts`` is the backdated start (``since_ts``, contracts 1.1; ``ts`` for 1.0
  producers). ``empty -> seated`` opens the session (``seated_at``); ``needs_bussing -> empty``
  records ``bussed_at`` and, once ``left_at`` is known, ``bussing_delay_s = bussed_at -
  left_at``.
* ``table.session_closed``: fills the session; a producer-supplied ``bussing_delay_s`` wins.
* Alerts: raise once per ``alert_id`` (with ``condition_since_ts``); the earliest
  acknowledgement wins (time and channel only); the first resolution wins. Acks/resolutions
  of unknown alerts are ignored.
* Queue facts are appended and occupancy/queue snapshots are appended for time series, once per
  ``event_id`` (a redelivery whose raw event is already gone never inserts twice); snapshots
  replace the "latest" rows only when newer.
* "Latest" rows (table state, occupancy, queue, device health) are ordered by edge ``ts``, but a
  stored row whose ``ts`` is beyond the accepted future skew (``max_future_s``, written by a
  device with a wrong clock before such events were rejected) never blocks a newer event.
* ``edge.heartbeat`` updates the sending device: its health and ``local_url`` (if newer) and
  ``last_seen_at`` (cloud receive time). A newer ``started_at`` (contracts 1.2) means the edge
  restarted and lost its in-memory alerts and table states: the site's open alerts raised
  before it are resolved (``expired``) and table states changed before it are reset to
  ``empty``. These changes are collected in :attr:`Projector.broadcasts` (cloud-generated
  ``alert.resolved`` / ``table.state_changed`` events for live clients).
"""

import logging

from rv_contracts import (
    AlertAcknowledged,
    AlertRaised,
    AlertResolved,
    EdgeEvent,
    EdgeHeartbeat,
    OccupancySnapshot,
    QueueSeated,
    QueueSnapshot,
    QueueWalkaway,
    ResolveReason,
    TableSessionClosed,
    TableState,
    TableStateChanged,
    make_event,
    new_uuid7,
)
from sqlalchemy.orm import Session

from ..db.models import Alert
from ..repositories import (
    AlertRepository,
    DeviceRepository,
    QueueRepository,
    SnapshotRepository,
    TableRepository,
)
from ..repositories.queues import (
    QUEUE_SEATED,
    QUEUE_WALKAWAY,
    SNAPSHOT_OCCUPANCY,
    SNAPSHOT_QUEUE,
)
from ..tenancy import SiteScope

log = logging.getLogger(__name__)


class Projector:
    """Applies events of one site; collects the ids of newly raised alerts."""

    def __init__(
        self,
        session: Session,
        scope: SiteScope,
        *,
        device_id: str,
        now: float,
        max_future_s: float | None = None,
    ) -> None:
        self._tables = TableRepository(session, scope)
        self._alerts = AlertRepository(session, scope)
        self._queues = QueueRepository(session, scope)
        self._snapshots = SnapshotRepository(session, scope)
        self._devices = DeviceRepository(session, scope)
        self._device_id = device_id
        self._now = now
        self._future_limit = now + max_future_s if max_future_s is not None else None
        """Stored "latest" rows with a ``ts`` beyond this are invalid and always replaced."""
        self._site_id = scope.site_id
        self.raised_alert_ids: list[str] = []
        self.broadcasts: list[EdgeEvent] = []
        """Cloud-generated events to broadcast after commit (edge restart clean-up)."""

    def apply(self, event: EdgeEvent) -> None:
        match event:
            case TableStateChanged():
                self._table_state_changed(event)
            case TableSessionClosed():
                self._session_closed(event)
            case AlertRaised():
                self._alert_raised(event)
            case AlertAcknowledged():
                self._alert_acknowledged(event)
            case AlertResolved():
                self._alert_resolved(event)
            case QueueSnapshot():
                self._queue_snapshot(event)
            case QueueSeated():
                self._queues.add_event(
                    event_id=event.event_id,
                    zone_id=event.zone_id,
                    kind=QUEUE_SEATED,
                    ts=event.ts,
                    waited_s=event.waited_s,
                    party_size_est=None,
                )
            case QueueWalkaway():
                self._queues.add_event(
                    event_id=event.event_id,
                    zone_id=event.zone_id,
                    kind=QUEUE_WALKAWAY,
                    ts=event.ts,
                    waited_s=event.waited_s,
                    party_size_est=event.party_size_est,
                )
            case OccupancySnapshot():
                self._occupancy_snapshot(event)
            case EdgeHeartbeat():
                self._heartbeat(event)

    # ------------------------------------------------------------------ tables

    def _table_state_changed(self, e: TableStateChanged) -> None:
        since = e.since_ts if e.since_ts is not None else e.ts
        self._tables.set_state(
            e.table_id,
            state=e.to_state.value,
            guest_count=e.guest_count,
            session_id=e.session_id,
            since_ts=since,
            changed_at=e.ts,
            future_limit=self._future_limit,
        )
        if e.from_state is TableState.EMPTY and e.to_state is TableState.SEATED:
            session = self._tables.get_or_create_session(e.session_id, e.table_id)
            if session.seated_at is None:
                session.seated_at = since
        elif e.from_state is TableState.NEEDS_BUSSING and e.to_state is TableState.EMPTY:
            session = self._tables.get_or_create_session(e.session_id, e.table_id)
            if session.bussed_at is None:
                session.bussed_at = since
            if session.bussing_delay_s is None and session.left_at is not None:
                session.bussing_delay_s = max(0.0, since - session.left_at)

    def _session_closed(self, e: TableSessionClosed) -> None:
        session = self._tables.get_or_create_session(e.session_id, e.table_id)
        session.table_id = e.table_id
        session.seated_at = e.seated_at
        session.left_at = e.left_at
        session.max_guests = e.max_guests
        session.first_visit_delay_s = e.first_visit_delay_s
        session.visits = e.visits
        if e.bussing_delay_s is not None:
            session.bussing_delay_s = e.bussing_delay_s
        elif session.bussed_at is not None and session.bussing_delay_s is None:
            session.bussing_delay_s = max(0.0, session.bussed_at - e.left_at)

    # ------------------------------------------------------------------ alerts

    def _alert_raised(self, e: AlertRaised) -> None:
        if self._alerts.get(e.alert_id) is not None:
            return
        self._alerts.add(
            Alert(
                alert_id=e.alert_id,
                kind=e.kind.value,
                severity=e.severity.value,
                table_id=e.table_id,
                zone_id=e.zone_id,
                raised_at=e.ts,
                condition_since_ts=e.condition_since_ts,
            )
        )
        self.raised_alert_ids.append(e.alert_id)

    def _alert_acknowledged(self, e: AlertAcknowledged) -> None:
        alert = self._alerts.get(e.alert_id)
        if alert is None:
            log.warning("ack for unknown alert ignored", extra={"alert_id": e.alert_id})
            return
        if alert.acked_at is None or e.ack_at < alert.acked_at:
            alert.acked_at = e.ack_at
            alert.ack_via = e.via.value

    def _alert_resolved(self, e: AlertResolved) -> None:
        alert = self._alerts.get(e.alert_id)
        if alert is None:
            log.warning("resolution of unknown alert ignored", extra={"alert_id": e.alert_id})
            return
        if alert.resolved_at is None:
            alert.resolved_at = e.resolved_at
            alert.resolve_reason = e.reason.value

    # ------------------------------------------------------------------ queue / occupancy

    def _queue_snapshot(self, e: QueueSnapshot) -> None:
        self._snapshots.add(
            event_id=e.event_id,
            kind=SNAPSHOT_QUEUE,
            ts=e.ts,
            value=float(e.people),
            zone_id=e.zone_id,
            payload=e.model_dump(
                mode="json", include={"people", "parties_est", "longest_wait_s", "avg_wait_s"}
            ),
        )
        self._queues.set_latest(
            e.zone_id,
            ts=e.ts,
            people=e.people,
            parties_est=e.parties_est,
            longest_wait_s=e.longest_wait_s,
            avg_wait_s=e.avg_wait_s,
            future_limit=self._future_limit,
        )

    def _occupancy_snapshot(self, e: OccupancySnapshot) -> None:
        self._snapshots.add(
            event_id=e.event_id,
            kind=SNAPSHOT_OCCUPANCY,
            ts=e.ts,
            value=float(e.guests),
            zone_id=None,
            payload=e.model_dump(
                mode="json", include={"guests", "tables_occupied", "tables_total", "staff_on_floor"}
            ),
        )
        self._snapshots.set_occupancy_latest(
            ts=e.ts,
            guests=e.guests,
            tables_occupied=e.tables_occupied,
            tables_total=e.tables_total,
            staff=e.staff_on_floor,
            future_limit=self._future_limit,
        )

    # ------------------------------------------------------------------ devices

    def _heartbeat(self, e: EdgeHeartbeat) -> None:
        device = self._devices.get(self._device_id)
        if device is None:  # unpaired between authentication and projection
            return
        self._devices.upsert_health(
            device.id,
            ts=e.ts,
            version=e.version,
            cameras=[c.model_dump(mode="json") for c in e.cameras],
            cpu_pct=e.cpu_pct,
            mem_mb=e.mem_mb,
            outbox_depth=e.outbox_depth,
            local_url=e.local_url,
            future_limit=self._future_limit,
        )
        device.version = e.version
        if device.last_seen_at is None or device.last_seen_at < self._now:
            device.last_seen_at = self._now
        if e.started_at is not None and (
            device.started_at is None or e.started_at > device.started_at
        ):
            device.started_at = e.started_at
            pass  # disabled

    def _edge_restarted(self, started_at: float) -> None:
        """The edge (re)started at ``started_at`` without the alerts and table states it held
        in memory: nothing will ever resolve or update those, so expire and reset them."""
        for alert in self._alerts.list(open_only=True, to_ts=started_at, limit=100_000):
            alert.resolved_at = started_at
            alert.resolve_reason = ResolveReason.EXPIRED.value
            self.broadcasts.append(
                make_event(
                    AlertResolved,
                    self._site_id,
                    started_at,
                    alert_id=alert.alert_id,
                    resolved_at=started_at,
                    reason=ResolveReason.EXPIRED,
                )
            )
        for row in self._tables.states().values():
            changed = row.changed_at if row.changed_at is not None else row.since_ts
            if changed >= started_at:
                continue
            previous = TableState(row.state)
            session_id = row.session_id
            # changed_at = started_at also keeps late events from before the restart out.
            row.state, row.guest_count, row.session_id = TableState.EMPTY.value, 0, None
            row.since_ts = row.changed_at = started_at
            if previous is not TableState.EMPTY:
                self.broadcasts.append(
                    make_event(
                        TableStateChanged,
                        self._site_id,
                        started_at,
                        table_id=row.table_id,
                        from_state=previous,
                        to_state=TableState.EMPTY,
                        guest_count=0,
                        session_id=session_id or new_uuid7(),
                        since_ts=started_at,
                    )
                )
