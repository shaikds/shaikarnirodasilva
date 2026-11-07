"""Cloud -> edge commands of one site."""

from collections.abc import Sequence
from typing import Any

from rv_contracts import new_uuid7
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db.models import Command
from ..tenancy import SiteScope
from .sites import ScopedSiteRepository


class CommandRepository:
    def __init__(self, session: Session, scope: SiteScope) -> None:
        self._session = session
        self._scope = scope

    def append(self, kind: str, payload: dict[str, Any], now: float) -> Command:
        """Append a command with the next per-site ``seq``.

        The site row is locked (``SELECT ... FOR UPDATE`` on Postgres; SQLite serializes
        writers) while ``command_seq`` is incremented, so concurrent writers commit their
        commands in ``seq`` order and a poller never skips one.
        """
        site = ScopedSiteRepository(self._session, self._scope).get(for_update=True)
        site.command_seq += 1
        command = Command(
            command_id=new_uuid7(),
            site_id=self._scope.site_id,
            seq=site.command_seq,
            kind=kind,
            payload_json=payload,
            created_at=now,
        )
        self._session.add(command)
        self._session.flush()
        return command

    def after(self, seq: int, limit: int) -> Sequence[Command]:
        return self._session.scalars(
            select(Command)
            .where(Command.site_id == self._scope.site_id, Command.seq > seq)
            .order_by(Command.seq)
            .limit(limit)
        ).all()

    def last_seq(self) -> int:
        return ScopedSiteRepository(self._session, self._scope).get().command_seq
