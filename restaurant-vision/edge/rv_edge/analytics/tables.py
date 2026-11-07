"""Table states, sessions and table alerts (architecture 6.2 ``TableModule``).

Each table is observed through its **primary** zone only (``SiteConfig.primary_zone``), so a
table seen by overlapping cameras is counted once. Tables without a primary zone, or whose
primary camera is disabled, are not tracked (they are coverage gaps).

Signals (:class:`TableSignals`, updated on every frame of the primary camera):

* guest count: tracks whose role counts as guest (``guest`` or ``unknown``) with their anchor
  in the zone, held for :data:`~.smoothing.GUEST_HOLD_S` after the last sighting (occlusion)
  and smoothed by the lower rolling median over ``count_window_s``. "Guests present" means the
  smoothed count is >= 1; ``present_since`` / ``absent_since`` mark the current run.
* staff visit: a staff track in the zone continuously for ``staff_visit_min_s``, gaps of up to
  :data:`STAFF_GAP_S` allowed. One continuous presence is one visit, confirmed when it reaches
  the minimum; its start is the arrival time.
* bussing visit: staff in the zone for ``bussing_visit_min_s`` *while no guest is seen* at the
  table, measured from the later of the staff arrival and the moment the held (unsmoothed)
  guest count dropped to 0. The held count is used so that the median's lag of about
  ``count_window_s / 2`` does not swallow a waiter who clears the table right after the guests
  leave.
* staff visits are measured on "any staff track in the zone", so they survive track id
  switches and the daily id rotation (with uniform calibration a new staff id is recognised
  in its first frame).

State machine (:class:`TableStateMachine`, State pattern, one per table)::

    empty --guests present seat_confirm_s--> seated            (opens a session)
    seated --staff visit--> attended
    seated|attended --no guests leave_confirm_s--> needs_bussing (closes the session)
    needs_bussing --bussing visit--> empty
    needs_bussing --guests present seat_confirm_s--> seated     (new session)

Presence-driven transitions are evaluated on frames of the table's camera only (a camera that
stops delivering frames freezes its tables instead of emptying them); alert timers run on frames
and on ``on_tick``. A table that was bussed while the guests' departure was still being
confirmed goes ``needs_bussing -> empty`` right after entering ``needs_bussing`` (same ts).

Timestamps are backdated to the evidence. The confirmation delays (``seat_confirm_s``,
``leave_confirm_s``, plus about ``count_window_s / 2`` of median lag) only decide *that* the
state changed; *when* it changed is taken from the sightings:

* seating: the first guest sighting of the presence episode (sightings less than
  :data:`EPISODE_GAP_S` apart form one episode) -> ``session.seated_at``, the ``seated`` state's
  ``since_ts`` and the ``waiter_needed`` deadline (``seated_at + first_visit_timeout_s``);
* attended: when the waiter arrived (``since_ts``);
* departure: the last guest sighting before the smoothed count dropped to 0 -> ``left_at``,
  ``needs_bussing``'s ``since_ts`` and the ``bussing_needed`` deadline.

A deadline that already passed at confirmation fires at once. A staff visit that started
after the guests arrived but was confirmed before seating was confirmed counts as the first
visit. ``table.state_changed`` events keep ``ts`` = confirmation time (the contract has no
separate "since" field; see :attr:`TableStateMachine.state_since`), so the event stream stays
in emission order.

Alerts (each raised at most once per condition episode, auto-resolved):

* ``waiter_needed`` (urgent): ``seated`` for ``first_visit_timeout_s`` without a visit; once
  per session. Resolved by the visit (``staff_visit``) or by guests leaving (``state_change``).
* ``checkin_needed`` (warn): ``attended`` and no staff attention for ``checkin_timeout_s``
  (measured from the last moment staff was seen during a confirmed visit). Once per episode: a
  visit resolves it (``staff_visit``) and starts a new episode. Guests leaving resolves it
  (``state_change``).
* ``bussing_needed`` (info): ``needs_bussing`` for ``bussing_timeout_s``. Resolved by the bussing
  visit (``staff_visit``) or by new guests being seated (``state_change``).

Event order within one transition: ``table.state_changed``, then ``table.session_closed`` (if
the session closes), then ``alert.resolved`` for alerts made moot.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any, ClassVar

from rv_contracts import (
    AlertKind,
    EdgeEvent,
    ResolveReason,
    SiteConfig,
    Table,
    TableLive,
    TableSessionClosed,
    TableState,
    TableStateChanged,
    Thresholds,
    TrackFrame,
    make_event,
    new_uuid7,
)

from .alerts import AlertManager
from .scene import SceneModule
from .smoothing import GUEST_HOLD_S, SmoothedCount
from .zones import PolygonZone, TrackKey

STAFF_GAP_S = 2.0
"""A staff visit survives detection gaps of up to this many seconds."""

EPISODE_GAP_S = 10.0
"""Guest sightings separated by at most this long belong to one presence episode (bridges
occlusions when estimating when guests really arrived)."""

_MAX_CASCADE = 4
_NO_KEYS: tuple[TrackKey, ...] = ()


# --------------------------------------------------------------------------------------
# Signals
# --------------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class StaffVisit:
    """A confirmed staff visit."""

    started_at: float
    """When the staff member arrived (first sighting of the continuous presence)."""
    confirmed_at: float
    """When the presence reached ``staff_visit_min_s``."""


@dataclass(frozen=True, slots=True)
class FrameSignals:
    """What one frame changed at a table, beyond the count and presence runs."""

    visit: StaffVisit | None = None
    """A staff visit confirmed in this frame."""
    bussed: bool = False
    """A bussing visit confirmed in this frame (only while no guest is seen)."""
    attending: bool = False
    """Staff is at the table in this frame as part of a confirmed visit."""

    def consumed(self) -> FrameSignals:
        """The same signals after a transition used them (visits trigger one transition)."""
        if self.visit is None and not self.bussed:
            return self
        return FrameSignals(attending=self.attending)


_NO_SIGNALS = FrameSignals()


class TableSignals:
    """Per-table observations from the primary zone (see module docstring)."""

    def __init__(
        self,
        window_s: float,
        *,
        hold_s: float = GUEST_HOLD_S,
        staff_gap_s: float = STAFF_GAP_S,
        episode_gap_s: float = EPISODE_GAP_S,
    ) -> None:
        self._guests = SmoothedCount(window_s, hold_s)
        self.staff_gap_s = staff_gap_s
        self.episode_gap_s = episode_gap_s
        self.present_since: float | None = None
        """Start of the current run of smoothed count >= 1 (None while absent)."""
        self.absent_since: float | None = None
        """Start of the current run of smoothed count 0 (None while present)."""
        self.raw_absent_since: float | None = None
        """Start of the current run of held (unsmoothed) count 0, None while someone is seen."""
        self.arrived_at: float | None = None
        """Backdated start of the current presence run: the first guest sighting of the
        sighting episode that made the smoothed count turn on (set with ``present_since``)."""
        self.departed_at: float | None = None
        """Backdated end of the last presence run: the last guest sighting before the smoothed
        count turned off (set with ``absent_since``)."""
        self.last_visit: StaffVisit | None = None
        """The latest confirmed staff visit, in any state."""
        self.last_ts: float | None = None
        self._episode_start: float | None = None
        self._episode_last: float | None = None
        self._staff_start = 0.0
        self._staff_last: float | None = None
        self._visit_fired = False
        self._bussed_for: float | None = None

    @property
    def count(self) -> int:
        """Smoothed guest count."""
        return self._guests.value

    @property
    def raw_count(self) -> int:
        """Held guest count of the latest frame, before the median."""
        return self._guests.raw

    @property
    def window_s(self) -> float:
        return self._guests.window_s

    @window_s.setter
    def window_s(self, value: float) -> None:
        self._guests.window_s = value

    def update(
        self,
        ts: float,
        guests: Sequence[TrackKey],
        staff: Sequence[TrackKey],
        *,
        visit_min_s: float,
        bussing_min_s: float,
    ) -> FrameSignals:
        """Ingest one frame of the primary camera: guest and staff tracks inside the zone."""
        count = self._guests.update(ts, guests, drop=staff)
        if guests:
            last = self._episode_last
            if last is None or ts - last > self.episode_gap_s:
                self._episode_start = ts
            self._episode_last = ts
        if count >= 1:
            if self.present_since is None:
                self.present_since = ts
                start = self._episode_start
                self.arrived_at = ts if start is None else min(start, ts)
            self.absent_since = None
        else:
            if self.absent_since is None:
                self.absent_since = ts
                last = self._episode_last
                self.departed_at = ts if last is None else min(last, ts)
            self.present_since = None
        if self._guests.raw >= 1:
            self.raw_absent_since = None
        elif self.raw_absent_since is None:
            self.raw_absent_since = ts
        self.last_ts = ts
        if not staff:
            return _NO_SIGNALS
        if self._staff_last is None or ts - self._staff_last > self.staff_gap_s:
            self._staff_start = ts
            self._visit_fired = False
        self._staff_last = ts
        start = self._staff_start
        visit = None
        if not self._visit_fired and ts - start >= visit_min_s:
            self._visit_fired = True
            visit = self.last_visit = StaffVisit(started_at=start, confirmed_at=ts)
        bussed = False
        absent = self.raw_absent_since
        if (
            absent is not None
            and self._bussed_for != absent
            and ts - max(start, absent) >= bussing_min_s
        ):
            self._bussed_for = absent
            bussed = True
        return FrameSignals(visit=visit, bussed=bussed, attending=self._visit_fired)


# --------------------------------------------------------------------------------------
# State machine
# --------------------------------------------------------------------------------------


@dataclass(slots=True)
class TableSession:
    """One seating at a table, from ``empty -> seated`` to ``-> needs_bussing``."""

    session_id: str
    seated_at: float
    max_guests: int
    visits: int = 0
    first_visit_at: float | None = None


@dataclass(slots=True)
class TableContext:
    """What every table machine of a site shares (updated by ``configure``)."""

    site_id: str
    thresholds: Thresholds
    alerts: AlertManager


@dataclass(frozen=True, slots=True)
class _Transition:
    target: TableStateHandler
    cause: ResolveReason
    """Resolve reason for the alerts this transition makes moot."""


class TableStateHandler:
    """State pattern: the behaviour of a table in one ``TableState``."""

    kind: ClassVar[TableState]

    def on_frame(
        self, m: TableStateMachine, t: float, sig: FrameSignals
    ) -> _Transition | None:
        """React to a frame of the table's camera; return a transition or None."""
        return None

    def on_timer(self, m: TableStateMachine, t: float) -> None:
        """Check this state's alert timer (frames and ticks)."""
        return None


class EmptyState(TableStateHandler):
    kind = TableState.EMPTY

    def on_frame(
        self, m: TableStateMachine, t: float, sig: FrameSignals
    ) -> _Transition | None:
        if m.present_for(t) >= m.thresholds.seat_confirm_s:
            return _Transition(SEATED, ResolveReason.STATE_CHANGE)
        return None


class SeatedState(TableStateHandler):
    kind = TableState.SEATED

    def on_frame(
        self, m: TableStateMachine, t: float, sig: FrameSignals
    ) -> _Transition | None:
        m.note_bussing(sig)
        visit = sig.visit or m.take_retro_visit()
        if visit is not None:
            m.record_visit(visit, t)
            return _Transition(ATTENDED, ResolveReason.STAFF_VISIT)
        if m.absent_for(t) >= m.thresholds.leave_confirm_s:
            return _Transition(NEEDS_BUSSING, ResolveReason.STATE_CHANGE)
        return None

    def on_timer(self, m: TableStateMachine, t: float) -> None:
        if m.in_state_for(t) >= m.thresholds.first_visit_timeout_s:
            m.raise_once(AlertKind.WAITER_NEEDED, t)


class AttendedState(TableStateHandler):
    kind = TableState.ATTENDED

    def on_frame(
        self, m: TableStateMachine, t: float, sig: FrameSignals
    ) -> _Transition | None:
        m.note_bussing(sig)
        if sig.visit is not None:
            m.record_visit(sig.visit, t)
        elif sig.attending:
            m.last_attention_at = max(m.last_attention_at, t)
        if m.absent_for(t) >= m.thresholds.leave_confirm_s:
            return _Transition(NEEDS_BUSSING, ResolveReason.STATE_CHANGE)
        return None

    def on_timer(self, m: TableStateMachine, t: float) -> None:
        if t - m.last_attention_at >= m.thresholds.checkin_timeout_s:
            m.raise_once(AlertKind.CHECKIN_NEEDED, t)


class NeedsBussingState(TableStateHandler):
    kind = TableState.NEEDS_BUSSING

    def on_frame(
        self, m: TableStateMachine, t: float, sig: FrameSignals
    ) -> _Transition | None:
        if sig.bussed or m.pre_bussed:
            return _Transition(EMPTY, ResolveReason.STAFF_VISIT)
        if m.present_for(t) >= m.thresholds.seat_confirm_s:
            return _Transition(SEATED, ResolveReason.STATE_CHANGE)
        return None

    def on_timer(self, m: TableStateMachine, t: float) -> None:
        if m.in_state_for(t) >= m.thresholds.bussing_timeout_s:
            m.raise_once(AlertKind.BUSSING_NEEDED, t)


EMPTY = EmptyState()
SEATED = SeatedState()
ATTENDED = AttendedState()
NEEDS_BUSSING = NeedsBussingState()


class TableStateMachine:
    """Lifecycle of one table (see module docstring). Emits ``table.*`` and table alerts."""

    def __init__(
        self, table_id: str, zone_id: str, signals: TableSignals, ctx: TableContext
    ) -> None:
        self.table_id = table_id
        self.zone_id = zone_id
        self.signals = signals
        self._ctx = ctx
        self._state: TableStateHandler = EMPTY
        self.state_since: float | None = None
        """When the current state started (None: initial state, no transition yet)."""
        self.session: TableSession | None = None
        """The open session (seated/attended) or the just-closed one (needs_bussing)."""
        self.last_attention_at = 0.0
        """Last moment staff attended the table (``attended`` check-in timer)."""
        self.pre_bussed = False
        """A bussing visit happened while the guests' departure was being confirmed."""
        self._retro_visit: StaffVisit | None = None
        self._open: dict[AlertKind, str] = {}
        self._raised: set[AlertKind] = set()
        self._out: list[EdgeEvent] = []

    @property
    def state(self) -> TableState:
        return self._state.kind

    @property
    def thresholds(self) -> Thresholds:
        return self._ctx.thresholds

    def present_for(self, t: float) -> float:
        """Seconds guests have been continuously present at ``t`` (-inf if absent)."""
        since = self.signals.present_since
        return -math.inf if since is None else t - since

    def absent_for(self, t: float) -> float:
        """Seconds without guests at ``t`` (-inf if present or unknown)."""
        since = self.signals.absent_since
        return -math.inf if since is None else t - since

    def in_state_for(self, t: float) -> float:
        """Seconds in the current state at ``t`` (-inf if it started before any transition)."""
        return -math.inf if self.state_since is None else t - self.state_since

    # --- evaluation -------------------------------------------------------------------

    def evaluate(self, t: float, sig: FrameSignals | None) -> list[EdgeEvent]:
        """Advance the machine at ``t``. ``sig`` is given for frames of the table's camera
        (after ``signals.update``) and None for ticks, which only run alert timers."""
        if sig is not None:
            if self.signals.raw_count >= 1:  # someone at the table after it was cleared
                self.pre_bussed = False
            session = self.session
            if session is not None and self._state in (SEATED, ATTENDED):
                session.max_guests = max(session.max_guests, self.signals.count)
            for _ in range(_MAX_CASCADE):
                transition = self._state.on_frame(self, t, sig)
                if transition is None:
                    break
                self._go(transition, t)
                sig = sig.consumed()
        self._state.on_timer(self, t)
        out, self._out = self._out, []
        return out

    def _go(self, transition: _Transition, t: float) -> None:
        prev, target = self._state, transition.target
        count = self.signals.count
        since = t
        if target is SEATED:
            since = self._backdate(self.signals.arrived_at, self.state_since, t)
            self.session = TableSession(
                session_id=new_uuid7(), seated_at=since, max_guests=count
            )
            self._raised.discard(AlertKind.WAITER_NEEDED)
            visit = self.signals.last_visit
            # a waiter who arrived after the guests but before seating was confirmed
            self._retro_visit = visit if visit is not None and visit.started_at > since else None
        session = self.session
        assert session is not None  # every state but empty belongs to a session
        site_id = self._ctx.site_id
        self._out.append(
            make_event(
                TableStateChanged,
                site_id,
                t,
                table_id=self.table_id,
                from_state=prev.kind,
                to_state=target.kind,
                guest_count=count,
                session_id=session.session_id,
            )
        )
        if target is ATTENDED:  # attended since the waiter arrived
            since = self._backdate(session.first_visit_at, session.seated_at, t)
        if target is NEEDS_BUSSING:
            since = self._backdate(self.signals.departed_at, session.seated_at, t)
            first = session.first_visit_at
            self._out.append(
                make_event(
                    TableSessionClosed,
                    site_id,
                    t,
                    table_id=self.table_id,
                    session_id=session.session_id,
                    seated_at=session.seated_at,
                    left_at=since,
                    max_guests=session.max_guests,
                    first_visit_delay_s=None if first is None else first - session.seated_at,
                    visits=session.visits,
                    bussing_delay_s=None,
                )
            )
            self._raised.discard(AlertKind.BUSSING_NEEDED)
        self._resolve_open(t, transition.cause)
        self._state = target
        self.state_since = since
        if target is EMPTY:
            self.session = None
            self.pre_bussed = False

    @staticmethod
    def _backdate(moment: float | None, floor: float | None, t: float) -> float:
        """``moment`` clamped to ``[floor, t]``; ``t`` when unknown."""
        if moment is None:
            return t
        if floor is not None:
            moment = max(moment, floor)
        return min(moment, t)

    # --- helpers used by the states ---------------------------------------------------

    def take_retro_visit(self) -> StaffVisit | None:
        """A visit confirmed before seating was, but after the guests arrived (once)."""
        visit, self._retro_visit = self._retro_visit, None
        return visit

    def note_bussing(self, sig: FrameSignals) -> None:
        """Remember a bussing visit seen before ``needs_bussing`` was confirmed."""
        if sig.bussed:
            self.pre_bussed = True

    def record_visit(self, visit: StaffVisit, t: float) -> None:
        """Count a staff visit in the session; it resolves an open ``checkin_needed``."""
        session = self.session
        assert session is not None
        session.visits += 1
        if session.first_visit_at is None:
            session.first_visit_at = max(visit.started_at, session.seated_at)
        self.last_attention_at = t
        self._raised.discard(AlertKind.CHECKIN_NEEDED)
        alert_id = self._open.pop(AlertKind.CHECKIN_NEEDED, None)
        if alert_id is not None:
            self._out += self._ctx.alerts.resolve(alert_id, t, ResolveReason.STAFF_VISIT)

    def raise_once(self, kind: AlertKind, t: float) -> None:
        """Raise ``kind`` unless it was already raised in the current episode."""
        if kind in self._raised:
            return
        record, events = self._ctx.alerts.raise_alert(
            kind, t, table_id=self.table_id, zone_id=self.zone_id
        )
        if record is None:
            return
        self._raised.add(kind)
        self._open[kind] = record.alert_id
        self._out += events

    def _resolve_open(self, t: float, reason: ResolveReason) -> None:
        for alert_id in self._open.values():
            self._out += self._ctx.alerts.resolve(alert_id, t, reason)
        self._open.clear()

    def reset(self, t: float) -> list[EdgeEvent]:
        """Back to the initial ``empty`` state without events, resolving open alerts
        (``state_change``). Used when the table is dropped or the tables module is off."""
        self._resolve_open(t, ResolveReason.STATE_CHANGE)
        self._state = EMPTY
        self.state_since = None
        self.session = None
        self.pre_bussed = False
        self._retro_visit = None
        self._raised.clear()
        out, self._out = self._out, []
        return out

    def snapshot(self) -> dict[str, Any]:
        session = self.session
        return {
            "state": self.state.value,
            "since_ts": self.state_since,
            "guest_count": self.signals.count,
            "raw_guest_count": self.signals.raw_count,
            "present_since": self.signals.present_since,
            "absent_since": self.signals.absent_since,
            "session_id": None if session is None else session.session_id,
            "visits": None if session is None else session.visits,
            "open_alerts": {k.value: v for k, v in self._open.items()},
        }


# --------------------------------------------------------------------------------------
# Module
# --------------------------------------------------------------------------------------


@dataclass(slots=True)
class _TableEntry:
    table: Table
    zone: PolygonZone
    camera_id: str
    signals: TableSignals
    machine: TableStateMachine = field(repr=False)


class TableModule:
    """``AnalyticsModule`` for tables (name ``tables``).

    Guest counting always runs (the occupancy module needs table guest counts even on plans
    without table states); the state machines, ``table.*`` events and table alerts run only
    while ``config.modules.tables`` is on.
    """

    def __init__(self, scene: SceneModule, alerts: AlertManager, config: SiteConfig) -> None:
        self._scene = scene
        self._alerts = alerts
        self._ctx = TableContext(config.site_id, config.thresholds, alerts)
        self._entries: dict[str, _TableEntry] = {}
        self._by_camera: dict[str, list[_TableEntry]] = {}
        self._enabled = False
        self._pending: list[EdgeEvent] = []
        self._last_t: float | None = None
        self.configure(config)

    @property
    def name(self) -> str:
        return "tables"

    @property
    def enabled(self) -> bool:
        """True while table states and table alerts run."""
        return self._enabled

    def configure(self, config: SiteConfig) -> None:
        """Keep machines (state, session, alerts) of tables that still have a primary zone on
        an enabled camera; reset their counters if that camera changed; drop the others and
        resolve their alerts (``state_change``, emitted on the next call)."""
        self._ctx.site_id = config.site_id
        self._ctx.thresholds = config.thresholds
        window = config.thresholds.count_window_s
        enabled_cams = {c.camera_id for c in config.cameras if c.enabled}
        ts = self._last_t if self._last_t is not None else 0.0
        entries: dict[str, _TableEntry] = {}
        for table in config.tables:
            zone = config.primary_zone(table.table_id)
            if zone is None or zone.camera_id not in enabled_cams:
                continue
            poly = PolygonZone.from_zone(zone)
            entry = self._entries.get(table.table_id)
            if entry is None:
                signals = TableSignals(window)
                machine = TableStateMachine(table.table_id, zone.zone_id, signals, self._ctx)
                entry = _TableEntry(table, poly, zone.camera_id, signals, machine)
            else:
                if entry.camera_id != zone.camera_id:
                    entry.signals = TableSignals(window)
                    entry.machine.signals = entry.signals
                entry.table, entry.zone, entry.camera_id = table, poly, zone.camera_id
                entry.machine.zone_id = zone.zone_id
                entry.signals.window_s = window
            entries[table.table_id] = entry
        for table_id, entry in self._entries.items():
            if table_id not in entries:
                self._pending += entry.machine.reset(ts)
        enabled = config.modules.tables
        if self._enabled and not enabled:
            for entry in entries.values():
                self._pending += entry.machine.reset(ts)
        self._enabled = enabled
        self._entries = entries
        self._by_camera = {}
        for entry in entries.values():
            self._by_camera.setdefault(entry.camera_id, []).append(entry)

    def take_pending(self) -> list[EdgeEvent]:
        """Events caused by ``configure`` (resolved alerts) not yet returned. They are also
        returned first by the next ``on_track_frame`` / ``on_tick``."""
        out, self._pending = self._pending, []
        return out

    def _advance(self, t: float) -> None:
        self._last_t = t if self._last_t is None else max(self._last_t, t)

    def on_track_frame(self, tf: TrackFrame) -> list[EdgeEvent]:
        out = self.take_pending()
        entries = self._by_camera.get(tf.camera_id)
        if not entries:
            return out
        fo = self._scene.observe(tf)
        if fo is None:
            return out
        t = fo.ts
        self._advance(t)
        guests: dict[str, list[TrackKey]] = {}
        staff: dict[str, list[TrackKey]] = {}
        for obs in fo.tracks:
            if not obs.hits.tables:
                continue
            bucket = guests if obs.role.counts_as_guest else staff
            for zone_id in obs.hits.tables:
                bucket.setdefault(zone_id, []).append(obs.key)
        th = self._ctx.thresholds
        for entry in entries:
            zone_id = entry.zone.zone_id
            sig = entry.signals.update(
                t,
                guests.get(zone_id, _NO_KEYS),
                staff.get(zone_id, _NO_KEYS),
                visit_min_s=th.staff_visit_min_s,
                bussing_min_s=th.bussing_visit_min_s,
            )
            if self._enabled:
                out += entry.machine.evaluate(t, sig)
        return out

    def on_tick(self, now: float) -> list[EdgeEvent]:
        out = self.take_pending()
        self._advance(now)
        if self._enabled:
            for entry in self._entries.values():
                out += entry.machine.evaluate(now, None)
        return out

    # --- read side --------------------------------------------------------------------

    def table_ids(self) -> list[str]:
        """Tracked tables in config order."""
        return list(self._entries)

    def machine(self, table_id: str) -> TableStateMachine | None:
        entry = self._entries.get(table_id)
        return None if entry is None else entry.machine

    def guest_counts(self) -> dict[str, int]:
        """Smoothed guest count per tracked table."""
        return {tid: e.signals.count for tid, e in self._entries.items()}

    def occupied_count(self) -> int:
        """Tables in ``seated`` or ``attended``; with table states off, tables with a smoothed
        guest count >= 1."""
        if self._enabled:
            busy = (TableState.SEATED, TableState.ATTENDED)
            return sum(1 for e in self._entries.values() if e.machine.state in busy)
        return sum(1 for e in self._entries.values() if e.signals.count >= 1)

    def live(self) -> list[TableLive]:
        """``TableLive`` per tracked table (config order); empty while table states are off."""
        if not self._enabled:
            return []
        return [
            TableLive(
                table_id=tid,
                label=e.table.label,
                seats=e.table.seats,
                state=e.machine.state,
                guest_count=e.signals.count,
                since_ts=e.machine.state_since,
                open_alert_ids=self._alerts.open_ids_for_table(tid),
            )
            for tid, e in self._entries.items()
        ]

    def snapshot(self) -> dict[str, Any]:
        return {
            "enabled": self._enabled,
            "tables": {tid: e.machine.snapshot() for tid, e in self._entries.items()},
        }
