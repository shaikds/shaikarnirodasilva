""""Next table to free" prediction for the host view (contracts 1.3, pure functions).

``expected_free_at = seated_at + median dwell`` of the site's sessions closed in the last
:data:`HISTORY_DAYS` days:

* the median of the same party-size bucket (1-2, 3-4, 5+) when it has at least
  :data:`MIN_BUCKET_SESSIONS` sessions -> confidence ``high``;
* else the site-wide median (any number of sessions) -> ``medium``;
* else :data:`DEFAULT_DWELL_S` (a guess to calibrate) -> ``low``.

If that moment has already passed, the guests are overstaying: predict ``now +``
:data:`OVERDUE_GRACE_S` and lower the confidence one step.
"""

from collections.abc import Sequence
from dataclasses import dataclass, field

from rv_contracts import Confidence

from .records import SessionRecord
from .stats import median

HISTORY_DAYS = 28
MIN_BUCKET_SESSIONS = 10
DEFAULT_DWELL_S = 60 * 60.0
"""Fallback dwell without history: 60 minutes, a guess to calibrate."""
OVERDUE_GRACE_S = 5 * 60.0

_LOWER = {
    Confidence.HIGH: Confidence.MEDIUM,
    Confidence.MEDIUM: Confidence.LOW,
    Confidence.LOW: Confidence.LOW,
}


def party_bucket(guests: int) -> str:
    """``"1-2"``, ``"3-4"`` or ``"5+"`` (0 guests count as 1-2)."""
    if guests <= 2:
        return "1-2"
    if guests <= 4:
        return "3-4"
    return "5+"


@dataclass(frozen=True, slots=True)
class DwellModel:
    """Dwell times (seconds) of closed sessions, overall and per party-size bucket."""

    all_s: tuple[float, ...] = ()
    by_bucket: dict[str, tuple[float, ...]] = field(default_factory=dict)

    @classmethod
    def from_sessions(cls, sessions: Sequence[SessionRecord]) -> "DwellModel":
        buckets: dict[str, list[float]] = {}
        for s in sessions:
            buckets.setdefault(party_bucket(s.max_guests), []).append(s.dwell_s)
        return cls(
            all_s=tuple(s.dwell_s for s in sessions),
            by_bucket={k: tuple(v) for k, v in buckets.items()},
        )

    def dwell(self, guests: int) -> tuple[float, Confidence]:
        """Median dwell for a party of ``guests`` and how much to trust it."""
        same = self.by_bucket.get(party_bucket(guests), ())
        if len(same) >= MIN_BUCKET_SESSIONS:
            value = median(same)
            assert value is not None
            return value, Confidence.HIGH
        overall = median(self.all_s)
        if overall is not None:
            return overall, Confidence.MEDIUM
        return DEFAULT_DWELL_S, Confidence.LOW


def predict_free_at(
    model: DwellModel, seated_at: float, guests: int, now: float
) -> tuple[float, Confidence]:
    """``(expected_free_at, confidence)`` of a table seated at ``seated_at``."""
    dwell, confidence = model.dwell(guests)
    expected = seated_at + dwell
    if expected <= now:
        return now + OVERDUE_GRACE_S, _LOWER[confidence]
    return expected, confidence
