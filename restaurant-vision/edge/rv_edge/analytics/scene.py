"""Shared perception for all analytics modules: anchors, zone hits, roles and line crossings.

:class:`SceneModule` turns a ``TrackFrame`` into a :class:`FrameObservation` once per frame;
the table, queue and occupancy modules read the same observation (cached by frame identity),
so zones are hit-tested and roles updated exactly once per track and frame.

Line crossings follow the advice of :func:`rv_contracts.line_crossing`: per track and line we
keep the last anchor that was *off* the line and test the movement from it to the current
anchor, so a track pausing on the line is counted exactly once when it leaves it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from rv_contracts import Crossing, EdgeEvent, SiteConfig, TrackFrame

from .roles import ROLE_FORGET_AFTER_S, Role, RoleBook, Sighting
from .zones import CameraZones, Point2, TrackKey, ZoneHits, ZoneIndex


@dataclass(frozen=True, slots=True)
class TrackObservation:
    """One track in one frame, enriched for the analytics."""

    key: TrackKey
    anchor: Point2
    role: Role
    hits: ZoneHits
    crossings: tuple[tuple[str, Crossing], ...] = ()
    """``(entrance_line zone id, direction)`` for every line crossed since the last frame."""


@dataclass(frozen=True, slots=True)
class FrameObservation:
    """All tracks of one ``TrackFrame``."""

    camera_id: str
    ts: float
    tracks: tuple[TrackObservation, ...]


class SceneModule:
    """Perception layer (an ``AnalyticsModule`` that emits no events).

    ``observe(tf)`` is idempotent per ``TrackFrame`` object: the engine calls it first and every
    module calling it again for the same frame gets the cached result.
    """

    def __init__(
        self,
        config: SiteConfig,
        *,
        roles: RoleBook | None = None,
        forget_after_s: float = ROLE_FORGET_AFTER_S,
    ) -> None:
        self._roles = roles if roles is not None else RoleBook(forget_after_s=forget_after_s)
        self._forget_after_s = forget_after_s
        self._zones = ZoneIndex(config)
        self._last_offline: dict[TrackKey, dict[str, Point2]] = {}
        self._seen: dict[TrackKey, float] = {}
        self._cache: tuple[TrackFrame, FrameObservation] | None = None

    @property
    def name(self) -> str:
        return "scene"

    @property
    def zones(self) -> ZoneIndex:
        return self._zones

    @property
    def roles(self) -> RoleBook:
        return self._roles

    def configure(self, config: SiteConfig) -> None:
        """Rebuild the zone index; forget tracks of cameras that are gone or disabled."""
        self._zones = ZoneIndex(config)
        self._cache = None
        for key in [k for k in self._seen if self._zones.camera(k[0]) is None]:
            self._drop(key)
            self._roles.forget(key)
        for camera_id in {k[0] for k in self._last_offline}:
            if self._zones.camera(camera_id) is None:
                self._roles.forget_camera(camera_id)

    def observe(self, tf: TrackFrame) -> FrameObservation | None:
        """Observation of ``tf``; None if its camera is unknown or disabled."""
        cached = self._cache
        if cached is not None and cached[0] is tf:
            return cached[1]
        cam = self._zones.camera(tf.camera_id)
        if cam is None:
            return None
        ts = tf.ts
        observations: list[TrackObservation] = []
        for track in tf.tracks:
            key = (tf.camera_id, track.track_id)
            anchor = cam.anchor_of(track.box)
            hits = cam.hits(anchor)
            role = self._roles.observe(
                Sighting(key, ts, anchor, hits, track.hints.uniform_score)
            )
            crossings = self._crossings(key, cam, anchor) if cam.lines else ()
            self._seen[key] = ts
            observations.append(TrackObservation(key, anchor, role, hits, crossings))
        result = FrameObservation(tf.camera_id, ts, tuple(observations))
        self._cache = (tf, result)
        return result

    def _crossings(
        self, key: TrackKey, cam: CameraZones, anchor: Point2
    ) -> tuple[tuple[str, Crossing], ...]:
        last = self._last_offline.setdefault(key, {})
        found: list[tuple[str, Crossing]] = []
        for line in cam.lines:
            prev = last.get(line.zone_id)
            if prev is not None:
                crossing = line.crossing(prev, anchor)
                if crossing is not None:
                    found.append((line.zone_id, crossing))
            if line.side(anchor) != 0:
                last[line.zone_id] = anchor
        return tuple(found)

    def _drop(self, key: TrackKey) -> None:
        self._seen.pop(key, None)
        self._last_offline.pop(key, None)

    def on_track_frame(self, tf: TrackFrame) -> list[EdgeEvent]:
        self.observe(tf)
        return []

    def on_tick(self, now: float) -> list[EdgeEvent]:
        """Forget tracks not seen for more than ``forget_after_s``."""
        self._roles.forget_stale(now)
        for key in [k for k, ts in self._seen.items() if now - ts > self._forget_after_s]:
            self._drop(key)
        return []

    def snapshot(self) -> dict[str, Any]:
        return {"tracks": len(self._seen), "roles": self._roles.counts()}
