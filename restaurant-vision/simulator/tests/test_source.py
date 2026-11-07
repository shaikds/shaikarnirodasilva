import pytest
from rv_contracts import Frame, FrameSource
from rv_edge.interfaces import SyntheticImage, SyntheticPerson

from rv_sim import ManualClock, Scenario, SimulatedSource, World, parse_scenario


@pytest.fixture
def setup(smoke: Scenario) -> tuple[World, ManualClock, SimulatedSource, SimulatedSource]:
    world = World(smoke)
    clock = ManualClock(world.start_ts)
    return (
        world,
        clock,
        SimulatedSource(world, "cam-dining", clock),
        SimulatedSource(world, "cam-entrance", clock),
    )


def test_frames_follow_the_clock(
    setup: tuple[World, ManualClock, SimulatedSource, SimulatedSource],
) -> None:
    world, clock, dining, entrance = setup
    assert isinstance(dining, FrameSource)
    dining.open()
    frame = dining.read()
    assert isinstance(frame, Frame)
    assert (frame.camera_id, frame.index, frame.width, frame.height) == ("cam-dining", 0, 1280, 720)
    assert frame.ts == clock.now()
    assert isinstance(frame.image, SyntheticImage)
    assert all(isinstance(p, SyntheticPerson) for p in frame.image.people)
    obs = dining.observation(0)
    assert obs is not None
    assert [o.role for o in obs.people if o.role != "false_positive"] == ["staff"] * 3
    assert dining.read() is None  # same frame interval
    clock.advance(0.1)
    assert dining.read() is None
    clock.advance(0.1)
    second = dining.read()
    assert second is not None and second.index == 1
    clock.advance(0.2 * 3)  # frames 2 and 3 are dropped, like a slow reader on a live camera
    third = dining.read()
    assert third is not None and third.index == 4 and third.ts == clock.now()
    assert world.tick == 4
    # A second source on the same world gets the same frame interval.
    other = entrance.read()
    assert other is not None and other.index == 4


def test_boxes_are_normalized_and_match_the_truth(
    setup: tuple[World, ManualClock, SimulatedSource, SimulatedSource],
) -> None:
    world, clock, dining, entrance = setup
    people = 0
    for _ in range(600):
        clock.advance(world.dt)
        for source in (dining, entrance):
            frame = source.read()
            assert frame is not None
            assert isinstance(frame.image, SyntheticImage)
            obs = source.observation(frame.index)
            assert obs is not None and obs.image() == frame.image
            for p in frame.image.people:
                x1, y1, x2, y2 = p.box
                assert 0 <= x1 <= x2 <= 1 and 0 <= y1 <= y2 <= 1
                assert p.uniform_score is not None and 0 <= p.uniform_score <= 1
                people += 1
    assert people > 1000


def test_source_ends_and_closes(smoke: Scenario) -> None:
    sc = parse_scenario(
        "run: {start: '18:00', duration: 2}\narrivals: {explicit: [{at: 0, size: 2}]}", "tiny"
    )
    world = World(sc)
    clock = ManualClock(world.start_ts - 1.0)
    source = SimulatedSource(world, "cam-entrance", clock)
    assert source.read() is None  # before the run starts
    clock.advance(1.0)
    indexes = []
    while clock.now() < world.end_ts + 5:
        frame = source.read()
        if frame is not None:
            indexes.append(frame.index)
        clock.advance(world.dt)
    assert indexes == list(range(world.end_tick + 1)) == list(range(11))
    assert source.exhausted
    source.close()
    assert source.read() is None
    with pytest.raises(ValueError):
        SimulatedSource(world, "cam-nope", clock)


def test_late_reader_still_gets_the_last_frame(smoke: Scenario) -> None:
    sc = parse_scenario(
        "run: {start: '18:00', duration: 2}\narrivals: {explicit: [{at: 0, size: 2}]}", "tiny"
    )
    world = World(sc)
    clock = ManualClock(world.start_ts)
    source = SimulatedSource(world, "cam-dining", clock)
    clock.advance(60.0)
    frame = source.read()
    assert frame is not None and frame.index == world.end_tick
    assert source.read() is None and source.exhausted
