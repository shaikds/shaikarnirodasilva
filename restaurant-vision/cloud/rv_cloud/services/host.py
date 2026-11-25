"""Host view (``GET /sites/{id}/host``, contracts 1.3): which table frees up next.

Prediction: :mod:`rv_cloud.metrics.host`. Ordering: free tables first (config order), then
``needs_bussing`` (longest waiting first), then occupied tables by ``expected_free_at``.
"""

from rv_contracts import Confidence, HostQueue, HostTable, HostView, TableState
from sqlalchemy.orm import Session

from ..clock import Clock
from ..metrics.host import HISTORY_DAYS, DwellModel, predict_free_at
from ..repositories import QueueRepository, ScopedSiteRepository, TableRepository
from ..tenancy import SiteScope
from . import views
from .metrics import MetricsService

_OCCUPIED = (TableState.SEATED, TableState.ATTENDED)


class HostService:
    def __init__(self, session: Session, clock: Clock) -> None:
        self._session = session
        self._clock = clock

    def view(self, scope: SiteScope) -> HostView:
        now = self._clock.now()
        site = ScopedSiteRepository(self._session, scope).get()
        config = views.load_config(site)
        repo = TableRepository(self._session, scope)
        states = repo.states()
        sessions = repo.sessions(
            {s.session_id for s in states.values() if s.session_id and s.state != "empty"}
        )
        history = MetricsService(self._session, self._clock).closed_sessions(
            scope, now - HISTORY_DAYS * 86400.0, now
        )
        model = DwellModel.from_sessions(history)

        free: list[HostTable] = []
        bussing: list[tuple[float, HostTable]] = []
        occupied: list[HostTable] = []
        for table in config.tables:
            row = states.get(table.table_id)
            state = TableState(row.state) if row is not None else TableState.EMPTY
            guests = row.guest_count if row is not None else 0
            seated_since: float | None = None
            expected: float | None = None
            confidence = Confidence.HIGH
            if row is not None and state in _OCCUPIED:
                session = sessions.get(row.session_id or "")
                seated_since = session.seated_at if session is not None else None
                if seated_since is None:
                    seated_since = row.since_ts
                expected, confidence = predict_free_at(model, seated_since, guests, now)
            item = HostTable(
                table_id=table.table_id,
                label=table.label,
                seats=table.seats,
                state=state,
                guest_count=guests,
                seated_since=seated_since,
                expected_free_at=expected,
                confidence=confidence,
            )
            if state is TableState.EMPTY:
                free.append(item)
            elif state is TableState.NEEDS_BUSSING:
                bussing.append((row.since_ts if row is not None else now, item))
            else:
                occupied.append(item)
        bussing.sort(key=lambda pair: pair[0])
        occupied.sort(key=lambda t: (t.expected_free_at or 0.0, t.label))
        waiting = [t for _, t in bussing] + occupied
        return HostView(
            site_id=scope.site_id,
            ts=now,
            queue=self._queue(scope, views.queue_zone_ids(config)),
            free_tables=len(free),
            next_free=waiting[0] if waiting else None,
            tables=free + waiting,
        )

    def _queue(self, scope: SiteScope, zone_ids: set[str]) -> HostQueue:
        rows = [q for q in QueueRepository(self._session, scope).latest() if q.zone_id in zone_ids]
        return HostQueue(
            people=sum(q.people for q in rows),
            parties_est=sum(q.parties_est for q in rows),
            longest_wait_s=max((q.longest_wait_s for q in rows), default=0.0),
        )
