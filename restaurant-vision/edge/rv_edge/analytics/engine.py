"""The analytics engine: facade over the scene, table, queue and occupancy modules plus the
alert manager (implements :class:`rv_edge.interfaces.AnalyticsEngine`).

Single-threaded and deterministic. All time comes from ``TrackFrame.ts`` and the ``now``
passed to ``on_tick``; the injected clock is only a fallback timestamp for events produced by
``configure`` before any frame or tick was seen (which cannot happen in practice: alerts only
exist after time has advanced).

Per frame: frames of unknown or disabled cameras are ignored, and so are frames older than the
camera's previous frame (out of order). The scene computes anchors, zones, roles and crossings
once; then tables, queue and occupancy consume it, in that order.

Per tick: scene housekeeping (forget tracks unseen for 60 s), table alert timers, queue
departures housekeeping, ``long_queue`` and snapshots, then the occupancy snapshot.

``configure`` cannot return events (protocol), so events it causes (alerts resolved because
their table or zone disappeared, or the ``alerts`` / ``tables`` / ``queue`` module was switched
off) are returned first by the next ``on_track_frame`` or ``on_tick`` call. Their timestamp is
the latest time the engine had seen when ``configure`` ran.
"""

from __future__ import annotations

from typing import Any

from rv_contracts import (
    AckVia,
    AnalyticsModule,
    Clock,
    EdgeEvent,
    ResolveReason,
    SiteConfig,
    TrackFrame,
)

from ..interfaces import AnalyticsEngine, LiveState
from .alerts import AlertManager
from .occupancy import OccupancyModule
from .queue import QueueModule, QueueParams
from .roles import RoleBook
from .scene import SceneModule
from .tables import TableModule


class DefaultAnalyticsEngine:
    """Default :class:`~rv_edge.interfaces.AnalyticsEngine` (see module docstring)."""

    def __init__(
        self,
        config: SiteConfig,
        *,
        clock: Clock,
        roles: RoleBook | None = None,
        queue_params: QueueParams | None = None,
    ) -> None:
        self._clock = clock
        self._config = config
        self._alerts = AlertManager(config.site_id, enabled=config.modules.alerts)
        self._scene = SceneModule(config, roles=roles)
        self._tables = TableModule(self._scene, self._alerts, config)
        self._queue = QueueModule(self._scene, self._alerts, config, params=queue_params)
        self._occupancy = OccupancyModule(self._scene, self._tables, config)
        self._pending: list[EdgeEvent] = []
        self._last_frame_ts: dict[str, float] = {}
        self._last_t: float | None = None

    # --- accessors --------------------------------------------------------------------

    @property
    def config(self) -> SiteConfig:
        return self._config

    @property
    def alerts(self) -> AlertManager:
        return self._alerts

    @property
    def scene(self) -> SceneModule:
        return self._scene

    @property
    def tables(self) -> TableModule:
        return self._tables

    @property
    def queue(self) -> QueueModule:
        return self._queue

    @property
    def occupancy(self) -> OccupancyModule:
        return self._occupancy

    @property
    def modules(self) -> tuple[AnalyticsModule, ...]:
        """The analytics modules in processing order."""
        return (self._scene, self._tables, self._queue, self._occupancy)

    # --- AnalyticsEngine --------------------------------------------------------------

    def configure(self, config: SiteConfig) -> None:
        """Apply a new config without losing live state of tables and zones that still exist
        (see the modules' ``configure``)."""
        ts = self._last_t if self._last_t is not None else self._clock.now()
        was_enabled = self._alerts.enabled
        self._config = config
        self._alerts.configure(config.site_id, enabled=config.modules.alerts)
        if was_enabled and not config.modules.alerts:
            self._pending += self._alerts.resolve_all(ts, ResolveReason.STATE_CHANGE)
        for module in self.modules:
            module.configure(config)
        self._pending += self._tables.take_pending() + self._queue.take_pending()
        cameras = {c.camera_id for c in config.cameras if c.enabled}
        self._last_frame_ts = {c: t for c, t in self._last_frame_ts.items() if c in cameras}

    def _take_pending(self) -> list[EdgeEvent]:
        out, self._pending = self._pending, []
        return out

    def _advance(self, t: float) -> None:
        self._last_t = t if self._last_t is None else max(self._last_t, t)

    def on_track_frame(self, tf: TrackFrame) -> list[EdgeEvent]:
        out = self._take_pending()
        last = self._last_frame_ts.get(tf.camera_id)
        if last is not None and tf.ts < last:
            return out
        if self._scene.observe(tf) is None:
            return out
        self._last_frame_ts[tf.camera_id] = tf.ts
        self._advance(tf.ts)
        out += self._tables.on_track_frame(tf)
        out += self._queue.on_track_frame(tf)
        out += self._occupancy.on_track_frame(tf)
        return out

    def on_tick(self, now: float) -> list[EdgeEvent]:
        out = self._take_pending()
        self._advance(now)
        for module in self.modules:
            out += module.on_tick(now)
        return out

    def apply_ack(self, alert_id: str, ack_at: float, via: AckVia) -> list[EdgeEvent]:
        """Acknowledge an open alert; idempotent (see :class:`AlertManager`)."""
        return self._take_pending() + self._alerts.apply_ack(alert_id, ack_at, via)

    def live(self) -> LiveState:
        labels = {t.table_id: t.label for t in self._config.tables}
        return LiveState(
            tables=self._tables.live(),
            occupancy=self._occupancy.live(),
            queues=self._queue.live(),
            open_alerts=self._alerts.views(labels),
        )

    def debug_snapshot(self) -> dict[str, Any]:
        """JSON-safe state of every module and the alert manager (for ``/local/state``
        debugging)."""
        out: dict[str, Any] = {m.name: m.snapshot() for m in self.modules}
        out["alerts"] = self._alerts.snapshot()
        return out


def build_analytics_engine(config: SiteConfig, *, clock: Clock) -> AnalyticsEngine:
    """Build the analytics engine for ``config`` (entry point used by the runtime)."""
    return DefaultAnalyticsEngine(config, clock=clock)
