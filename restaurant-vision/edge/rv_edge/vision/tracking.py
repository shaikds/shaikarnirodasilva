"""``Tracker`` implementation: ByteTrack with random, camera-scoped, rotating track ids."""

from __future__ import annotations

import secrets
from collections.abc import Callable

import numpy as np
from rv_contracts import Detection, Frame, Track

from .bytetrack import ByteTrack

VIRTUAL_SIZE = 1000
"""Pixel size used when a frame reports no dimensions (e.g. synthetic frames)."""


def random_track_id() -> str:
    """12 random hex characters (48 bits). Not derived from anything about the person."""
    return secrets.token_hex(6)


class ByteTrackTracker:
    """ByteTrack on normalized boxes, with privacy-preserving ids.

    Boxes are converted to pixels for the tracker (the Kalman filter models aspect ratio and
    height in pixels) and tracks carry their detection's original normalized box and score.
    Internal integer ids are mapped to random strings; the mapping and all tracker state are
    discarded every ``track_id_ttl_h`` hours of frame time (and on :meth:`reset`), so ids never
    link a person across days. ``first_seen_ts`` is the frame time a track id first appeared.

    ``lost_track_buffer`` is in 30 fps frames, as in supervision: the default 90 keeps a
    briefly occluded person's id for about 3 s whatever the frame rate.
    """

    def __init__(
        self,
        frame_rate: float = 5.0,
        track_id_ttl_h: float = 24.0,
        *,
        track_activation_threshold: float = 0.25,
        lost_track_buffer: int = 90,
        minimum_matching_threshold: float = 0.8,
        minimum_consecutive_frames: int = 1,
        id_factory: Callable[[], str] = random_track_id,
    ) -> None:
        if track_id_ttl_h <= 0:
            raise ValueError("track_id_ttl_h must be positive")
        self._ttl_s = track_id_ttl_h * 3600.0
        self._core = ByteTrack(
            track_activation_threshold=track_activation_threshold,
            lost_track_buffer=lost_track_buffer,
            minimum_matching_threshold=minimum_matching_threshold,
            frame_rate=frame_rate,
            minimum_consecutive_frames=minimum_consecutive_frames,
        )
        self._id_factory = id_factory
        self._ids: dict[int, str] = {}
        self._first_seen: dict[int, float] = {}
        self._epoch_ts: float | None = None

    @property
    def epoch_ts(self) -> float | None:
        """Frame time at which the current id mapping started."""
        return self._epoch_ts

    def reset(self) -> None:
        """Forget all tracks and ids; the next ids are new random strings."""
        self._core.reset()
        self._ids.clear()
        self._first_seen.clear()
        self._epoch_ts = None

    def update(self, detections: list[Detection], frame: Frame) -> list[Track]:
        if self._epoch_ts is None or not 0 <= frame.ts - self._epoch_ts < self._ttl_s:
            self.reset()
            self._epoch_ts = frame.ts
        width = frame.width if frame.width > 0 else VIRTUAL_SIZE
        height = frame.height if frame.height > 0 else VIRTUAL_SIZE
        scale = np.array([width, height, width, height], dtype=np.float64)
        boxes = np.array([d.box for d in detections], dtype=np.float64).reshape(-1, 4) * scale
        scores = np.array([d.score for d in detections], dtype=np.float64)
        matched = self._core.update(boxes, scores)

        tracks: list[Track] = []
        for internal_id, det_index in matched:
            det = detections[det_index]
            tracks.append(
                Track(
                    track_id=self._external_id(internal_id),
                    box=det.box,
                    score=det.score,
                    first_seen_ts=self._first_seen.setdefault(internal_id, frame.ts),
                )
            )
        self._forget_dead()
        return tracks

    def _external_id(self, internal_id: int) -> str:
        ext = self._ids.get(internal_id)
        if ext is None:
            used = set(self._ids.values())
            ext = self._id_factory()
            while ext in used:
                ext = self._id_factory()
            self._ids[internal_id] = ext
        return ext

    def _forget_dead(self) -> None:
        alive = self._core.alive_ids()
        for internal_id in [i for i in self._ids if i not in alive]:
            del self._ids[internal_id]
            self._first_seen.pop(internal_id, None)
