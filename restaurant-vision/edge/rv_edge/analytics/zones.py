"""Zone lookups per camera (architecture 6.2, ``ZoneIndex``).

Every track is reduced to one *anchor point* per frame: the bottom-centre of its box on
``Anchor.FOOT`` cameras (where a person stands) or the box centre on ``Anchor.CENTER`` cameras
(top-down ceiling cameras). Polygon zones are hit-tested with that point (boundary inclusive);
counting lines are crossed by the movement from a track's previous anchor to its current one.

Coordinates are normalized image coordinates (``[0, 1]``, y grows downwards), as in
:mod:`rv_contracts.geometry`. Only zones on *enabled* cameras are indexed. ``privacy`` zones are
not indexed: they are blacked out before detection, so nothing is ever detected inside them.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from rv_contracts import (
    Anchor,
    Box,
    CameraConfig,
    Crossing,
    Line,
    SiteConfig,
    Zone,
    ZoneKind,
    anchor_point,
    line_crossing,
    point_in_polygon,
    segment_side,
)

Point2 = tuple[float, float]
"""A normalized ``(x, y)`` image point."""

TrackKey = tuple[str, str]
"""``(camera_id, track_id)``. Track ids are camera-scoped, so the camera is part of the key."""


def distance_to_segment(p: Point2, a: Point2, b: Point2) -> float:
    """Euclidean distance (normalized units) from ``p`` to the finite segment ``a-b``."""
    ax, ay = a
    dx, dy = b[0] - ax, b[1] - ay
    length2 = dx * dx + dy * dy
    if length2 == 0.0:
        return math.hypot(p[0] - ax, p[1] - ay)
    u = ((p[0] - ax) * dx + (p[1] - ay) * dy) / length2
    u = min(1.0, max(0.0, u))
    return math.hypot(p[0] - (ax + u * dx), p[1] - (ay + u * dy))


def border_distance(p: Point2) -> float:
    """Distance from ``p`` to the nearest image border (0 on the border)."""
    return min(p[0], 1.0 - p[0], p[1], 1.0 - p[1])


@dataclass(frozen=True, slots=True)
class PolygonZone:
    """A polygon zone prepared for fast hit tests (bounding-box prefilter)."""

    zone_id: str
    kind: ZoneKind
    polygon: tuple[Point2, ...]
    bbox: tuple[float, float, float, float]
    """``(min_x, min_y, max_x, max_y)`` of the polygon."""
    table_id: str | None = None
    primary: bool = False

    @classmethod
    def from_zone(cls, zone: Zone) -> PolygonZone:
        """Build from a contract ``Zone`` that has a polygon."""
        if zone.polygon is None:
            raise ValueError(f"zone {zone.zone_id!r} has no polygon")
        points = tuple((float(x), float(y)) for x, y in zone.polygon)
        xs = [x for x, _ in points]
        ys = [y for _, y in points]
        return cls(
            zone_id=zone.zone_id,
            kind=zone.kind,
            polygon=points,
            bbox=(min(xs), min(ys), max(xs), max(ys)),
            table_id=zone.table_id,
            primary=zone.primary,
        )

    def contains(self, p: Point2) -> bool:
        """True if ``p`` is inside the polygon or on its boundary."""
        x, y = p
        x1, y1, x2, y2 = self.bbox
        if x < x1 or x > x2 or y < y1 or y > y2:
            return False
        return point_in_polygon(p, self.polygon)

    def boundary_distance(self, p: Point2) -> float:
        """Distance from ``p`` to the nearest polygon edge (normalized units)."""
        pts = self.polygon
        return min(
            distance_to_segment(p, pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts))
        )

    def centroid(self) -> Point2:
        """Mean of the vertices: a point inside convex zones (used by tests and tooling)."""
        n = len(self.polygon)
        return (sum(x for x, _ in self.polygon) / n, sum(y for _, y in self.polygon) / n)


@dataclass(frozen=True, slots=True)
class LineZone:
    """A directed counting line (``entrance_line`` zone)."""

    zone_id: str
    line: Line

    def side(self, p: Point2) -> int:
        """``+1`` / ``-1`` for the two sides of the line, ``0`` exactly on it."""
        return segment_side(self.line.a, self.line.b, p)

    def crossing(self, prev: Point2, curr: Point2) -> Crossing | None:
        """Direction of the movement ``prev -> curr`` across the segment, if it crosses."""
        return line_crossing(self.line, prev, curr)

    def distance(self, p: Point2) -> float:
        """Distance from ``p`` to the segment (normalized units)."""
        return distance_to_segment(p, self.line.a, self.line.b)


@dataclass(frozen=True, slots=True)
class ZoneHits:
    """Zones that contain one anchor point (zone ids in config order)."""

    tables: tuple[str, ...] = ()
    """Table zones, primary or not."""
    queues: tuple[str, ...] = ()
    areas: tuple[str, ...] = ()
    staff_area: bool = False
    """Inside at least one ``staff_area`` zone."""


NO_HITS = ZoneHits()


class CameraZones:
    """The zones of one camera, grouped by kind, plus the camera's anchor rule."""

    __slots__ = (
        "anchor",
        "areas",
        "camera_id",
        "lines",
        "queues",
        "staff_areas",
        "tables",
        "_polygons",
    )

    def __init__(self, camera: CameraConfig, zones: Sequence[Zone]) -> None:
        self.camera_id: str = camera.camera_id
        self.anchor: Anchor = camera.anchor
        polys = [PolygonZone.from_zone(z) for z in zones if z.polygon is not None]
        self.tables: tuple[PolygonZone, ...] = tuple(
            z for z in polys if z.kind is ZoneKind.TABLE
        )
        self.queues: tuple[PolygonZone, ...] = tuple(
            z for z in polys if z.kind is ZoneKind.QUEUE
        )
        self.areas: tuple[PolygonZone, ...] = tuple(z for z in polys if z.kind is ZoneKind.AREA)
        self.staff_areas: tuple[PolygonZone, ...] = tuple(
            z for z in polys if z.kind is ZoneKind.STAFF_AREA
        )
        self.lines: tuple[LineZone, ...] = tuple(
            LineZone(zone_id=z.zone_id, line=z.line)
            for z in zones
            if z.kind is ZoneKind.ENTRANCE_LINE and z.line is not None
        )
        self._polygons = self.tables + self.queues + self.areas + self.staff_areas

    @property
    def hosts_tables(self) -> bool:
        """True if any table zone (primary or not) is drawn on this camera."""
        return bool(self.tables)

    def anchor_of(self, box: Box) -> Point2:
        """The point of ``box`` tested against zones (see module docstring)."""
        return anchor_point(box, self.anchor)

    def hits(self, p: Point2) -> ZoneHits:
        """All polygon zones of this camera containing ``p``."""
        tables: list[str] = []
        queues: list[str] = []
        areas: list[str] = []
        staff = False
        for zone in self._polygons:
            if not zone.contains(p):
                continue
            kind = zone.kind
            if kind is ZoneKind.TABLE:
                tables.append(zone.zone_id)
            elif kind is ZoneKind.QUEUE:
                queues.append(zone.zone_id)
            elif kind is ZoneKind.AREA:
                areas.append(zone.zone_id)
            else:
                staff = True
        if not (tables or queues or areas or staff):
            return NO_HITS
        return ZoneHits(tuple(tables), tuple(queues), tuple(areas), staff)


class ZoneIndex:
    """Per-camera zone lookups for a whole site (enabled cameras only)."""

    def __init__(self, config: SiteConfig) -> None:
        self._cameras: dict[str, CameraZones] = {}
        self._polygons: dict[str, PolygonZone] = {}
        self._lines: dict[str, LineZone] = {}
        for camera in config.cameras:
            if not camera.enabled:
                continue
            zones = [
                z for z in config.zones_for(camera.camera_id) if z.kind is not ZoneKind.PRIVACY
            ]
            cam = CameraZones(camera, zones)
            self._cameras[camera.camera_id] = cam
            for poly in cam.tables + cam.queues + cam.areas + cam.staff_areas:
                self._polygons[poly.zone_id] = poly
            for line in cam.lines:
                self._lines[line.zone_id] = line

    @property
    def cameras(self) -> Mapping[str, CameraZones]:
        """Indexed (enabled) cameras by id."""
        return self._cameras

    def camera(self, camera_id: str) -> CameraZones | None:
        """Zones of ``camera_id``, or None if the camera is unknown or disabled."""
        return self._cameras.get(camera_id)

    def polygon(self, zone_id: str) -> PolygonZone | None:
        """An indexed polygon zone by id."""
        return self._polygons.get(zone_id)

    def line(self, zone_id: str) -> LineZone | None:
        """An indexed counting line by id."""
        return self._lines.get(zone_id)
