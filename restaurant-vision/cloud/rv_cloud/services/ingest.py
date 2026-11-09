"""``POST /edge/events``: idempotent storage plus projection, in one transaction.

Idempotency holds across retention: raw events are kept ``raw_retention_days`` after they were
*received*, and an event whose ``ts`` is older than that window is treated as already
processed (a duplicate, never projected), so an at-least-once redelivery of an old batch can
neither double count nor fail. Derived rows are idempotent on ``event_id`` as well.
"""

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from rv_contracts import AlertKind, AlertPush, AlertSeverity, EdgeEvent
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..clock import Clock
from ..db.models import Site
from ..errors import InvalidInput
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

DAY_S = 86400.0


@dataclass(frozen=True, slots=True)
class IngestResult:
    accepted: int
    duplicates: int
    push_payloads: list[dict[str, Any]] = field(default_factory=list)
    """One ``AlertPush`` (as JSON-safe dict) per alert raised by this batch and still
    unresolved after it."""


def broker_message(event: EdgeEvent) -> BrokerMessage:
    return BrokerMessage(
        site_id=event.site_id, event_type=event.type.value, data=event.model_dump_json()
    )


class IngestService:
    def __init__(
        self,
        session: Session,
        clock: Clock,
        broker: EventBroker | None = None,
        *,
        max_future_s: float | None = None,
        raw_retention_days: float | None = None,
    ) -> None:
        """``max_future_s``: reject a batch with an event ``ts`` further ahead of the server
        clock (None or 0: no limit, e.g. sped-up demos). ``raw_retention_days``: events with an
        older ``ts`` count as duplicates."""
        self._session = session
        self._clock = clock
        self._broker = broker
        self._max_future_s = max_future_s or None
        self._raw_retention_s = raw_retention_days * DAY_S if raw_retention_days else None

    def ingest(self, device: DevicePrincipal, events: Sequence[EdgeEvent]) -> IngestResult:
        """Store new events, project them and broadcast them after commit.

        Events already stored (same ``event_id``, also within the batch) count as duplicates.
        A concurrent delivery of the same batch can hit the primary key at commit; the batch
        is then retried once, when those events are duplicates.
        """
        foreign = [e.event_id for e in events if e.site_id != device.site_id]
        if foreign:
            # 422, not 403: distinct from auth failures (401 = unknown/revoked device token).
            raise InvalidInput(
                f"{len(foreign)} event(s) carry a site_id other than the device's site"
            )
        if self._max_future_s is not None:
            limit = self._clock.now() + self._max_future_s
            future = [e.event_id for e in events if e.ts > limit]
            if future:
                # 422 so the edge isolates and dead-letters the event (a wrong device clock)
                # instead of retrying forever; accepting it would freeze the "latest" rows.
                raise InvalidInput(
                    f"{len(future)} event(s) have a ts more than {self._max_future_s:g} s "
                    "ahead of the server clock"
                )
        try:
            return self._ingest_once(device, events)
        except IntegrityError:
            self._session.rollback()
            return self._ingest_once(device, events)

    def _ingest_once(self, device: DevicePrincipal, events: Sequence[EdgeEvent]) -> IngestResult:
        scope = SiteScope(org_id=device.org_id, site_id=device.site_id)
        repo = EventRepository(self._session, scope)
        now = self._clock.now()
        # Older than the raw-event window: its raw row may already be gone, so it can no
        # longer be told apart from a redelivery. Treat it as processed.
        expired_before = now - self._raw_retention_s if self._raw_retention_s else None
        known = repo.known_ids(e.event_id for e in events)
        fresh: list[EdgeEvent] = []
        seen: set[str] = set()
        for event in events:
            if event.event_id in known or event.event_id in seen:
                continue
            seen.add(event.event_id)
            if expired_before is not None and event.ts < expired_before:
                continue
            fresh.append(event)
        duplicates = len(events) - len(fresh)
        if not fresh:
            return IngestResult(accepted=0, duplicates=duplicates)

        repo.add(fresh, received_at=now, device_id=device.device_id)
        site = ScopedSiteRepository(self._session, scope).get()
        earliest = min(e.ts for e in fresh)
        if site.first_event_ts is None or earliest < site.first_event_ts:
            site.first_event_ts = earliest

        ordered = sorted(fresh, key=lambda e: e.ts)  # stable: batch order breaks ties
        projector = Projector(
            self._session,
            scope,
            device_id=device.device_id,
            now=now,
            max_future_s=self._max_future_s,
        )
        for event in ordered:
            projector.apply(event)
        self._session.flush()

        payloads = self._push_payloads(scope, projector.raised_alert_ids, site)
        self._session.commit()

        if self._broker is not None:
            for event in [*ordered, *projector.broadcasts]:
                self._broker.publish(broker_message(event))
        return IngestResult(accepted=len(fresh), duplicates=duplicates, push_payloads=payloads)

    def _push_payloads(
        self, scope: SiteScope, alert_ids: Sequence[str], site: Site
    ) -> list[dict[str, Any]]:
        """``AlertPush`` payloads (no PII) for raised alerts still unresolved after the
        batch."""
        if not alert_ids:
            return []
        labels = views.table_labels(views.load_config(site))
        alerts = AlertRepository(self._session, scope)
        payloads: list[dict[str, Any]] = []
        for alert_id in alert_ids:
            alert = alerts.get(alert_id)
            if alert is None or alert.resolved_at is not None:
                continue
            push = AlertPush(
                alert_id=alert.alert_id,
                site_id=alert.site_id,
                kind=AlertKind(alert.kind),
                severity=AlertSeverity(alert.severity),
                table_label=labels.get(alert.table_id) if alert.table_id else None,
                raised_at=alert.raised_at,
                condition_since_ts=alert.condition_since_ts,
            )
            payloads.append(push.model_dump(mode="json"))
        return payloads
