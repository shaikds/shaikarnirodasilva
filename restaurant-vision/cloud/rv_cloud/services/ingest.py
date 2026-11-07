"""``POST /edge/events``: idempotent storage plus projection, in one transaction."""

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from rv_contracts import EdgeEvent
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..clock import Clock
from ..db.models import Site
from ..errors import Forbidden
from ..realtime import BrokerMessage, EventBroker
from ..repositories import (
    AlertRepository,
    DevicePrincipal,
    EventRepository,
    ScopedSiteRepository,
)
from ..tenancy import SiteScope
from . import views
from .projections import Projector


@dataclass(frozen=True, slots=True)
class IngestResult:
    accepted: int
    duplicates: int
    push_payloads: list[dict[str, Any]] = field(default_factory=list)
    """One payload per alert raised by this batch and still unresolved after it."""


def broker_message(event: EdgeEvent) -> BrokerMessage:
    return BrokerMessage(
        site_id=event.site_id, event_type=event.type.value, data=event.model_dump_json()
    )


class IngestService:
    def __init__(self, session: Session, clock: Clock, broker: EventBroker | None = None) -> None:
        self._session = session
        self._clock = clock
        self._broker = broker

    def ingest(self, device: DevicePrincipal, events: Sequence[EdgeEvent]) -> IngestResult:
        """Store new events, project them and broadcast them after commit.

        Events already stored (same ``event_id``, also within the batch) count as duplicates.
        A concurrent delivery of the same batch can hit the primary key at commit; the batch
        is then retried once, when those events are duplicates.
        """
        foreign = [e.event_id for e in events if e.site_id != device.site_id]
        if foreign:
            raise Forbidden("Events must belong to the device's site")
        try:
            return self._ingest_once(device, events)
        except IntegrityError:
            self._session.rollback()
            return self._ingest_once(device, events)

    def _ingest_once(self, device: DevicePrincipal, events: Sequence[EdgeEvent]) -> IngestResult:
        scope = SiteScope(org_id=device.org_id, site_id=device.site_id)
        repo = EventRepository(self._session, scope)
        known = repo.known_ids(e.event_id for e in events)
        fresh: list[EdgeEvent] = []
        seen: set[str] = set()
        for event in events:
            if event.event_id in known or event.event_id in seen:
                continue
            seen.add(event.event_id)
            fresh.append(event)
        duplicates = len(events) - len(fresh)
        if not fresh:
            return IngestResult(accepted=0, duplicates=duplicates)

        now = self._clock.now()
        repo.add(fresh, received_at=now, device_id=device.device_id)
        site = ScopedSiteRepository(self._session, scope).get()
        earliest = min(e.ts for e in fresh)
        if site.first_event_ts is None or earliest < site.first_event_ts:
            site.first_event_ts = earliest

        ordered = sorted(fresh, key=lambda e: e.ts)  # stable: batch order breaks ties
        projector = Projector(self._session, scope, device_id=device.device_id, now=now)
        for event in ordered:
            projector.apply(event)
        self._session.flush()

        payloads = self._push_payloads(scope, projector.raised_alert_ids, site)
        self._session.commit()

        if self._broker is not None:
            for event in ordered:
                self._broker.publish(broker_message(event))
        return IngestResult(accepted=len(fresh), duplicates=duplicates, push_payloads=payloads)

    def _push_payloads(
        self, scope: SiteScope, alert_ids: Sequence[str], site: Site
    ) -> list[dict[str, Any]]:
        """Push payloads (no PII) for raised alerts still unresolved after the batch."""
        if not alert_ids:
            return []
        labels = views.table_labels(views.load_config(site))
        alerts = AlertRepository(self._session, scope)
        payloads: list[dict[str, Any]] = []
        for alert_id in alert_ids:
            alert = alerts.get(alert_id)
            if alert is None or alert.resolved_at is not None:
                continue
            payloads.append(
                {
                    "alert_id": alert.alert_id,
                    "site_id": alert.site_id,
                    "kind": alert.kind,
                    "table_label": labels.get(alert.table_id) if alert.table_id else None,
                    "raised_at": alert.raised_at,
                }
            )
        return payloads
