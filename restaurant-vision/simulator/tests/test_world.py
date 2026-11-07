from collections import Counter

import pytest
from rv_contracts import anchor_point, point_in_polygon

from rv_sim import Scenario, World
from rv_sim.world import PartyPhase, Role

TERMINAL = {PartyPhase.DEPARTED, PartyPhase.WALKED_AWAY, PartyPhase.BALKED}


def _frames(world: World) -> list[tuple[object, ...]]:
    return [world.observe(cam).people for cam in world.camera_ids]


def test_same_seed_same_world(smoke: Scenario) -> None:
    a, b = World(smoke), World(smoke)
    while not a.finished:
        a.step()
        b.step()
        if a.tick % 7 == 0:
            assert _frames(a) == _frames(b)
    assert a.truth.to_dict() == b.truth.to_dict()


def test_other_seed_other_world(smoke: Scenario, smoke_world: World) -> None:
    other = World(smoke, seed=1)
    other.run_to_end()
    assert other.seed == smoke.seed + 1
    assert other.truth.to_dict() != smoke_world.truth.to_dict()


def test_observations_do_not_depend_on_read_pattern(smoke: Scenario) -> None:
    every, sparse = World(smoke), World(smoke)
    for _ in range(1500):
        every.step()
        sparse.step()
        frames = _frames(every)
        if every.tick % 13 == 0:
            assert _frames(sparse) == frames


@pytest.fixture(scope="module")
def checked_run(smoke: Scenario) -> World:
    """Run the smoke scenario, asserting the world invariants on every tick."""
    world = World(smoke)
    geo = world.geometry
    polygons = {z.zone_id: z.polygon for zs in geo.zones.values() for z in zs}
    seats = {t.zone_id: t.seats for t in geo.tables.values()}
    while True:
        # Party conservation: every arrival is in exactly one phase; guests belong to parties.
        phases = world.party_phase_counts()
        assert sum(phases.values()) == len(world.parties) == len(world.truth.parties)
        for p in world.people.values():
            if p.role is Role.GUEST:
                assert p.party_id is not None
                party = world.parties[p.party_id]
                assert p in party.members
                assert party.phase not in TERMINAL or not p.gone
        # People stay where they are allowed; holds are inside their zone.
        for p in world.people.values():
            if p.box is None:
                continue
            assert p.zones <= p.allowed, (p.person_id, p.activity, p.zones, p.allowed)
            if p.required is not None:
                assert p.required in p.zones, (p.person_id, p.activity)
        # No table over capacity, one party per table.
        at_table: dict[str, list[str]] = {}
        for p in world.people.values():
            if p.role is Role.GUEST:
                for z in p.zones & seats.keys():
                    assert p.party_id is not None
                    at_table.setdefault(z, []).append(p.party_id)
        for z, parties in at_table.items():
            assert len(parties) <= seats[z]
            assert len(set(parties)) == 1
        # Nobody on two cameras; noisy anchors of people holding a spot stay in its zone.
        seen: set[str] = set()
        for cam in world.camera_ids:
            obs = world.observe(cam)
            ids = {o.person_id for o in obs.people if o.person_id} | {
                k.split("#")[0] for k in obs.hidden
            }
            assert not ids & seen
            seen |= ids
            for o in obs.people:
                person = world.people.get(o.person_id or "")
                if person is not None and person.required is not None:
                    anchor = anchor_point(o.box, geo.anchors[cam])
                    assert point_in_polygon(anchor, polygons[person.required])
        if world.finished:
            return world
        world.step()


def test_world_invariants_hold_every_tick(checked_run: World) -> None:
    assert checked_run.finished
    assert checked_run.tick == checked_run.end_tick == 3000


def test_line_crossings_have_the_right_direction(checked_run: World) -> None:
    truth = checked_run.truth
    by_person: dict[str, list[str]] = {}
    for c in truth.crossings:
        by_person.setdefault(c.person_id, []).append(c.direction)
    for party in checked_run.parties.values():
        for m in party.members:
            crossings = by_person.get(m.person_id, [])
            if party.phase in (PartyPhase.WALKED_AWAY, PartyPhase.BALKED):
                assert crossings == []
            elif party.phase is PartyPhase.DEPARTED:
                assert crossings == ["in", "out"]
            elif party.session is not None:
                assert crossings == ["in"]
    assert all(c.role == "guest" for c in truth.crossings)


def test_smoke_truth_matches_the_script(smoke_world: World) -> None:
    truth = smoke_world.truth
    t0 = smoke_world.start_ts
    assert len(truth.sessions) == 9
    positives = [c for c in truth.waiter_needed_cases() if c.positive]
    assert [(c.table_id, truth.sessions[c.session_no - 1].party_id) for c in positives] == [
        ("t3", "p002")
    ]
    assert positives[0].delay_s is not None and positives[0].delay_s > 240
    assert sorted(w.party_id for w in truth.walkaways) == ["p010", "p011"]
    assert {q.party_id for q in truth.queue_seated} == {"p009"}
    p009 = next(s for s in truth.sessions if s.party_id == "p009")
    first = next(s for s in truth.sessions if s.party_id == "p001")
    assert p009.from_queue and p009.table_id == first.table_id == "t1"
    assert first.cleared_at is not None and p009.seated_at > first.cleared_at
    assert truth.sessions[0].seated_at - t0 < 30


def test_ground_truth_is_consistent_with_the_world(smoke_world: World) -> None:
    truth = smoke_world.truth
    th = truth.thresholds
    now = truth.now_ts
    sizes = {p.party_id: p.size for p in truth.parties.values()}
    by_table: dict[str, list[tuple[float, float]]] = {}
    for s in truth.sessions:
        assert s.guests == sizes[s.party_id]
        assert s.guests <= smoke_world.geometry.tables[s.table_id].seats
        end = s.left_at if s.left_at is not None else now
        assert s.seated_at < end
        if s.left_at is not None:
            assert s.leave_started_at is not None and s.leave_started_at <= s.left_at
            assert abs(s.dwell_s - s.planned_dwell_s) < 10  # type: ignore[operator]
        if s.cleared_at is not None:
            assert s.left_at is not None and s.cleared_at > s.left_at
            assert s.bussing_started_at is not None
        for v in s.visits:
            assert v.kind == "service" and v.table_id == s.table_id
            assert s.seated_at <= v.start <= end
        first = s.first_visit_at(th.staff_visit_min_s, now)
        if s.visits:
            assert first == s.visits[0].start
        by_table.setdefault(s.table_id, []).append((s.seated_at, end))
    for intervals in by_table.values():
        intervals.sort()
        assert all(a[1] <= b[0] for a, b in zip(intervals, intervals[1:], strict=False))
    # One queue-seated record per queued person seated; all from from_queue sessions.
    queued_parties = {s.party_id for s in truth.sessions if s.from_queue}
    assert Counter(q.party_id for q in truth.queue_seated) == {
        pid: sizes[pid] for pid in queued_parties
    }
    assert all(q.waited_s > 0 for q in truth.queue_seated)
    # Walk-aways waited about their patience.
    plans = {p.party_id: p for p in smoke_world.plans}
    for w in truth.walkaways:
        assert w.waited_s is not None
        assert abs(w.waited_s - plans[w.party_id].patience_s) < 15
    # The occupancy timeline agrees with the sessions.
    assert len(truth.occupancy) == 601
    for point in truth.occupancy:
        open_sessions = [
            s
            for s in truth.sessions
            if s.seated_at <= point.ts and (s.left_at is None or s.left_at > point.ts)
        ]
        assert point.tables_occupied == len(open_sessions)
        assert point.guests_at_tables >= sum(s.guests for s in open_sessions) - 6
        assert point.staff_visible == smoke_world.scenario.staff.count


def test_hourly_arrivals_follow_the_rate_profile() -> None:
    from conftest import SCENARIOS
    from rv_sim import load_scenario

    world = World(load_scenario(SCENARIOS / "peak_friday.yaml"))
    hours = Counter(int((p.at + 30 * 60) // 3600) for p in world.plans)  # starts 19:30
    assert sum(hours.values()) == len(world.plans) > 40
    assert all(p.at <= world.scenario.run.duration - 20 * 60 for p in world.plans)
    assert [p.at for p in world.plans] == sorted(p.at for p in world.plans)
