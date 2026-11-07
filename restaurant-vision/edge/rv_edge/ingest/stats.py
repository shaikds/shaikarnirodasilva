"""Frame-rate measurement and camera health classification shared by sources and pipelines."""

from __future__ import annotations

import threading
from collections import deque
from dataclasses import dataclass
from typing import Protocol, runtime_checkable

from rv_contracts import CameraStatus

DEGRADED_AFTER_S = 5.0
"""A camera whose last frame is older than this is ``degraded``."""
OFFLINE_AFTER_S = 30.0
"""A camera whose last frame is older than this is ``offline``."""
MIN_FPS_RATIO = 0.5
"""Below this fraction of the target fps a camera is ``degraded``."""


@dataclass(frozen=True, slots=True)
class SourceStats:
    """Live statistics of one frame source."""

    status: CameraStatus
    fps: float
    """Frames per second received from the device (or emitted, for files)."""
    last_frame_age_s: float | None
    """Seconds since the last frame; None if none yet."""
    connected: bool
    """False while (re)connecting or after a finite source is exhausted."""


@runtime_checkable
class StatsSource(Protocol):
    """A frame source that reports :class:`SourceStats` (RTSP and file sources do)."""

    def stats(self) -> SourceStats: ...


class RateMeter:
    """Events per second over a sliding window. Times are supplied by the caller. Thread-safe."""

    def __init__(self, window_s: float = 5.0) -> None:
        if window_s <= 0:
            raise ValueError("window_s must be positive")
        self._window_s = window_s
        self._times: deque[float] = deque()
        self._start: float | None = None
        self._lock = threading.Lock()

    def reset(self, start: float | None = None) -> None:
        """Forget all events; ``start`` is when measuring began (defaults to the first tick)."""
        with self._lock:
            self._times.clear()
            self._start = start

    def tick(self, t: float) -> None:
        """Record one event at time ``t``."""
        with self._lock:
            if self._start is None:
                self._start = t
            self._times.append(t)
            self._trim(t)

    def rate(self, now: float) -> float:
        """Events per second over the last ``window_s`` (or since start, if shorter)."""
        with self._lock:
            self._trim(now)
            if self._start is None:
                return 0.0
            span = min(self._window_s, now - self._start)
            if span <= 0:
                return 0.0
            return len(self._times) / span

    def _trim(self, now: float) -> None:
        cutoff = now - self._window_s
        while self._times and self._times[0] <= cutoff:
            self._times.popleft()


def classify_health(
    *,
    connected: bool,
    fps: float,
    target_fps: float,
    last_frame_age_s: float | None,
    since_start_s: float,
) -> CameraStatus:
    """Map raw measurements to ``ok`` / ``degraded`` / ``offline``.

    ``offline``: disconnected, or no frame for more than :data:`OFFLINE_AFTER_S` (counted from
    start when no frame arrived yet). ``degraded``: no frame yet, last frame older than
    :data:`DEGRADED_AFTER_S`, or fps below :data:`MIN_FPS_RATIO` of the target.
    """
    if not connected:
        return CameraStatus.OFFLINE
    age = last_frame_age_s if last_frame_age_s is not None else since_start_s
    if age > OFFLINE_AFTER_S:
        return CameraStatus.OFFLINE
    if last_frame_age_s is None or age > DEGRADED_AFTER_S:
        return CameraStatus.DEGRADED
    if fps < MIN_FPS_RATIO * target_fps:
        return CameraStatus.DEGRADED
    return CameraStatus.OK
