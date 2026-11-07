"""Synthetic restaurant scenarios, ground truth and evaluation for Restaurant Vision.

Entry points:

* :func:`rv_sim.adapter.load_simulation`: what ``rv-edge simulate`` uses.
* :func:`rv_sim.scenario.load_scenario`, :class:`rv_sim.world.World`: the simulation itself.
* :func:`rv_sim.evaluate.evaluate` and the ``rv-sim`` CLI: score the edge analytics.
"""

from .adapter import Simulation, build_simulation, load_simulation
from .clock import AcceleratedClock, ManualClock, SimClock
from .ground_truth import GroundTruth
from .scenario import Scenario, load_scenario, parse_scenario
from .source import SimulatedSource
from .world import World

__all__ = [
    "AcceleratedClock",
    "GroundTruth",
    "ManualClock",
    "Scenario",
    "SimClock",
    "SimulatedSource",
    "Simulation",
    "World",
    "build_simulation",
    "load_scenario",
    "load_simulation",
    "parse_scenario",
]
