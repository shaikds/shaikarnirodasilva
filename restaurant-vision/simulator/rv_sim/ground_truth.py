"""Ground truth: what really happened in a simulated service.

The world records raw facts while it runs; everything else is derived on demand, so the truth of
a run that is still in progress (live demo) is always consistent. All times are Unix epoch
seconds, like edge events.

Definitions (geometric, from the people's true anchor points, not from detections):

* A session starts (``seated_at``) when the last member of the party sits down at the table and
  ends (``left_at``) when the last member's anchor leaves the table's primary zone.
* A staff visit is a staff anchor inside a table's primary zone (``start``..``end``); its kind is
  the waiter's task (``service`` or ``bussing``). The first visit is the first service visit at
  least ``staff_visit_min_s`` long. ``cleared_at`` is when the bussing waiter finished.
* ``waiter_needed`` is a true case when the first visit came more than
  ``first_visit_timeout_s`` after ``seated_at`` (or never, and the guests stayed longer than
  that); its expected time is ``seated_at + first_visit_timeout_s``.
* Queue-seated records are per person: first entry into the queue zone, and the inward entrance
  line crossing. Walk-aways are per party: ``left_at`` is when the last member left the queue
  zone, ``waited_s`` is the members' mean time in the queue zone.
"""

from __future__ import annotations

import bisect
from dataclasses import asdict, dataclass, field
from typing import Any

from rv_contracts import Thresholds


@dataclass(slots=True)
class TrueVisit:
    table_id: str
    staff_id: str
    kind: str
    """``service``, ``bussing`` or ``passing`` (no task at this table)."""
    start: float
    end: float | None = None

    def duration(self, now: float) -> float:
        return (self.end if self.end is not None else now) - self.start


@dataclass(slots=True)
class TrueSession:
    session_no: int
    table_id: str
    party_id: str
    guests: int
    seated_at: float
    from_queue: bool
    planned_dwell_s: float
    leave_started_at: float | None = None
    left_at: float | None = None
    cleared_at: float | None = None
    visits: list[TrueVisit] = field(default_factory=list)
    """Service visits during the session."""
    bussing_visits: list[TrueVisit] = field(default_factory=list)

    def first_visit_at(self, min_visit_s: float, now: float) -> float | None:
        for visit in self.visits:
            if visit.duration(now) >= min_visit_s:
                return visit.start
        return None

    def visit_count(self, min_visit_s: float, now: float) -> int:
        return sum(1 for v in self.visits if v.duration(now) >= min_visit_s)

    @property
    def bussing_started_at(self) -> float | None:
        return self.bussing_visits[0].start if self.bussing_visits else None

    @property
    def dwell_s(self) -> float | None:
        return None if self.left_at is None else self.left_at - self.seated_at


@dataclass(slots=True)
class QueueInterval:
    person_id: str
    party_id: str
    zone_id: str
    entered_at: float
    exited_at: float | None = None


@dataclass(frozen=True, slots=True)
class TrueQueueSeated:
    """One queued person crossing the entrance line inward."""

    person_id: str
    party_id: str
    zone_id: str
    entered_at: float
    crossed_at: float

    @property
    def waited_s(self) -> float:
        return self.crossed_at - self.entered_at


@dataclass(slots=True)
class TrueWalkaway:
    party_id: str
    zone_id: str
    size: int
    decided_at: float
    member_ids: tuple[str, ...]
    entered_at: float | None = None
    left_at: float | None = None
    waited_s: float | None = None


@dataclass(frozen=True, slots=True)
class LineCrossingRecord:
    person_id: str
    party_id: str | None
    role: str
    direction: str
    ts: float


@dataclass(slots=True)
class PartyRecord:
    party_id: str
    size: int
    arrived_at: float
    outcome: str = "pending"
    """``pending``, ``queued``, ``seated``, ``walked_away``, ``balked``, ``departed``."""
    table_id: str | None = None
    queued_at: float | None = None
    seated_at: float | None = None
    ended_at: float | None = None


@dataclass(frozen=True, slots=True)
class OccupancyPoint:
    ts: float
    guests_at_tables: int
    tables_occupied: int
    queue_people: int
    staff_visible: int
    staff_on_floor: int
    """Visible staff on cameras that have table zones (the edge's documented definition,
    staff area included)."""
    staff_outside_staff_area: int


@dataclass(frozen=True, slots=True)
class AlertCase:
    """A table alert situation in the truth (positive or not), for scoring."""

    kind: str
    table_id: str
    session_no: int
    reference_at: float
    """``seated_at`` (waiter_needed) or ``left_at`` (bussing_needed)."""
    expected_at: float
    """When the alert should fire if the case is positive."""
    positive: bool
    delay_s: float | None
    """Seconds until the resolving staff visit; None if none happened (yet)."""
    observed_s: float
    """How long the situation was observable (until the visit, the end or the run end)."""


class GroundTruth:
    """Raw facts recorded by the world plus derived views (see module docstring)."""

    def __init__(
        self, *, site_id: str, thresholds: Thresholds, start_ts: float, end_ts: float
    ) -> None:
        self.site_id = site_id
        self.thresholds = thresholds
        self.start_ts = start_ts
        self.end_ts = end_ts
        self.now_ts = start_ts
        """Time of the last world step recorded."""
        self.parties: dict[str, PartyRecord] = {}
        self.sessions: list[TrueSession] = []
        self.visits: list[TrueVisit] = []
        self.queue_intervals: list[QueueInterval] = []
        self.queue_seated: list[TrueQueueSeated] = []
        self.crossings: list[LineCrossingRecord] = []
        self._walkaways: list[TrueWalkaway] = []
        self.occupancy: list[OccupancyPoint] = []
        self._open_queue: dict[str, QueueInterval] = {}
        self._first_queue_entry: dict[str, float] = {}

    # --- recording (called by the world) -------------------------------------------------

    def party_arrived(self, party_id: str, size: int, ts: float) -> None:
        self.parties[party_id] = PartyRecord(party_id, size, ts)

    def party_update(self, party_id: str, outcome: str, ts: float, **fields: Any) -> None:
        record = self.parties[party_id]
        record.outcome = outcome
        if outcome in ("walked_away", "balked", "departed"):
            record.ended_at = ts
        for name, value in fields.items():
            setattr(record, name, value)

    def open_session(
        self,
        table_id: str,
        party_id: str,
        guests: int,
        seated_at: float,
        *,
        from_queue: bool,
        planned_dwell_s: float,
    ) -> TrueSession:
        session = TrueSession(
            len(self.sessions) + 1,
            table_id,
            party_id,
            guests,
            seated_at,
            from_queue,
            planned_dwell_s,
        )
        self.sessions.append(session)
        return session

    def open_visit(self, table_id: str, staff_id: str, kind: str, ts: float) -> TrueVisit:
        visit = TrueVisit(table_id, staff_id, kind, ts)
        self.visits.append(visit)
        return visit

    def queue_entered(self, person_id: str, party_id: str, zone_id: str, ts: float) -> None:
        interval = QueueInterval(person_id, party_id, zone_id, ts)
        self.queue_intervals.append(interval)
        self._open_queue[person_id] = interval
        self._first_queue_entry.setdefault(person_id, ts)

    def queue_exited(self, person_id: str, ts: float) -> None:
        interval = self._open_queue.pop(person_id, None)
        if interval is not None:
            interval.exited_at = ts

    def line_crossed(
        self,
        person_id: str,
        party_id: str | None,
        role: str,
        direction: str,
        ts: float,
        zone_id: str,
    ) -> None:
        self.crossings.append(LineCrossingRecord(person_id, party_id, role, direction, ts))
        entered = self._first_queue_entry.get(person_id)
        if direction == "in" and party_id is not None and entered is not None:
            self.queue_seated.append(TrueQueueSeated(person_id, party_id, zone_id, entered, ts))

    def walkaway_started(
        self, party_id: str, zone_id: str, member_ids: tuple[str, ...], ts: float
    ) -> None:
        self._walkaways.append(TrueWalkaway(party_id, zone_id, len(member_ids), ts, member_ids))

    def add_occupancy(self, point: OccupancyPoint) -> None:
        self.occupancy.append(point)

    # --- derived views -------------------------------------------------------------------

    @property
    def walkaways(self) -> list[TrueWalkaway]:
        """Walk-aways with entry/exit times filled from the queue intervals."""
        by_person: dict[str, list[QueueInterval]] = {}
        for interval in self.queue_intervals:
            by_person.setdefault(interval.person_id, []).append(interval)
        out: list[TrueWalkaway] = []
        for w in self._walkaways:
            intervals = [i for m in w.member_ids for i in by_person.get(m, [])]
            entered = min((i.entered_at for i in intervals), default=None)
            exits = [i.exited_at for i in intervals]
            done = bool(intervals) and all(e is not None for e in exits)
            left = max(e for e in exits if e is not None) if done else None
            waits = [i.exited_at - i.entered_at for i in intervals if i.exited_at is not None]
            waited = sum(waits) / len(waits) if done and waits else None
            out.append(
                TrueWalkaway(
                    w.party_id,
                    w.zone_id,
                    w.size,
                    w.decided_at,
                    w.member_ids,
                    entered,
                    left,
                    waited,
                )
            )
        return out

    def waiter_needed_cases(self) -> list[AlertCase]:
        """One case per session: positive when the first visit came too late (or never)."""
        th = self.thresholds
        now = self.now_ts
        cases: list[AlertCase] = []
        for s in self.sessions:
            first = s.first_visit_at(th.staff_visit_min_s, now)
            end = s.left_at if s.left_at is not None else now
            delay = None if first is None else first - s.seated_at
            observed = (first if first is not None else end) - s.seated_at
            positive = observed > th.first_visit_timeout_s
            cases.append(
                AlertCase(
                    "waiter_needed",
                    s.table_id,
                    s.session_no,
                    s.seated_at,
                    s.seated_at + th.first_visit_timeout_s,
                    positive,
                    delay,
                    observed,
                )
            )
        return cases

    def bussing_needed_cases(self) -> list[AlertCase]:
        """One case per finished session: positive when bussing started too late (or never)."""
        th = self.thresholds
        now = self.now_ts
        cases: list[AlertCase] = []
        for s in self.sessions:
            if s.left_at is None:
                continue
            start = s.bussing_started_at
            delay = None if start is None else start - s.left_at
            observed = (start if start is not None else now) - s.left_at
            cases.append(
                AlertCase(
                    "bussing_needed",
                    s.table_id,
                    s.session_no,
                    s.left_at,
                    s.left_at + th.bussing_timeout_s,
                    observed > th.bussing_timeout_s,
                    delay,
                    observed,
                )
            )
        return cases

    def occupancy_at(self, ts: float) -> OccupancyPoint | None:
        """The latest occupancy sample at or before ``ts``."""
        if not self.occupancy:
            return None
        i = bisect.bisect_right([p.ts for p in self.occupancy], ts + 1e-6) - 1
        return self.occupancy[max(0, i)]

    def summary(self) -> dict[str, Any]:
        """Headline counts for CLIs and reports."""
        outcomes: dict[str, int] = {}
        for p in self.parties.values():
            outcomes[p.outcome] = outcomes.get(p.outcome, 0) + 1
        done = [s for s in self.sessions if s.left_at is not None]
        waits = [q.waited_s for q in self.queue_seated]
        walkaways = self.walkaways
        th = self.thresholds
        return {
            "parties": len(self.parties),
            "guests": sum(p.size for p in self.parties.values()),
            "party_outcomes": dict(sorted(outcomes.items())),
            "sessions": len(self.sessions),
            "sessions_completed": len(done),
            "avg_dwell_s": _mean([s.dwell_s for s in done if s.dwell_s is not None]),
            "waiter_needed": sum(c.positive for c in self.waiter_needed_cases()),
            "bussing_needed": sum(c.positive for c in self.bussing_needed_cases()),
            "queue_seated_people": len(waits),
            "avg_queue_wait_s": _mean(waits),
            "walkaways": len(walkaways),
            "walkaways_reportable": sum(
                1
                for w in walkaways
                if w.waited_s is not None and w.waited_s >= th.walkaway_min_wait_s
            ),
            "peak_guests_at_tables": max((p.guests_at_tables for p in self.occupancy), default=0),
            "peak_queue_people": max((p.queue_people for p in self.occupancy), default=0),
        }

    def event_log(self) -> list[dict[str, Any]]:
        """Chronological true events (for humans and external tools)."""
        log: list[dict[str, Any]] = []
        for p in self.parties.values():
            log.append(
                {
                    "ts": p.arrived_at,
                    "type": "party.arrived",
                    "party_id": p.party_id,
                    "size": p.size,
                }
            )
        for s in self.sessions:
            log.append(
                {
                    "ts": s.seated_at,
                    "type": "table.seated",
                    "table_id": s.table_id,
                    "party_id": s.party_id,
                    "guests": s.guests,
                    "session_no": s.session_no,
                }
            )
            if s.left_at is not None:
                log.append(
                    {
                        "ts": s.left_at,
                        "type": "table.left",
                        "table_id": s.table_id,
                        "session_no": s.session_no,
                    }
                )
            if s.cleared_at is not None:
                log.append(
                    {
                        "ts": s.cleared_at,
                        "type": "table.cleared",
                        "table_id": s.table_id,
                        "session_no": s.session_no,
                    }
                )
        for v in self.visits:
            log.append(
                {
                    "ts": v.start,
                    "type": "staff.visit",
                    "table_id": v.table_id,
                    "kind": v.kind,
                    "end": v.end,
                }
            )
        for c in self.waiter_needed_cases():
            if c.positive:
                log.append(
                    {
                        "ts": c.expected_at,
                        "type": "alert.waiter_needed",
                        "table_id": c.table_id,
                        "session_no": c.session_no,
                    }
                )
        for q in self.queue_seated:
            log.append(
                {
                    "ts": q.crossed_at,
                    "type": "queue.seated",
                    "party_id": q.party_id,
                    "person_id": q.person_id,
                    "waited_s": q.waited_s,
                }
            )
        for w in self.walkaways:
            log.append(
                {
                    "ts": w.left_at if w.left_at is not None else w.decided_at,
                    "type": "queue.walkaway",
                    "party_id": w.party_id,
                    "size": w.size,
                    "waited_s": w.waited_s,
                }
            )
        log.sort(key=lambda e: (e["ts"], e["type"]))
        return log

    def to_dict(self) -> dict[str, Any]:
        """JSON-safe export of the whole truth."""
        th = self.thresholds
        now = self.now_ts
        sessions = []
        for s in self.sessions:
            d = asdict(s)
            first = s.first_visit_at(th.staff_visit_min_s, now)
            d["first_visit_at"] = first
            d["first_visit_delay_s"] = None if first is None else first - s.seated_at
            d["bussing_started_at"] = s.bussing_started_at
            sessions.append(d)
        return {
            "site_id": self.site_id,
            "start_ts": self.start_ts,
            "end_ts": self.end_ts,
            "now_ts": self.now_ts,
            "summary": self.summary(),
            "parties": [asdict(p) for p in self.parties.values()],
            "sessions": sessions,
            "waiter_needed": [asdict(c) for c in self.waiter_needed_cases() if c.positive],
            "queue_seated": [{**asdict(q), "waited_s": q.waited_s} for q in self.queue_seated],
            "walkaways": [asdict(w) for w in self.walkaways],
            "occupancy": [asdict(p) for p in self.occupancy],
        }


def _mean(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None
