"""Site-wide occupancy (architecture 6.2 ``OccupancyModule``).

* ``guests`` = sum of the smoothed guest counts of all tracked tables (primary zones only, so
  overlapping cameras do not double count tables) + smoothed guest counts of ``area`` zones
  (bar, standing area). A track inside a primary table zone of the same camera is counted by
  the table, not by an overlapping area. Area zones on *different* cameras that see the same
  floor would double count; draw areas on one camera only.
* ``staff_on_floor`` = sum over cameras that host at least one table zone (primary or not) of
  the smoothed number of staff tracks on that camera. A staff member seen by two such cameras
  at the same time is counted twice: track ids are camera-scoped and the system deliberately
  never matches people across cameras. Treat it as an upper bound.
* ``tables_occupied`` = tables in ``seated``/``attended`` (with table states off: tables with a
  smoothed guest count >= 1); ``tables_total`` = tracked tables (with a primary zone on an
  enabled camera).

Counts use the same hold + rolling median smoothing as tables (``count_window_s``).
``occupancy.snapshot`` is emitted every ``snapshot_interval_s`` from ``on_tick``.
"""

from __future__ import annotations

from typing import Any

from rv_contracts import (
    EdgeEvent,
    OccupancyLive,
    OccupancySnapshot,
    SiteConfig,
    TrackFrame,
    ZoneKind,
    make_event,
)

from .roles import Role
from .scene import SceneModule
from .smoothing import SmoothedCount
from .tables import TableModule
from .timers import IntervalTimer
from .zones import TrackKey


class OccupancyModule:
    """``AnalyticsModule`` for occupancy (name ``occupancy``); see module docstring."""

    def __init__(self, scene: SceneModule, tables: TableModule, config: SiteConfig) -> None:
        self._scene = scene
        self._tables = tables
        self._config = config
        self._enabled = False
        self._areas: dict[str, tuple[str, SmoothedCount]] = {}
        """area zone id -> (camera id, guest counter)."""
        self._staff: dict[str, SmoothedCount] = {}
        """floor camera id -> staff counter."""
        self._primary_zones: dict[str, frozenset[str]] = {}
        self._timer = IntervalTimer(config.thresholds.snapshot_interval_s)
        self._latest: OccupancyLive | None = None
        self.configure(config)

    @property
    def name(self) -> str:
        return "occupancy"

    @property
    def enabled(self) -> bool:
        return self._enabled

    def configure(self, config: SiteConfig) -> None:
        """Keep counters of area zones and floor cameras that still exist; drop the rest."""
        self._config = config
        self._enabled = config.modules.occupancy
        window = config.thresholds.count_window_s
        self._timer.interval_s = config.thresholds.snapshot_interval_s
        enabled_cams = {c.camera_id for c in config.cameras if c.enabled}
        areas: dict[str, tuple[str, SmoothedCount]] = {}
        staff: dict[str, SmoothedCount] = {}
        primary: dict[str, set[str]] = {}
        for zone in config.zones:
            if zone.camera_id not in enabled_cams:
                continue
            if zone.kind is ZoneKind.AREA:
                old = self._areas.get(zone.zone_id)
                counter = (
                    old[1] if old is not None and old[0] == zone.camera_id
                    else SmoothedCount(window)
                )
                counter.window_s = window
                areas[zone.zone_id] = (zone.camera_id, counter)
            elif zone.kind is ZoneKind.TABLE:
                counter = (
                    staff.get(zone.camera_id)
                    or self._staff.get(zone.camera_id)
                    or SmoothedCount(window)
                )
                counter.window_s = window
                staff[zone.camera_id] = counter
                if zone.primary:
                    primary.setdefault(zone.camera_id, set()).add(zone.zone_id)
        self._areas = areas
        self._staff = staff
        self._primary_zones = {cam: frozenset(ids) for cam, ids in primary.items()}
        if not self._enabled:
            self._latest = None
            self._timer.reset()

    def on_track_frame(self, tf: TrackFrame) -> list[EdgeEvent]:
        if not self._enabled:
            return []
        cam_areas = [(zid, c) for zid, (cam, c) in self._areas.items() if cam == tf.camera_id]
        staff_counter = self._staff.get(tf.camera_id)
        if not cam_areas and staff_counter is None:
            return []
        fo = self._scene.observe(tf)
        if fo is None:
            return []
        primary = self._primary_zones.get(tf.camera_id, frozenset())
        in_area: dict[str, list[TrackKey]] = {}
        staff: list[TrackKey] = []
        for obs in fo.tracks:
            if obs.role is Role.STAFF:
                staff.append(obs.key)
            elif obs.hits.areas and not primary.intersection(obs.hits.tables):
                for zone_id in obs.hits.areas:
                    in_area.setdefault(zone_id, []).append(obs.key)
        for zone_id, counter in cam_areas:
            counter.update(fo.ts, in_area.get(zone_id, ()), drop=staff)
        if staff_counter is not None:
            staff_counter.update(fo.ts, staff)
        return []

    def current(self, ts: float) -> OccupancyLive:
        """Occupancy from the latest smoothed counts, stamped ``ts``."""
        guests = sum(self._tables.guest_counts().values())
        guests += sum(counter.value for _, counter in self._areas.values())
        return OccupancyLive(
            ts=ts,
            guests=guests,
            tables_occupied=self._tables.occupied_count(),
            tables_total=len(self._tables.table_ids()),
            staff_on_floor=sum(counter.value for counter in self._staff.values()),
        )

    def on_tick(self, now: float) -> list[EdgeEvent]:
        if not self._enabled or not self._timer.due(now):
            return []
        live = self.current(now)
        self._latest = live
        return [
            make_event(
                OccupancySnapshot,
                self._config.site_id,
                now,
                guests=live.guests,
                tables_occupied=live.tables_occupied,
                tables_total=live.tables_total,
                staff_on_floor=live.staff_on_floor,
            )
        ]

    def live(self) -> OccupancyLive | None:
        """Latest ``occupancy.snapshot`` (None before the first one or while disabled)."""
        return self._latest

    def snapshot(self) -> dict[str, Any]:
        latest = self._latest
        return {
            "enabled": self._enabled,
            "latest": None if latest is None else latest.model_dump(mode="json"),
            "areas": {zid: counter.value for zid, (_, counter) in self._areas.items()},
            "staff_by_camera": {cam: counter.value for cam, counter in self._staff.items()},
        }
