"""Daily track-id rotation: every visible person gets a new id in the same frame.

Nothing may change because of it: no session closed or opened, no double count, staff visits
continue, queue waits are kept and no false walk-away is reported.
"""

from __future__ import annotations

from analytics_dsl import (
    Person,
    Scenario,
    crisp_config,
    of_type,
    person,
    rel,
    rotate,
    walker,
)
from rv_contracts import QueueSnapshot, SiteConfig, TableSessionClosed
from rv_contracts.fixtures import sample_site_config

E = "cam-entrance"
IN = (0.8, 0.7)


def table_people() -> list[Person]:
    return [
        person(at="t3", from_t=10, to_t=300, track_id="g1"),
        person(at="t3", from_t=10, to_t=300, offset=(-0.03, 0.0), track_id="g2"),
        person(at="t3", role="staff", from_t=100, to_t=110, offset=(0.03, 0.0), track_id="w1"),
    ]


def replay(config: SiteConfig, people: list[Person], until: float) -> Scenario:
    sc = Scenario(config).add(*people)
    sc.run(until)
    return sc


def test_rotation_mid_session_and_mid_visit_changes_nothing() -> None:
    for config in (crisp_config(), sample_site_config()):
        plain = replay(config, table_people(), 400)
        rotated = replay(config, rotate(table_people(), at=103.0), 400)
        assert rotated.summary() == plain.summary()
        [closed] = of_type(rotated.events, TableSessionClosed)
        assert (closed.max_guests, closed.visits) == (2, 1)
    crisp = replay(crisp_config(), rotate(table_people(), at=103.0), 103.0)
    m = crisp.eng.tables.machine("t3")
    assert m is not None and (m.signals.raw_count, m.signals.count) == (2, 2)


def test_rotation_keeps_queue_waits_and_avoids_false_walkaways() -> None:
    def people() -> list[Person]:
        return [
            # waits right at the zone edge (where a vanished id would look like a walk-away)
            walker([(10, (0.09, 0.7)), (200, (0.09, 0.7)), (202, IN)], camera=E, to_t=205),
            walker([(12, (0.3, 0.5)), (220, (0.3, 0.5)), (222, IN)], camera=E, to_t=225),
        ]

    plain = replay(crisp_config(), people(), 240)
    rotated = replay(crisp_config(), rotate(people(), at=80.0), 240)
    expected = [(201.75, "seated", "z-queue", 191.75), (221.5, "seated", "z-queue", 209.5)]
    assert plain.summary() == expected
    assert rotated.summary() == expected
    snaps = {rel(e.ts): e for e in of_type(rotated.events, QueueSnapshot)}
    assert [(snaps[t].people, snaps[t].longest_wait_s) for t in (70.0, 80.0, 90.0)] == [
        (2, 60.0), (2, 70.0), (2, 80.0)]


def test_rotation_does_not_double_count_occupancy() -> None:
    people = [
        person(at="t1", from_t=0, track_id="a"),
        person(at="t1", from_t=0, offset=(0.02, 0.0), track_id="b"),
        person((0.5, 0.48), role="staff", camera="cam-dining", from_t=0, track_id="s"),
    ]
    sc = replay(crisp_config(), rotate(people, at=20.0), 30)
    occ = [s for s in sc.summary(snapshots=True) if s[1] == "occupancy"]
    assert occ == [(t, "occupancy", 2, 0 if t < 20 else 1, 8, 1) for t in (0.0, 10.0, 20.0, 30.0)]
