"""Integration point for the edge runtime: ``load_simulation`` (used by ``rv-edge simulate``).

::

    sim = load_simulation("scenarios/demo_dinner.yaml", speed=20)
    sim.config      # SiteConfig to run the edge with
    sim.clock       # Clock shared by the sources and the runtime
    sim.sources     # {camera_id: FrameSource} for every enabled camera
    sim.world       # the World behind the sources
    sim.ground_truth

* ``manual=False`` (default): :class:`AcceleratedClock` at ``speed`` x real time, anchored at the
  scenario start on its first ``now()`` call.
* ``manual=True``: :class:`ManualClock` at the scenario start; the caller advances it
  (``sim.clock.advance(sim.dt)`` per frame, or :meth:`Simulation.step`). ``speed`` is ignored.
* ``seed`` is added to the scenario's own ``seed``: 0 reproduces the scenario as written, other
  values give independent variations of it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from rv_contracts import Clock, FrameSource, SiteConfig

from .clock import AcceleratedClock, ManualClock
from .ground_truth import GroundTruth
from .scenario import Scenario, load_scenario
from .source import SimulatedSource
from .world import CameraObservation, World


@dataclass
class Simulation:
    """A loaded scenario ready to feed an edge pipeline."""

    config: SiteConfig
    clock: Clock
    sources: dict[str, FrameSource]
    world: World
    ground_truth: GroundTruth
    scenario: Scenario
    _sim_sources: dict[str, SimulatedSource] = field(default_factory=dict, repr=False)

    @property
    def dt(self) -> float:
        """Seconds between frames (1 / fps)."""
        return self.world.dt

    @property
    def start_ts(self) -> float:
        return self.world.start_ts

    @property
    def end_ts(self) -> float:
        return self.world.end_ts

    @property
    def finished(self) -> bool:
        """True when every source returned its last frame."""
        return all(s.exhausted for s in self._sim_sources.values())

    def source(self, camera_id: str) -> SimulatedSource:
        return self._sim_sources[camera_id]

    def observation(self, camera_id: str, index: int) -> CameraObservation | None:
        """The truth behind a recently returned frame of ``camera_id``."""
        return self._sim_sources[camera_id].observation(index)

    def step(self) -> None:
        """Manual clock only: advance the clock by one frame interval."""
        if not isinstance(self.clock, ManualClock):
            raise TypeError("step() needs a manual clock (load_simulation(..., manual=True))")
        self.clock.advance(self.dt)

    def close(self) -> None:
        for source in self._sim_sources.values():
            source.close()


def load_simulation(
    scenario_path: str | Path, *, speed: float = 1.0, seed: int = 0, manual: bool = False
) -> Simulation:
    """Load a scenario and build its world, clock and per-camera sources (see module doc)."""
    scenario = load_scenario(scenario_path)
    return build_simulation(scenario, speed=speed, seed=seed, manual=manual)


def build_simulation(
    scenario: Scenario, *, speed: float = 1.0, seed: int = 0, manual: bool = False
) -> Simulation:
    """Like :func:`load_simulation` for an already validated :class:`Scenario`."""
    world = World(scenario, seed=seed)
    clock: ManualClock | AcceleratedClock = (
        ManualClock(world.start_ts) if manual else AcceleratedClock(world.start_ts, speed)
    )
    sim_sources = {cam: SimulatedSource(world, cam, clock) for cam in world.camera_ids}
    sources: dict[str, FrameSource] = dict(sim_sources)
    return Simulation(
        config=world.config,
        clock=clock,
        sources=sources,
        world=world,
        ground_truth=world.truth,
        scenario=scenario,
        _sim_sources=sim_sources,
    )
