"""Video file source for demos with real footage: decimated to the target fps, optionally looped."""

from __future__ import annotations

import logging
import math
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from rv_contracts import Clock, Frame

from ..interfaces import SourceSpec
from .capture import CaptureFactory, CaptureLike, open_ffmpeg_capture, safe_release
from .stats import RateMeter, SourceStats, classify_health

log = logging.getLogger(__name__)

DEFAULT_FILE_FPS = 25.0


class FileSource:
    """``FrameSource`` that plays a video file at ``target_fps``.

    The file's own fps decides which frames are kept (e.g. every 5th frame of a 25 fps file at
    5 fps). With ``realtime=True`` frames are paced to the wall clock like a live camera
    (frames are skipped when processing lags) and ``Frame.ts`` comes from ``clock``. With
    ``realtime=False`` frames come as fast as they are read and ``Frame.ts`` is video time,
    ``clock.now()`` at open plus the position in the video, so dwell times stay correct.

    The path is ``spec.url`` (or ``spec.options["path"]``); ``spec.loop`` restarts at the end.
    """

    def __init__(
        self,
        spec: SourceSpec,
        *,
        clock: Clock,
        target_fps: float,
        realtime: bool = True,
        capture_factory: CaptureFactory | None = None,
        sleep: Callable[[float], None] = time.sleep,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        path = spec.url or spec.options.get("path")
        if not path:
            raise ValueError(f"camera {spec.camera_id!r}: a file source needs a path (url)")
        if target_fps <= 0:
            raise ValueError("target_fps must be positive")
        self._camera_id = spec.camera_id
        self._path = str(path)
        self._loop = spec.loop
        self._clock = clock
        self._target_fps = target_fps
        self._realtime = realtime
        self._factory: CaptureFactory = capture_factory or open_ffmpeg_capture
        self._check_exists = capture_factory is None
        self._sleep = sleep
        self._monotonic = monotonic

        self._capture: CaptureLike | None = None
        self._src_fps = DEFAULT_FILE_FPS
        self._step = 1.0
        self._period = 1.0 / target_fps
        self._target_pos = 0.0  # fractional frame index (within the current loop) to emit next
        self._next_frame = 0  # index of the frame the capture delivers next
        self._loop_offset = 0  # frames played in earlier loops
        self._exhausted = False
        self._next_due: float | None = None
        self._t0 = 0.0
        self._index = 0
        self._meter = RateMeter(window_s=5.0)
        self._opened_mono: float | None = None
        self._last_frame_mono: float | None = None

    @property
    def camera_id(self) -> str:
        return self._camera_id

    def open(self) -> None:
        """Open the file. Raises ``FileNotFoundError``/``OSError`` if it cannot be decoded."""
        if self._capture is not None:
            return
        if self._check_exists and not Path(self._path).is_file():
            raise FileNotFoundError(f"camera {self._camera_id!r}: no video file at {self._path}")
        self._capture = self._open_capture()
        fps = float(self._capture.get(cv2.CAP_PROP_FPS) or 0.0)
        if not math.isfinite(fps) or not 1.0 <= fps <= 240.0:
            fps = DEFAULT_FILE_FPS
        self._src_fps = fps
        self._step = max(1.0, fps / self._target_fps)
        self._period = self._step / fps
        self._target_pos = 0.0
        self._next_frame = 0
        self._loop_offset = 0
        self._exhausted = False
        self._next_due = None
        self._t0 = self._clock.now()
        self._opened_mono = self._monotonic()
        self._meter.reset(self._opened_mono)

    def close(self) -> None:
        safe_release(self._capture)
        self._capture = None

    def read(self) -> Frame | None:
        """The next frame at the target rate, or ``None`` once a non-looping file has ended."""
        if self._capture is None or self._exhausted:
            return None
        if self._realtime:
            now = self._monotonic()
            if self._next_due is None:
                self._next_due = now
            if now < self._next_due:
                self._sleep(self._next_due - now)
                now = self._next_due
            behind = int((now - self._next_due) // self._period)  # skip like a live camera
            self._target_pos += self._step * behind
            self._next_due += self._period * (1 + behind)
        image = self._frame_at(int(self._target_pos))
        if image is None:
            return None
        frame_no = self._loop_offset + self._next_frame - 1
        self._target_pos += self._step
        now_mono = self._monotonic()
        self._meter.tick(now_mono)
        self._last_frame_mono = now_mono
        ts = self._clock.now() if self._realtime else self._t0 + frame_no / self._src_fps
        height, width = image.shape[:2]
        frame = Frame(
            camera_id=self._camera_id,
            ts=ts,
            index=self._index,
            width=int(width),
            height=int(height),
            image=image,
        )
        self._index += 1
        return frame

    def stats(self) -> SourceStats:
        """Emitted fps, age of the last frame, and whether the file is still playing."""
        now = self._monotonic()
        connected = self._capture is not None and not self._exhausted
        age = None if self._last_frame_mono is None else now - self._last_frame_mono
        fps = self._meter.rate(now)
        since_start = 0.0 if self._opened_mono is None else now - self._opened_mono
        status = classify_health(
            connected=connected,
            fps=fps,
            target_fps=self._target_fps,
            last_frame_age_s=age,
            since_start_s=since_start,
        )
        return SourceStats(status=status, fps=fps, last_frame_age_s=age, connected=connected)

    # ---------------------------------------------------------------- internals

    def _open_capture(self) -> CaptureLike:
        capture = self._factory(self._path)
        if not capture.isOpened():
            safe_release(capture)
            raise OSError(f"camera {self._camera_id!r}: cannot decode video file {self._path}")
        return capture

    def _frame_at(self, target: int) -> Any:
        """Decode frame ``target`` of the current loop, rewinding at the end if looping."""
        for _attempt in range(2):
            image = self._seek_and_read(target)
            if image is not None:
                return image
            frames_in_loop = self._next_frame
            if not self._loop or frames_in_loop == 0:
                self._exhausted = True
                log.info("camera %s: video file ended", self._camera_id)
                return None
            # Rewind: start the next loop, keeping the phase of decimation and video time.
            loops = max(1, int(self._target_pos // frames_in_loop))
            self._loop_offset += loops * frames_in_loop
            self._target_pos -= loops * frames_in_loop
            target = int(self._target_pos)
            safe_release(self._capture)
            self._capture = self._open_capture()
            self._next_frame = 0
        self._exhausted = True
        return None

    def _seek_and_read(self, target: int) -> Any:
        capture = self._capture
        if capture is None:
            return None
        while self._next_frame < target:
            if not capture.grab():
                return None
            self._next_frame += 1
        ok, image = capture.read()
        if not ok or not isinstance(image, np.ndarray):
            return None
        self._next_frame += 1
        return image
