"""Entrance queue: seated vs walk-away vs short visit, parties, long_queue, snapshots.

Sample geometry (``cam-entrance``): the queue zone spans x ~0.04-0.60, y 0.40-0.98; the
entrance line is x = 0.66 (inside = towards the dining room, x > 0.66).
"""

from __future__ import annotations

from typing import Any

from analytics_dsl import (
    Person,
    Scenario,
    crisp_config,
    of_type,
    person,
    rel,
    walker,
    with_thresholds,
    with_zones,
)
from rv_contracts import QueueSnapshot, SiteConfig

from rv_edge.analytics import QueueParams

E = "cam-entrance"
SPOT = (0.3, 0.7)  # inside the queue zone
IN = (0.8, 0.7)  # dining-room side of the entrance line
DOOR = (0.02, 0.7)  # left image edge, outside the zone


def queuer(
    enter: float,
    leave: float,
    to: tuple[float, float],
    *,
    spot: tuple[float, float] = SPOT,
    walk_s: float = 2.0,
    gone: float | None = None,
    **kw: Any,
) -> Person:
    """Waits at ``spot`` from ``enter`` to ``leave``, then walks to ``to`` in ``walk_s``."""
    end = leave + walk_s
    return walker(
        [(enter, spot), (leave, spot), (end, to)], camera=E, to_t=end if gone is None else gone,
        **kw,
    )


def run(*people: Person, until: float = 200.0, config: SiteConfig | None = None) -> Scenario:
    sc = Scenario(config or crisp_config())
    sc.add(*people)
    sc.run(until)
    return sc


def test_crossing_inward_is_seated_with_wait() -> None:
    sc = run(queuer(10, 100, IN, gone=110))
    # x crosses 0.66 between 101.25 (0.6125) and 101.5 (0.675)
    assert sc.summary() == [(101.5, "seated", "z-queue", 91.5)]


def test_vanishing_at_the_door_after_min_wait_is_a_walkaway() -> None:
    sc = run(queuer(10, 100, DOOR))
    # last inside the zone at 101.5, last seen 101.75, vanished for 3 s at 104.75
    assert sc.summary() == [(104.75, "walkaway", "z-queue", 91.5, 1)]


def test_walkaway_min_wait_boundary_and_short_visit() -> None:
    # inside until leave + 1.5 s, last seen at leave + 1.75 s: waits of 60.0 and 59.75 s
    assert run(queuer(10, 68.5, DOOR)).summary() == [(73.25, "walkaway", "z-queue", 60.0, 1)]
    assert run(queuer(10, 68.25, DOOR)).summary() == []
    assert run(queuer(10, 30, DOOR)).summary() == []  # short visit


def test_leaving_the_zone_while_visible_is_a_walkaway_after_grace() -> None:
    sc = run(queuer(10, 100, (0.3, 0.2), walk_s=1.0, gone=1000))
    # leaves the zone upwards (last inside at 100.5) and lingers away from the line
    assert sc.summary() == [(110.5, "walkaway", "z-queue", 90.5, 1)]


def test_member_heading_to_the_line_keeps_waiting_until_it_crosses() -> None:
    sc = run(walker([(10, SPOT), (100, SPOT), (101, (0.63, 0.7)), (150, (0.63, 0.7)),
                     (151, IN)], camera=E, to_t=160))
    assert sc.summary() == [(150.25, "seated", "z-queue", 140.25)]


def test_vanishing_near_the_line_or_deep_in_the_queue_is_not_a_walkaway() -> None:
    near_line = walker([(10, SPOT), (100, SPOT), (101, (0.63, 0.7))], camera=E, to_t=102)
    deep = person(SPOT, camera=E, from_t=10, to_t=100)
    assert run(near_line, deep, until=300).summary() == []


def test_lost_member_resumes_with_same_id_or_hands_off_to_a_new_id() -> None:
    same = queuer(10, 100, IN, gaps=[(40.0, 60.0)], gone=110)
    assert run(same).summary() == [(101.5, "seated", "z-queue", 91.5)]
    first = person((0.31, 0.7), camera=E, from_t=10, to_t=40)
    second = queuer(55, 100, IN, gone=110)  # new track id where the first was lost
    assert run(first, second).summary() == [(101.5, "seated", "z-queue", 91.5)]


def test_lost_member_is_dropped_silently_after_keep_time() -> None:
    # lost at 42.75, dropped at 72.75; the next guest (80) inherits nothing
    sc = run(person(SPOT, camera=E, from_t=10, to_t=40), queuer(80, 100, IN, gone=110))
    assert sc.summary() == [(101.5, "seated", "z-queue", 21.5)]
    snap = sc.eng.queue.snapshot()["zones"]["z-queue"]
    assert snap["people"] == 0 and snap["lost"] == 0


def test_party_grouping_and_party_walkaway() -> None:
    a = queuer(10, 100, DOOR)
    b = queuer(12, 100, (0.02, 0.72), spot=(0.35, 0.72))
    c = queuer(30, 150, IN, spot=(0.3, 0.5), gone=160)  # 18 s later: another party
    sc = run(a, b, c, until=200)
    # b was last inside at 101.75 (89.75 s); the party's longest wait is a's 91.5 s
    assert sc.summary() == [
        (104.75, "walkaway", "z-queue", 91.5, 2),
        (151.5, "seated", "z-queue", 121.5),
    ]
    snaps = {rel(e.ts): e for e in of_type(sc.events, QueueSnapshot)}
    assert (snaps[20].people, snaps[20].parties_est) == (2, 1)
    assert (snaps[40].people, snaps[40].parties_est) == (3, 2)
    assert (snaps[40].longest_wait_s, snaps[40].avg_wait_s) == (30.0, (30 + 28 + 10) / 3)


def test_party_member_lost_counts_in_party_size() -> None:
    a = queuer(10, 100, DOOR)
    b = person((0.35, 0.72), camera=E, from_t=12, to_t=100)  # lost deep in the queue
    sc = run(a, b, until=200)
    # b: lost at 102.75, dropped at 132.75, which completes the party
    assert sc.summary() == [(132.75, "walkaway", "z-queue", 91.5, 2)]


def test_staff_in_the_queue_zone_is_ignored() -> None:
    host = person(SPOT, role="staff", camera=E, from_t=0)
    sc = run(host, queuer(10, 100, DOOR, role="unknown"), until=150)
    assert sc.summary() == [(104.75, "walkaway", "z-queue", 91.5, 1)]
    assert all(e.people <= 1 for e in of_type(sc.events, QueueSnapshot))


def test_long_queue_by_people_with_hysteresis() -> None:
    cfg = with_thresholds(crisp_config(), long_queue_people=4)
    spots = [(0.3, 0.5), (0.3, 0.6), (0.3, 0.8), (0.3, 0.9)]
    people = [
        queuer(10, 100 + 20 * i, IN, spot=spot, gone=110 + 20 * i)
        for i, spot in enumerate(spots)
    ]
    sc = run(*people, until=200, config=cfg)
    # 4 people from 10 -> raised; 3 at 101.5 keeps it (clears at <= 2); 2 at 121.5 clears
    assert sc.summary() == [
        (10.0, "raised", "long_queue", "z-queue"),
        (101.5, "seated", "z-queue", 91.5),
        (121.5, "seated", "z-queue", 111.5),
        (122.0, "resolved", "long_queue", "state_change"),
        (141.5, "seated", "z-queue", 131.5),
        (161.5, "seated", "z-queue", 151.5),
    ]


def test_long_queue_by_wait_with_hysteresis() -> None:
    cfg = with_thresholds(crisp_config(), long_queue_wait_s=100.0)
    sc = run(queuer(10, 300, IN, gone=310), until=320, config=cfg)
    assert sc.summary() == [
        (110.0, "raised", "long_queue", "z-queue"),
        (301.5, "seated", "z-queue", 291.5),
        (302.0, "resolved", "long_queue", "state_change"),
    ]


def test_snapshots_every_interval() -> None:
    sc = run(queuer(10, 100, IN, gone=110), until=30)
    snaps = [s for s in sc.summary(snapshots=True) if s[1] == "queue"]
    assert snaps == [
        (0.0, "queue", "z-queue", 0, 0, 0.0, 0.0),
        (10.0, "queue", "z-queue", 1, 1, 0.0, 0.0),
        (20.0, "queue", "z-queue", 1, 1, 10.0, 10.0),
        (30.0, "queue", "z-queue", 1, 1, 20.0, 20.0),
    ]
    [live] = sc.eng.live().queues
    assert (live.zone_id, live.people, live.longest_wait_s) == ("z-queue", 1, 20.0)


def test_people_hysteresis_levels() -> None:
    params = QueueParams()
    assert [params.people_clear_at(n) for n in (1, 2, 3, 4, 8, 12)] == [0, 0, 1, 2, 5, 8]
    assert QueueParams(people_hysteresis=0).people_clear_at(8) == 7


def test_queued_track_recognised_as_staff_later_leaves_no_outcome() -> None:
    # same track id: no uniform score at first (unknown, joins the queue), then the
    # calibrated uniform score marks it as staff (e.g. a host stepping into the zone)
    first = person(SPOT, role="unknown", camera=E, from_t=10, to_t=20, track_id="host")
    later = walker([(20, SPOT), (100, SPOT), (102, DOOR)], role="staff", camera=E, to_t=102,
                   track_id="host")
    sc = run(first, later, until=150)
    assert sc.summary() == []
    people = [s[3] for s in sc.summary(snapshots=True) if s[1] == "queue"]
    assert people[:4] == [0, 1, 0, 0]


def test_queue_without_entrance_line_counts_every_exit_as_leaving() -> None:
    cfg = with_zones(crisp_config(), remove=["z-entrance-line"])
    sc = run(queuer(10, 100, IN, gone=1000), until=200, config=cfg)
    # no line to cross: walking towards the dining room is just leaving the zone
    # last inside at 101.0 (x 0.55; the zone edge is at x ~0.59), visible outside for 10 s
    assert sc.summary() == [(111.0, "walkaway", "z-queue", 91.0, 1)]


def stand_back(enter: float, spot: tuple[float, float] = (0.3, 0.45)) -> list[tuple[float, Any]]:
    """Enter at the zone's near edge, then walk deeper into the queue within 2 s."""
    return [(enter, (0.3, 0.9)), (enter + 2.0, spot)]


def test_party_split_when_joining_is_merged_when_walking_away() -> None:
    # a and b move deeper in before c arrives (2.5 s after b, 0.45 away from them): c starts
    # its own party at the door, but all three walk out together -> one walk-away of 3
    a = walker([*stand_back(10), (100, (0.3, 0.45)), (102, (0.02, 0.45))], camera=E, to_t=102)
    b = walker([*stand_back(10.5, (0.35, 0.47)), (100, (0.35, 0.47)), (102, (0.02, 0.47))],
               camera=E, to_t=102)
    c = walker([(13, (0.3, 0.9)), (100, (0.3, 0.9)), (102, (0.02, 0.9))], camera=E, to_t=102)
    sc = run(a, b, c)
    assert sc.summary() == [(104.75, "walkaway", "z-queue", 91.5, 3)]


def test_back_to_back_parties_stay_distinct() -> None:
    x1 = walker([*stand_back(10), (100, (0.3, 0.45)), (102, (0.02, 0.45))], camera=E, to_t=102)
    x2 = walker([*stand_back(10.5, (0.35, 0.47)), (100, (0.35, 0.47)), (102, (0.02, 0.47))],
                camera=E, to_t=102)
    y = queuer(13.5, 200, IN, spot=(0.3, 0.9), gone=210)  # arrives 3 s later, stays
    sc = run(x1, x2, y, until=250)
    # x is held up to merge_window_s (10 s) in case y follows; y stays, so x is reported alone
    assert sc.summary() == [
        (114.75, "walkaway", "z-queue", 91.5, 2),
        (201.5, "seated", "z-queue", 188.0),
    ]


def test_false_detection_cannot_graft_its_wait_onto_a_real_person() -> None:
    blip = person(SPOT, camera=E, from_t=50, to_t=50.25)  # one-frame false positive
    sc = run(blip, queuer(60, 100, IN, gone=110))
    assert sc.summary() == [(101.5, "seated", "z-queue", 41.5)]  # not 51.5 from the blip
    # a real track appearing in the very next frame does not take the blip over either
    real = walker([(50.25, SPOT), (100, SPOT), (102, IN)], camera=E, to_t=110)
    sc = run(person(SPOT, camera=E, from_t=50, to_t=50.25), real)
    assert sc.summary() == [(101.5, "seated", "z-queue", 51.25)]  # not 51.5
