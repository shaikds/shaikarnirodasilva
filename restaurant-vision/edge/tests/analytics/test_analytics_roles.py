"""Role classification: the three strategies, the weighted sticky vote, forgetting."""

from __future__ import annotations

from analytics_dsl import Scenario, crisp_config, person, walker
from rv_edge.analytics import (
    MovementPattern,
    Role,
    RoleBook,
    Sighting,
    StaffZoneOrigin,
    UniformColor,
    Vote,
)
from rv_edge.analytics.zones import NO_HITS, TrackKey, ZoneHits

K: TrackKey = ("cam-dining", "a")
KITCHEN = ZoneHits(staff_area=True)


def at(ts: float, hits: ZoneHits = NO_HITS, uniform: float | None = None,
       key: TrackKey = K) -> Sighting:
    return Sighting(key, ts, (0.5, 0.5), hits, uniform)


def table(zone: str) -> ZoneHits:
    return ZoneHits(tables=(zone,))


class Fixed:
    """A stub classifier with a settable vote."""

    def __init__(self, weight: float, vote: Vote | None = None) -> None:
        self._weight = weight
        self.current = vote

    @property
    def name(self) -> str:
        return "fixed"

    @property
    def weight(self) -> float:
        return self._weight

    def observe(self, sighting: Sighting) -> None:
        return None

    def vote(self, key: TrackKey) -> Vote | None:
        return self.current

    def forget(self, key: TrackKey) -> None:
        self.current = None


def test_staff_zone_origin_within_window_only() -> None:
    c = StaffZoneOrigin()
    c.observe(at(0.0))
    c.observe(at(2.0, KITCHEN))  # still within the 2 s origin window
    assert c.vote(K) == Vote(Role.STAFF)
    other: TrackKey = ("cam-dining", "b")
    c.observe(at(0.0, key=other))
    c.observe(at(2.25, KITCHEN, key=other))
    assert c.vote(other) is None
    c.forget(K)
    assert c.vote(K) is None
    assert (c.name, c.weight) == ("staff_zone_origin", 3.0)


def test_uniform_color_thresholds_and_calibration() -> None:
    c = UniformColor(min_samples=2)
    c.observe(at(0.0, uniform=0.9))
    assert c.vote(K) is None  # one sample < min_samples
    c.observe(at(0.2, uniform=0.5))
    assert c.vote(K) == Vote(Role.STAFF)  # mean 0.7
    c.observe(at(0.4, uniform=0.1))
    assert c.vote(K) is None  # mean 0.5: dead band
    c.observe(at(0.6, uniform=0.0))
    assert c.vote(K) is None  # mean 0.375: still in the dead band
    c.observe(at(0.8, uniform=None))  # no calibration this frame: ignored
    c.observe(at(1.0, uniform=0.0))
    assert c.vote(K) == Vote(Role.GUEST)  # mean 0.3
    c.forget(K)
    assert c.vote(K) is None
    try:
        UniformColor(staff_threshold=0.3, guest_threshold=0.6)
    except ValueError:
        pass
    else:  # pragma: no cover
        raise AssertionError("expected ValueError")


def feed(c: MovementPattern, start: float, end: float, hits: ZoneHits, step: float = 0.5) -> None:
    t = start
    while t <= end + 1e-9:
        c.observe(at(t, hits))
        t += step


def test_movement_two_distinct_tables_is_staff() -> None:
    c = MovementPattern()
    feed(c, 0, 5, table("z-t1"))
    feed(c, 5.5, 6, NO_HITS)  # within the 2 s gap
    feed(c, 6.5, 11, table("z-t2"))  # switching tables closes the first visit
    assert c.vote(K) is None  # only one completed visit
    feed(c, 11.5, 14, NO_HITS)
    assert c.vote(K) == Vote(Role.STAFF)


def test_movement_short_visits_to_same_table_is_staff() -> None:
    c = MovementPattern()
    feed(c, 0, 4, table("z-t1"))
    feed(c, 4.5, 7, NO_HITS)  # 3 s away: visit closed
    assert c.vote(K) is None
    feed(c, 20, 30, table("z-t1"))
    feed(c, 31, 34, NO_HITS)
    assert c.vote(K) == Vote(Role.STAFF)


def test_movement_pass_through_is_not_a_visit_and_long_dwell_is_guest() -> None:
    c = MovementPattern()
    feed(c, 0, 2, table("z-t1"))  # 2 s < min_visit_s
    feed(c, 2.5, 6, NO_HITS)
    feed(c, 6.5, 8, table("z-t2"))
    feed(c, 8.5, 12, NO_HITS)
    assert c.vote(K) is None
    feed(c, 20, 140, table("z-t3"))
    assert c.vote(K) == Vote(Role.GUEST)


def test_movement_resumed_after_long_gap_is_a_new_visit_and_window_expires() -> None:
    c = MovementPattern(window_s=100.0)
    feed(c, 0, 5, table("z-t1"))
    feed(c, 10, 15, table("z-t1"))  # same zone after 5 s unseen: a new visit
    assert c.vote(K) is None  # visit 2 still open
    feed(c, 16, 20, table("z-t2"))
    assert c.vote(K) == Vote(Role.STAFF)  # two short visits to t1
    feed(c, 200, 201, NO_HITS)  # all visits older than the window
    assert c.vote(K) is None
    c.forget(K)
    assert c.vote(("cam-dining", "never")) is None


def test_rolebook_weighted_sticky_vote() -> None:
    staff, guest = Fixed(1.5), Fixed(2.0)
    book = RoleBook([staff, guest], switch_margin=1.0)
    assert book.observe(at(0.0)) is Role.UNKNOWN
    guest.current = Vote(Role.GUEST)
    assert book.observe(at(1.0)) is Role.GUEST
    staff.current = Vote(Role.STAFF)
    assert book.observe(at(2.0)) is Role.GUEST  # 2.0 vs 1.5: guest still wins
    guest.current = Vote(Role.GUEST, confidence=0.5)
    assert book.observe(at(3.0)) is Role.GUEST  # 1.5 vs 1.0: wins by < margin, sticky
    guest.current = None
    assert book.observe(at(4.0)) is Role.STAFF  # 1.5 vs 0: switch
    staff.current = None
    assert book.observe(at(5.0)) is Role.STAFF  # no evidence: keeps the role
    staff.current = Vote(Role.STAFF)
    guest.current = Vote(Role.GUEST, confidence=0.75)
    assert book.observe(at(6.0)) is Role.STAFF  # tie keeps the role
    assert book.counts() == {"guest": 0, "staff": 1, "unknown": 0}
    assert len(book) == 1 and len(book.classifiers) == 2


def test_rolebook_forgets_after_60s() -> None:
    book = RoleBook()
    assert book.observe(at(0.0, KITCHEN)) is Role.STAFF
    assert book.observe(at(60.0)) is Role.STAFF  # 60 s: not forgotten yet
    assert book.observe(at(120.25)) is Role.UNKNOWN  # > 60 s unseen: starts fresh
    other: TrackKey = ("cam-entrance", "b")
    book.observe(at(120.0, KITCHEN, key=other))
    assert book.forget_stale(180.0) == 0  # 59.75 s and exactly 60 s unseen
    assert book.forget_stale(180.5) == 2
    book.observe(at(200.0, KITCHEN, key=other))
    book.forget_camera("cam-entrance")
    assert book.role(other) is Role.UNKNOWN and len(book) == 0


def test_waiter_from_kitchen_without_uniform_calibration_is_staff() -> None:
    sc = Scenario(crisp_config())
    sc.add(person(at="t3", from_t=0))
    sc.add(walker([(100, "z-staff-kitchen"), (102, (0.56, 0.33)), (110, (0.56, 0.33))],
                  role="staff", uniform=None, to_t=111))
    sc.run(120)
    assert sc.summary() == [
        (20.0, "state", "t3", "empty", "seated", 1),
        (106.75, "state", "t3", "seated", "attended", 1),
    ]


def test_waiter_learned_from_movement_pattern() -> None:
    sc = Scenario(crisp_config())
    sc.add(person(at="t3", from_t=0))
    sc.add(walker(
        [(30, "t1"), (40, "t1"), (41, "t2"), (51, "t2"), (52, (0.42, 0.47)), (60, (0.42, 0.47)),
         (61, (0.56, 0.33)), (80, (0.56, 0.33))],
        role="unknown", to_t=81,
    ))
    sc.run(100)
    # unknown at t1/t2 (10 s each, counted as a guest but too short to seat); staff once the
    # second visit completed, so the stop at t3 is a waiter visit
    assert sc.summary() == [
        (20.0, "state", "t3", "empty", "seated", 1),
        (65.5, "state", "t3", "seated", "attended", 1),  # inside t3 from 60.5
    ]
