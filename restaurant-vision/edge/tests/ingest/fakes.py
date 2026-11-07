"""Fake captures and clocks for source tests (no network, no files)."""

from __future__ import annotations

import threading
import time
from typing import Any

import numpy as np


class ManualClock:
    """``Clock`` that only moves when told to."""

    def __init__(self, start: float = 1_700_000_000.0) -> None:
        self.t = start

    def now(self) -> float:
        return self.t

    def advance(self, dt: float) -> None:
        self.t += dt


def counter_image(value: int) -> np.ndarray:
    """A tiny BGR-shaped image whose pixels hold ``value`` (int64 so large counters fit)."""
    return np.full((4, 6, 3), value, dtype=np.int64)


class FakeLiveCapture:
    """Live camera: yields increasing frame numbers every ``interval_s``; fails after
    ``fail_after`` frames (None: never). ``opened=False`` simulates an unreachable camera."""

    def __init__(
        self, *, opened: bool = True, fail_after: int | None = None, interval_s: float = 0.002
    ) -> None:
        self.opened = opened
        self.fail_after = fail_after
        self.interval_s = interval_s
        self.count = 0
        self.released = False

    def isOpened(self) -> bool:  # noqa: N802 (OpenCV naming)
        return self.opened

    def read(self) -> tuple[bool, Any]:
        if self.fail_after is not None and self.count >= self.fail_after:
            return False, None
        time.sleep(self.interval_s)
        self.count += 1
        return True, counter_image(self.count)

    def grab(self) -> bool:
        return self.read()[0]

    def get(self, prop_id: int) -> float:
        return 0.0

    def release(self) -> None:
        self.released = True


class CaptureSequence:
    """Capture factory returning the given captures in order, then ``tail`` forever."""

    def __init__(self, captures: list[Any], tail: Any = None) -> None:
        self._captures = list(captures)
        self._tail = tail
        self.urls: list[str] = []
        self._lock = threading.Lock()

    def __call__(self, url: str) -> Any:
        with self._lock:
            self.urls.append(url)
            if self._captures:
                return self._captures.pop(0)
            return self._tail if self._tail is not None else FakeLiveCapture(opened=False)

    @property
    def calls(self) -> int:
        with self._lock:
            return len(self.urls)


class FakeVideoFile:
    """A video file of ``n_frames`` at ``fps``; frame ``i`` is ``counter_image(i)``."""

    def __init__(self, n_frames: int, fps: float = 25.0) -> None:
        self.n_frames = n_frames
        self.fps = fps
        self.pos = 0
        self.decoded = 0

    def isOpened(self) -> bool:  # noqa: N802 (OpenCV naming)
        return True

    def grab(self) -> bool:
        if self.pos >= self.n_frames:
            return False
        self.pos += 1
        return True

    def read(self) -> tuple[bool, Any]:
        if self.pos >= self.n_frames:
            return False, None
        image = counter_image(self.pos)
        self.pos += 1
        self.decoded += 1
        return True, image

    def get(self, prop_id: int) -> float:
        return self.fps

    def release(self) -> None:
        pass


class FakeTime:
    """Deterministic ``monotonic``/``sleep`` pair: sleeping advances time."""

    def __init__(self) -> None:
        self.t = 100.0
        self.slept: list[float] = []

    def monotonic(self) -> float:
        return self.t

    def sleep(self, dt: float) -> None:
        self.slept.append(dt)
        self.t += dt
