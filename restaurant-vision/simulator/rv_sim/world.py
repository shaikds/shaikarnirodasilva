"""Deterministic discrete-time agent simulation of one restaurant service.

The world steps at the cameras' frame rate (``dt = 1 / fps``, 0.2 s by default). Each tick:

1. every person moves along their planned *legs* (walk a polyline, hold a spot, transit
   between cameras off screen, vanish) and leg callbacks fire at the exact leg end time;
2. due events run (arrivals, host decisions, patience timeouts, departures);
3. idle waiters take due tasks (first visit, check-in, bussing);
4. the ground truth is updated from the true anchor points (zone entries/exits, entrance line
   crossings, occupancy once per second).

Guest parties: arrive at the street door (entrance camera) -> the host seats them at the
smallest free table that fits, or they join the queue (or balk if it is full) -> walk across the
entrance line inward -> off camera -> appear at the dining camera's entry -> walk the aisle to
their seats -> dwell -> walk out (across the entrance line outward) and vanish. A queued party
whose wait exceeds its patience walks back to the door without crossing the line. Waiters idle
in the staff area and walk the aisle to tables.

Time base: ``start_ts`` is the scenario's ``run.date`` + ``run.start`` in the site's time zone,
unless overridden (``rv-edge simulate --rebase-to-now`` passes the current time so live timers
and today's shift report work in demos). The override only shifts timestamps: the arrival plan
(``hourly_rates`` by local hour) is computed on the scenario's own clock, so a rebased run is
the same service at another time.

Randomness: independent ``random.Random`` streams per purpose (arrivals, parties, staff,
dynamics), so the same seed always gives the same world. Detector noise for a frame comes from
a stream keyed by ``(seed, camera, tick)``, so observations do not depend on who reads which
frame when.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import heapq
import itertools
import math
import random
import threading
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field
from enum import StrEnum
from functools import partial
from zoneinfo import ZoneInfo

from rv_contracts import anchor_point, line_crossing, segment_side
from rv_edge.interfaces import SyntheticImage, SyntheticPerson

from .ground_truth import GroundTruth, OccupancyPoint, TrueSession, TrueVisit
from .layout import Box, Posture, Pt, TableGeometry, clip_box, cumulative_lengths, dedupe
from .layout import point_along as _point_along
from .scenario import ExplicitArrival, Scenario

_EPS = 1e-9


def derived_seed(*parts: object) -> int:
    """Stable 64-bit seed from any parts (independent of ``PYTHONHASHSEED``)."""
    text = ":".join(str(p) for p in parts).encode()
    return int.from_bytes(hashlib.blake2b(text, digest_size=8).digest(), "big")


def _rng(*parts: object) -> random.Random:
    return random.Random(derived_seed(*parts))


class Role(StrEnum):
    GUEST = "guest"
    STAFF = "staff"


class PartyPhase(StrEnum):
    ARRIVING = "arriving"
    """At the door while the host decides."""
    QUEUED = "queued"
    TO_TABLE = "to_table"
    SEATED = "seated"
    LEAVING = "leaving"
    DEPARTED = "departed"
    WALKING_AWAY = "walking_away"
    WALKED_AWAY = "walked_away"
    BALKED = "balked"
    """Queue full on arrival: left straight away."""


class TableStatus(StrEnum):
    FREE = "free"
    RESERVED = "reserved"
    OCCUPIED = "occupied"
    DIRTY = "dirty"
    BUSSING = "bussing"


class TaskKind(StrEnum):
    FIRST_VISIT = "first_visit"
    CHECKIN = "checkin"
    BUSSING = "bussing"


# --------------------------------------------------------------------------------------
# Movement
# --------------------------------------------------------------------------------------


@dataclass(slots=True)
class Leg:
    """One piece of a person's plan: walk ``points`` (or hold ``points[0]``) on a camera, or
    be off camera (``camera_id`` None) for ``duration`` seconds."""

    camera_id: str | None
    points: tuple[Pt, ...]
    duration: float
    posture: Posture
    activity: str
    allowed: frozenset[str] = frozenset()
    """Zones the person's anchor may be in during this leg (tests check this)."""
    required: str | None = None
    """Zone the anchor must be in (holds at a seat, queue slot, staff spot ...)."""
    on_done: Callable[[float], None] | None = None
    vanish: bool = False
    start: float | None = None
    cum: tuple[float, ...] = ()

    def __post_init__(self) -> None:
        self.cum = tuple(cumulative_lengths(self.points))
        if self.required is not None:
            self.allowed = self.allowed | {self.required}

    def position(self, t: float) -> Pt:
        assert self.start is not None
        if self.duration <= 0 or len(self.points) == 1:
            return self.points[-1] if t >= self.start + self.duration else self.points[0]
        frac = min(1.0, max(0.0, (t - self.start) / self.duration))
        return _point_along(self.points, self.cum, frac * self.cum[-1])


@dataclass(eq=False, slots=True)
class OcclusionSchedule:
    """Alternating visible/occluded periods (exponential lengths) for one seated person."""

    rng: random.Random
    fraction: float
    mean_s: float
    occluded_now: bool = False
    until: float = 0.0

    @classmethod
    def start(
        cls, rng: random.Random, fraction: float, mean_s: float, ts: float
    ) -> OcclusionSchedule:
        schedule = cls(rng, fraction, mean_s, rng.random() < fraction)
        schedule.until = ts + schedule._draw()
        return schedule

    def _draw(self) -> float:
        mean = (
            self.mean_s if self.occluded_now else self.mean_s * (1 - self.fraction) / self.fraction
        )
        return self.rng.expovariate(1.0 / mean)

    def occluded(self, ts: float) -> bool:
        """Whether the person is hidden at ``ts`` (queries must not go back in time)."""
        while ts >= self.until:
            self.occluded_now = not self.occluded_now
            self.until += self._draw()
        return self.occluded_now


@dataclass(eq=False, slots=True)
class Person:
    person_id: str
    role: Role
    uniform_score: float
    height_factor: float
    party_id: str | None = None
    camera_id: str | None = None
    pos: Pt | None = None
    posture: Posture = Posture.STANDING
    activity: str = "offstage"
    allowed: frozenset[str] = frozenset()
    required: str | None = None
    legs: deque[Leg] = field(default_factory=deque)
    gone: bool = False
    episode: int = 0
    """Number of times this person appeared on a camera (true track = id + episode)."""
    seen_camera: str | None = None
    box: Box | None = None
    """True box at the current tick (None when off camera)."""
    anchor: Pt | None = None
    zones: frozenset[str] = frozenset()
    """Zones containing the true anchor at the current tick."""
    last_off_line: Pt | None = None
    occlusion: OcclusionSchedule | None = None
    visit: TrueVisit | None = None
    geo_key: tuple[str, Pt, Posture] | None = None

    @property
    def track_key(self) -> str:
        return f"{self.person_id}#{self.episode}"


@dataclass(frozen=True, slots=True)
class PartyPlan:
    """Everything random about a party, drawn up front so dynamics cannot change it."""

    party_id: str
    at: float
    size: int
    dwell_s: float
    patience_s: float
    first_visit_delay_s: float
    uniform_scores: tuple[float, ...]
    height_factors: tuple[float, ...]


@dataclass(eq=False, slots=True)
class Party:
    plan: PartyPlan
    members: list[Person]
    phase: PartyPhase = PartyPhase.ARRIVING
    table_id: str | None = None
    slots: list[int] = field(default_factory=list)
    seated_count: int = 0
    session: TrueSession | None = None
    leave_at: float | None = None
    from_queue: bool = False

    @property
    def party_id(self) -> str:
        return self.plan.party_id

    @property
    def size(self) -> int:
        return self.plan.size


@dataclass(eq=False, slots=True)
class TableRuntime:
    geo: TableGeometry
    status: TableStatus = TableStatus.FREE
    party: Party | None = None
    session: TrueSession | None = None


@dataclass(order=True, slots=True)
class Task:
    due: float
    seq: int
    kind: TaskKind = field(compare=False)
    table_id: str = field(compare=False)
    party: Party | None = field(default=None, compare=False)
    cancelled: bool = field(default=False, compare=False)

    @property
    def visit_kind(self) -> str:
        return "bussing" if self.kind is TaskKind.BUSSING else "service"


@dataclass(eq=False, slots=True)
class StaffMember:
    index: int
    person: Person
    home: Pt
    task: Task | None = None


# --------------------------------------------------------------------------------------
# Observations
# --------------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ObservedPerson:
    """One box in a synthetic frame, with the truth behind it."""

    key: str
    """True track identity: ``<person_id>#<episode>``, or ``fp:...`` for false positives."""
    person_id: str | None
    role: str
    """``guest``, ``staff`` or ``false_positive``."""
    box: Box
    """What the detector sees (jittered)."""
    true_box: Box | None
    uniform_score: float


@dataclass(frozen=True, slots=True)
class CameraObservation:
    camera_id: str
    tick: int
    ts: float
    people: tuple[ObservedPerson, ...]
    """Boxes in the frame (visible people and false positives)."""
    hidden: tuple[str, ...]
    """Track keys of people on this camera that are occluded in this frame."""

    def image(self) -> SyntheticImage:
        return SyntheticImage(
            people=tuple(SyntheticPerson(p.box, p.uniform_score) for p in self.people)
        )


# --------------------------------------------------------------------------------------
# World
# --------------------------------------------------------------------------------------


class World:
    """The simulated restaurant (see module docstring). Thread-safe for concurrent readers:
    :meth:`advance_to_tick` and :meth:`observe` hold :attr:`lock`."""

    def __init__(
        self, scenario: Scenario, *, seed: int = 0, start_ts: float | None = None
    ) -> None:
        self.scenario = scenario
        self.config = scenario.site_config
        self.geometry = scenario.geometry
        self.seed = scenario.seed + seed
        self.fps = scenario.run.fps
        self.dt = 1.0 / self.fps
        self.scenario_start_ts = scenario.start_epoch()
        """The scenario's own start (``run.date`` + ``run.start``); plans arrivals."""
        self.start_ts = self.scenario_start_ts if start_ts is None else float(start_ts)
        """Time of tick 0: the scenario start, or the ``start_ts`` override."""
        self.end_tick = max(1, round(scenario.run.duration * self.fps))
        self.end_ts = self.start_ts + self.end_tick * self.dt
        self.lock = threading.RLock()
        self.truth = GroundTruth(
            site_id=self.config.site_id,
            thresholds=self.config.thresholds,
            start_ts=self.start_ts,
            end_ts=self.end_ts,
        )
        self.tick = 0
        self.people: dict[str, Person] = {}
        self.parties: dict[str, Party] = {}
        self.tables = {tid: TableRuntime(g) for tid, g in self.geometry.tables.items()}
        self._table_order = {t.table_id: i for i, t in enumerate(self.config.tables)}
        self.queue: list[Party] = []
        self._slot_owner: list[str | None] = [None] * len(self.geometry.queue_slots)
        self._events: list[tuple[float, int, Callable[[float], None]]] = []
        self._tasks: list[Task] = []
        self._seq = itertools.count()
        self._leaving: list[Party] = []
        self._next_occupancy_t = 0.0
        self._obs: dict[str, CameraObservation] = {}
        self._rng = _rng(self.seed, "dynamics")
        self.staff: list[StaffMember] = []
        self._staff_by_pid: dict[str, StaffMember] = {}
        self.plans = self._plan_parties()
        self._init_staff()
        for plan in self.plans:
            self._at(plan.at, partial(self._arrive, plan))
        self._run_due(0.0)
        self._dispatch(0.0)
        self._observe_truth()

    # --- time ------------------------------------------------------------------------------

    @property
    def t(self) -> float:
        """Seconds since the run start."""
        return self.tick * self.dt

    @property
    def ts(self) -> float:
        """Epoch seconds of the current tick."""
        return self.start_ts + self.tick * self.dt

    @property
    def finished(self) -> bool:
        return self.tick >= self.end_tick

    @property
    def camera_ids(self) -> list[str]:
        return [c.camera_id for c in self.config.cameras if c.enabled]

    def tick_at(self, ts: float) -> int:
        """Tick index of the frame interval containing epoch time ``ts`` (may be < 0)."""
        return math.floor((ts - self.start_ts) / self.dt + 1e-6)

    def step(self) -> None:
        """Advance one tick (no-op at the end of the run)."""
        with self.lock:
            if self.tick >= self.end_tick:
                return
            self.tick += 1
            t = self.t
            for person in list(self.people.values()):
                self._advance(person, t)
            self._run_due(t)
            self._dispatch(t)
            self._observe_truth()

    def advance_to_tick(self, tick: int) -> None:
        with self.lock:
            target = min(tick, self.end_tick)
            while self.tick < target:
                self.step()

    def run_to_end(self) -> None:
        self.advance_to_tick(self.end_tick)

    # --- queries ---------------------------------------------------------------------------

    def visible(self, camera_id: str) -> list[Person]:
        return [p for p in self.people.values() if p.camera_id == camera_id and p.box is not None]

    def party_phase_counts(self) -> dict[PartyPhase, int]:
        counts = {phase: 0 for phase in PartyPhase}
        for party in self.parties.values():
            counts[party.phase] += 1
        return counts

    def observe(self, camera_id: str) -> CameraObservation:
        """What ``camera_id`` sees at the current tick (cached per tick)."""
        with self.lock:
            cached = self._obs.get(camera_id)
            if cached is not None and cached.tick == self.tick:
                return cached
            obs = self._make_observation(camera_id)
            self._obs[camera_id] = obs
            return obs

    # --- setup -----------------------------------------------------------------------------

    def _plan_parties(self) -> list[PartyPlan]:
        sc = self.scenario
        body = sc.body
        rng = _rng(self.seed, "parties")
        items: list[tuple[float, ExplicitArrival | None]]
        if sc.arrivals.explicit is not None:
            scripted = sorted(sc.arrivals.explicit, key=lambda a: a.at)
            items = [(a.at, a) for a in scripted]
        else:
            items = [(t, None) for t in self._arrival_times(_rng(self.seed, "arrivals"))]
        sizes = [s for s, w in sorted(sc.party_size.items()) if w > 0]
        weights = [sc.party_size[s] for s in sizes]
        plans: list[PartyPlan] = []
        for i, (at, scripted_arrival) in enumerate(items):
            size = rng.choices(sizes, weights)[0]
            if scripted_arrival is not None:
                size = scripted_arrival.size
            dwell = sc.dwell.for_size(size).sample(rng)
            patience = sc.patience.sample(rng)
            first_visit = sc.staff.first_visit_delay.sample(rng)
            if scripted_arrival is not None:
                dwell = _override(scripted_arrival.dwell, dwell)
                patience = _override(scripted_arrival.patience, patience)
                first_visit = _override(scripted_arrival.first_visit_delay, first_visit)
            scores = tuple(sc.uniform_scores.guest.sample(rng) for _ in range(size))
            heights = tuple(body.clamp_factor(rng.gauss(1.0, body.height_sd)) for _ in range(size))
            plans.append(
                PartyPlan(f"p{i + 1:03d}", at, size, dwell, patience, first_visit, scores, heights)
            )
        return plans

    def _arrival_times(self, rng: random.Random) -> list[float]:
        """Piecewise-constant Poisson process over local clock hours."""
        rates = self.scenario.arrivals.hourly_rates or {}
        tz = ZoneInfo(self.config.timezone)
        end = self.scenario.run.duration - self.scenario.arrivals.stop_before_end
        out: list[float] = []
        t = 0.0
        while t < end:
            local = dt.datetime.fromtimestamp(round(self.scenario_start_ts + t, 3), tz)
            into_hour = local.minute * 60 + local.second + local.microsecond / 1e6
            boundary = t + 3600.0 - into_hour
            rate = rates.get(local.hour, 0.0)
            if rate <= 0:
                t = boundary
                continue
            gap = rng.expovariate(rate / 3600.0)
            if t + gap >= boundary:
                t = boundary
                continue
            t += gap
            if t < end:
                out.append(t)
        return out

    def _init_staff(self) -> None:
        sc = self.scenario
        geo = self.geometry
        rng = _rng(self.seed, "staff")
        for i in range(sc.staff.count):
            person = Person(
                f"s{i + 1}",
                Role.STAFF,
                sc.uniform_scores.staff.sample(rng),
                sc.body.clamp_factor(rng.gauss(1.0, sc.body.height_sd)),
            )
            home = geo.staff_spots[i % len(geo.staff_spots)]
            member = StaffMember(i, person, home)
            self.staff.append(member)
            self._staff_by_pid[person.person_id] = member
            self.people[person.person_id] = person
            self._place(person, geo.staff_camera, home, "staff_idle", required=geo.staff_zone_id)

    # --- scheduling ------------------------------------------------------------------------

    def _at(self, t: float, fn: Callable[[float], None]) -> None:
        heapq.heappush(self._events, (t, next(self._seq), fn))

    def _run_due(self, t: float) -> None:
        while self._events and self._events[0][0] <= t + _EPS:
            _, _, fn = heapq.heappop(self._events)
            fn(t)

    def _add_task(self, due: float, kind: TaskKind, table_id: str, party: Party | None) -> None:
        heapq.heappush(self._tasks, Task(due, next(self._seq), kind, table_id, party))

    # --- legs ------------------------------------------------------------------------------

    def _walk(
        self,
        camera_id: str,
        points: list[Pt],
        speed: float,
        activity: str,
        allowed: frozenset[str] = frozenset(),
    ) -> Leg:
        pts = tuple(dedupe(points))
        length = cumulative_lengths(pts)[-1]
        return Leg(camera_id, pts, length / speed, Posture.STANDING, activity, allowed)

    def _hold(
        self,
        camera_id: str,
        at: Pt,
        duration: float,
        activity: str,
        *,
        posture: Posture = Posture.STANDING,
        required: str | None = None,
        allowed: frozenset[str] = frozenset(),
        on_done: Callable[[float], None] | None = None,
    ) -> Leg:
        return Leg(camera_id, (at,), duration, posture, activity, allowed, required, on_done)

    def _stay(self, person: Person, duration: float) -> Leg:
        """Hold the current spot with the person's current attributes."""
        at = person.pos if person.pos is not None else (0.0, 0.0)
        return Leg(
            person.camera_id,
            (at,),
            duration,
            person.posture,
            person.activity,
            person.allowed,
            person.required,
        )

    def _transit(self) -> Leg:
        return Leg(None, ((0.0, 0.0),), self.scenario.motion.transit_s, Posture.STANDING, "transit")

    def _vanish(self, on_done: Callable[[float], None] | None = None) -> Leg:
        return Leg(None, ((0.0, 0.0),), 0.0, Posture.STANDING, "gone", on_done=on_done, vanish=True)

    def _plan(self, person: Person, legs: list[Leg], start: float) -> None:
        person.legs = deque(legs)
        if legs:
            legs[0].start = start

    def _place(
        self,
        person: Person,
        camera_id: str,
        at: Pt,
        activity: str,
        *,
        required: str | None = None,
        allowed: frozenset[str] = frozenset(),
    ) -> None:
        person.legs.clear()
        person.camera_id, person.pos, person.posture = camera_id, at, Posture.STANDING
        person.activity, person.required = activity, required
        person.allowed = allowed | ({required} if required else set())

    def _travel(
        self,
        person: Person,
        camera_id: str,
        to: Pt,
        speed: float,
        activity: str,
        allowed: frozenset[str],
    ) -> list[Leg]:
        """Walk from where the person is to ``to`` on ``camera_id`` (changing camera if needed)."""
        geo = self.geometry
        src_cam, src = person.camera_id, person.pos
        if src_cam == camera_id and src is not None:
            return [self._walk(camera_id, geo.route(camera_id, src, to), speed, activity, allowed)]
        legs: list[Leg] = []
        if src_cam is not None and src is not None:
            exit_route = geo.route(src_cam, src, geo.entry(src_cam))
            legs.append(self._walk(src_cam, exit_route, speed, activity, allowed))
        legs.append(self._transit())
        entry = geo.entry(camera_id)
        legs.append(
            self._walk(camera_id, geo.route(camera_id, entry, to), speed, activity, allowed)
        )
        return legs

    def _advance(self, person: Person, t: float) -> None:
        while person.legs:
            leg = person.legs[0]
            if leg.start is None:
                leg.start = t
            end = leg.start + leg.duration
            if t < end - _EPS:
                person.camera_id = leg.camera_id
                person.pos = leg.position(t) if leg.camera_id is not None else None
                person.posture, person.activity = leg.posture, leg.activity
                person.allowed, person.required = leg.allowed, leg.required
                return
            person.legs.popleft()
            person.camera_id = leg.camera_id
            person.pos = leg.points[-1] if leg.camera_id is not None else None
            person.posture, person.activity = leg.posture, leg.activity
            person.allowed, person.required = leg.allowed, leg.required
            if leg.vanish:
                self._remove(person)
                if leg.on_done is not None:
                    leg.on_done(end)
                return
            if person.legs and person.legs[0].start is None:
                person.legs[0].start = end
            if leg.on_done is not None:
                leg.on_done(end)

    def _remove(self, person: Person) -> None:
        if person.zones:
            self._zones_changed(person, person.zones, frozenset(), self.ts)
        person.gone = True
        person.camera_id = person.pos = person.box = person.anchor = None
        person.zones = frozenset()
        self.people.pop(person.person_id, None)

    # --- parties ---------------------------------------------------------------------------

    def _arrive(self, plan: PartyPlan, t: float) -> None:
        geo = self.geometry
        members = [
            Person(
                f"{plan.party_id}.{i + 1}",
                Role.GUEST,
                plan.uniform_scores[i],
                plan.height_factors[i],
                party_id=plan.party_id,
            )
            for i in range(plan.size)
        ]
        party = Party(plan, members)
        self.parties[plan.party_id] = party
        for i, m in enumerate(members):
            self.people[m.person_id] = m
            self._place(m, geo.entrance_camera, geo.door_spots[i % len(geo.door_spots)], "door")
        self.truth.party_arrived(plan.party_id, plan.size, self.start_ts + t)
        self._at(t + self.scenario.motion.door_pause_s, lambda now: self._host_decide(party, now))

    def _host_decide(self, party: Party, t: float) -> None:
        table = self._free_table(party.size)
        if table is not None:
            self._send_to_table(party, table, t, from_queue=False)
        elif self._slot_owner.count(None) >= party.size:
            self._join_queue(party, t)
        else:
            self._balk(party, t)

    def _free_table(self, size: int) -> TableRuntime | None:
        free = [
            tr
            for tr in self.tables.values()
            if tr.status is TableStatus.FREE and tr.geo.seats >= size
        ]
        if not free:
            return None
        return min(free, key=lambda tr: (tr.geo.seats, self._table_order[tr.geo.table_id]))

    def _send_to_table(
        self, party: Party, table: TableRuntime, t: float, *, from_queue: bool
    ) -> None:
        geo, motion = self.geometry, self.scenario.motion
        ent = geo.layout.entrance
        table.status, table.party = TableStatus.RESERVED, party
        party.phase, party.table_id, party.from_queue = (
            PartyPhase.TO_TABLE,
            table.geo.table_id,
            from_queue,
        )
        tail = ent.queue_exit if from_queue else ent.lane_in
        ent_allowed = frozenset({geo.queue_zone_id}) if from_queue else frozenset()
        zone = table.geo.zone_id
        cam = table.geo.camera_id
        for i, m in enumerate(party.members):
            seat = table.geo.seat_spots[i]
            legs: list[Leg] = []
            if i:
                legs.append(self._stay(m, i * motion.stagger_s))
            assert m.pos is not None
            legs.append(
                self._walk(
                    geo.entrance_camera,
                    [m.pos, *tail],
                    motion.guest_speed,
                    "to_dining",
                    ent_allowed,
                )
            )
            legs.append(self._transit())
            route = geo.route(cam, geo.entry(cam), seat)
            legs.append(self._walk(cam, route, motion.guest_speed, "to_table", frozenset({zone})))
            legs.append(
                self._hold(
                    cam,
                    seat,
                    0.0,
                    "seated",
                    posture=Posture.SEATED,
                    required=zone,
                    on_done=partial(self._member_seated, party, m),
                )
            )
            self._plan(m, legs, t)

    def _member_seated(self, party: Party, member: Person, end: float) -> None:
        noise = self.scenario.noise
        if noise.seated_miss_prob > 0:
            member.occlusion = OcclusionSchedule.start(
                _rng(self.seed, "occlusion", member.person_id),
                noise.seated_miss_prob,
                noise.occlusion_mean_s,
                self.start_ts + end,
            )
        party.seated_count += 1
        if party.seated_count < party.size:
            return
        assert party.table_id is not None
        table = self.tables[party.table_id]
        party.phase = PartyPhase.SEATED
        table.status = TableStatus.OCCUPIED
        seated_at = self.start_ts + end
        session = self.truth.open_session(
            party.table_id,
            party.party_id,
            party.size,
            seated_at,
            from_queue=party.from_queue,
            planned_dwell_s=party.plan.dwell_s,
        )
        party.session = table.session = session
        party.leave_at = end + party.plan.dwell_s
        self.truth.party_update(
            party.party_id, "seated", seated_at, table_id=party.table_id, seated_at=seated_at
        )
        self._at(party.leave_at, lambda now: self._leave(party, now))
        self._add_task(
            end + party.plan.first_visit_delay_s, TaskKind.FIRST_VISIT, party.table_id, party
        )

    def _leave(self, party: Party, t: float) -> None:
        geo, motion = self.geometry, self.scenario.motion
        assert party.table_id is not None and party.session is not None
        table = self.tables[party.table_id]
        party.phase = PartyPhase.LEAVING
        table.status = TableStatus.DIRTY
        party.session.leave_started_at = self.start_ts + t
        for task in self._tasks:
            if task.party is party:
                task.cancelled = True
        cam, zone = table.geo.camera_id, table.geo.zone_id
        ent = geo.layout.entrance
        for i, m in enumerate(party.members):
            assert m.pos is not None
            legs: list[Leg] = []
            if i:
                legs.append(self._stay(m, i * motion.stagger_s))
            route = geo.route(cam, m.pos, geo.entry(cam))
            legs.append(self._walk(cam, route, motion.guest_speed, "leaving", frozenset({zone})))
            legs.append(self._transit())
            if geo.layout.departures_via_entrance:
                legs.append(
                    self._walk(
                        geo.entrance_camera,
                        [*ent.lane_out, ent.door_exit],
                        motion.guest_speed,
                        "departing",
                    )
                )
            legs.append(self._vanish(partial(self._member_departed, party)))
            self._plan(m, legs, t)
        self._leaving.append(party)
        delay = self.scenario.staff.bussing_delay.sample(self._rng)
        self._add_task(t + delay, TaskKind.BUSSING, party.table_id, None)

    def _member_departed(self, party: Party, end: float) -> None:
        if all(m.gone for m in party.members):
            party.phase = PartyPhase.DEPARTED
            self.truth.party_update(party.party_id, "departed", self.start_ts + end)

    def _join_queue(self, party: Party, t: float) -> None:
        geo, motion = self.geometry, self.scenario.motion
        free = self._cluster_slots(party.size)
        party.slots = free
        for i in free:
            self._slot_owner[i] = party.party_id
        party.phase = PartyPhase.QUEUED
        self.queue.append(party)
        queue_zone = geo.queue_zone_id
        # The party funnels in through the cluster's first slot, then spreads to its spots.
        for i, (m, slot_index) in enumerate(zip(party.members, free, strict=True)):
            slot = geo.queue_slots[slot_index]
            assert m.pos is not None
            legs: list[Leg] = []
            if i:
                legs.append(self._stay(m, i * motion.stagger_s))
            legs.append(
                self._walk(
                    geo.entrance_camera,
                    [m.pos, geo.queue_slots[free[0]], slot],
                    motion.guest_speed,
                    "to_queue",
                    frozenset({queue_zone}),
                )
            )
            legs.append(self._hold(geo.entrance_camera, slot, 0.0, "queued", required=queue_zone))
            self._plan(m, legs, t)
        self.truth.party_update(
            party.party_id, "queued", self.start_ts + t, queued_at=self.start_ts + t
        )
        self._at(t + party.plan.patience_s, lambda now: self._patience_out(party, now))

    def _cluster_slots(self, size: int) -> list[int]:
        """A party stands together: the frontmost free slot plus the free slots nearest to it."""
        slots = self.geometry.queue_slots
        free = [i for i, owner in enumerate(self._slot_owner) if owner is None]
        seed = slots[free[0]]
        return sorted(free, key=lambda i: (math.dist(slots[i], seed), i))[:size]

    def _release_slots(self, party: Party) -> None:
        for i in party.slots:
            if self._slot_owner[i] == party.party_id:
                self._slot_owner[i] = None
        party.slots = []

    def _patience_out(self, party: Party, t: float) -> None:
        if party.phase is not PartyPhase.QUEUED:
            return
        geo = self.geometry
        self.queue.remove(party)
        self._release_slots(party)
        party.phase = PartyPhase.WALKING_AWAY
        ids = tuple(m.person_id for m in party.members)
        self.truth.walkaway_started(party.party_id, geo.queue_zone_id, ids, self.start_ts + t)
        self.truth.party_update(party.party_id, "walked_away", self.start_ts + t)
        self._to_street(
            party, t, "walkaway", frozenset({geo.queue_zone_id}), PartyPhase.WALKED_AWAY
        )

    def _balk(self, party: Party, t: float) -> None:
        party.phase = PartyPhase.BALKED
        self.truth.party_update(party.party_id, "balked", self.start_ts + t)
        self._to_street(party, t, "balking", frozenset(), PartyPhase.BALKED)

    def _to_street(
        self, party: Party, t: float, activity: str, allowed: frozenset[str], final: PartyPhase
    ) -> None:
        geo, motion = self.geometry, self.scenario.motion
        door_exit = geo.layout.entrance.door_exit

        def done(end: float) -> None:
            if all(m.gone for m in party.members):
                party.phase = final

        for i, m in enumerate(party.members):
            assert m.pos is not None
            legs: list[Leg] = []
            if i:
                legs.append(self._stay(m, i * motion.stagger_s))
            legs.append(
                self._walk(
                    geo.entrance_camera, [m.pos, door_exit], motion.guest_speed, activity, allowed
                )
            )
            legs.append(self._vanish(done))
            self._plan(m, legs, t)

    def _seat_from_queue(self, t: float) -> None:
        for party in list(self.queue):
            table = self._free_table(party.size)
            if table is None:
                continue
            self.queue.remove(party)
            self._release_slots(party)
            self._send_to_table(party, table, t, from_queue=True)

    # --- staff -----------------------------------------------------------------------------

    def _dispatch(self, t: float, only: StaffMember | None = None) -> bool:
        """Give due tasks to idle waiters (only ``only`` when given). True if ``only`` got one."""
        postponed: list[Task] = []
        got_one = False
        while self._tasks and self._tasks[0].due <= t + _EPS:
            if only is not None:
                idle = [only] if only.task is None else []
            else:
                idle = [s for s in self.staff if s.task is None]
            if not idle:
                break
            task = heapq.heappop(self._tasks)
            if task.cancelled:
                continue
            verdict = self._check_task(task)
            if verdict == "later":
                postponed.append(task)
                continue
            if verdict == "drop":
                continue
            spot = self.tables[task.table_id].geo.service_spot
            staff = min(idle, key=lambda s: (self._distance(s.person, spot), s.index))
            if self._start_task(staff, task, t) and staff is only:
                got_one = True
        for task in postponed:
            task.due = t + 1.0
            heapq.heappush(self._tasks, task)
        return got_one

    def _distance(self, person: Person, to: Pt) -> float:
        if person.pos is None:
            return math.inf
        return math.dist(person.pos, to)

    def _check_task(self, task: Task) -> str:
        table = self.tables[task.table_id]
        if task.kind is TaskKind.BUSSING:
            if table.status is not TableStatus.DIRTY:
                return "drop"
            if table.session is not None and table.session.left_at is None:
                return "later"
            return "ok"
        party = task.party
        if party is None or party.phase is not PartyPhase.SEATED:
            return "drop"
        return "ok"

    def _start_task(self, staff: StaffMember, task: Task, t: float) -> bool:
        sc, geo = self.scenario, self.geometry
        table = self.tables[task.table_id]
        spot, cam, zone = table.geo.service_spot, table.geo.camera_id, table.geo.zone_id
        allowed = staff.person.zones | {zone, geo.staff_zone_id}
        legs = self._travel(staff.person, cam, spot, sc.motion.staff_speed, "staff_walk", allowed)
        walk_s = sum(leg.duration for leg in legs)
        if task.kind is TaskKind.BUSSING:
            duration = sc.staff.bussing_duration.sample(self._rng)
            activity = "staff_bussing"
            table.status = TableStatus.BUSSING
        else:
            duration = sc.staff.visit_duration.sample(self._rng)
            activity = "staff_visit"
            party = task.party
            assert party is not None and party.leave_at is not None
            if t + walk_s + duration + 5.0 > party.leave_at:
                return False
        legs.append(
            self._hold(
                cam,
                spot,
                duration,
                activity,
                required=zone,
                on_done=lambda end: self._task_done(staff, task, end),
            )
        )
        staff.task = task
        self._plan(staff.person, legs, t)
        return True

    def _task_done(self, staff: StaffMember, task: Task, end: float) -> None:
        staff.task = None
        table = self.tables[task.table_id]
        if task.kind is TaskKind.BUSSING:
            table.status = TableStatus.FREE
            table.party = None
            if table.session is not None:
                table.session.cleared_at = self.start_ts + end
            self._at(end, self._seat_from_queue)
        else:
            party = task.party
            if party is not None and party.phase is PartyPhase.SEATED:
                assert party.leave_at is not None
                due = end + self.scenario.staff.checkin_interval.sample(self._rng)
                if due < party.leave_at:
                    self._add_task(due, TaskKind.CHECKIN, task.table_id, party)
        if not self._dispatch(end, only=staff):
            self._go_home(staff, end)

    def _go_home(self, staff: StaffMember, t: float) -> None:
        geo = self.geometry
        allowed = staff.person.zones | {geo.staff_zone_id}
        legs = self._travel(
            staff.person,
            geo.staff_camera,
            staff.home,
            self.scenario.motion.staff_speed,
            "staff_return",
            allowed,
        )
        legs.append(
            self._hold(geo.staff_camera, staff.home, 0.0, "staff_idle", required=geo.staff_zone_id)
        )
        self._plan(staff.person, legs, t)

    # --- ground truth ----------------------------------------------------------------------

    def _observe_truth(self) -> None:
        geo = self.geometry
        ts = self.ts
        self.truth.now_ts = ts
        line = geo.line
        for p in list(self.people.values()):
            if p.camera_id is None or p.pos is None:
                if p.zones:
                    self._zones_changed(p, p.zones, frozenset(), ts)
                p.zones, p.box, p.anchor = frozenset(), None, None
                p.seen_camera, p.last_off_line, p.geo_key = None, None, None
                continue
            if p.camera_id != p.seen_camera:
                if p.zones:
                    self._zones_changed(p, p.zones, frozenset(), ts)
                    p.zones = frozenset()
                p.episode += 1
                p.seen_camera, p.last_off_line, p.geo_key = p.camera_id, None, None
            key = (p.camera_id, p.pos, p.posture)
            if key == p.geo_key:
                continue
            p.geo_key = key
            anchor_mode = geo.anchors[p.camera_id]
            p.box = geo.body.box(p.pos, p.posture, p.height_factor, anchor_mode)
            p.anchor = anchor = anchor_point(p.box, anchor_mode)
            zones = geo.zones_at(p.camera_id, anchor)
            if zones != p.zones:
                self._zones_changed(p, p.zones, zones, ts)
                p.zones = zones
            if p.camera_id == geo.entrance_camera and segment_side(line.a, line.b, anchor) != 0:
                if p.last_off_line is not None:
                    crossing = line_crossing(line, p.last_off_line, anchor)
                    if crossing is not None:
                        self.truth.line_crossed(
                            p.person_id,
                            p.party_id,
                            p.role.value,
                            crossing.value,
                            ts,
                            geo.queue_zone_id,
                        )
                p.last_off_line = anchor
        for party in list(self._leaving):
            session = party.session
            assert session is not None and party.table_id is not None
            zone = self.tables[party.table_id].geo.zone_id
            if not any(zone in m.zones for m in party.members):
                session.left_at = ts
                self._leaving.remove(party)
        if self.t >= self._next_occupancy_t - _EPS:
            self._next_occupancy_t += 1.0
            self.truth.add_occupancy(self._occupancy_point(ts))

    def _zones_changed(
        self, p: Person, old: frozenset[str], new: frozenset[str], ts: float
    ) -> None:
        geo = self.geometry
        for zone in sorted(old - new):
            if zone == geo.queue_zone_id and p.role is Role.GUEST:
                self.truth.queue_exited(p.person_id, ts)
            elif (
                zone in geo.table_by_zone
                and p.visit is not None
                and p.visit.table_id == geo.table_by_zone[zone]
            ):
                p.visit.end = ts
                p.visit = None
        for zone in sorted(new - old):
            if zone == geo.queue_zone_id and p.role is Role.GUEST:
                assert p.party_id is not None
                self.truth.queue_entered(p.person_id, p.party_id, zone, ts)
            elif zone in geo.table_by_zone and p.role is Role.STAFF:
                table_id = geo.table_by_zone[zone]
                task = self._staff_by_pid[p.person_id].task
                kind = "passing"
                if task is not None and task.table_id == table_id:
                    kind = task.visit_kind
                visit = self.truth.open_visit(table_id, p.person_id, kind, ts)
                p.visit = visit
                session = self.tables[table_id].session
                if session is not None and kind == "service":
                    session.visits.append(visit)
                elif session is not None and kind == "bussing":
                    session.bussing_visits.append(visit)

    def _occupancy_point(self, ts: float) -> OccupancyPoint:
        geo = self.geometry
        table_zones = geo.table_by_zone
        table_cams = {z.camera_id for z in self.config.zones if z.table_id is not None}
        guests = staff_visible = staff_floor = staff_out = queue = 0
        for p in self.people.values():
            if p.box is None:
                continue
            if p.role is Role.GUEST:
                if any(z in table_zones for z in p.zones):
                    guests += 1
                if geo.queue_zone_id in p.zones:
                    queue += 1
            else:
                staff_visible += 1
                if p.camera_id in table_cams:
                    staff_floor += 1
                if geo.staff_zone_id not in p.zones:
                    staff_out += 1
        occupied = sum(
            1
            for tr in self.tables.values()
            if tr.session is not None and tr.session.left_at is None
        )
        return OccupancyPoint(ts, guests, occupied, queue, staff_visible, staff_floor, staff_out)

    # --- observations ----------------------------------------------------------------------

    def _make_observation(self, camera_id: str) -> CameraObservation:
        noise = self.scenario.noise
        ts = self.ts
        rng = _rng(self.seed, "frame", camera_id, self.tick)
        people: list[ObservedPerson] = []
        hidden: list[str] = []
        for p in self.people.values():
            if p.camera_id != camera_id or p.box is None:
                continue
            if p.posture is Posture.SEATED and p.occlusion is not None and p.occlusion.occluded(ts):
                hidden.append(p.track_key)
                continue
            box = _jitter(p.box, noise.box_jitter, rng) if noise.box_jitter > 0 else p.box
            score = p.uniform_score
            if noise.uniform_frame_sd > 0:
                score = min(1.0, max(0.0, score + rng.gauss(0.0, noise.uniform_frame_sd)))
            people.append(ObservedPerson(p.track_key, p.person_id, p.role.value, box, p.box, score))
        for i in range(_poisson(rng, noise.false_positives_per_frame)):
            people.append(_false_positive(rng, f"fp:{camera_id}:{self.tick}:{i}"))
        return CameraObservation(camera_id, self.tick, ts, tuple(people), tuple(hidden))


def _override(value: float | None, default: float) -> float:
    return default if value is None else value


def _jitter(box: Box, sd: float, rng: random.Random) -> Box:
    def j(v: float) -> float:
        return v + max(-3 * sd, min(3 * sd, rng.gauss(0.0, sd)))

    x1, y1, x2, y2 = (j(v) for v in box)
    x1, x2 = sorted((x1, x2))
    y1, y2 = sorted((y1, y2))
    return clip_box((x1, y1, x2, y2))


def _poisson(rng: random.Random, lam: float) -> int:
    if lam <= 0:
        return 0
    limit, k, prod = math.exp(-lam), 0, rng.random()
    while prod > limit:
        k += 1
        prod *= rng.random()
    return k


def _false_positive(rng: random.Random, key: str) -> ObservedPerson:
    h = rng.uniform(0.08, 0.3)
    x = rng.uniform(0.05, 0.95)
    y = rng.uniform(0.25, 1.0)
    box = clip_box((x - 0.2 * h, y - h, x + 0.2 * h, y))
    return ObservedPerson(key, None, "false_positive", box, None, rng.uniform(0.0, 0.6))
