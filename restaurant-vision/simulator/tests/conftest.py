from pathlib import Path

import pytest

from rv_sim import Scenario, World, load_scenario

SCENARIOS = Path(__file__).resolve().parents[1] / "scenarios"
SMOKE = SCENARIOS / "smoke.yaml"


@pytest.fixture(scope="session")
def smoke() -> Scenario:
    return load_scenario(SMOKE)


@pytest.fixture(scope="session")
def smoke_world(smoke: Scenario) -> World:
    """The smoke scenario run to the end (shared, read-only)."""
    world = World(smoke)
    world.run_to_end()
    return world
