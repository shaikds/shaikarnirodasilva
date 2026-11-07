"""Interval scheduling driven by the ``now`` passed to ``on_tick`` (never the wall clock)."""

from __future__ import annotations


class IntervalTimer:
    """Fires on the first tick, then every ``interval_s`` (anchored, so it does not drift).

    After a gap longer than one interval it fires once and re-anchors at that tick instead of
    firing a burst of catch-up snapshots.
    """

    __slots__ = ("_next", "interval_s")

    def __init__(self, interval_s: float) -> None:
        self.interval_s = interval_s
        self._next: float | None = None

    def due(self, now: float) -> bool:
        """True (and schedule the next firing) if the timer fires at ``now``."""
        nxt = self._next
        if nxt is not None and now < nxt:
            return False
        if nxt is None or now >= nxt + self.interval_s:
            self._next = now + self.interval_s
        else:
            self._next = nxt + self.interval_s
        return True

    def reset(self) -> None:
        """Fire again on the next tick."""
        self._next = None
