"""Per-camera vision pipeline: source -> privacy masks -> detector -> tracker -> hints."""

from __future__ import annotations

import dataclasses
import threading
from collections.abc import Sequence

from rv_contracts import Anchor, Clock, Detector, Frame, FrameSource, Tracker, TrackFrame

from ..ingest.stats import RateMeter, StatsSource, classify_health
from ..interfaces import Box, CameraHealthInfo, HintExtractor
from .privacy import PolygonLike, apply_masks

FPS_WINDOW_S = 10.0


class DefaultCameraPipeline:
    """``CameraPipeline`` for one camera. ``step`` runs on the camera's thread; ``health`` and
    ``snapshot`` may be called from other threads.

    Health (clock time): ``offline`` when stopped, when the source reports it is disconnected,
    or when the last processed frame is older than 30 s; ``degraded`` when it is older than
    5 s or processing runs below 50% of ``target_fps``; else ``ok``. Exceptions from the
    detector or tracker propagate to the caller.
    """

    def __init__(
        self,
        camera_id: str,
        source: FrameSource,
        detector: Detector,
        tracker: Tracker,
        hints: HintExtractor,
        *,
        clock: Clock,
        target_fps: float,
        privacy_masks: Sequence[PolygonLike] = (),
        anchor: Anchor = Anchor.FOOT,
    ) -> None:
        self._camera_id = camera_id
        self._source = source
        self._detector = detector
        self._tracker = tracker
        self._hints = hints
        self._clock = clock
        self._target_fps = target_fps
        self._masks = [list(p) for p in privacy_masks]
        self._anchor = anchor
        self._lock = threading.Lock()
        self._meter = RateMeter(window_s=FPS_WINDOW_S)
        self._running = False
        self._started_ts: float | None = None
        self._last_ts: float | None = None
        self._last: tuple[Frame, tuple[Box, ...]] | None = None

    @property
    def camera_id(self) -> str:
        return self._camera_id

    def start(self) -> None:
        """Open the source and start measuring health."""
        self._source.open()
        now = self._clock.now()
        with self._lock:
            self._running = True
            self._started_ts = now
            self._last_ts = None
            self._meter.reset(now)

    def stop(self) -> None:
        """Close the source and drop the last frame from memory."""
        with self._lock:
            self._running = False
            self._last = None
        self._source.close()

    def step(self) -> TrackFrame | None:
        """Read one frame and run it through masks, detector, tracker and hints."""
        if not self._running:
            return None
        frame = self._source.read()
        if frame is None:
            return None
        masked = apply_masks(frame, self._masks, anchor=self._anchor)
        detections = self._detector.detect(masked)
        tracks = tuple(
            dataclasses.replace(t, hints=self._hints.hints_for(masked, t.box))
            for t in self._tracker.update(detections, masked)
        )
        now = self._clock.now()
        with self._lock:
            self._last_ts = now
            self._last = (masked, tuple(d.box for d in detections))
        self._meter.tick(now)
        return TrackFrame(camera_id=self._camera_id, ts=frame.ts, index=frame.index, tracks=tracks)

    def snapshot(self) -> tuple[Frame, Sequence[Box]] | None:
        """The last processed frame (privacy masks applied, RAM only) and every person box
        detected in it; None before the first frame or after ``stop``."""
        with self._lock:
            return self._last

    def health(self) -> CameraHealthInfo:
        now = self._clock.now()
        with self._lock:
            running, started, last = self._running, self._started_ts, self._last_ts
        fps = self._meter.rate(now) if running else 0.0
        age = None if last is None else max(0.0, now - last)
        connected = running
        if running and isinstance(self._source, StatsSource):
            connected = self._source.stats().connected
        status = classify_health(
            connected=connected,
            fps=fps,
            target_fps=self._target_fps,
            last_frame_age_s=age,
            since_start_s=0.0 if started is None else now - started,
        )
        return CameraHealthInfo(
            camera_id=self._camera_id, status=status, fps=round(fps, 2), last_frame_age_s=age
        )
