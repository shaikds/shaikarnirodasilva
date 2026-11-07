"""Live view (``GET /sites/{id}/live``), alert listing and cloud acknowledgements."""

from collections import defaultdict

from rv_contracts import (
    AckVia,
    AlertAcknowledged,
    AlertView,
    CommandKind,
    LiveSnapshot,
    OccupancyLive,
    QueueLive,
    TableLive,
    TableState,
    make_event,
)
from sqlalchemy.orm import Session

from ..clock import Clock
from ..errors import NotFound
from ..realtime import EventBroker
from ..repositories import (
    AlertRepository,
    CommandRepository,
    OrgAlertRepository,
    QueueRepository,
    ScopedSiteRepository,
    SiteRepository,
    SnapshotRepository,
    TableRepository,
)
from ..tenancy import SiteScope
from . import views
from .auth import CurrentUser
from .devices import DeviceService
from .ingest import broker_message


class LiveService:
    def __init__(self, session: Session, clock: Clock) -> None:
        self._session = session
        self._clock = clock

    def snapshot(self, scope: SiteScope) -> LiveSnapshot:
        site = ScopedSiteRepository(self._session, scope).get()
        config = views.load_config(site)
        labels = views.table_labels(config)
        open_alerts = AlertRepository(self._session, scope).list(open_only=True)
        alerts_by_table: dict[str, list[str]] = defaultdict(list)
        for alert in open_alerts:
            if alert.table_id is not None:
                alerts_by_table[alert.table_id].append(alert.alert_id)
        states = TableRepository(self._session, scope).states()
        tables = []
        for table in config.tables:
            state = states.get(table.table_id)
            tables.append(
                TableLive(
                    table_id=table.table_id,
                    label=table.label,
                    seats=table.seats,
                    state=TableState(state.state) if state else TableState.EMPTY,
                    guest_count=state.guest_count if state else 0,
                    since_ts=state.since_ts if state else None,
                    open_alert_ids=alerts_by_table.get(table.table_id, []),
                )
            )
        occ = SnapshotRepository(self._session, scope).occupancy_latest()
        occupancy = (
            OccupancyLive(
                ts=occ.ts,
                guests=occ.guests,
                tables_occupied=occ.tables_occupied,
                tables_total=occ.tables_total,
                staff_on_floor=occ.staff_on_floor,
            )
            if occ is not None
            else None
        )
        queues = [
            QueueLive(
                zone_id=q.zone_id,
                ts=q.ts,
                people=q.people,
                parties_est=q.parties_est,
                longest_wait_s=q.longest_wait_s,
                avg_wait_s=q.avg_wait_s,
            )
            for q in QueueRepository(self._session, scope).latest()
        ]
        return LiveSnapshot(
            site_id=scope.site_id,
            ts=self._clock.now(),
            tables=tables,
            occupancy=occupancy,
            queues=queues,
            open_alerts=[views.alert_view(a, labels) for a in open_alerts],
            devices=DeviceService(self._session, self._clock).statuses(scope),
        )


class AlertService:
    def __init__(self, session: Session, clock: Clock, broker: EventBroker | None = None) -> None:
        self._session = session
        self._clock = clock
        self._broker = broker

    def list(
        self,
        scope: SiteScope,
        *,
        open_only: bool,
        from_ts: float | None,
        to_ts: float | None,
        limit: int = 1000,
    ) -> list[AlertView]:
        site = ScopedSiteRepository(self._session, scope).get()
        labels = views.table_labels(views.load_config(site))
        rows = AlertRepository(self._session, scope).list(
            open_only=open_only, from_ts=from_ts, to_ts=to_ts, limit=limit
        )
        return [views.alert_view(a, labels) for a in rows]

    def ack(self, user: CurrentUser, alert_id: str) -> AlertView:
        """ "On it": record time and channel (never who), queue an ``alert_ack`` command for
        the edge and broadcast an ``alert.acknowledged`` event. Idempotent: acking an already
        acknowledged or resolved alert returns it unchanged."""
        site_ids = SiteRepository(self._session, user.scope).accessible_site_ids()
        alert = OrgAlertRepository(self._session, user.org_id, site_ids).find(alert_id)
        if alert is None:
            raise NotFound("Alert not found")
        scope = SiteScope(org_id=user.org_id, site_id=alert.site_id)
        event = None
        if alert.acked_at is None and alert.resolved_at is None:
            now = self._clock.now()
            alert.acked_at = now
            alert.ack_via = AckVia.CLOUD.value
            CommandRepository(self._session, scope).append(
                CommandKind.ALERT_ACK.value, {"alert_id": alert.alert_id, "ack_at": now}, now
            )
            event = make_event(
                AlertAcknowledged,
                alert.site_id,
                now,
                alert_id=alert.alert_id,
                ack_at=now,
                via=AckVia.CLOUD,
            )
        site = ScopedSiteRepository(self._session, scope).get()
        labels = views.table_labels(views.load_config(site))
        self._session.commit()
        if event is not None and self._broker is not None:
            self._broker.publish(broker_message(event))
        return views.alert_view(alert, labels)
