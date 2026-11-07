"""Raw edge events of one site."""

from collections.abc import Iterable, Sequence

from rv_contracts import EdgeEvent
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db.models import Event
from ..tenancy import SiteScope


class EventRepository:
    def __init__(self, session: Session, scope: SiteScope) -> None:
        self._session = session
        self._scope = scope

    def known_ids(self, event_ids: Iterable[str]) -> set[str]:
        """Which of ``event_ids`` are already stored. ``event_id`` is the global primary key
        (UUIDv7), so this existence check spans all sites; it returns ids only, never data."""
        ids = list(set(event_ids))
        if not ids:
            return set()
        return set(self._session.scalars(select(Event.event_id).where(Event.event_id.in_(ids))))

    def add(self, events: Sequence[EdgeEvent], *, received_at: float, device_id: str) -> None:
        self._session.add_all(
            Event(
                event_id=event.event_id,
                site_id=self._scope.site_id,
                type=event.type.value,
                ts=event.ts,
                payload_json=event.model_dump(mode="json"),
                received_at=received_at,
                device_id=device_id,
            )
            for event in events
        )
        self._session.flush()
