"""Anonymous role classification of tracks: ``guest``, ``staff`` or ``unknown`` (architecture 6.2).

Strategy pattern: each :class:`RoleClassifier` looks at one kind of evidence and may vote for
``staff`` or ``guest``; :class:`RoleBook` combines the weighted votes into one *sticky* role per
track. Classifiers keep only per-track scalars and zone ids (no appearance embeddings, nothing
that identifies a person), and everything about a track is forgotten once it has not been seen
for ``forget_after_s`` (60 s).

Default classifiers and weights (tunable):

* :class:`StaffZoneOrigin` (weight 3.0): first seen inside a ``staff_area`` -> staff.
* :class:`UniformColor` (weight 2.0): mean ``hints.uniform_score`` >= 0.65 -> staff,
  <= 0.35 -> guest, abstains in between or without calibration.
* :class:`MovementPattern` (weight 1.5): short visits to >= 2 table zones (or >= 2 short
  visits) within 10 min -> staff; one long stay at a table (>= 120 s) -> guest.

Downstream, ``unknown`` counts as a guest (most people in a restaurant are guests; staff needs
positive evidence) but never as staff: see :attr:`Role.counts_as_guest`.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Sequence
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Protocol

from .zones import Point2, TrackKey, ZoneHits

ROLE_FORGET_AFTER_S = 60.0
"""Per-track role state is dropped when a track has not been seen for longer than this."""


class Role(StrEnum):
    """Role of one track."""

    GUEST = "guest"
    STAFF = "staff"
    UNKNOWN = "unknown"

    @property
    def counts_as_guest(self) -> bool:
        """``guest`` and ``unknown`` count as guests in table and area counts."""
        return self is not Role.STAFF


@dataclass(frozen=True, slots=True)
class Sighting:
    """One track in one frame, as seen by the classifiers."""

    key: TrackKey
    ts: float
    """Frame time, epoch seconds."""
    anchor: Point2
    hits: ZoneHits
    uniform_score: float | None


@dataclass(frozen=True, slots=True)
class Vote:
    """A classifier's opinion about one track."""

    role: Role
    """``Role.STAFF`` or ``Role.GUEST``."""
    confidence: float = 1.0
    """0..1, multiplied by the classifier weight."""


STAFF_VOTE = Vote(Role.STAFF)
GUEST_VOTE = Vote(Role.GUEST)


class RoleClassifier(Protocol):
    """Strategy: one source of role evidence. Single-threaded; time only from sightings."""

    @property
    def name(self) -> str: ...

    @property
    def weight(self) -> float: ...

    def observe(self, sighting: Sighting) -> None:
        """Update the per-track state with one sighting."""
        ...

    def vote(self, key: TrackKey) -> Vote | None:
        """Current vote for ``key``; None to abstain."""
        ...

    def forget(self, key: TrackKey) -> None:
        """Drop all state about ``key``."""
        ...


class StaffZoneOrigin:
    """Tracks first seen in a ``staff_area`` (kitchen door, bar back) are staff.

    "First seen" allows ``origin_window_s`` after the track's first sighting, because a tracker
    often confirms a new track a few frames after the person stepped out of the staff area.
    """

    def __init__(self, weight: float = 3.0, origin_window_s: float = 2.0) -> None:
        self._weight = weight
        self.origin_window_s = origin_window_s
        self._first: dict[TrackKey, float] = {}
        self._staff: set[TrackKey] = set()

    @property
    def name(self) -> str:
        return "staff_zone_origin"

    @property
    def weight(self) -> float:
        return self._weight

    def observe(self, sighting: Sighting) -> None:
        first = self._first.setdefault(sighting.key, sighting.ts)
        if sighting.hits.staff_area and sighting.ts - first <= self.origin_window_s:
            self._staff.add(sighting.key)

    def vote(self, key: TrackKey) -> Vote | None:
        return STAFF_VOTE if key in self._staff else None

    def forget(self, key: TrackKey) -> None:
        self._first.pop(key, None)
        self._staff.discard(key)


class UniformColor:
    """Votes from ``hints.uniform_score`` (0..1 similarity to the calibrated staff uniform).

    Uses the running mean of the track's non-None scores, after ``min_samples`` of them:
    mean >= ``staff_threshold`` -> staff, mean <= ``guest_threshold`` -> guest, in between ->
    abstain (the dead band acts as hysteresis). Abstains when the site has no uniform
    calibration (all scores None).
    """

    def __init__(
        self,
        weight: float = 2.0,
        staff_threshold: float = 0.65,
        guest_threshold: float = 0.35,
        min_samples: int = 1,
    ) -> None:
        if guest_threshold > staff_threshold:
            raise ValueError("guest_threshold must not exceed staff_threshold")
        self._weight = weight
        self.staff_threshold = staff_threshold
        self.guest_threshold = guest_threshold
        self.min_samples = min_samples
        self._stats: dict[TrackKey, tuple[int, float]] = {}

    @property
    def name(self) -> str:
        return "uniform_color"

    @property
    def weight(self) -> float:
        return self._weight

    def observe(self, sighting: Sighting) -> None:
        score = sighting.uniform_score
        if score is None:
            return
        n, total = self._stats.get(sighting.key, (0, 0.0))
        self._stats[sighting.key] = (n + 1, total + score)

    def vote(self, key: TrackKey) -> Vote | None:
        n, total = self._stats.get(key, (0, 0.0))
        if n == 0 or n < self.min_samples:
            return None
        mean = total / n
        if mean >= self.staff_threshold:
            return STAFF_VOTE
        if mean <= self.guest_threshold:
            return GUEST_VOTE
        return None

    def forget(self, key: TrackKey) -> None:
        self._stats.pop(key, None)


@dataclass(slots=True)
class _Movement:
    zone: str | None = None
    """Table zone of the visit in progress."""
    start: float = 0.0
    last: float = 0.0
    visits: deque[tuple[str, float, float]] = field(default_factory=deque)
    """Completed visits ``(zone_id, start, end)`` of at least ``min_visit_s``."""


class MovementPattern:
    """Staff move between tables; guests stay at one.

    A *visit* is a stay of at least ``min_visit_s`` in one table zone; leaving the zone (or not
    being seen) for up to ``gap_s`` does not end it. Within the last ``window_s`` (10 min):

    * staff if completed visits shorter than ``guest_dwell_s`` cover >= 2 distinct table zones,
      or if there were >= 2 completed short visits (<= ``short_visit_max_s``, "standing
      visits", e.g. a waiter returning to the same table);
    * otherwise guest if the visit in progress has lasted >= ``guest_dwell_s`` (seated).

    Only completed visits count as staff evidence, so a guest who pauses next to another table
    on the way to their own is not mistaken for staff while sitting down.
    """

    def __init__(
        self,
        weight: float = 1.5,
        window_s: float = 600.0,
        min_visit_s: float = 3.0,
        short_visit_max_s: float = 60.0,
        guest_dwell_s: float = 120.0,
        gap_s: float = 2.0,
    ) -> None:
        self._weight = weight
        self.window_s = window_s
        self.min_visit_s = min_visit_s
        self.short_visit_max_s = short_visit_max_s
        self.guest_dwell_s = guest_dwell_s
        self.gap_s = gap_s
        self._state: dict[TrackKey, _Movement] = {}

    @property
    def name(self) -> str:
        return "movement_pattern"

    @property
    def weight(self) -> float:
        return self._weight

    def observe(self, sighting: Sighting) -> None:
        st = self._state.get(sighting.key)
        if st is None:
            st = self._state[sighting.key] = _Movement()
        ts = sighting.ts
        zone = sighting.hits.tables[0] if sighting.hits.tables else None
        if st.zone is not None:
            within_gap = ts - st.last <= self.gap_s
            if zone == st.zone and within_gap:
                st.last = ts
            elif not (zone is None and within_gap):
                self._close(st)
        if zone is not None and st.zone is None:
            st.zone, st.start, st.last = zone, ts, ts
        cutoff = ts - self.window_s
        while st.visits and st.visits[0][2] < cutoff:
            st.visits.popleft()

    def _close(self, st: _Movement) -> None:
        if st.zone is not None and st.last - st.start >= self.min_visit_s:
            st.visits.append((st.zone, st.start, st.last))
        st.zone = None

    def vote(self, key: TrackKey) -> Vote | None:
        st = self._state.get(key)
        if st is None:
            return None
        distinct = {z for z, start, end in st.visits if end - start < self.guest_dwell_s}
        if len(distinct) >= 2:
            return STAFF_VOTE
        short = sum(1 for _, start, end in st.visits if end - start <= self.short_visit_max_s)
        if short >= 2:
            return STAFF_VOTE
        if st.zone is not None and st.last - st.start >= self.guest_dwell_s:
            return GUEST_VOTE
        return None

    def forget(self, key: TrackKey) -> None:
        self._state.pop(key, None)


def default_classifiers() -> list[RoleClassifier]:
    """The default strategy set: staff-zone origin, uniform colour, movement pattern."""
    return [StaffZoneOrigin(), UniformColor(), MovementPattern()]


class RoleBook:
    """Combines classifier votes into one sticky role per track.

    Scores: ``S`` = sum of ``weight * confidence`` over staff votes, ``G`` likewise for guest
    votes. The candidate is the larger side (no candidate on a tie). A track without a role yet
    takes the candidate; a track that has one switches only if the candidate wins by at least
    ``switch_margin`` (hysteresis), and never falls back to ``unknown``.

    State of a track is forgotten when it has not been seen for more than ``forget_after_s``;
    a forgotten track that reappears starts from scratch.
    """

    def __init__(
        self,
        classifiers: Sequence[RoleClassifier] | None = None,
        *,
        switch_margin: float = 1.0,
        forget_after_s: float = ROLE_FORGET_AFTER_S,
    ) -> None:
        self._classifiers: tuple[RoleClassifier, ...] = tuple(
            default_classifiers() if classifiers is None else classifiers
        )
        self.switch_margin = switch_margin
        self.forget_after_s = forget_after_s
        self._roles: dict[TrackKey, Role] = {}
        self._last_seen: dict[TrackKey, float] = {}

    @property
    def classifiers(self) -> tuple[RoleClassifier, ...]:
        return self._classifiers

    def __len__(self) -> int:
        return len(self._roles)

    def observe(self, sighting: Sighting) -> Role:
        """Feed one sighting to every classifier and return the track's (sticky) role."""
        key = sighting.key
        last = self._last_seen.get(key)
        if last is not None and sighting.ts - last > self.forget_after_s:
            self.forget(key)
        self._last_seen[key] = sighting.ts if last is None else max(last, sighting.ts)
        for classifier in self._classifiers:
            classifier.observe(sighting)
        role = self._decide(key)
        self._roles[key] = role
        return role

    def _decide(self, key: TrackKey) -> Role:
        staff = guest = 0.0
        for classifier in self._classifiers:
            vote = classifier.vote(key)
            if vote is None:
                continue
            if vote.role is Role.STAFF:
                staff += classifier.weight * vote.confidence
            elif vote.role is Role.GUEST:
                guest += classifier.weight * vote.confidence
        current = self._roles.get(key, Role.UNKNOWN)
        if staff == guest:
            return current
        candidate = Role.STAFF if staff > guest else Role.GUEST
        if current is Role.UNKNOWN or candidate is current:
            return candidate
        if abs(staff - guest) >= self.switch_margin:
            return candidate
        return current

    def role(self, key: TrackKey) -> Role:
        """Current role of ``key`` (``unknown`` if never seen or forgotten)."""
        return self._roles.get(key, Role.UNKNOWN)

    def forget(self, key: TrackKey) -> None:
        """Drop everything known about ``key``."""
        self._roles.pop(key, None)
        self._last_seen.pop(key, None)
        for classifier in self._classifiers:
            classifier.forget(key)

    def forget_stale(self, now: float) -> int:
        """Forget tracks not seen for more than ``forget_after_s`` before ``now``; returns how
        many were forgotten."""
        stale = [k for k, last in self._last_seen.items() if now - last > self.forget_after_s]
        for key in stale:
            self.forget(key)
        return len(stale)

    def forget_camera(self, camera_id: str) -> None:
        """Forget every track of ``camera_id`` (camera removed or disabled)."""
        for key in [k for k in self._last_seen if k[0] == camera_id]:
            self.forget(key)

    def counts(self) -> dict[str, int]:
        """Number of known tracks per role (JSON-safe)."""
        out = {role.value: 0 for role in Role}
        for role in self._roles.values():
            out[role.value] += 1
        return out
