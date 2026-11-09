"""Table state and table sessions of one site."""

from collections.abc import Collection, Sequence

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..db.models import TableSession, TableStateCurrent
from ..tenancy import SiteScope
from .queues import replaces


class TableRepository:
    def __init__(self, session: Session, scope: SiteScope) -> None:
        self._session = session
        self._scope = scope

    # ------------------------------------------------------------------ current state

    def states(self) -> dict[str, TableStateCurrent]:
        rows = self._session.scalars(
            select(TableStateCurrent).where(TableStateCurrent.site_id == self._scope.site_id)
        )
        return {row.table_id: row for row in rows}

    def get_state(self, table_id: str) -> TableStateCurrent | None:
        return self._session.get(TableStateCurrent, (self._scope.site_id, table_id))

    def set_state(
        self,
        table_id: str,
        *,
        state: str,
        guest_count: int,
        session_id: str,
        since_ts: float,
        changed_at: float,
        future_limit: float | None = None,
    ) -> bool:
        """Record a transition unless a later one is already stored. True if applied.

        Transitions are ordered by ``changed_at`` (the event ``ts``); ``since_ts`` is the
        backdated start of the state, for display. A stored transition beyond
        ``future_limit`` (a wrong device clock) never blocks a newer one."""
        row = self.get_state(table_id)
        if row is None:
            row = TableStateCurrent(site_id=self._scope.site_id, table_id=table_id)
            self._session.add(row)
        else:
            stored = row.changed_at if row.changed_at is not None else row.since_ts
            if not replaces(stored, changed_at, future_limit):
                return False
        row.state = state
        row.guest_count = guest_count
        row.session_id = session_id
        row.since_ts = since_ts
        row.changed_at = changed_at
        return True

    def prune_states(self, keep_table_ids: Collection[str]) -> int:
        """Delete current-state rows of tables not in ``keep_table_ids`` (removed from config)."""
        query = delete(TableStateCurrent).where(TableStateCurrent.site_id == self._scope.site_id)
        if keep_table_ids:
            query = query.where(TableStateCurrent.table_id.not_in(list(keep_table_ids)))
        result = self._session.execute(query.execution_options(synchronize_session="fetch"))
        return int(getattr(result, "rowcount", 0) or 0)

    # ------------------------------------------------------------------ sessions

    def get_or_create_session(self, session_id: str, table_id: str) -> TableSession:
        row = self._session.get(TableSession, (self._scope.site_id, session_id))
        if row is None:
            row = TableSession(
                site_id=self._scope.site_id, session_id=session_id, table_id=table_id
            )
            self._session.add(row)
        return row

    def closed_sessions(self, from_ts: float, to_ts: float) -> Sequence[TableSession]:
        """Sessions whose guests left in ``[from_ts, to_ts)``."""
        return self._session.scalars(
            select(TableSession)
            .where(
                TableSession.site_id == self._scope.site_id,
                TableSession.left_at >= from_ts,
                TableSession.left_at < to_ts,
                TableSession.seated_at.is_not(None),
            )
            .order_by(TableSession.left_at)
        ).all()
