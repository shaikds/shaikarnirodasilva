"""Plain records the metric functions compute on (decoupled from the ORM)."""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class SessionRecord:
    """A closed table session."""

    table_id: str
    seated_at: float
    left_at: float
    max_guests: int
    first_visit_delay_s: float | None = None
    bussing_delay_s: float | None = None

    @property
    def dwell_s(self) -> float:
        return max(0.0, self.left_at - self.seated_at)

    @property
    def turn_s(self) -> float:
        """Table occupied-to-reusable time: dwell plus bussing delay when known."""
        return self.dwell_s + (self.bussing_delay_s or 0.0)


@dataclass(frozen=True, slots=True)
class AlertRecord:
    kind: str
    raised_at: float
    resolved_at: float | None = None

    @property
    def response_s(self) -> float | None:
        if self.resolved_at is None:
            return None
        return max(0.0, self.resolved_at - self.raised_at)


@dataclass(frozen=True, slots=True)
class QueueRecord:
    """A ``queue.seated`` (``kind="seated"``) or ``queue.walkaway`` fact."""

    kind: str
    ts: float
    waited_s: float
    zone_id: str = ""
    party_size_est: int | None = None


@dataclass(frozen=True, slots=True)
class SnapshotPoint:
    """One occupancy (guests) or queue (people) snapshot."""

    ts: float
    value: float
    zone_id: str | None = None
