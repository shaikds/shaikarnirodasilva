"""Automatic table suggestions for the setup wizard.

The installer used to draw every table polygon by hand. Here YOLOX (COCO classes ``dining
table`` 60, ``chair`` 56 and ``couch`` 57) runs once on the current camera frame and each
table, with the seats around it, becomes a suggested polygon the installer only confirms or
fixes. Works best on an empty room (seated people hide chairs and table edges).

Algorithm (:func:`suggest_tables`, pure and deterministic; boxes are normalized, geometry runs
in pixels so padding is the same horizontally and vertically):

1. Keep tables and seating (chairs, optionally couches) with ``score >= min_confidence``.
2. Merge table boxes that overlap heavily (IoU above ``merge_iou``, or one mostly inside the
   other) into their union, keeping the best score; repeated until nothing merges.
3. Assign each seat to the nearest table whose box, grown by ``assign_expand`` of its size on
   every side, contains the seat's centre. Unassigned seats are ignored, except that clusters
   of 2+ nearby unassigned chairs become low-confidence suggestions (``chair_clusters``).
4. Polygon: convex hull of the table box corners and the assigned seat box corners (a table
   with no detected seat is grown by ``no_seat_margin`` of its longer side so people seated
   around it still fall inside), padded by ``pad_frac`` of the shorter image side, clipped
   to the image and reduced to at most ``max_points`` vertices without uncovering any box
   corner.
5. ``seats_est``: assigned chairs (a couch counts ``seats_per_couch``); with none, 2, 4 or 6
   from the table box's aspect ratio and size.
6. ``confidence``: table score plus a small bonus per assigned seat (minus a small penalty
   with none), clipped to 0..1. Results below ``min_confidence`` are dropped.
7. Suggestions mostly (``mask_overlap_max``) inside a privacy mask are dropped.
8. Reading order (rows top to bottom, each row left to right) with ids ``s1..sn``.

Privacy: the frame is only read in RAM by :func:`suggest_tables_in_frame`; only polygons,
boxes and counts come out.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol, runtime_checkable

import cv2
import numpy as np
from rv_contracts import Detection, Frame

from ..interfaces import Box
from .detectors.factory import build_detector
from .detectors.yolox_onnx import YoloxOnnxDetector
from .factory import inference_threads

COCO_CHAIR = 56
COCO_COUCH = 57
COCO_DINING_TABLE = 60

DEFAULT_MIN_CONFIDENCE = 0.25
MIN_SCORE_FLOOR = 0.05
"""Lowest detector threshold used, whatever ``min_confidence`` asks (keeps NMS small)."""
MASK_GRID = 200
"""Raster resolution used to measure overlap with privacy masks."""

Point = tuple[float, float]


@dataclass(frozen=True, slots=True)
class SuggestParams:
    """Tuning knobs of :func:`suggest_tables` (fractions unless stated otherwise)."""

    merge_iou: float = 0.3
    """Tables with a larger IoU are one table."""
    merge_containment: float = 0.85
    """Tables whose intersection covers this much of the smaller box are one table."""
    assign_expand: float = 0.6
    """A seat belongs to a table when its centre is inside the table box grown by this
    fraction of the table's width/height on every side."""
    no_seat_margin: float = 0.5
    """A table with no detected seat is grown on every side by this fraction of its longer
    side (in pixels) before padding, so guests seated around it are covered."""
    pad_frac: float = 0.03
    """Polygon padding, as a fraction of the shorter image side."""
    max_points: int = 12
    include_couches: bool = True
    seats_per_couch: int = 2
    chair_clusters: bool = True
    """Turn clusters of 2+ chairs without a table into low-confidence suggestions."""
    cluster_link: float = 1.5
    """Two chairs are neighbours when their centres are closer than this many times the
    larger side of the bigger chair."""
    cluster_confidence_factor: float = 0.6
    """Confidence of a chair cluster: this times the mean chair score."""
    seat_bonus: float = 0.04
    """Confidence added per assigned seat (up to ``max_bonus_seats``)."""
    max_bonus_seats: int = 4
    no_seat_penalty: float = 0.05
    long_table_ratio: float = 1.8
    """Long side / short side (pixels) from which a table without chairs seats 6."""
    small_table_area: float = 0.008
    """Fraction of the image below which a table without chairs seats 2."""
    mask_overlap_max: float = 0.5
    """Drop a suggestion when more than this fraction of it lies in privacy masks."""


DEFAULT_PARAMS = SuggestParams()


@dataclass(frozen=True, slots=True)
class TableSuggestion:
    """One suggested table zone. Coordinates are normalized to ``[0, 1]``."""

    suggestion_id: str
    polygon: tuple[Point, ...]
    """3..``max_points`` vertices, non-zero area, covering the table and its seats."""
    table_box: Box
    """The (merged) table box; for a chair cluster, the box around its chairs."""
    seats_est: int
    confidence: float


@runtime_checkable
class MultiClassDetector(Protocol):
    """A detector that returns normalized boxes per COCO class (``YoloxOnnxDetector``)."""

    def detect_classes(
        self, frame: Frame, classes: Iterable[int], *, score_thr: float | None = None
    ) -> Mapping[int, Sequence[Detection]]: ...


# ----------------------------------------------------------------------------- box helpers
@dataclass(frozen=True, slots=True)
class _PxBox:
    """A box in pixels with its detector score (and, for seating, how many seats it is)."""

    x1: float
    y1: float
    x2: float
    y2: float
    score: float
    seats: int = 1

    @property
    def w(self) -> float:
        return self.x2 - self.x1

    @property
    def h(self) -> float:
        return self.y2 - self.y1

    @property
    def area(self) -> float:
        return self.w * self.h

    @property
    def center(self) -> Point:
        return ((self.x1 + self.x2) / 2.0, (self.y1 + self.y2) / 2.0)

    def corners(self) -> list[Point]:
        return [(self.x1, self.y1), (self.x2, self.y1), (self.x2, self.y2), (self.x1, self.y2)]

    def grown(self, frac: float) -> _PxBox:
        dx, dy = frac * self.w, frac * self.h
        return _PxBox(
            self.x1 - dx, self.y1 - dy, self.x2 + dx, self.y2 + dy, self.score, self.seats
        )

    def grown_by(self, margin: float) -> _PxBox:
        return _PxBox(
            self.x1 - margin,
            self.y1 - margin,
            self.x2 + margin,
            self.y2 + margin,
            self.score,
            self.seats,
        )

    def contains(self, p: Point) -> bool:
        return self.x1 <= p[0] <= self.x2 and self.y1 <= p[1] <= self.y2

    def distance(self, p: Point) -> float:
        dx = max(self.x1 - p[0], 0.0, p[0] - self.x2)
        dy = max(self.y1 - p[1], 0.0, p[1] - self.y2)
        return math.hypot(dx, dy)


def _to_px(det: Detection, width: int, height: int, seats: int = 1) -> _PxBox | None:
    x1, y1, x2, y2 = (float(v) for v in det.box)
    x1, x2 = sorted((min(1.0, max(0.0, x1)), min(1.0, max(0.0, x2))))
    y1, y2 = sorted((min(1.0, max(0.0, y1)), min(1.0, max(0.0, y2))))
    box = _PxBox(x1 * width, y1 * height, x2 * width, y2 * height, float(det.score), seats)
    return box if box.w > 0 and box.h > 0 else None


def _intersection(a: _PxBox, b: _PxBox) -> float:
    w = min(a.x2, b.x2) - max(a.x1, b.x1)
    h = min(a.y2, b.y2) - max(a.y1, b.y1)
    return w * h if w > 0 and h > 0 else 0.0


def _same_table(a: _PxBox, b: _PxBox, params: SuggestParams) -> bool:
    inter = _intersection(a, b)
    if inter <= 0.0:
        return False
    iou = inter / (a.area + b.area - inter)
    return iou > params.merge_iou or inter >= params.merge_containment * min(a.area, b.area)


def merge_tables(tables: Sequence[_PxBox], params: SuggestParams = DEFAULT_PARAMS) -> list[_PxBox]:
    """Union of heavily overlapping table boxes (best score kept), until nothing merges."""
    boxes = sorted(tables, key=lambda b: (-b.score, b.x1, b.y1, b.x2, b.y2))
    merged = True
    while merged:
        merged = False
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                a, b = boxes[i], boxes[j]
                if _same_table(a, b, params):
                    boxes[i] = _PxBox(
                        min(a.x1, b.x1),
                        min(a.y1, b.y1),
                        max(a.x2, b.x2),
                        max(a.y2, b.y2),
                        max(a.score, b.score),
                    )
                    del boxes[j]
                    merged = True
                    break
            if merged:
                break
    return boxes


def assign_seats(
    tables: Sequence[_PxBox], seats: Sequence[_PxBox], params: SuggestParams = DEFAULT_PARAMS
) -> tuple[list[list[_PxBox]], list[_PxBox]]:
    """Seats per table (same order as ``tables``) and the seats no table claimed.

    A seat goes to the table nearest to its centre (distance to the box, then to the box
    centre) among the tables whose grown box contains that centre.
    """
    grown = [t.grown(params.assign_expand) for t in tables]
    assigned: list[list[_PxBox]] = [[] for _ in tables]
    unassigned: list[_PxBox] = []
    for seat in seats:
        c = seat.center
        candidates = [
            (t.distance(c), math.dist(t.center, c), i)
            for i, t in enumerate(tables)
            if grown[i].contains(c)
        ]
        if candidates:
            assigned[min(candidates)[2]].append(seat)
        else:
            unassigned.append(seat)
    return assigned, unassigned


def chair_clusters(
    chairs: Sequence[_PxBox], params: SuggestParams = DEFAULT_PARAMS
) -> list[list[_PxBox]]:
    """Connected groups of 2+ neighbouring chairs (single linkage), in input order."""
    n = len(chairs)
    parent = list(range(n))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(n):
        for j in range(i + 1, n):
            a, b = chairs[i], chairs[j]
            link = params.cluster_link * max(a.w, a.h, b.w, b.h)
            if math.dist(a.center, b.center) <= link:
                parent[find(j)] = find(i)
    groups: dict[int, list[_PxBox]] = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(chairs[i])
    return [g for g in groups.values() if len(g) >= 2]


def estimate_seats(
    table: _PxBox,
    seats: Sequence[_PxBox],
    image_size: tuple[int, int],
    params: SuggestParams = DEFAULT_PARAMS,
) -> int:
    """Assigned seats when there are any, else 6 for a long table, 2 for a small one, else 4."""
    counted = sum(s.seats for s in seats)
    if counted >= 1:
        return counted
    long_side, short_side = max(table.w, table.h), min(table.w, table.h)
    if short_side > 0 and long_side / short_side >= params.long_table_ratio:
        return 6
    width, height = image_size
    if table.area / float(width * height) < params.small_table_area:
        return 2
    return 4


def _confidence(table: _PxBox, seats: Sequence[_PxBox], params: SuggestParams) -> float:
    n = sum(s.seats for s in seats)
    if n == 0:
        conf = table.score - params.no_seat_penalty
    else:
        conf = table.score + params.seat_bonus * min(n, params.max_bonus_seats)
    return round(min(1.0, max(0.0, conf)), 3)


# ----------------------------------------------------------------------------- polygon helpers
def _cross(o: Point, a: Point, b: Point) -> float:
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


def convex_hull(points: Iterable[Point]) -> list[Point]:
    """Andrew's monotone chain; counter-clockwise (in x-right, y-up terms), no collinear
    points, starting at the smallest ``(x, y)``."""
    pts = sorted(set(points))
    if len(pts) <= 2:
        return pts
    lower: list[Point] = []
    for p in pts:
        while len(lower) >= 2 and _cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper: list[Point] = []
    for p in reversed(pts):
        while len(upper) >= 2 and _cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def _pad(hull: Sequence[Point], pad: float) -> list[Point]:
    """Grow a convex polygon by at least ``pad`` (Minkowski sum with a circumscribed
    octagon)."""
    if pad <= 0:
        return list(hull)
    r = pad / math.cos(math.pi / 8)
    offsets = [
        (r * math.cos(k * math.pi / 4 + math.pi / 8), r * math.sin(k * math.pi / 4 + math.pi / 8))
        for k in range(8)
    ]
    return convex_hull((x + dx, y + dy) for x, y in hull for dx, dy in offsets)


def _clip_half_plane(
    polygon: Sequence[Point], axis: int, bound: float, keep_above: bool
) -> list[Point]:
    """One Sutherland-Hodgman pass: keep the part with ``p[axis] >= bound`` (or ``<=``)."""

    def inside(p: Point) -> bool:
        return p[axis] >= bound if keep_above else p[axis] <= bound

    def cut(p: Point, q: Point) -> Point:
        t = (bound - p[axis]) / (q[axis] - p[axis])
        if axis == 0:
            return (bound, p[1] + t * (q[1] - p[1]))
        return (p[0] + t * (q[0] - p[0]), bound)

    out: list[Point] = []
    for i, cur in enumerate(polygon):
        prev = polygon[i - 1]
        if inside(cur):
            if not inside(prev):
                out.append(cut(prev, cur))
            out.append(cur)
        elif inside(prev):
            out.append(cut(prev, cur))
    return out


def clip_to_unit(polygon: Sequence[Point]) -> list[Point]:
    """Sutherland-Hodgman clip of a polygon to the ``[0, 1]`` square."""
    out = list(polygon)
    for axis, bound, keep_above in (
        (0, 0.0, True),
        (0, 1.0, False),
        (1, 0.0, True),
        (1, 1.0, False),
    ):
        out = _clip_half_plane(out, axis, bound, keep_above)
    return [(min(1.0, max(0.0, x)), min(1.0, max(0.0, y))) for x, y in out]


def _area2(polygon: Sequence[Point]) -> float:
    """Twice the signed area (positive for counter-clockwise in x-right, y-up terms)."""
    return sum(
        polygon[i - 1][0] * polygon[i][1] - polygon[i][0] * polygon[i - 1][1]
        for i in range(len(polygon))
    )


def _drop_collinear(polygon: list[Point], eps: float = 1e-12) -> list[Point]:
    changed = True
    while changed and len(polygon) > 3:
        changed = False
        for i in range(len(polygon)):
            prev, cur, nxt = polygon[i - 1], polygon[i], polygon[(i + 1) % len(polygon)]
            if abs(_cross(prev, cur, nxt)) <= eps or cur == prev:
                del polygon[i]
                changed = True
                break
    return polygon


def simplify(
    polygon: Sequence[Point], max_points: int, keep_inside: Sequence[Point] = ()
) -> list[Point]:
    """Reduce a convex polygon to ``max_points`` vertices (Visvalingam: drop the vertex whose
    triangle is smallest), never dropping one that would uncover a ``keep_inside`` point
    unless no other vertex can go."""
    poly = _drop_collinear(list(polygon))
    orientation = 1.0 if _area2(poly) >= 0 else -1.0
    while len(poly) > max(3, max_points):
        n = len(poly)
        order = sorted(
            range(n), key=lambda i: (abs(_cross(poly[i - 1], poly[i], poly[(i + 1) % n])), i)
        )
        chosen = order[0]
        for i in order:
            u, w = poly[i - 1], poly[(i + 1) % n]
            if all(orientation * _cross(u, w, p) >= -1e-12 for p in keep_inside):
                chosen = i
                break
        del poly[chosen]
    return poly


def _polygon(
    core: Sequence[Point], image_size: tuple[int, int], params: SuggestParams
) -> tuple[Point, ...] | None:
    """Padded, clipped, simplified hull of ``core`` (pixel points), normalized."""
    width, height = image_size
    padded = _pad(convex_hull(core), params.pad_frac * min(width, height))
    normalized = [(x / width, y / height) for x, y in padded]
    clipped = clip_to_unit(normalized)
    keep = [(min(1.0, max(0.0, x / width)), min(1.0, max(0.0, y / height))) for x, y in core]
    simple = simplify(clipped, params.max_points, keep)
    rounded: list[Point] = []
    for x, y in simple:
        p = (round(x, 4), round(y, 4))
        if not rounded or p != rounded[-1]:
            rounded.append(p)
    if len(rounded) > 1 and rounded[0] == rounded[-1]:
        rounded.pop()
    rounded = _drop_collinear(rounded)
    if len(rounded) < 3 or abs(_area2(rounded)) / 2.0 <= 1e-6:
        return None
    return tuple(rounded)


def mask_overlap(
    polygon: Sequence[Point], masks: Sequence[Sequence[Point]], grid: int = MASK_GRID
) -> float:
    """Fraction of ``polygon`` (normalized) covered by the union of ``masks``, on a raster."""
    valid = [m for m in masks if len(m) >= 3]
    if not valid:
        return 0.0

    def raster(polys: Sequence[Sequence[Point]]) -> np.ndarray:
        canvas = np.zeros((grid, grid), dtype=np.uint8)
        pts = [
            np.array([[round(x * grid), round(y * grid)] for x, y in p], dtype=np.int32)
            for p in polys
        ]
        cv2.fillPoly(canvas, pts, 1)
        return canvas

    own = raster([polygon])
    total = int(own.sum())
    if total == 0:
        return 0.0
    covered = int(np.logical_and(own, raster(valid)).sum())
    return covered / total


def _box_norm(box: _PxBox, image_size: tuple[int, int]) -> Box:
    width, height = image_size
    return (
        round(min(1.0, max(0.0, box.x1 / width)), 4),
        round(min(1.0, max(0.0, box.y1 / height)), 4),
        round(min(1.0, max(0.0, box.x2 / width)), 4),
        round(min(1.0, max(0.0, box.y2 / height)), 4),
    )


def reading_order(boxes: Sequence[Box]) -> list[int]:
    """Indices of ``boxes`` in reading order: rows top to bottom, each row left to right.

    The topmost remaining box (by centre) starts a row; every remaining box whose centre lies
    within that box's vertical extent joins it.
    """
    remaining = sorted(range(len(boxes)), key=lambda i: (_cy(boxes[i]), _cx(boxes[i]), i))
    order: list[int] = []
    while remaining:
        head = boxes[remaining[0]]
        row = [i for i in remaining if head[1] <= _cy(boxes[i]) <= head[3]]
        row.sort(key=lambda i: (_cx(boxes[i]), _cy(boxes[i]), i))
        order.extend(row)
        remaining = [i for i in remaining if i not in row]
    return order


def _cx(box: Box) -> float:
    return (box[0] + box[2]) / 2.0


def _cy(box: Box) -> float:
    return (box[1] + box[3]) / 2.0


# ----------------------------------------------------------------------------- main entry
@dataclass(frozen=True, slots=True)
class _Draft:
    polygon: tuple[Point, ...]
    table_box: Box
    seats_est: int
    confidence: float


def suggest_tables(
    detections_by_class: Mapping[int, Sequence[Detection]],
    *,
    image_size: tuple[int, int],
    privacy_masks: Sequence[Sequence[Point]] = (),
    min_confidence: float = DEFAULT_MIN_CONFIDENCE,
    params: SuggestParams = DEFAULT_PARAMS,
) -> list[TableSuggestion]:
    """Table suggestions from per-class detections (see the module docstring).

    ``detections_by_class`` maps COCO class ids to normalized detections (other classes are
    ignored); ``image_size`` is the frame's ``(width, height)`` in pixels; ``privacy_masks``
    are the camera's normalized mask polygons. Pure and deterministic.
    """
    width, height = image_size
    if width <= 0 or height <= 0:
        raise ValueError("image_size must be positive (width, height) in pixels")
    size = (int(width), int(height))

    def boxes(cls: int, seats: int = 1) -> list[_PxBox]:
        out: list[_PxBox] = []
        for det in detections_by_class.get(cls, ()):
            if det.score >= min_confidence:
                box = _to_px(det, size[0], size[1], seats)
                if box is not None:
                    out.append(box)
        return out

    tables = merge_tables(boxes(COCO_DINING_TABLE), params)
    chairs = boxes(COCO_CHAIR)
    couches = boxes(COCO_COUCH, params.seats_per_couch) if params.include_couches else []
    assigned, unassigned = assign_seats(tables, chairs + couches, params)

    drafts: list[_Draft] = []
    for table, seats in zip(tables, assigned, strict=True):
        core = [c for s in seats for c in s.corners()]
        base = table if seats else table.grown_by(params.no_seat_margin * max(table.w, table.h))
        polygon = _polygon(table.corners() + base.corners() + core, size, params)
        if polygon is None:
            continue
        drafts.append(
            _Draft(
                polygon,
                _box_norm(table, size),
                estimate_seats(table, seats, size, params),
                _confidence(table, seats, params),
            )
        )

    if params.chair_clusters:
        chair_ids = {id(c) for c in chairs}
        loose_chairs = [s for s in unassigned if id(s) in chair_ids]
        for cluster in chair_clusters(loose_chairs, params):
            polygon = _polygon([c for s in cluster for c in s.corners()], size, params)
            if polygon is None:
                continue
            union = _PxBox(
                min(s.x1 for s in cluster),
                min(s.y1 for s in cluster),
                max(s.x2 for s in cluster),
                max(s.y2 for s in cluster),
                0.0,
            )
            mean = sum(s.score for s in cluster) / len(cluster)
            confidence = round(min(1.0, params.cluster_confidence_factor * mean), 3)
            drafts.append(_Draft(polygon, _box_norm(union, size), len(cluster), confidence))

    kept = [
        d
        for d in drafts
        if d.confidence >= min_confidence
        and mask_overlap(d.polygon, privacy_masks) <= params.mask_overlap_max
    ]
    order = reading_order([d.table_box for d in kept])
    return [
        TableSuggestion(
            suggestion_id=f"s{n}",
            polygon=kept[i].polygon,
            table_box=kept[i].table_box,
            seats_est=max(1, kept[i].seats_est),
            confidence=kept[i].confidence,
        )
        for n, i in enumerate(order, start=1)
    ]


# ----------------------------------------------------------------------------- frame wrapper
def suggestion_classes(params: SuggestParams = DEFAULT_PARAMS) -> tuple[int, ...]:
    """The COCO classes :func:`suggest_tables` uses."""
    if params.include_couches:
        return (COCO_DINING_TABLE, COCO_CHAIR, COCO_COUCH)
    return (COCO_DINING_TABLE, COCO_CHAIR)


def has_pixels(frame: Frame | None) -> bool:
    """True when ``frame`` carries a BGR ``HxWx3`` image (not a simulated frame)."""
    image: Any = frame.image if frame is not None else None
    return (
        isinstance(image, np.ndarray) and image.ndim == 3 and image.shape[2] == 3 and image.size > 0
    )


def suggest_tables_in_frame(
    frame: Frame,
    detector: MultiClassDetector,
    *,
    privacy_masks: Sequence[Sequence[Point]] = (),
    min_confidence: float = DEFAULT_MIN_CONFIDENCE,
    params: SuggestParams = DEFAULT_PARAMS,
) -> list[TableSuggestion]:
    """Run ``detector`` once on ``frame`` (in RAM, never stored) and suggest tables.

    Raises ``ValueError`` for a frame without pixels.
    """
    if not has_pixels(frame):
        raise ValueError("table suggestions need a real camera image")
    height, width = frame.image.shape[:2]
    detections = detector.detect_classes(
        frame, suggestion_classes(params), score_thr=max(MIN_SCORE_FLOOR, min_confidence)
    )
    return suggest_tables(
        detections,
        image_size=(width, height),
        privacy_masks=privacy_masks,
        min_confidence=min_confidence,
        params=params,
    )


def default_table_detector(model_path: Path | str | None = None) -> YoloxOnnxDetector:
    """The YOLOX detector for suggestions: the same shared ONNX session the camera pipelines
    use (same model and thread cap), created on first use. Raises ``ModelNotFoundError``
    (a ``FileNotFoundError``) when the model file is missing."""
    detector = build_detector(
        "yolox", model_path, source_kind="rtsp", threads=inference_threads(), shared=True
    )
    if not isinstance(detector, YoloxOnnxDetector):  # pragma: no cover - factory contract
        raise TypeError("expected a YOLOX detector")
    return detector
