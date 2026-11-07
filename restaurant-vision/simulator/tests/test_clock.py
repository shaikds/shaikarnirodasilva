import pytest
from rv_contracts import Clock

from rv_sim import AcceleratedClock, ManualClock, SimClock


def test_manual_clock() -> None:
    clock = ManualClock(1000.0)
    assert isinstance(clock, Clock)
    assert clock.now() == 1000.0
    assert clock.advance(0.2) == pytest.approx(1000.2)
    for _ in range(5):
        clock.advance(0.2)
    assert clock.now() == pytest.approx(1001.2)
    assert clock.elapsed == pytest.approx(1.2)
    clock.set(1010.0)
    assert clock.now() == 1010.0
    with pytest.raises(ValueError):
        clock.advance(-0.1)
    with pytest.raises(ValueError):
        clock.set(1009.0)


def test_accelerated_clock_runs_speed_times_faster_from_first_use() -> None:
    mono = [50.0]
    clock = AcceleratedClock(1000.0, speed=20, monotonic=lambda: mono[0])
    assert isinstance(clock, Clock)
    assert SimClock is AcceleratedClock
    assert not clock.started
    mono[0] = 80.0  # setup time before the first now() does not count
    assert clock.now() == 1000.0
    assert clock.started
    mono[0] = 81.5
    assert clock.now() == pytest.approx(1030.0)
    clock.restart()
    assert clock.now() == 1000.0
    assert clock.speed == 20


def test_accelerated_clock_real_time_and_validation() -> None:
    clock = AcceleratedClock(5.0)
    first = clock.now()
    assert first == 5.0
    assert clock.now() >= first
    with pytest.raises(ValueError):
        AcceleratedClock(0.0, speed=0)
