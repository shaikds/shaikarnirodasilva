"""Edge analytics (architecture 6.2): tracked people per camera -> table states, waiter alerts,
queue and walk-away metrics, and occupancy. Pure, single-threaded, deterministic logic.

Entry point: :func:`build_analytics_engine` (``rv_edge.analytics.engine``).
"""

from .alerts import AlertManager, AlertRecord
from .engine import DefaultAnalyticsEngine, build_analytics_engine
from .occupancy import OccupancyModule
from .queue import QueueModule, QueueParams
from .roles import (
    MovementPattern,
    Role,
    RoleBook,
    RoleClassifier,
    Sighting,
    StaffZoneOrigin,
    UniformColor,
    Vote,
)
from .scene import FrameObservation, SceneModule, TrackObservation
from .tables import TableModule, TableStateMachine
from .zones import ZoneIndex

__all__ = [
    "AlertManager",
    "AlertRecord",
    "DefaultAnalyticsEngine",
    "FrameObservation",
    "MovementPattern",
    "OccupancyModule",
    "QueueModule",
    "QueueParams",
    "Role",
    "RoleBook",
    "RoleClassifier",
    "SceneModule",
    "Sighting",
    "StaffZoneOrigin",
    "TableModule",
    "TableStateMachine",
    "TrackObservation",
    "UniformColor",
    "Vote",
    "ZoneIndex",
    "build_analytics_engine",
]
