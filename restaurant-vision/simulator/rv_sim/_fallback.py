"""Pass-through detector and truth tracker (``rv-sim eval --tracker fallback``).

They turn synthetic frames into tracks using the simulator's true identities, so an evaluation
measures the analytics alone, without detector or tracker errors beyond the noise the scenario
puts into the frames (jitter, occlusion, false positives). A person keeps one track id per
appearance on a camera; an occluded person keeps their id when they reappear (a perfect
tracker); every false positive is its own one-frame track.
"""

from __future__ import annotations

from collections.abc import Callable

from rv_contracts import AppearanceHints, Detection, Frame, Track
from rv_edge.interfaces import SyntheticImage

from .world import CameraObservation


class PassThroughDetector:
    """``Detector``: every box of a ``SyntheticImage`` becomes a detection."""

    def __init__(self, score: float = 0.9) -> None:
        self.score = score

    def detect(self, frame: Frame) -> list[Detection]:
        image = frame.image
        if not isinstance(image, SyntheticImage):
            raise TypeError("PassThroughDetector needs frames from a simulated source")
        return [Detection(box=p.box, score=self.score) for p in image.people]


class TruthTracker:
    """``Tracker`` that assigns ids from the truth behind each frame.

    ``lookup(frame_index)`` returns the :class:`CameraObservation` of this camera's frame
    (``Simulation.observation`` bound to the camera). Detections are matched to the truth by
    identical box, so the detector must pass boxes through unchanged.
    """

    def __init__(self, lookup: Callable[[int], CameraObservation | None]) -> None:
        self._lookup = lookup
        self._ids: dict[str, str] = {}
        self._first_seen: dict[str, float] = {}

    def reset(self) -> None:
        self._ids.clear()
        self._first_seen.clear()

    def update(self, detections: list[Detection], frame: Frame) -> list[Track]:
        obs = self._lookup(frame.index)
        truth = {p.box: p for p in obs.people} if obs is not None else {}
        tracks: list[Track] = []
        for i, det in enumerate(detections):
            person = truth.get(det.box)
            key = person.key if person is not None else f"unknown:{frame.index}:{i}"
            track_id = self._ids.setdefault(key, f"trk-{len(self._ids) + 1}")
            first_seen = self._first_seen.setdefault(key, frame.ts)
            score = person.uniform_score if person is not None else None
            tracks.append(
                Track(
                    track_id=track_id,
                    box=det.box,
                    score=det.score,
                    first_seen_ts=first_seen,
                    hints=AppearanceHints(uniform_score=score),
                )
            )
        return tracks
