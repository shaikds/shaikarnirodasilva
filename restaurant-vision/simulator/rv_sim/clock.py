"""Clocks for simulated runs. Both satisfy ``rv_contracts.Clock`` (``now() -> epoch seconds``).

* :class:`ManualClock`: time moves only when :meth:`ManualClock.advance` is called. Used by
  evaluation and tests to run a scenario as fast as possible, deterministically.
* :class:`AcceleratedClock`: scenario time = ``start + speed * real elapsed time``, for live
  demos (e.g. ``speed=20``: a 2 h service plays in 6 minutes). The real-time anchor is taken on
  the first :meth:`AcceleratedClock.now` call, so simulated time starts at ``start`` exactly
  when something first looks at the clock, however long setup took.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable


class ManualClock:
    """A clock that only moves when told to (thread-safe)."""

    def __init__(self, start: float) -> None:
        self._start = float(start)
        self._elapsed = 0.0
        self._lock = threading.Lock()

    @property
    def start(self) -> float:
        return self._start

    @property
    def elapsed(self) -> float:
        """Seconds advanced since ``start``."""
        return self._elapsed

    def now(self) -> float:
        return self._start + self._elapsed

    def advance(self, dt: float) -> float:
        """Move forward by ``dt`` seconds (>= 0) and return the new time."""
        if dt < 0:
            raise ValueError("a clock cannot go backwards")
        with self._lock:
            self._elapsed += dt
            return self._start + self._elapsed

    def set(self, ts: float) -> None:
        """Jump to ``ts`` (must not be earlier than now)."""
        with self._lock:
            if ts < self._start + self._elapsed:
                raise ValueError("a clock cannot go backwards")
            self._elapsed = ts - self._start


class AcceleratedClock:
    """Scenario time running ``speed`` times faster than real time (see module docstring)."""

    def __init__(
        self, start: float, speed: float = 1.0, *, monotonic: Callable[[], float] = time.monotonic
    ) -> None:
        if speed <= 0:
            raise ValueError("speed must be positive")
        self._start = float(start)
        self._speed = float(speed)
        self._monotonic = monotonic
        self._anchor: float | None = None
        self._lock = threading.Lock()

    @property
    def start(self) -> float:
        return self._start

    @property
    def speed(self) -> float:
        return self._speed

    @property
    def started(self) -> bool:
        return self._anchor is not None

    def now(self) -> float:
        with self._lock:
            mono = self._monotonic()
            if self._anchor is None:
                self._anchor = mono
            return self._start + (mono - self._anchor) * self._speed

    def restart(self) -> None:
        """Re-anchor: the next :meth:`now` returns ``start`` again."""
        with self._lock:
            self._anchor = None


SimClock = AcceleratedClock
"""The architecture's name for the accelerated simulation clock."""
