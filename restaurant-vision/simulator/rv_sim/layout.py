"""Simulator floor layout: where people appear, walk, queue, sit and idle on each camera.

The site config (``rv_contracts``) only holds zones the analytics uses. The simulator also needs
places the analytics does not care about: the street door, walking aisles and the points where
people leave one camera for another. :class:`Layout` holds them; its defaults fit
``rv_contracts.fixtures.sample_site_config()``. :func:`compile_layout` checks a layout against a
site config and precomputes seat, queue, door, service and staff spots (:class:`SiteGeometry`).

Rules the compiled geometry guarantees (checked here, re-checked by tests on live runs):

* every spot (seat, queue slot, staff spot, service spot) lies inside its zone with ``margin``
  to every edge, so box jitter of up to ``margin / 3`` never moves an anchor out of the zone;
* aisles and walking routes never enter a zone they are not meant to (other tables, the queue,
  privacy masks);
* on the entrance camera, the route to the dining room crosses the entrance line exactly once,
  inward, and the routes to the street door never cross it inward.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field
from rv_contracts import (
    Anchor,
    Crossing,
    Line,
    SiteConfig,
    Zone,
    ZoneKind,
    line_crossing,
    point_in_polygon,
    segment_side,
)
from rv_contracts.fixtures import (
    CAM_DINING,
    CAM_ENTRANCE,
    ENTRANCE_LINE_ZONE_ID,
    QUEUE_ZONE_ID,
    STAFF_ZONE_ID,
    rect,
)

Pt = tuple[float, float]
Box = tuple[float, float, float, float]

_SAMPLE_STEP = 0.004
"""Spacing of sample points when checking routes against zones."""


class Posture(StrEnum):
    STANDING = "standing"
    SEATED = "seated"


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Body(_Model):
    """Person box sizes in normalized image units."""

    standing_height: float = Field(0.25, gt=0.05, le=0.6)
    seated_height: float = Field(0.18, gt=0.05, le=0.6)
    aspect: float = Field(0.4, gt=0.1, le=1.0)
    """Box width / box height."""
    height_sd: float = Field(0.04, ge=0.0, le=0.1)
    """Relative per-person height variation (clamped to +-3 sd)."""

    @property
    def max_factor(self) -> float:
        return 1.0 + 3.0 * self.height_sd

    def clamp_factor(self, factor: float) -> float:
        lo, hi = 1.0 - 3.0 * self.height_sd, self.max_factor
        return min(hi, max(lo, factor))

    def height(self, posture: Posture, factor: float = 1.0) -> float:
        base = self.seated_height if posture is Posture.SEATED else self.standing_height
        return base * factor

    def box(self, at: Pt, posture: Posture, factor: float, anchor: Anchor) -> Box:
        """Box whose ``anchor`` point is ``at`` (before clipping to the image)."""
        h = self.height(posture, factor)
        hw = h * self.aspect / 2.0
        x, y = at
        if anchor is Anchor.FOOT:
            return clip_box((x - hw, y - h, x + hw, y))
        return clip_box((x - hw, y - h / 2.0, x + hw, y + h / 2.0))

    def fits(self, at: Pt, posture: Posture, anchor: Anchor) -> bool:
        """True if clipping the largest box at ``at`` cannot move its anchor."""
        h = self.height(posture, self.max_factor)
        hw = h * self.aspect / 2.0
        x, y = at
        if x - hw < 0.0 or x + hw > 1.0:
            return False
        if anchor is Anchor.CENTER:
            return y - h / 2.0 >= 0.0 and y + h / 2.0 <= 1.0
        return 0.0 <= y <= 1.0


def clip_box(box: Box) -> Box:
    x1, y1, x2, y2 = (min(1.0, max(0.0, v)) for v in box)
    return (x1, y1, x2, y2)


# --------------------------------------------------------------------------------------
# Plane geometry helpers
# --------------------------------------------------------------------------------------


def dist(a: Pt, b: Pt) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def dist_point_segment(p: Pt, a: Pt, b: Pt) -> float:
    ax, ay = a
    dx, dy = b[0] - ax, b[1] - ay
    length2 = dx * dx + dy * dy
    if length2 == 0.0:
        return dist(p, a)
    u = max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / length2))
    return dist(p, (ax + u * dx, ay + u * dy))


def edge_distance(p: Pt, polygon: Sequence[Pt]) -> float:
    n = len(polygon)
    return min(dist_point_segment(p, polygon[i], polygon[(i + 1) % n]) for i in range(n))


def deep_inside(p: Pt, polygon: Sequence[Pt], margin: float) -> bool:
    """Inside ``polygon`` and at least ``margin`` from every edge."""
    return point_in_polygon(p, polygon) and edge_distance(p, polygon) >= margin - 1e-9


def cumulative_lengths(points: Sequence[Pt]) -> list[float]:
    cum = [0.0]
    for a, b in zip(points, points[1:], strict=False):
        cum.append(cum[-1] + dist(a, b))
    return cum


def point_along(points: Sequence[Pt], cum: Sequence[float], s: float) -> Pt:
    """Point at arc length ``s`` along a polyline (clamped to its ends)."""
    if s <= 0.0 or len(points) == 1:
        return points[0]
    if s >= cum[-1]:
        return points[-1]
    lo, hi = 0, len(cum) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if cum[mid] <= s:
            lo = mid
        else:
            hi = mid
    seg = cum[hi] - cum[lo]
    u = 0.0 if seg == 0.0 else (s - cum[lo]) / seg
    (ax, ay), (bx, by) = points[lo], points[hi]
    return (ax + u * (bx - ax), ay + u * (by - ay))


def project_on_polyline(points: Sequence[Pt], p: Pt) -> tuple[Pt, float]:
    """Closest point of a polyline to ``p`` and its arc-length position."""
    if len(points) == 1:
        return points[0], 0.0
    best: tuple[float, Pt, float] | None = None
    s0 = 0.0
    for a, b in zip(points, points[1:], strict=False):
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dy)
        u = 0.0
        if length > 0.0:
            u = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (length * length)))
        q = (a[0] + u * dx, a[1] + u * dy)
        d = dist(p, q)
        if best is None or d < best[0] - 1e-12:
            best = (d, q, s0 + u * length)
        s0 += length
    assert best is not None
    return best[1], best[2]


def polyline_between(points: Sequence[Pt], s_from: float, s_to: float) -> list[Pt]:
    """Vertices of a polyline strictly between two arc-length positions, in travel order."""
    cum = cumulative_lengths(points)
    if s_from <= s_to:
        return [p for p, s in zip(points, cum, strict=True) if s_from < s < s_to]
    return [p for p, s in reversed(list(zip(points, cum, strict=True))) if s_to < s < s_from]


def sample_path(points: Sequence[Pt], step: float = _SAMPLE_STEP) -> list[Pt]:
    """Points every ``step`` along a polyline, including both ends."""
    if len(points) == 1:
        return [points[0]]
    out: list[Pt] = [points[0]]
    for a, b in zip(points, points[1:], strict=False):
        n = max(1, math.ceil(dist(a, b) / step))
        out.extend((a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(1, n + 1))
    return out


def path_crossings(line: Line, points: Sequence[Pt]) -> list[Crossing]:
    """Line crossings of a walk along ``points`` (sampled), with ``line_crossing`` semantics."""
    out: list[Crossing] = []
    last_off: Pt | None = None
    for p in sample_path(points):
        if last_off is not None:
            crossing = line_crossing(line, last_off, p)
            if crossing is not None:
                out.append(crossing)
        if segment_side(line.a, line.b, p) != 0:
            last_off = p
    return out


def dedupe(points: Sequence[Pt]) -> list[Pt]:
    out: list[Pt] = []
    for p in points:
        if not out or dist(out[-1], p) > 1e-9:
            out.append(p)
    return out


# --------------------------------------------------------------------------------------
# Layout model (scenario YAML ``layout:``)
# --------------------------------------------------------------------------------------


class CameraLayout(_Model):
    """Walking structure of a camera that has tables or the staff area."""

    entry: Pt
    """Where people appear on (and vanish from) this camera when changing cameras."""
    aisle: list[Pt] = Field(min_length=1)
    """Polyline people walk along; it must not touch any zone."""


class EntranceLayout(_Model):
    """The entrance camera: street door, queue and the way into the dining room."""

    camera_id: str = CAM_ENTRANCE
    queue_zone_id: str = QUEUE_ZONE_ID
    line_zone_id: str = ENTRANCE_LINE_ZONE_ID
    door: list[Pt] = Field(default_factory=lambda: rect(0.06, 0.27, 0.30, 0.37), min_length=3)
    """Polygon where arriving parties stand while the host decides (outside the queue zone)."""
    door_exit: Pt = (0.12, 0.31)
    """Where walk-aways and departing guests vanish into the street."""
    lane_in: list[Pt] = Field(default_factory=lambda: [(0.36, 0.33), (0.86, 0.33)], min_length=1)
    """Route from the door to the dining room for parties seated straight away (no queue)."""
    queue_exit: list[Pt] = Field(
        default_factory=lambda: [(0.62, 0.42), (0.86, 0.37)], min_length=1
    )
    """Route from a queue slot to the dining room; must cross the entrance line inward."""
    lane_out: list[Pt] = Field(default_factory=lambda: [(0.86, 0.28), (0.36, 0.28)], min_length=1)
    """Route of departing guests from the dining side to the door (then ``door_exit``)."""
    queue_spacing: Pt = (0.065, 0.09)
    """Grid spacing of standing spots inside the queue zone."""


def _default_cameras() -> dict[str, CameraLayout]:
    return {
        CAM_DINING: CameraLayout(
            entry=(0.08, 0.47), aisle=[(0.08, 0.47), (0.93, 0.47), (0.93, 0.30)]
        )
    }


class Layout(_Model):
    """Simulator-only places; defaults fit ``sample_site_config()``."""

    entrance: EntranceLayout = Field(default_factory=EntranceLayout)
    cameras: dict[str, CameraLayout] = Field(default_factory=_default_cameras)
    """Per camera with tables or the staff area."""
    staff_zone_id: str = STAFF_ZONE_ID
    margin: float = Field(0.025, ge=0.005, le=0.1)
    """Minimum distance of every spot from its zone's edges."""
    departures_via_entrance: bool = True
    """Departing guests walk out through the entrance camera (crossing the line outward)."""


# --------------------------------------------------------------------------------------
# Compiled geometry
# --------------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class TableGeometry:
    table_id: str
    zone_id: str
    camera_id: str
    seats: int
    polygon: tuple[Pt, ...]
    seat_spots: tuple[Pt, ...]
    service_spot: Pt
    """Where staff stand during a visit or while bussing (inside the zone, aisle side)."""


@dataclass(frozen=True, slots=True)
class ZoneShape:
    zone_id: str
    kind: ZoneKind
    polygon: tuple[Pt, ...]


@dataclass(frozen=True)
class SiteGeometry:
    """Everything the world needs to place and route people (see module docstring)."""

    config: SiteConfig
    layout: Layout
    body: Body
    anchors: dict[str, Anchor]
    zones: dict[str, tuple[ZoneShape, ...]]
    """Polygon zones per camera."""
    entrance_camera: str
    queue_zone_id: str
    queue_polygon: tuple[Pt, ...]
    line: Line
    door_spots: tuple[Pt, ...]
    queue_slots: tuple[Pt, ...]
    """Standing spots in the queue zone, front of the queue first."""
    tables: dict[str, TableGeometry]
    table_by_zone: dict[str, str]
    """Primary table zone id -> table id."""
    staff_camera: str
    staff_zone_id: str
    staff_spots: tuple[Pt, ...]

    def zones_at(self, camera_id: str, p: Pt) -> frozenset[str]:
        """Ids of the polygon zones on ``camera_id`` containing ``p``."""
        return frozenset(
            z.zone_id for z in self.zones.get(camera_id, ()) if point_in_polygon(p, z.polygon)
        )

    def entry(self, camera_id: str) -> Pt:
        return self.layout.cameras[camera_id].entry

    def route(self, camera_id: str, a: Pt, b: Pt) -> list[Pt]:
        """Walking polyline from ``a`` to ``b`` on a camera with a :class:`CameraLayout`."""
        aisle = self.layout.cameras[camera_id].aisle
        pa, sa = project_on_polyline(aisle, a)
        pb, sb = project_on_polyline(aisle, b)
        return dedupe([a, pa, *polyline_between(aisle, sa, sb), pb, b])


def compile_layout(
    config: SiteConfig, layout: Layout, body: Body, *, staff_count: int, max_party: int
) -> SiteGeometry:
    """Validate ``layout`` against ``config`` and precompute spots. Raises ``ValueError``."""
    errors: list[str] = []
    anchors = {c.camera_id: c.anchor for c in config.cameras}
    zones_by_id = {z.zone_id: z for z in config.zones}
    zones: dict[str, tuple[ZoneShape, ...]] = {}
    for z in config.zones:
        if z.polygon is not None:
            shape = ZoneShape(z.zone_id, z.kind, tuple(z.polygon))
            zones[z.camera_id] = (*zones.get(z.camera_id, ()), shape)
    margin = layout.margin

    def fail() -> ValueError:
        return ValueError("invalid layout: " + "; ".join(errors))

    # --- entrance camera ---------------------------------------------------------------
    ent = layout.entrance
    queue_zone = _zone(zones_by_id, ent.queue_zone_id, ZoneKind.QUEUE, ent.camera_id, errors)
    line_zone = _zone(zones_by_id, ent.line_zone_id, ZoneKind.ENTRANCE_LINE, ent.camera_id, errors)
    if ent.camera_id not in anchors:
        errors.append(f"entrance camera {ent.camera_id!r} is not in the site config")
    if errors or queue_zone is None or line_zone is None:
        raise fail()
    assert queue_zone.polygon is not None and line_zone.line is not None
    queue_poly = tuple(queue_zone.polygon)
    line = line_zone.line
    ent_anchor = anchors[ent.camera_id]
    out_side = -line.in_side

    door_spots = _place(ent.door, max_party, margin, body, Posture.STANDING, ent_anchor)
    if len(door_spots) < max_party:
        errors.append(f"door polygon has room for {len(door_spots)} people, need {max_party}")
    for p in (*door_spots, ent.door_exit):
        if point_in_polygon(p, queue_poly):
            errors.append(f"door point {p} is inside the queue zone")
        if segment_side(line.a, line.b, p) != out_side:
            errors.append(f"door point {p} is not on the outer side of the entrance line")
    queue_slots = _lattice(queue_poly, ent.queue_spacing, margin, body, Posture.STANDING, ent_anchor)
    queue_slots.sort(key=lambda p: (round(dist(p, ent.queue_exit[0]), 6), p))
    if len(queue_slots) < max_party:
        errors.append(f"queue zone has room for {len(queue_slots)} people, need {max_party}")
    if errors:
        raise fail()

    ent_zone_ids = {z.zone_id for z in zones.get(ent.camera_id, ())}
    queue_only = frozenset({ent.queue_zone_id})
    for spot in door_spots[:1]:
        _check_route(
            "lane_in", line, [spot, *ent.lane_in], Crossing.IN, frozenset(), zones, ent.camera_id,
            errors,
        )
    _check_route(
        "lane_out", line, [*ent.lane_out, ent.door_exit], Crossing.OUT, frozenset(), zones,
        ent.camera_id, errors,
    )
    for slot in queue_slots:
        _check_route(
            "queue_exit", line, [slot, *ent.queue_exit], Crossing.IN, queue_only, zones,
            ent.camera_id, errors,
        )
        _check_route(
            "walk-away", line, [slot, ent.door_exit], None, queue_only, zones, ent.camera_id,
            errors,
        )
        for spot in door_spots:
            _check_route(
                "door-to-queue", line, [spot, slot], None, queue_only, zones, ent.camera_id,
                errors,
            )
        if errors:
            break
    for name, end in (("lane_in", ent.lane_in[-1]), ("queue_exit", ent.queue_exit[-1])):
        if segment_side(line.a, line.b, end) != line.in_side:
            errors.append(f"{name} must end on the inner side of the entrance line")
    del ent_zone_ids

    # --- tables ------------------------------------------------------------------------
    tables: dict[str, TableGeometry] = {}
    table_by_zone: dict[str, str] = {}
    for table in config.tables:
        zone = config.primary_zone(table.table_id)
        if zone is None or zone.polygon is None:
            errors.append(f"table {table.table_id!r} has no primary zone")
            continue
        cam = zone.camera_id
        if cam not in layout.cameras:
            errors.append(f"camera {cam!r} (table {table.table_id!r}) has no layout entry")
            continue
        poly = tuple(zone.polygon)
        seats = _place(poly, table.seats, margin, body, Posture.SEATED, anchors[cam])
        if len(seats) < table.seats:
            errors.append(
                f"table zone {zone.zone_id!r} has room for {len(seats)} seats, need {table.seats}"
            )
            continue
        aisle = layout.cameras[cam].aisle
        service = _closest_to(poly, aisle, margin, body, anchors[cam])
        if service is None:
            errors.append(f"table zone {zone.zone_id!r} has no room for a standing waiter")
            continue
        tables[table.table_id] = TableGeometry(
            table.table_id, zone.zone_id, cam, table.seats, poly, tuple(seats), service
        )
        table_by_zone[zone.zone_id] = table.table_id

    # --- staff area --------------------------------------------------------------------
    staff_zone = _zone(zones_by_id, layout.staff_zone_id, ZoneKind.STAFF_AREA, None, errors)
    staff_spots: list[Pt] = []
    staff_camera = ""
    if staff_zone is not None and staff_zone.polygon is not None:
        staff_camera = staff_zone.camera_id
        if staff_camera not in layout.cameras:
            errors.append(f"staff camera {staff_camera!r} has no layout entry")
        else:
            staff_spots = _place(
                staff_zone.polygon, staff_count, margin, body, Posture.STANDING,
                anchors[staff_camera],
            )
            if not staff_spots:
                errors.append(f"staff zone {staff_zone.zone_id!r} has no room for staff")
    if errors:
        raise fail()

    geometry = SiteGeometry(
        config=config,
        layout=layout,
        body=body,
        anchors=anchors,
        zones=zones,
        entrance_camera=ent.camera_id,
        queue_zone_id=ent.queue_zone_id,
        queue_polygon=queue_poly,
        line=line,
        door_spots=tuple(door_spots),
        queue_slots=tuple(queue_slots),
        tables=tables,
        table_by_zone=table_by_zone,
        staff_camera=staff_camera,
        staff_zone_id=layout.staff_zone_id,
        staff_spots=tuple(staff_spots),
    )

    # --- routes on table / staff cameras -----------------------------------------------
    for cam, cam_layout in layout.cameras.items():
        if cam not in anchors:
            errors.append(f"layout camera {cam!r} is not in the site config")
            continue
        _check_zones(f"{cam} aisle", cam_layout.aisle, frozenset(), zones, cam, errors)
        _check_zones(f"{cam} entry", [cam_layout.entry], frozenset(), zones, cam, errors)
    if errors:
        raise fail()
    for t in tables.values():
        own = frozenset({t.zone_id})
        for spot in (*t.seat_spots, t.service_spot):
            path = geometry.route(t.camera_id, geometry.entry(t.camera_id), spot)
            _check_zones(f"route to table {t.table_id}", path, own, zones, t.camera_id, errors)
        if staff_camera == t.camera_id and staff_spots:
            path = geometry.route(t.camera_id, staff_spots[0], t.service_spot)
            allowed = frozenset({t.zone_id, layout.staff_zone_id})
            _check_zones(f"staff route to {t.table_id}", path, allowed, zones, t.camera_id, errors)
    if errors:
        raise fail()
    return geometry


def _zone(
    zones: dict[str, Zone], zone_id: str, kind: ZoneKind, camera_id: str | None, errors: list[str]
) -> Zone | None:
    zone = zones.get(zone_id)
    if zone is None:
        errors.append(f"zone {zone_id!r} not found in the site config")
        return None
    if zone.kind is not kind:
        errors.append(f"zone {zone_id!r} is a {zone.kind.value} zone, expected {kind.value}")
        return None
    if camera_id is not None and zone.camera_id != camera_id:
        errors.append(f"zone {zone_id!r} is on camera {zone.camera_id!r}, expected {camera_id!r}")
        return None
    return zone


def _check_zones(
    name: str,
    path: Sequence[Pt],
    allowed: frozenset[str],
    zones: dict[str, tuple[ZoneShape, ...]],
    camera_id: str,
    errors: list[str],
) -> None:
    for p in sample_path(path):
        for z in zones.get(camera_id, ()):
            if z.zone_id not in allowed and point_in_polygon(p, z.polygon):
                errors.append(f"{name} passes through zone {z.zone_id!r} at {_fmt(p)}")
                return


def _check_route(
    name: str,
    line: Line,
    path: Sequence[Pt],
    expect: Crossing | None,
    allowed: frozenset[str],
    zones: dict[str, tuple[ZoneShape, ...]],
    camera_id: str,
    errors: list[str],
) -> None:
    _check_zones(name, path, allowed, zones, camera_id, errors)
    crossings = path_crossings(line, path)
    want = [] if expect is None else [expect]
    if crossings != want:
        got = [c.value for c in crossings] or "none"
        need = expect.value if expect is not None else "none"
        errors.append(f"{name} from {_fmt(path[0])} crosses the entrance line {got}, need {need}")


def _fmt(p: Pt) -> str:
    return f"({p[0]:.3f}, {p[1]:.3f})"


def _candidates(
    polygon: Sequence[Pt], margin: float, body: Body, posture: Posture, anchor: Anchor,
    step: float = 0.005,
) -> list[Pt]:
    xs = [p[0] for p in polygon]
    ys = [p[1] for p in polygon]
    out: list[Pt] = []
    nx = int((max(xs) - min(xs)) / step) + 1
    ny = int((max(ys) - min(ys)) / step) + 1
    for j in range(ny + 1):
        for i in range(nx + 1):
            p = (round(min(xs) + i * step, 6), round(min(ys) + j * step, 6))
            if deep_inside(p, polygon, margin) and body.fits(p, posture, anchor):
                out.append(p)
    return out


def _place(
    polygon: Sequence[Pt], n: int, margin: float, body: Body, posture: Posture, anchor: Anchor
) -> list[Pt]:
    """``n`` well spread spots inside ``polygon``: a 1- or 2-row grid over the shrunk bounding
    box when it fits, otherwise farthest-point sampling of valid candidates."""
    if n <= 0:
        return []
    xs = [p[0] for p in polygon]
    ys = [p[1] for p in polygon]
    x1, x2 = min(xs) + margin, max(xs) - margin
    y1, y2 = min(ys) + margin, max(ys) - margin
    rows = 1 if n <= 2 else 2
    cols = math.ceil(n / rows)
    grid = [
        (round(x1 + (i + 0.5) * (x2 - x1) / cols, 6), round(y1 + (j + 0.5) * (y2 - y1) / rows, 6))
        for j in range(rows)
        for i in range(cols)
    ][:n]
    if x2 > x1 and y2 > y1 and all(
        deep_inside(p, polygon, margin) and body.fits(p, posture, anchor) for p in grid
    ):
        return grid
    cands = _candidates(polygon, margin, body, posture, anchor)
    if not cands:
        return []
    cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
    chosen = [min(cands, key=lambda p: dist(p, (cx, cy)))]
    while len(chosen) < n:
        best = max(cands, key=lambda p: min(dist(p, c) for c in chosen))
        if min(dist(best, c) for c in chosen) < 1e-9:
            break
        chosen.append(best)
    return chosen


def _lattice(
    polygon: Sequence[Pt], spacing: Pt, margin: float, body: Body, posture: Posture,
    anchor: Anchor,
) -> list[Pt]:
    xs = [p[0] for p in polygon]
    ys = [p[1] for p in polygon]
    sx, sy = spacing
    out: list[Pt] = []
    y = min(ys) + margin
    while y <= max(ys) - margin + 1e-9:
        x = min(xs) + margin
        while x <= max(xs) - margin + 1e-9:
            p = (round(x, 6), round(y, 6))
            if deep_inside(p, polygon, margin) and body.fits(p, posture, anchor):
                out.append(p)
            x += sx
        y += sy
    return out


def _closest_to(
    polygon: Sequence[Pt], aisle: Sequence[Pt], margin: float, body: Body, anchor: Anchor
) -> Pt | None:
    cands = _candidates(polygon, margin, body, Posture.STANDING, anchor)
    if not cands:
        return None
    cx = sum(p[0] for p in polygon) / len(polygon)
    return min(
        cands,
        key=lambda p: (round(dist(p, project_on_polyline(aisle, p)[0]), 4), abs(p[0] - cx), p),
    )
