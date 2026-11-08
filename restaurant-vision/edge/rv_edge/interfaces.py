"""Internal edge interfaces shared by the vision, analytics and runtime packages.

These are the seams between ``rv_edge.vision``, ``rv_edge.analytics`` and ``rv_edge.runtime``.
Each package implements its side; the runtime wires them together. Change this file only
in coordination with all three packages (the integrator owns it).

Wire shapes (events, config, API payloads) live in ``rv_contracts``; this module only adds
edge-internal types that never leave the restaurant.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, Protocol, runtime_checkable

from rv_contracts import (
    AckVia,
    AlertView,
    AppearanceHints,
    CameraConfig,
    CameraStatus,
    Clock,
    EdgeEvent,
    Frame,
    OccupancyLive,
    Polygon,
    QueueLive,
    SiteConfig,
    TableLive,
    TrackFrame,
)

Box = tuple[float, float, float, float]
"""Normalized ``x1, y1, x2, y2`` in ``[0, 1]`` image coordinates."""


# --------------------------------------------------------------------------------------
# Synthetic frames (produced by ``rv_sim``, consumed by the simulated detector/hints)
# --------------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class SyntheticPerson:
    """One person in a synthetic frame. Ground truth for the simulated detector."""

    box: Box
    uniform_score: float | None = None
    """Similarity to the site's staff uniform color (0..1), as a real hint extractor would
    report it. ``None`` when the simulator does not model clothing."""


@dataclass(frozen=True, slots=True)
class SyntheticImage:
    """Value placed in ``Frame.image`` by simulated sources instead of a pixel array."""

    people: tuple[SyntheticPerson, ...]


# --------------------------------------------------------------------------------------
# Vision side
# --------------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class SourceSpec:
    """How to open one camera. Local only: never serialized to the cloud.

    ``url`` may contain RTSP credentials; it is read from the edge's local secrets file.
    """

    camera_id: str
    kind: Literal["rtsp", "file", "simulated"]
    url: str | None = None
    loop: bool = True
    options: dict[str, Any] = field(default_factory=dict)
    """Edge-local knobs read by the vision factory, e.g. ``track_id_ttl_h`` (set by the runtime
    from ``Thresholds.track_id_ttl_h``), ``simulated_detector``, ``realtime`` and ``source``
    (see ``rv_edge.vision.factory``)."""


@dataclass(frozen=True, slots=True)
class CameraHealthInfo:
    """Live health of one camera pipeline, reported in ``edge.heartbeat``."""

    camera_id: str
    status: CameraStatus
    fps: float
    last_frame_age_s: float | None


class HintExtractor(Protocol):
    """Computes scalar appearance hints for one detected person. Nothing is retained."""

    def hints_for(self, frame: Frame, box: Box) -> AppearanceHints: ...


@runtime_checkable
class CameraPipeline(Protocol):
    """Source -> privacy masks -> detector -> tracker -> hints, for one camera.

    Built by ``rv_edge.vision.factory.build_camera_pipeline``. The runtime calls ``step``
    in a loop on a dedicated thread.
    """

    @property
    def camera_id(self) -> str: ...

    def start(self) -> None: ...

    def stop(self) -> None: ...

    def step(self) -> TrackFrame | None:
        """Read and process one frame. ``None`` when no frame is available right now."""
        ...

    def health(self) -> CameraHealthInfo: ...

    def snapshot(self) -> tuple[Frame, Sequence[Box]] | None:
        """The latest frame processed by ``step`` (privacy masks applied, RAM only) and every
        person box detected in it, or None before the first frame. Used for the blurred setup
        snapshot, table suggestions and uniform calibration; must be safe to call from another
        thread while ``step`` runs. Simulated frames carry a ``SyntheticImage``, not pixels."""
        ...


class CameraPipelineFactory(Protocol):
    """Signature of ``rv_edge.vision.factory.build_camera_pipeline``."""

    def __call__(
        self,
        camera: CameraConfig,
        spec: SourceSpec,
        *,
        clock: Clock,
        privacy_masks: list[Polygon],
        detector_backend: Literal["auto", "yolox", "simulated"] = "auto",
        model_path: Path | None = None,
        uniform_hsv: tuple[float, float, float] | None = None,
    ) -> CameraPipeline: ...


# --------------------------------------------------------------------------------------
# Analytics side
# --------------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class LiveState:
    """Current analytics state, served by the local API and used to build ``LiveSnapshot``.

    The runtime adds ``site_id``, ``ts`` and device health to form a full ``LiveSnapshot``.
    """

    tables: list[TableLive]
    occupancy: OccupancyLive | None
    queues: list[QueueLive]
    open_alerts: list[AlertView]


class AnalyticsEngine(Protocol):
    """Facade over every analytics module plus the alert manager.

    Built by ``rv_edge.analytics.engine.build_analytics_engine(config, clock=...)``.
    Single-threaded: the runtime calls it from one analytics thread only.
    """

    def configure(self, config: SiteConfig) -> None:
        """Apply a new config (zones, thresholds, modules) without losing live state
        for tables that still exist."""
        ...

    def on_track_frame(self, tf: TrackFrame) -> list[EdgeEvent]: ...

    def on_tick(self, now: float) -> list[EdgeEvent]:
        """Advance timers (called about once per second)."""
        ...

    def apply_ack(self, alert_id: str, ack_at: float, via: AckVia) -> list[EdgeEvent]:
        """Acknowledge an open alert (from the cloud or the local LAN app). Idempotent."""
        ...

    def live(self) -> LiveState: ...
