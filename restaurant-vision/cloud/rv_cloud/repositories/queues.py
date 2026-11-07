"""Queue facts, snapshots and the latest occupancy/queue state of one site."""

from collections.abc import Sequence
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db.models import MetricSnapshot, OccupancyLatest, QueueEvent, QueueLatest
from ..tenancy import SiteScope

SNAPSHOT_OCCUPANCY = "occupancy"
SNAPSHOT_QUEUE = "queue"
QUEUE_SEATED = "seated"
QUEUE_WALKAWAY = "walkaway"


class QueueRepository:
    """``queue.seated`` / ``queue.walkaway`` facts and latest queue snapshots."""

    def __init__(self, session: Session, scope: SiteScope) -> None:
        self._session = session
        self._scope = scope

    def add_event(
        self,
        *,
        event_id: str,
        zone_id: str,
        kind: str,
        ts: float,
        waited_s: float,
        party_size_est: int | None,
    ) -> None:
        self._session.add(
            QueueEvent(
                event_id=event_id,
                site_id=self._scope.site_id,
                zone_id=zone_id,
                kind=kind,
                ts=ts,
                waited_s=waited_s,
                party_size_est=party_size_est,
            )
        )

    def events(self, from_ts: float, to_ts: float, kind: str | None = None) -> Sequence[QueueEvent]:
        query = select(QueueEvent).where(
            QueueEvent.site_id == self._scope.site_id,
            QueueEvent.ts >= from_ts,
            QueueEvent.ts < to_ts,
        )
        if kind is not None:
            query = query.where(QueueEvent.kind == kind)
        return self._session.scalars(query.order_by(QueueEvent.ts)).all()

    def latest(self) -> Sequence[QueueLatest]:
        return self._session.scalars(
            select(QueueLatest)
            .where(QueueLatest.site_id == self._scope.site_id)
            .order_by(QueueLatest.zone_id)
        ).all()

    def set_latest(
        self,
        zone_id: str,
        *,
        ts: float,
        people: int,
        parties_est: int,
        longest_wait_s: float,
        avg_wait_s: float,
    ) -> None:
        row = self._session.get(QueueLatest, (self._scope.site_id, zone_id))
        if row is None:
            row = QueueLatest(site_id=self._scope.site_id, zone_id=zone_id)
            self._session.add(row)
        elif row.ts > ts:
            return
        row.ts = ts
        row.people = people
        row.parties_est = parties_est
        row.longest_wait_s = longest_wait_s
        row.avg_wait_s = avg_wait_s


class SnapshotRepository:
    """Every occupancy/queue snapshot (time series) and the latest occupancy."""

    def __init__(self, session: Session, scope: SiteScope) -> None:
        self._session = session
        self._scope = scope

    def add(
        self, *, kind: str, ts: float, value: float, zone_id: str | None, payload: dict[str, Any]
    ) -> None:
        self._session.add(
            MetricSnapshot(
                site_id=self._scope.site_id,
                kind=kind,
                ts=ts,
                value=value,
                zone_id=zone_id,
                payload=payload,
            )
        )

    def between(
        self, kind: str, from_ts: float, to_ts: float
    ) -> Sequence[tuple[float, float, str | None]]:
        """``(ts, value, zone_id)`` rows of ``kind`` in ``[from_ts, to_ts)``, by time."""
        rows = self._session.execute(
            select(MetricSnapshot.ts, MetricSnapshot.value, MetricSnapshot.zone_id)
            .where(
                MetricSnapshot.site_id == self._scope.site_id,
                MetricSnapshot.kind == kind,
                MetricSnapshot.ts >= from_ts,
                MetricSnapshot.ts < to_ts,
            )
            .order_by(MetricSnapshot.ts)
        ).all()
        return [(float(r[0]), float(r[1]), r[2]) for r in rows]

    def occupancy_latest(self) -> OccupancyLatest | None:
        return self._session.get(OccupancyLatest, self._scope.site_id)

    def set_occupancy_latest(
        self, *, ts: float, guests: int, tables_occupied: int, tables_total: int, staff: int
    ) -> None:
        row = self.occupancy_latest()
        if row is None:
            row = OccupancyLatest(site_id=self._scope.site_id)
            self._session.add(row)
        elif row.ts > ts:
            return
        row.ts = ts
        row.guests = guests
        row.tables_occupied = tables_occupied
        row.tables_total = tables_total
        row.staff_on_floor = staff
