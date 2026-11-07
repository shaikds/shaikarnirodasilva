"""Fakes and helpers for vision tests."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

import numpy as np
from rv_contracts import CameraStatus, Frame

from rv_edge.ingest.stats import SourceStats
from rv_edge.interfaces import Box, SyntheticImage, SyntheticPerson

W, H = 640, 360


class ManualClock:
    def __init__(self, start: float = 1_700_000_000.0) -> None:
        self.t = start

    def now(self) -> float:
        return self.t

    def advance(self, dt: float) -> None:
        self.t += dt


def synthetic_frame(
    people: Iterable[SyntheticPerson | Box], *, ts: float = 0.0, index: int = 0
) -> Frame:
    persons = tuple(p if isinstance(p, SyntheticPerson) else SyntheticPerson(box=p) for p in people)
    return Frame("cam-1", ts, index, W, H, SyntheticImage(people=persons))


def pixel_frame(image: np.ndarray | None = None, *, ts: float = 0.0, index: int = 0) -> Frame:
    if image is None:
        image = np.full((H, W, 3), 128, dtype=np.uint8)
    return Frame("cam-1", ts, index, image.shape[1], image.shape[0], image)


def walking_people(n_frames: int, *, fps: float = 5.0) -> list[list[Box]]:
    """Three people: one walking right, one walking left, one seated (static)."""
    out: list[list[Box]] = []
    for i in range(n_frames):
        a = 0.05 + 0.01 * i
        b = 0.85 - 0.008 * i
        out.append(
            [
                (a, 0.30, a + 0.08, 0.80),
                (b, 0.35, b + 0.08, 0.85),
                (0.45, 0.10, 0.52, 0.40),
            ]
        )
    return out


class ListSource:
    """``FrameSource`` that replays frames, stamping ``ts`` from the clock."""

    def __init__(self, frames: Iterable[Frame], clock: ManualClock | None = None) -> None:
        self.camera_id = "cam-1"
        self._frames = list(frames)
        self._clock = clock
        self.opened = False
        self.closed = False

    def open(self) -> None:
        self.opened = True

    def read(self) -> Frame | None:
        if not self._frames:
            return None
        frame = self._frames.pop(0)
        if self._clock is not None:
            frame = Frame(
                frame.camera_id,
                self._clock.now(),
                frame.index,
                frame.width,
                frame.height,
                frame.image,
            )
        return frame

    def close(self) -> None:
        self.closed = True

    def push(self, frame: Frame) -> None:
        self._frames.append(frame)


class StatsListSource(ListSource):
    """A ``ListSource`` that also reports connection state, like the RTSP source."""

    def __init__(self, frames: Iterable[Frame], clock: ManualClock | None = None) -> None:
        super().__init__(frames, clock)
        self.connected = True

    def stats(self) -> SourceStats:
        status = CameraStatus.OK if self.connected else CameraStatus.OFFLINE
        return SourceStats(status=status, fps=5.0, last_frame_age_s=0.0, connected=self.connected)


class RecordingDetector:
    """Detector that returns fixed detections and remembers the frames it saw."""

    def __init__(self, boxes: list[Box] | None = None) -> None:
        self.boxes = boxes or []
        self.seen: list[Any] = []

    def detect(self, frame: Frame) -> list[Any]:
        from rv_contracts import Detection

        self.seen.append(frame.image)
        return [Detection(box=b, score=0.9) for b in self.boxes]
