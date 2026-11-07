"""A tiny DSL to script people in front of the cameras and replay them through the engine.

    sc = Scenario(crisp_config())
    sc.add(person(at="t3", role="guest", from_t=10, to_t=300))
    sc.add(person(at="t3", role="staff", from_t=100, to_t=110))
    events = sc.run(until=400)
    assert sc.summary(events) == [(30.0, "state", "t3", "empty", "seated", 1), ...]

Times in the DSL are seconds relative to ``T0``. Frames are generated for every enabled camera
at ``fps`` (default 4: 0.25 s steps are exact binary fractions, so threshold boundaries are
exact), and ``on_tick`` is called every ``tick_s`` after the frames of that instant.
A person is visible for ``from_t <= t < to_t`` except inside ``gaps`` (occlusion).
Roles are conveyed the way the vision pipeline does it: by ``hints.uniform_score``
(guest 0.1, staff 0.9, unknown None).
"""

from __future__ import annotations

import dataclasses
import itertools
import math
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from typing import Any

from rv_contracts import (
    AckVia,
    AlertAcknowledged,
    AlertRaised,
    AlertResolved,
    Anchor,
    AppearanceHints,
    EdgeEvent,
    OccupancySnapshot,
    QueueSeated,
    QueueSnapshot,
    QueueWalkaway,
    SiteConfig,
    TableSessionClosed,
    TableStateChanged,
    Thresholds,
    Track,
    TrackFrame,
    Zone,
)
from rv_contracts.fixtures import SAMPLE_TS, sample_site_config

from rv_edge.analytics import DefaultAnalyticsEngine
from rv_edge.analytics.zones import PolygonZone

T0 = SAMPLE_TS
Point2 = tuple[float, float]

ROLE_UNIFORM: dict[str, float | None] = {"guest": 0.1, "staff": 0.9, "unknown": None}

_ids = itertools.count(1)


class FixedClock:
    """A clock that never moves (the engine must not depend on it)."""

    def __init__(self, ts: float = T0) -> None:
        self.ts = ts

    def now(self) -> float:
        return self.ts


def with_thresholds(config: SiteConfig, **changes: Any) -> SiteConfig:
    data = config.model_dump()
    data["thresholds"] = {**data["thresholds"], **changes}
    return SiteConfig.model_validate(data)


def with_modules(config: SiteConfig, **changes: bool) -> SiteConfig:
    data = config.model_dump()
    data["modules"] = {**data["modules"], **changes}
    return SiteConfig.model_validate(data)


def with_zones(
    config: SiteConfig, add: Iterable[Zone] = (), remove: Iterable[str] = ()
) -> SiteConfig:
    removed = set(remove)
    data = config.model_dump()
    data["zones"] = [z for z in data["zones"] if z["zone_id"] not in removed]
    data["zones"] += [z.model_dump() for z in add]
    return SiteConfig.model_validate(data)


def replace(config: SiteConfig, **changes: Any) -> SiteConfig:
    return SiteConfig.model_validate({**config.model_dump(), **changes})


def crisp_config(**thresholds: Any) -> SiteConfig:
    """Sample config with a median window shorter than one frame step: the smoothed count
    equals the held count, which makes state timings easy to read."""
    return with_thresholds(sample_site_config(), **{"count_window_s": 0.1, **thresholds})


def default_thresholds() -> Thresholds:
    return Thresholds()


def zone_point(config: SiteConfig, ref: str, offset: Point2 = (0.0, 0.0)) -> tuple[str, Point2]:
    """``(camera_id, point)`` at the centroid of zone ``ref`` (or the primary zone of table
    ``ref``), shifted by ``offset``."""
    zone = config.primary_zone(ref) or next(z for z in config.zones if z.zone_id == ref)
    cx, cy = PolygonZone.from_zone(zone).centroid()
    return zone.camera_id, (cx + offset[0], cy + offset[1])


@dataclass(frozen=True)
class Person:
    """One tracked person on one camera."""

    track_id: str
    camera_id: str
    path: tuple[tuple[float, Point2], ...]
    """``(t, anchor)`` waypoints, linearly interpolated; clamped before/after."""
    from_t: float = 0.0
    to_t: float = math.inf
    uniform: float | None = None
    gaps: tuple[tuple[float, float], ...] = ()

    def anchor_at(self, t: float) -> Point2 | None:
        if t < self.from_t or t >= self.to_t:
            return None
        if any(g0 <= t < g1 for g0, g1 in self.gaps):
            return None
        path = self.path
        if t <= path[0][0]:
            return path[0][1]
        for (t0, p0), (t1, p1) in itertools.pairwise(path):
            if t <= t1:
                f = (t - t0) / (t1 - t0)
                return (p0[0] + f * (p1[0] - p0[0]), p0[1] + f * (p1[1] - p0[1]))
        return path[-1][1]


def _uniform(role: str, uniform: float | None | str) -> float | None:
    return ROLE_UNIFORM[role] if uniform == "role" else uniform  # type: ignore[return-value]


def person(
    at: str | Point2,
    role: str = "guest",
    from_t: float = 0.0,
    to_t: float = math.inf,
    *,
    camera: str | None = None,
    track_id: str | None = None,
    offset: Point2 = (0.0, 0.0),
    gaps: Sequence[tuple[float, float]] = (),
    uniform: float | None | str = "role",
    config: SiteConfig | None = None,
) -> Person:
    """A person standing still at zone/table ``at`` (or at a point on ``camera``)."""
    if isinstance(at, str):
        cam, point = zone_point(config or sample_site_config(), at, offset)
    else:
        assert camera is not None, "a point needs a camera"
        cam, point = camera, at
    return Person(
        track_id=track_id or f"trk-{next(_ids)}",
        camera_id=camera or cam,
        path=((from_t, point),),
        from_t=from_t,
        to_t=to_t,
        uniform=_uniform(role, uniform),
        gaps=tuple(gaps),
    )


def walker(
    waypoints: Sequence[tuple[float, str | Point2]],
    role: str = "guest",
    *,
    camera: str | None = None,
    to_t: float | None = None,
    from_t: float | None = None,
    track_id: str | None = None,
    gaps: Sequence[tuple[float, float]] = (),
    uniform: float | None | str = "role",
    config: SiteConfig | None = None,
) -> Person:
    """A person moving through ``waypoints`` (zone/table ids or points). Visible from the
    first waypoint (or ``from_t``) until ``to_t`` (default: forever)."""
    cfg = config or sample_site_config()
    path: list[tuple[float, Point2]] = []
    cam = camera
    for t, ref in waypoints:
        if isinstance(ref, str):
            zc, point = zone_point(cfg, ref)
            cam = cam or zc
        else:
            point = ref
        path.append((t, point))
    assert cam is not None, "walker needs a camera or a zone waypoint"
    return Person(
        track_id=track_id or f"trk-{next(_ids)}",
        camera_id=cam,
        path=tuple(path),
        from_t=path[0][0] if from_t is None else from_t,
        to_t=math.inf if to_t is None else to_t,
        uniform=_uniform(role, uniform),
        gaps=tuple(gaps),
    )


def rotate(people: Iterable[Person], at: float) -> list[Person]:
    """The tracker's daily id rotation: every person visible across ``at`` continues under a
    new track id from ``at`` on (old id until just before, new id from that very frame)."""
    out: list[Person] = []
    for p in people:
        if p.from_t < at < p.to_t:
            out.append(dataclasses.replace(p, to_t=at))
            out.append(dataclasses.replace(p, from_t=at, track_id=f"{p.track_id}-r"))
        else:
            out.append(p)
    return out


def box_for(anchor: Point2, mode: Anchor) -> tuple[float, float, float, float]:
    """A person-sized box whose anchor point is ``anchor``."""
    x, y = anchor
    if mode is Anchor.FOOT:
        return (x - 0.02, max(0.0, y - 0.15), x + 0.02, y)
    return (x - 0.02, y - 0.05, x + 0.02, y + 0.05)


@dataclass
class Scenario:
    """Replays people through an engine (see module docstring)."""

    config: SiteConfig = field(default_factory=crisp_config)
    fps: float = 4.0
    tick_s: float = 1.0
    engine: DefaultAnalyticsEngine | None = None
    people: list[Person] = field(default_factory=list)
    events: list[EdgeEvent] = field(default_factory=list)
    alert_kinds: dict[str, tuple[str, str | None]] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.engine is None:
            self.engine = DefaultAnalyticsEngine(self.config, clock=FixedClock())
        self._dt = 1.0 / self.fps
        self._tick_every = max(1, round(self.tick_s / self._dt))
        self._n = 0
        self._index: dict[str, int] = {}

    @property
    def eng(self) -> DefaultAnalyticsEngine:
        assert self.engine is not None
        return self.engine

    @property
    def now(self) -> float:
        """Relative time of the last processed step."""
        return (self._n - 1) * self._dt

    def add(self, *people: Person) -> Scenario:
        self.people.extend(people)
        return self

    def frame(self, camera_id: str, t: float) -> TrackFrame:
        anchors = {c.camera_id: c.anchor for c in self.config.cameras}
        tracks = []
        for p in self.people:
            if p.camera_id != camera_id:
                continue
            anchor = p.anchor_at(t)
            if anchor is None:
                continue
            tracks.append(
                Track(
                    track_id=p.track_id,
                    box=box_for(anchor, anchors[camera_id]),
                    score=0.9,
                    first_seen_ts=T0 + p.from_t,
                    hints=AppearanceHints(uniform_score=p.uniform),
                )
            )
        index = self._index.get(camera_id, 0)
        self._index[camera_id] = index + 1
        return TrackFrame(camera_id=camera_id, ts=T0 + t, index=index, tracks=tuple(tracks))

    def run(self, until: float) -> list[EdgeEvent]:
        """Process every step up to and including relative time ``until``."""
        out: list[EdgeEvent] = []
        while self._n * self._dt <= until + 1e-9:
            t = self._n * self._dt
            for camera in self.config.cameras:
                if camera.enabled:
                    out += self.eng.on_track_frame(self.frame(camera.camera_id, t))
            if self._n % self._tick_every == 0:
                out += self.eng.on_tick(T0 + t)
            self._n += 1
        self._record(out)
        return out

    def configure(self, config: SiteConfig) -> None:
        self.config = config
        self.eng.configure(config)

    def ack(self, alert_id: str, at: float, via: AckVia = AckVia.LOCAL) -> list[EdgeEvent]:
        out = self.eng.apply_ack(alert_id, T0 + at, via)
        self._record(out)
        return out

    def _record(self, events: list[EdgeEvent]) -> None:
        self.events += events
        for ev in events:
            if isinstance(ev, AlertRaised):
                self.alert_kinds[ev.alert_id] = (ev.kind.value, ev.table_id or ev.zone_id)

    def alert_id(self, kind: str, target: str | None = None) -> str:
        """Id of the latest raised alert of ``kind`` (and ``target``)."""
        ids = [
            aid
            for aid, (k, tgt) in self.alert_kinds.items()
            if k == kind and (target is None or tgt == target)
        ]
        assert ids, f"no {kind} alert raised"
        return ids[-1]

    def summary(
        self, events: Iterable[EdgeEvent] | None = None, *, snapshots: bool = False
    ) -> list[tuple[Any, ...]]:
        return summarize(self.events if events is None else events, self.alert_kinds, snapshots)


def rel(ts: float) -> float:
    return round(ts - T0, 6)


def summarize(
    events: Iterable[EdgeEvent],
    alert_kinds: dict[str, tuple[str, str | None]] | None = None,
    snapshots: bool = False,
) -> list[tuple[Any, ...]]:
    """Readable tuples for event-sequence assertions (times relative to ``T0``)."""
    kinds = dict(alert_kinds or {})
    out: list[tuple[Any, ...]] = []
    for ev in events:
        t = rel(ev.ts)
        if isinstance(ev, TableStateChanged):
            out.append(
                (t, "state", ev.table_id, ev.from_state.value, ev.to_state.value, ev.guest_count)
            )
        elif isinstance(ev, TableSessionClosed):
            out.append(
                (
                    t,
                    "closed",
                    ev.table_id,
                    rel(ev.seated_at),
                    rel(ev.left_at),
                    ev.max_guests,
                    ev.first_visit_delay_s,
                    ev.visits,
                )
            )
        elif isinstance(ev, AlertRaised):
            kinds[ev.alert_id] = (ev.kind.value, ev.table_id or ev.zone_id)
            out.append((t, "raised", ev.kind.value, ev.table_id or ev.zone_id))
        elif isinstance(ev, AlertAcknowledged):
            out.append((t, "acked", kinds.get(ev.alert_id, ("?",))[0], ev.via.value))
        elif isinstance(ev, AlertResolved):
            out.append((t, "resolved", kinds.get(ev.alert_id, ("?",))[0], ev.reason.value))
        elif isinstance(ev, QueueSeated):
            out.append((t, "seated", ev.zone_id, ev.waited_s))
        elif isinstance(ev, QueueWalkaway):
            out.append((t, "walkaway", ev.zone_id, ev.waited_s, ev.party_size_est))
        elif snapshots and isinstance(ev, QueueSnapshot):
            out.append(
                (t, "queue", ev.zone_id, ev.people, ev.parties_est, ev.longest_wait_s,
                 ev.avg_wait_s)
            )
        elif snapshots and isinstance(ev, OccupancySnapshot):
            out.append(
                (t, "occupancy", ev.guests, ev.tables_occupied, ev.tables_total,
                 ev.staff_on_floor)
            )
    return out


def of_type(events: Iterable[EdgeEvent], cls: type[Any]) -> list[Any]:
    return [e for e in events if isinstance(e, cls)]
