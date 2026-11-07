"""Live RTSP camera source: latest-frame-only reader thread, reconnect with backoff."""

from __future__ import annotations

import functools
import logging
import threading
import time
from typing import Any

import numpy as np

from rv_contracts import Clock, Frame

from ..interfaces import SourceSpec
from .capture import CaptureFactory, CaptureLike, open_ffmpeg_capture, safe_release
from .rtsp_templates import redact_url
from .stats import RateMeter, SourceStats, classify_health

log = logging.getLogger(__name__)

BACKOFF_INITIAL_S = 1.0
BACKOFF_MAX_S = 30.0


def next_backoff(delay: float, maximum: float = BACKOFF_MAX_S) -> float:
    """Exponential backoff step: double, capped at ``maximum``."""
    return min(delay * 2.0, maximum)


class RtspSource:
    """``FrameSource`` for an RTSP camera (use the substream).

    A daemon thread decodes continuously and keeps only the newest frame, so analysis never
    lags behind live video. :meth:`read` paces delivery to at most ``target_fps``: it waits for
    the next slot, then up to ``max_wait_s`` for a frame newer than the last one returned, and
    returns ``None`` if none arrives (camera stalled or reconnecting). The URL holds
    credentials and is only ever logged redacted.
    """

    def __init__(
        self,
        spec: SourceSpec,
        *,
        clock: Clock,
        target_fps: float,
        capture_factory: CaptureFactory | None = None,
        backoff_initial_s: float = BACKOFF_INITIAL_S,
        backoff_max_s: float = BACKOFF_MAX_S,
        open_timeout_s: float = 10.0,
        read_timeout_s: float = 10.0,
        max_wait_s: float | None = None,
    ) -> None:
        if not spec.url:
            raise ValueError(f"camera {spec.camera_id!r}: an rtsp source needs a url")
        if target_fps <= 0:
            raise ValueError("target_fps must be positive")
        self._camera_id = spec.camera_id
        self._url = spec.url
        self._clock = clock
        self._target_fps = target_fps
        self._period = 1.0 / target_fps
        self._max_wait_s = max_wait_s if max_wait_s is not None else max(2 * self._period, 0.5)
        self._factory: CaptureFactory = capture_factory or functools.partial(
            open_ffmpeg_capture, open_timeout_s=open_timeout_s, read_timeout_s=read_timeout_s
        )
        self._backoff_initial_s = backoff_initial_s
        self._backoff_max_s = backoff_max_s

        self._cond = threading.Condition()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._latest: tuple[Any, float] | None = None
        self._seq = 0
        self._delivered_seq = 0
        self._connected = False
        self._last_frame_mono: float | None = None
        self._opened_mono: float | None = None
        self._meter = RateMeter(window_s=5.0)
        self._index = 0
        self._next_due = 0.0

    @property
    def camera_id(self) -> str:
        return self._camera_id

    @property
    def redacted_url(self) -> str:
        """The URL with credentials removed, for logs and the setup UI."""
        return redact_url(self._url)

    def open(self) -> None:
        """Start the reader thread (idempotent). Connection errors are retried, not raised."""
        if self._thread is not None:
            return
        self._stop.clear()
        self._opened_mono = time.monotonic()
        self._meter.reset(self._opened_mono)
        self._thread = threading.Thread(
            target=self._run, name=f"rtsp-{self._camera_id}", daemon=True
        )
        self._thread.start()

    def close(self) -> None:
        """Stop the reader thread and release the stream."""
        self._stop.set()
        with self._cond:
            self._cond.notify_all()
        thread, self._thread = self._thread, None
        if thread is not None:
            thread.join(timeout=5.0)
        with self._cond:
            self._latest = None
            self._connected = False

    def read(self) -> Frame | None:
        """The newest frame, paced to ``target_fps``; ``None`` if no new frame arrived in time."""
        if self._thread is None:
            return None
        delay = self._next_due - time.monotonic()
        if delay > 0 and self._stop.wait(delay):
            return None
        with self._cond:
            self._cond.wait_for(
                lambda: self._stop.is_set() or self._seq > self._delivered_seq,
                timeout=self._max_wait_s,
            )
            if self._stop.is_set() or self._seq <= self._delivered_seq or self._latest is None:
                return None
            image, ts = self._latest
            self._delivered_seq = self._seq
        self._next_due = max(self._next_due + self._period, time.monotonic())
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
        """Receive-side health: camera fps, age of the newest frame, connection state."""
        now = time.monotonic()
        with self._cond:
            connected = self._connected and self._thread is not None
            last = self._last_frame_mono
        age = None if last is None else now - last
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

    # ---------------------------------------------------------------- reader thread

    def _run(self) -> None:
        delay = self._backoff_initial_s
        while not self._stop.is_set():
            capture = self._connect()
            got_frames = False
            if capture is not None:
                try:
                    got_frames = self._pump(capture)
                finally:
                    safe_release(capture)
                    with self._cond:
                        self._connected = False
            if self._stop.is_set():
                break
            if got_frames:
                delay = self._backoff_initial_s
            log.info("camera %s: reconnecting in %.0f s", self._camera_id, delay)
            if self._stop.wait(delay):
                break
            delay = next_backoff(delay, self._backoff_max_s)

    def _connect(self) -> CaptureLike | None:
        try:
            capture = self._factory(self._url)
        except Exception as exc:  # cv2 raises cv2.error on some invalid URLs
            log.warning("camera %s: cannot open %s: %s", self._camera_id, self.redacted_url, exc)
            return None
        if not capture.isOpened():
            safe_release(capture)
            log.warning("camera %s: cannot open %s", self._camera_id, self.redacted_url)
            return None
        with self._cond:
            self._connected = True
        log.info("camera %s: connected to %s", self._camera_id, self.redacted_url)
        return capture

    def _pump(self, capture: CaptureLike) -> bool:
        """Read frames until the stream fails or the source is closed."""
        got_frames = False
        while not self._stop.is_set():
            try:
                ok, image = capture.read()
            except Exception as exc:
                log.warning("camera %s: read error: %s", self._camera_id, exc)
                return got_frames
            if not ok or not isinstance(image, np.ndarray) or image.ndim < 2:
                log.warning("camera %s: stream ended or stalled", self._camera_id)
                return got_frames
            now_mono = time.monotonic()
            ts = self._clock.now()
            with self._cond:
                self._latest = (image, ts)
                self._seq += 1
                self._last_frame_mono = now_mono
                self._cond.notify_all()
            self._meter.tick(now_mono)
            got_frames = True
        return got_frames
