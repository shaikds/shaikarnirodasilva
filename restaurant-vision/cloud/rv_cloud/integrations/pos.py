"""POS integration seam (architecture 7.5, phase 2).

A ``PosAdapter`` (Adapter pattern) translates a POS vendor's check lifecycle into calls the cloud
understands, and maps POS table ids to ``table_id``. Phase 2 uses ``on_check_closed`` to add
``waiting_for_check`` and revenue per session; the MVP wires :class:`NullPosAdapter`.
"""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class PosCheck:
    """A POS check. Amounts in the site's currency, major units. No staff identity."""

    check_id: str
    pos_table_id: str
    opened_at: float
    closed_at: float | None = None
    total: float | None = None
    covers: int | None = None


class PosAdapter(Protocol):
    def on_check_opened(self, site_id: str, check: PosCheck) -> None:
        """A check was opened at a POS table."""
        ...

    def on_check_closed(self, site_id: str, check: PosCheck) -> None:
        """A check was paid and closed."""
        ...

    def table_id_for(self, site_id: str, pos_table_id: str) -> str | None:
        """Map the POS table id to ``rv_contracts`` ``table_id`` (None: unmapped)."""
        ...

    def pos_table_id_for(self, site_id: str, table_id: str) -> str | None:
        """Reverse mapping."""
        ...


class NullPosAdapter:
    """No POS connected: ignores checks and maps nothing."""

    def on_check_opened(self, site_id: str, check: PosCheck) -> None:
        return None

    def on_check_closed(self, site_id: str, check: PosCheck) -> None:
        return None

    def table_id_for(self, site_id: str, pos_table_id: str) -> str | None:
        return None

    def pos_table_id_for(self, site_id: str, table_id: str) -> str | None:
        return None
