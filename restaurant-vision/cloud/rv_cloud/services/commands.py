"""Edge command polling (``GET /edge/commands?after=<cursor>``)."""

from rv_contracts import CommandsPage, EdgeCommandAdapter
from sqlalchemy.orm import Session

from ..errors import InvalidInput
from ..repositories import CommandRepository
from ..tenancy import SiteScope

MAX_PAGE = 500


def parse_cursor(after: str | None) -> int:
    """The cursor is the decimal per-site sequence number of the last command seen."""
    if after is None or after == "":
        return 0
    if not after.isdigit():
        raise InvalidInput("Invalid cursor")
    return int(after)


class CommandService:
    def __init__(self, session: Session) -> None:
        self._session = session

    def poll(self, scope: SiteScope, after: str | None, limit: int = 100) -> CommandsPage:
        """Commands after ``after``, oldest first. A cursor beyond this site's last command
        (e.g. one kept from a previous pairing) restarts from the beginning."""
        repo = CommandRepository(self._session, scope)
        requested = parse_cursor(after)
        seq = requested if requested <= repo.last_seq() else 0
        rows = repo.after(seq, max(1, min(limit, MAX_PAGE)))
        commands = [
            EdgeCommandAdapter.validate_python(
                {
                    **row.payload_json,
                    "kind": row.kind,
                    "command_id": row.command_id,
                    "site_id": row.site_id,
                    "created_at": row.created_at,
                }
            )
            for row in rows
        ]
        if rows:
            cursor = str(rows[-1].seq)
        elif after and seq == requested:
            cursor = after  # nothing new: echo the cursor unchanged
        else:
            cursor = str(seq)
        return CommandsPage(cursor=cursor, commands=commands)
