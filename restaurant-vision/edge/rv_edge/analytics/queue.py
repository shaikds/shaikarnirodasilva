"""Entrance queue: waits, seatings, walk-aways and the long-queue alert (architecture 6.2).

One state per ``queue`` zone, using the ``entrance_line`` zones drawn on the same camera
(the line between the queue and the dining room; crossing it inward means "seated").

Per track (staff tracks are ignored, e.g. a host standing at the host stand):

* **Join**: the first frame its anchor is inside the queue zone records ``entered_at``.
* **Seated**: a member crossing an entrance line *inward* emits ``queue.seated`` with
  ``waited_s = crossing ts - entered_at``.
* **Left** (walked away outward): a member that is visible but has been outside the zone for
  ``exit_grace_s`` without heading towards the line, or that vanished (not seen for
  ``vanish_s``) *near the door*: outside the zone, or within ``door_margin`` of the zone edge
  or the image border, but not within ``line_near`` of the entrance line. Its wait is
  ``last time inside the zone - entered_at``.
* **Lost**: a member that vanished elsewhere (deep inside the queue, or near the line) is
  probably occluded (the tracker keeps an id through about 3 s of occlusion, then issues a new
  one). It stops counting, but for ``lost_keep_s`` it can resume (same track id reappears) or
  be taken over by a new track id that appears inside the zone within ``handoff_distance`` of
  where it was lost. After that it is dropped silently: the outcome is unknown, so no event.
* **Id switch / rotation**: a new track id appearing within ``handoff_distance`` of a member
  whose id was in the previous frame but not in this one takes the member over at once (wait
  and party kept). This covers the daily ``track_id_ttl_h`` rotation, when every visible
  person gets a new id in the same frame. Matching uses geometry and timing only, never
  appearance, and the state lives only in RAM.

Parties: a joining track belongs to the party of a waiting member that joined within
``party_window_s`` (5 s) and stands within ``party_distance``. In a crowded queue a large party
can still be split (its members spread out to free spots), so a party that finishes as a
walk-away is held up to ``merge_window_s`` while any party that joined within
``party_window_s`` of it is still waiting; if that one walks away too in the meantime, both
are reported as one walk-away. Distinct parties that arrive back to back stay distinct unless
they also walk away together. Tracks that vanish less than ``min_member_s`` after joining
(false detections, passers-by) are discarded and can never be taken over, so they cannot graft
a stale wait or party onto a real person. A party's walk-away is one
``queue.walkaway`` event, emitted when its last member is resolved, if the longest wait of the
members who left is >= ``walkaway_min_wait_s``: ``party_size_est`` = members who left (plus
members dropped as lost, unless someone of the party was seated). It is stamped when it is
emitted, normally the moment the last member is resolved.

``long_queue`` (warn) is raised when people >= ``long_queue_people`` or the longest current
wait >= ``long_queue_wait_s``, and resolved (``state_change``) only once *both* fall back
below the hysteresis levels: people <= ``long_queue_people - 1 - h`` (h defaults to a quarter
of the threshold, at least 1) and longest wait < ``wait_clear_ratio * long_queue_wait_s``.

``queue.snapshot`` (people waiting, parties, longest and mean current wait) is emitted for
every queue zone every ``snapshot_interval_s``. Waits are measured to the tick time.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

from rv_contracts import (
    AlertKind,
    Crossing,
    EdgeEvent,
    QueueLive,
    QueueSeated,
    QueueSnapshot,
    QueueWalkaway,
    ResolveReason,
    SiteConfig,
    TrackFrame,
    ZoneKind,
    make_event,
)

from .alerts import AlertManager
from .roles import Role
from .scene import FrameObservation, SceneModule
from .timers import IntervalTimer
from .zones import LineZone, Point2, PolygonZone, TrackKey, border_distance


@dataclass(frozen=True, slots=True)
class QueueParams:
    """Queue heuristics. Distances are normalized image units, times seconds."""

    party_window_s: float = 5.0
    party_distance: float = 0.15
    """Max distance between a joining track and a party member's entry point or position."""
    merge_window_s: float = 10.0
    """A finished walk-away is held up to this long while a party that joined the queue within
    ``party_window_s`` of it is still waiting; if that party walks away meanwhile, both are
    reported as one walk-away (one party split when joining)."""
    min_member_s: float = 2.0
    """A track that vanishes less than this after joining is discarded without an outcome
    (false detection or a passer-by); it can never be taken over."""
    exit_grace_s: float = 10.0
    vanish_s: float = 3.0
    door_margin: float = 0.05
    line_near: float = 0.1
    heading_eps: float = 0.02
    """A member outside the zone is heading in if it is this much closer to the line than
    where it last was inside the zone."""
    lost_keep_s: float = 30.0
    handoff_distance: float = 0.1
    people_hysteresis: int | None = None
    """People below ``long_queue_people - 1`` needed to clear ``long_queue``; None: a quarter
    of the threshold, at least 1."""
    wait_clear_ratio: float = 0.75
    done_forget_s: float = 60.0
    """Finished track ids are ignored (not re-queued) until unseen this long."""

    def people_clear_at(self, long_queue_people: int) -> int:
        """Highest people count at which an open ``long_queue`` may clear."""
        hyst = self.people_hysteresis
        if hyst is None:
            hyst = max(1, round(long_queue_people * 0.25))
        return max(0, long_queue_people - 1 - hyst)


@dataclass(slots=True, eq=False)
class _Party:
    entered_at: float
    """When its first member joined the queue."""
    waiting: int = 0
    """Members not yet resolved (waiting or lost)."""
    left_waits: list[float] = field(default_factory=list)
    dropped: int = 0
    seated: int = 0
    completed_at: float | None = None
    """When its last member was resolved (set while held for a possible merge)."""

    def absorb(self, other: _Party) -> None:
        """Merge the outcome of ``other`` (the same party, split when joining)."""
        self.entered_at = min(self.entered_at, other.entered_at)
        self.left_waits += other.left_waits
        self.dropped += other.dropped
        self.seated += other.seated


@dataclass(slots=True, eq=False)
class _Member:
    key: TrackKey
    party: _Party
    entered_at: float
    last_in_zone_ts: float
    last_in_zone_anchor: Point2
    last_seen_ts: float
    last_anchor: Point2
    lost_at: float | None = None

    @property
    def lifetime(self) -> float:
        """Seconds between joining the queue and the last sighting."""
        return self.last_seen_ts - self.entered_at


def _dist(a: Point2, b: Point2) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


class _QueueZone:
    """Live state of one queue zone."""

    def __init__(self, zone: PolygonZone, camera_id: str, lines: tuple[LineZone, ...]) -> None:
        self.zone = zone
        self.camera_id = camera_id
        self.lines = lines
        self.members: dict[TrackKey, _Member] = {}
        self.done: dict[TrackKey, float] = {}
        self.alert_id: str | None = None
        self.latest: QueueLive | None = None
        self.last_frame_ts: float | None = None
        self.held: list[_Party] = []
        """Completed walk-away parties held briefly in case the rest of the party follows."""

    def line_distance(self, p: Point2) -> float:
        return min((line.distance(p) for line in self.lines), default=math.inf)

    def waiting(self) -> list[_Member]:
        return [m for m in self.members.values() if m.lost_at is None]

    def stats(self, now: float) -> tuple[int, int, float, float]:
        """``(people, parties, longest_wait_s, avg_wait_s)`` at ``now``."""
        waiting = self.waiting()
        if not waiting:
            return 0, 0, 0.0, 0.0
        waits = [max(0.0, now - m.entered_at) for m in waiting]
        parties = len({id(m.party) for m in waiting})
        return len(waiting), parties, max(waits), sum(waits) / len(waits)


class QueueModule:
    """``AnalyticsModule`` for entrance queues (name ``queue``); see module docstring."""

    def __init__(
        self,
        scene: SceneModule,
        alerts: AlertManager,
        config: SiteConfig,
        *,
        params: QueueParams | None = None,
    ) -> None:
        self._scene = scene
        self._alerts = alerts
        self.params = params if params is not None else QueueParams()
        self._config = config
        self._zones: dict[str, _QueueZone] = {}
        self._enabled = False
        self._timer = IntervalTimer(config.thresholds.snapshot_interval_s)
        self._pending: list[EdgeEvent] = []
        self._last_t: float | None = None
        self.configure(config)

    @property
    def name(self) -> str:
        return "queue"

    @property
    def enabled(self) -> bool:
        return self._enabled

    def configure(self, config: SiteConfig) -> None:
        """Keep the state of queue zones that still exist on the same camera; drop the others
        and resolve their ``long_queue`` alerts (``state_change``, emitted on the next call)."""
        self._config = config
        self._timer.interval_s = config.thresholds.snapshot_interval_s
        enabled = config.modules.queue
        enabled_cams = {c.camera_id for c in config.cameras if c.enabled}
        zones: dict[str, _QueueZone] = {}
        if enabled:
            for zone in config.zones:
                if zone.kind is not ZoneKind.QUEUE or zone.camera_id not in enabled_cams:
                    continue
                poly = PolygonZone.from_zone(zone)
                lines = tuple(
                    LineZone(z.zone_id, z.line)
                    for z in config.zones_for(zone.camera_id, ZoneKind.ENTRANCE_LINE)
                    if z.line is not None
                )
                state = self._zones.get(zone.zone_id)
                if state is None or state.camera_id != zone.camera_id:
                    state = _QueueZone(poly, zone.camera_id, lines)
                else:
                    state.zone, state.lines = poly, lines
                zones[zone.zone_id] = state
        ts = self._last_t if self._last_t is not None else 0.0
        for zone_id, state in self._zones.items():
            if zones.get(zone_id) is not state and state.alert_id is not None:
                self._pending += self._alerts.resolve(
                    state.alert_id, ts, ResolveReason.STATE_CHANGE
                )
        self._zones = zones
        self._enabled = enabled

    def take_pending(self) -> list[EdgeEvent]:
        """Events caused by ``configure`` (resolved alerts) not yet returned. They are also
        returned first by the next ``on_track_frame`` / ``on_tick``."""
        out, self._pending = self._pending, []
        return out

    def _advance(self, t: float) -> None:
        self._last_t = t if self._last_t is None else max(self._last_t, t)

    # --- frames -----------------------------------------------------------------------

    def on_track_frame(self, tf: TrackFrame) -> list[EdgeEvent]:
        out = self.take_pending()
        states = [q for q in self._zones.values() if q.camera_id == tf.camera_id]
        if not states:
            return out
        fo = self._scene.observe(tf)
        if fo is None:
            return out
        self._advance(fo.ts)
        for state in states:
            out += self._process(state, fo)
        return out

    def _process(self, qz: _QueueZone, fo: FrameObservation) -> list[EdgeEvent]:
        t = fo.ts
        zone_id = qz.zone.zone_id
        line_ids = {line.zone_id for line in qz.lines}
        events: list[EdgeEvent] = []
        prev_t, qz.last_frame_ts = qz.last_frame_ts, t
        frame_keys = {obs.key for obs in fo.tracks}
        for obs in fo.tracks:
            key = obs.key
            if key in qz.done:
                qz.done[key] = t
                continue
            member = qz.members.get(key)
            if obs.role is Role.STAFF:
                if member is not None:  # mistaken for a guest at first: no queue outcome
                    events += self._finish(qz, member, t)
                continue
            in_zone = zone_id in obs.hits.queues
            if member is None:
                member = self._take_over(qz, key, obs.anchor, t, in_zone, prev_t, frame_keys)
                if member is None:
                    if in_zone:
                        self._join(qz, key, t, obs.anchor)
                    continue
            member.lost_at = None
            if any(c is Crossing.IN and lid in line_ids for lid, c in obs.crossings):
                events.append(
                    make_event(
                        QueueSeated,
                        self._config.site_id,
                        t,
                        zone_id=zone_id,
                        waited_s=max(0.0, t - member.entered_at),
                    )
                )
                member.party.seated += 1
                events += self._finish(qz, member, t)
                continue
            member.last_seen_ts, member.last_anchor = t, obs.anchor
            if in_zone:
                member.last_in_zone_ts, member.last_in_zone_anchor = t, obs.anchor
        p = self.params
        for member in list(qz.members.values()):
            if member.lost_at is not None:
                if t - member.lost_at >= p.lost_keep_s:
                    member.party.dropped += 1
                    events += self._finish(qz, member, t)
            elif member.key in frame_keys:
                if t - member.last_in_zone_ts >= p.exit_grace_s and not self._heading_in(
                    qz, member
                ):
                    events += self._left(qz, member, t)
            elif t - member.last_seen_ts >= p.vanish_s:
                if member.lifetime < p.min_member_s:  # a false detection or a passer-by
                    events += self._finish(qz, member, t)
                elif self._near_door(qz, member):
                    events += self._left(qz, member, t)
                else:
                    member.lost_at = t
        return events + self._release(qz, t)

    def _take_over(
        self,
        qz: _QueueZone,
        key: TrackKey,
        anchor: Point2,
        t: float,
        in_zone: bool,
        prev_t: float | None,
        frame_keys: set[TrackKey],
    ) -> _Member | None:
        """Let a new track id continue an existing member (keeping its wait and party).

        Candidates within ``handoff_distance``: a member whose id was in the previous frame
        but not in this one (an id switch or the daily id rotation: same spot, same instant),
        anywhere; and, for a new id inside the zone, a member lost earlier. The nearest wins;
        the old id is retired (ignored if it ever comes back)."""
        best: _Member | None = None
        best_d = math.inf
        for m in qz.members.values():
            if m.key in frame_keys:
                continue
            switched = m.lost_at is None and prev_t is not None and m.last_seen_ts == prev_t
            if not (switched or (in_zone and m.lost_at is not None)):
                continue
            if m.lifetime < self.params.min_member_s:
                continue
            d = _dist(m.last_anchor, anchor)
            if d <= self.params.handoff_distance and d < best_d:
                best, best_d = m, d
        if best is None:
            return None
        del qz.members[best.key]
        qz.done[best.key] = t
        best.key = key
        qz.members[key] = best
        return best

    def _join(self, qz: _QueueZone, key: TrackKey, t: float, anchor: Point2) -> None:
        p = self.params
        best: _Member | None = None
        best_d = math.inf
        for m in qz.members.values():
            if m.lost_at is not None or abs(t - m.entered_at) > p.party_window_s:
                continue
            d = _dist(m.last_anchor, anchor)
            if d <= p.party_distance and d < best_d:
                best, best_d = m, d
        party = _Party(entered_at=t) if best is None else best.party
        party.waiting += 1
        qz.members[key] = _Member(key, party, t, t, anchor, t, anchor)

    def _heading_in(self, qz: _QueueZone, m: _Member) -> bool:
        if not qz.lines or m.last_seen_ts == m.last_in_zone_ts:
            return False
        return (
            qz.line_distance(m.last_anchor)
            < qz.line_distance(m.last_in_zone_anchor) - self.params.heading_eps
        )

    def _near_door(self, qz: _QueueZone, m: _Member) -> bool:
        p = self.params
        anchor = m.last_anchor
        if qz.lines and qz.line_distance(anchor) <= p.line_near:
            return False
        if m.last_seen_ts != m.last_in_zone_ts:  # last seen outside the zone
            return not self._heading_in(qz, m)
        return (
            qz.zone.boundary_distance(anchor) <= p.door_margin
            or border_distance(anchor) <= p.door_margin
        )

    def _left(self, qz: _QueueZone, m: _Member, t: float) -> list[EdgeEvent]:
        m.party.left_waits.append(max(0.0, m.last_in_zone_ts - m.entered_at))
        return self._finish(qz, m, t)

    def _finish(self, qz: _QueueZone, m: _Member, t: float) -> list[EdgeEvent]:
        del qz.members[m.key]
        qz.done[m.key] = t
        party = m.party
        party.waiting -= 1
        if party.waiting > 0 or not party.left_waits:
            return []
        window = self.params.party_window_s
        for held in qz.held:  # the rest of the same party left moments ago: one walk-away
            if abs(held.entered_at - party.entered_at) <= window:
                held.absorb(party)
                return self._release(qz, t)
        party.completed_at = t
        qz.held.append(party)
        return self._release(qz, t)

    def _release(self, qz: _QueueZone, t: float) -> list[EdgeEvent]:
        """Emit held walk-aways once no party that joined with them is still waiting, or
        after ``merge_window_s``."""
        if not qz.held:
            return []
        p = self.params
        waiting = {id(m.party): m.party for m in qz.members.values()}.values()
        events: list[EdgeEvent] = []
        for party in list(qz.held):
            assert party.completed_at is not None
            expired = t - party.completed_at >= p.merge_window_s
            if not expired and any(
                abs(other.entered_at - party.entered_at) <= p.party_window_s for other in waiting
            ):
                continue
            qz.held.remove(party)
            longest = max(party.left_waits)
            if longest < self._config.thresholds.walkaway_min_wait_s:
                continue
            size = len(party.left_waits) + (party.dropped if party.seated == 0 else 0)
            events.append(
                make_event(
                    QueueWalkaway,
                    self._config.site_id,
                    t,
                    zone_id=qz.zone.zone_id,
                    waited_s=longest,
                    party_size_est=size,
                )
            )
        return events

    # --- ticks ------------------------------------------------------------------------

    def on_tick(self, now: float) -> list[EdgeEvent]:
        out = self.take_pending()
        if not self._enabled:
            return out
        self._advance(now)
        forget = self.params.done_forget_s
        for qz in self._zones.values():
            for key in [k for k, ts in qz.done.items() if now - ts > forget]:
                del qz.done[key]
            out += self._release(qz, now)
            out += self._long_queue(qz, now)
        if self._zones and self._timer.due(now):
            for qz in self._zones.values():
                people, parties, longest, avg = qz.stats(now)
                out.append(
                    make_event(
                        QueueSnapshot,
                        self._config.site_id,
                        now,
                        zone_id=qz.zone.zone_id,
                        people=people,
                        parties_est=parties,
                        longest_wait_s=longest,
                        avg_wait_s=avg,
                    )
                )
                qz.latest = QueueLive(
                    zone_id=qz.zone.zone_id,
                    ts=now,
                    people=people,
                    parties_est=parties,
                    longest_wait_s=longest,
                    avg_wait_s=avg,
                )
        return out

    def _long_queue(self, qz: _QueueZone, now: float) -> list[EdgeEvent]:
        th = self._config.thresholds
        people, _, longest, _ = qz.stats(now)
        if qz.alert_id is not None and not self._alerts.is_open(qz.alert_id):
            qz.alert_id = None  # resolved elsewhere (alerts switched off)
        if qz.alert_id is None:
            if people >= th.long_queue_people or longest >= th.long_queue_wait_s:
                record, events = self._alerts.raise_alert(
                    AlertKind.LONG_QUEUE, now, zone_id=qz.zone.zone_id
                )
                if record is not None:
                    qz.alert_id = record.alert_id
                return events
            return []
        if (
            people <= self.params.people_clear_at(th.long_queue_people)
            and longest < self.params.wait_clear_ratio * th.long_queue_wait_s
        ):
            events = self._alerts.resolve(qz.alert_id, now, ResolveReason.STATE_CHANGE)
            qz.alert_id = None
            return events
        return []

    # --- read side --------------------------------------------------------------------

    def live(self) -> list[QueueLive]:
        """Latest ``queue.snapshot`` of every queue zone that has one."""
        return [qz.latest for qz in self._zones.values() if qz.latest is not None]

    def snapshot(self) -> dict[str, Any]:
        now = self._last_t if self._last_t is not None else 0.0
        zones: dict[str, Any] = {}
        for zone_id, qz in self._zones.items():
            people, parties, longest, avg = qz.stats(now)
            zones[zone_id] = {
                "people": people,
                "parties_est": parties,
                "longest_wait_s": longest,
                "avg_wait_s": avg,
                "lost": len(qz.members) - people,
                "alert_id": qz.alert_id,
            }
        return {"enabled": self._enabled, "zones": zones}
