"""Time-based smoothing of noisy per-frame people counts (pure and deterministic).

Two stages, used for table guests, ``area`` guests and staff on the floor:

1. :class:`HeldSet` tolerates short detection dropouts (occlusion): a track still counts if it
   was seen within the last ``hold_s`` seconds (3 s, matching the tracker, which keeps a
   person's id through about 3 s of occlusion). A track id that appears while a held id is
   missing replaces it, so id switches and the daily id rotation do not double count.
2. :class:`RollingMedian` smooths the held count with the lower median over the trailing window
   ``(t - window_s, t]`` (``Thresholds.count_window_s``). Every frame is one sample, so at a
   steady frame rate the median moves from ``a`` to ``b`` once more than half of the window
   shows ``b``: roughly ``window_s / 2`` after a real change, while spikes or dropouts shorter
   than that are ignored.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Iterable

from .zones import TrackKey

GUEST_HOLD_S = 3.0
"""Seconds a track keeps counting after it was last seen (occlusion tolerance)."""


class RollingMedian:
    """Lower median of integer samples in the trailing window ``(t - window_s, t]``.

    Values are small non-negative counts kept in a histogram, so an update costs
    O(number of distinct values) instead of a sort of the whole window.
    """

    __slots__ = ("_hist", "_samples", "_window_s")

    def __init__(self, window_s: float) -> None:
        self._window_s = 0.0
        self.window_s = window_s
        self._samples: deque[tuple[float, int]] = deque()
        self._hist: dict[int, int] = {}

    @property
    def window_s(self) -> float:
        """Window length in seconds (> 0)."""
        return self._window_s

    @window_s.setter
    def window_s(self, value: float) -> None:
        if value <= 0:
            raise ValueError("window_s must be > 0")
        self._window_s = value

    def __len__(self) -> int:
        return len(self._samples)

    def add(self, ts: float, value: int) -> int:
        """Add the sample taken at ``ts`` (epoch seconds) and return the new median."""
        self._samples.append((ts, value))
        self._hist[value] = self._hist.get(value, 0) + 1
        cutoff = ts - self._window_s
        samples = self._samples
        while samples[0][0] <= cutoff:
            _, old = samples.popleft()
            left = self._hist[old] - 1
            if left:
                self._hist[old] = left
            else:
                del self._hist[old]
        return self.value

    @property
    def value(self) -> int:
        """Lower median of the window; 0 when there are no samples."""
        n = len(self._samples)
        if n == 0:
            return 0
        rank = (n - 1) // 2
        seen = 0
        value = 0
        for value in sorted(self._hist):
            seen += self._hist[value]
            if seen > rank:
                break
        return value

    def clear(self) -> None:
        """Drop all samples."""
        self._samples.clear()
        self._hist.clear()


class HeldSet:
    """Track keys seen within the last ``hold_s`` seconds."""

    __slots__ = ("_last", "hold_s")

    def __init__(self, hold_s: float = GUEST_HOLD_S) -> None:
        self.hold_s = hold_s
        self._last: dict[TrackKey, float] = {}

    def see(self, key: TrackKey, ts: float) -> None:
        """Record a sighting of ``key`` at ``ts``."""
        self._last[key] = ts

    def see_frame(self, ts: float, keys: Iterable[TrackKey]) -> None:
        """Record every key seen in one frame.

        Keys seen for the first time *replace* held keys missing from this frame (most
        recently seen first) instead of adding to them: when a tracker gives a person a new
        id (id switch after occlusion, or every visible track at once at the daily
        ``track_id_ttl_h`` rotation), the old id must not keep counting for ``hold_s`` next
        to the new one. Nothing is carried from the old key to the new one; this only avoids
        a double count. A genuinely new person arriving while someone is occluded can make
        the count dip for at most ``hold_s``, which the rolling median absorbs.
        """
        frame = list(keys)
        last = self._last
        fresh = sum(1 for key in frame if key not in last)
        if fresh:
            present = set(frame)
            missing = sorted(
                (k for k, seen in last.items() if k not in present and ts - seen <= self.hold_s),
                key=lambda k: (-last[k], k),
            )
            for key in missing[:fresh]:
                del last[key]
        for key in frame:
            last[key] = ts

    def discard(self, key: TrackKey) -> None:
        """Stop counting ``key`` immediately (e.g. it turned out to be staff)."""
        self._last.pop(key, None)

    def count(self, ts: float) -> int:
        """Number of keys last seen at most ``hold_s`` seconds before ``ts``; older ones are
        forgotten."""
        expired = [k for k, last in self._last.items() if ts - last > self.hold_s]
        for key in expired:
            del self._last[key]
        return len(self._last)

    def clear(self) -> None:
        """Forget every key."""
        self._last.clear()


class SmoothedCount:
    """Held count of distinct tracks, smoothed by a rolling median (see module docstring)."""

    __slots__ = ("_held", "_median", "raw", "value")

    def __init__(self, window_s: float, hold_s: float = GUEST_HOLD_S) -> None:
        self._held = HeldSet(hold_s)
        self._median = RollingMedian(window_s)
        self.raw = 0
        """Held (unsmoothed) count after the latest update."""
        self.value = 0
        """Smoothed count after the latest update."""

    @property
    def window_s(self) -> float:
        """Median window in seconds."""
        return self._median.window_s

    @window_s.setter
    def window_s(self, value: float) -> None:
        self._median.window_s = value

    def update(
        self, ts: float, keys: Iterable[TrackKey], drop: Iterable[TrackKey] = ()
    ) -> int:
        """Record the tracks counted in the frame at ``ts``; ``drop`` stops counting tracks
        that must no longer count (e.g. reclassified as staff). Returns the smoothed count."""
        held = self._held
        for key in drop:
            held.discard(key)
        held.see_frame(ts, keys)
        self.raw = held.count(ts)
        self.value = self._median.add(ts, self.raw)
        return self.value

    def clear(self) -> None:
        """Forget all tracks and samples."""
        self._held.clear()
        self._median.clear()
        self.raw = 0
        self.value = 0
