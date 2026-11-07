import datetime as dt
import inspect
from zoneinfo import ZoneInfo

import pytest
from rv_contracts import FrameSource, SiteConfig
from rv_contracts.fixtures import sample_site_config

from conftest import SMOKE
from rv_sim import AcceleratedClock, ManualClock, Simulation, load_simulation
from rv_sim.adapter import load_simulation as adapter_load_simulation


def test_signature_is_the_integration_contract() -> None:
    assert load_simulation is adapter_load_simulation
    sig = inspect.signature(load_simulation)
    params = sig.parameters
    assert list(params) == ["scenario_path", "speed", "seed", "manual"]
    assert params["scenario_path"].kind is inspect.Parameter.POSITIONAL_OR_KEYWORD
    for name, default in (("speed", 1.0), ("seed", 0), ("manual", False)):
        assert params[name].kind is inspect.Parameter.KEYWORD_ONLY
        assert params[name].default == default


def test_load_simulation_live() -> None:
    sim = load_simulation(str(SMOKE), speed=20)
    assert isinstance(sim, Simulation)
    assert isinstance(sim.config, SiteConfig)
    assert sim.config == sample_site_config()
    assert isinstance(sim.clock, AcceleratedClock) and sim.clock.speed == 20
    assert set(sim.sources) == {"cam-dining", "cam-entrance"}
    assert all(isinstance(s, FrameSource) for s in sim.sources.values())
    assert sim.ground_truth is sim.world.truth
    assert sim.world.seed == 11
    start = dt.datetime(2026, 11, 6, 18, 0, tzinfo=ZoneInfo("Asia/Jerusalem")).timestamp()
    assert sim.start_ts == start == sim.clock.now()
    frame = sim.sources["cam-dining"].read()
    assert frame is not None and frame.index == 0
    with pytest.raises(TypeError):
        sim.step()
    sim.close()
    assert sim.sources["cam-dining"].read() is None


def test_load_simulation_manual_runs_to_the_end() -> None:
    sim = load_simulation(SMOKE, manual=True, seed=3)
    assert isinstance(sim.clock, ManualClock)
    assert sim.world.seed == 14
    frames = 0
    while not sim.finished:
        for source in sim.sources.values():
            if source.read() is not None:
                frames += 1
        sim.step()
    assert frames == 2 * (sim.world.end_tick + 1)
    assert sim.world.finished
    assert sim.ground_truth.summary()["parties"] == 11
