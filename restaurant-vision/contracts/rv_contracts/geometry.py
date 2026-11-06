"""Geometry in normalized image coordinates, plus pure helpers shared by edge and web logic.

Coordinate system (per camera image):

* ``(0, 0)`` is the top-left corner, ``(1, 1)`` the bottom-right corner.
* ``x`` grows to the right, ``y`` grows **downwards** (image convention).
* Coordinates are fractions of the image width/height, independent of the stream resolution.

Types:

* ``Point``: ``(x, y)`` with both values in ``[0, 1]``. JSON: ``[x, y]``.
* ``Polygon``: list of at least 3 points with non-zero area, implicitly closed (do not repeat
  the first point). JSON: ``[[x, y], ...]``. Self-intersection is not checked.
* ``Line``: a directed segment ``a -> b`` with ``in_direction``. Architecture 5.1 sketches
  ``Line = tuple[Point, Point]`` plus a direction; it is a small model ``{a, b, in_direction}``
  here so the direction travels with the segment. JSON:
  ``{"a": [x, y], "b": [x, y], "in_direction": "left_to_right"}``.
* ``Box``: detector/tracker box ``(x1, y1, x2, y2)``, normalized, ``x1 <= x2``, ``y1 <= y2``.

Sides and crossing direction: :func:`segment_side` returns ``+1`` when a point is on the
**right-hand side of a person walking from a to b, as seen on screen** (y down), ``-1`` for
the left-hand side and ``0`` on the line. ``in_direction="left_to_right"`` means that moving
from the left side to the right side of ``a -> b`` is an inward crossing (the right side is
"in"); ``"right_to_left"`` is the opposite. Example: for ``a=(0.5, 1.0)``, ``b=(0.5, 0.0)``
(drawn bottom to top), the right side is ``x > 0.5``.

The helpers are dependency-free, do no validation and accept any float coordinates.
"""

from collections.abc import Sequence
from enum import StrEnum
from typing import Annotated, Literal, Self

from pydantic import AfterValidator, Field, model_validator

from ._base import ContractModel

EPS = 1e-12
"""Tolerance used to decide that a point lies exactly on a line or edge."""

Coord = Annotated[float, Field(ge=0.0, le=1.0)]
"""A normalized image coordinate in ``[0, 1]``."""

Point = tuple[Coord, Coord]
"""``(x, y)`` in normalized image coordinates."""

Box = tuple[float, float, float, float]
"""Normalized ``(x1, y1, x2, y2)`` box, top-left and bottom-right corners."""

Side = Literal[-1, 0, 1]


class Anchor(StrEnum):
    """Which point of a person's box is tested against zones."""

    FOOT = "foot"
    """Bottom-centre of the box. Default; best for floor zones seen from above at an angle."""
    CENTER = "center"
    """Centre of the box. For top-down ceiling cameras."""


class LineDirection(StrEnum):
    """Which crossing of a directed line ``a -> b`` counts as inward (see module docstring)."""

    LEFT_TO_RIGHT = "left_to_right"
    RIGHT_TO_LEFT = "right_to_left"


class Crossing(StrEnum):
    """Result of :func:`line_crossing`."""

    IN = "in"
    OUT = "out"


def polygon_area(polygon: Sequence[tuple[float, float]]) -> float:
    """Absolute area (shoelace formula) in normalized units; 1.0 is the whole image.

    Returns 0.0 for fewer than 3 points or degenerate (collinear) polygons.
    """
    n = len(polygon)
    if n < 3:
        return 0.0
    twice = 0.0
    for i in range(n):
        x1, y1 = polygon[i]
        x2, y2 = polygon[(i + 1) % n]
        twice += x1 * y2 - x2 * y1
    return abs(twice) / 2.0


def _validate_polygon(points: list[Point]) -> list[Point]:
    if len(points) < 3:
        raise ValueError(f"polygon needs at least 3 points, got {len(points)}")
    if polygon_area(points) <= EPS:
        raise ValueError("polygon has zero area (points are collinear or repeated)")
    return points


Polygon = Annotated[list[Point], AfterValidator(_validate_polygon)]
"""Closed polygon: >= 3 points, non-zero area, last point implicitly joined to the first."""


def segment_side(
    a: tuple[float, float], b: tuple[float, float], p: tuple[float, float]
) -> Side:
    """Side of point ``p`` relative to the directed line through ``a -> b``.

    ``+1``: right-hand side as seen on screen (image y axis points down); ``-1``: left-hand
    side; ``0``: on the line (within :data:`EPS`). Equals the sign of
    ``(b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)``.
    """
    cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
    if cross > EPS:
        return 1
    if cross < -EPS:
        return -1
    return 0


def _on_segment(
    p: tuple[float, float], a: tuple[float, float], b: tuple[float, float]
) -> bool:
    if segment_side(a, b, p) != 0:
        return False
    return (
        min(a[0], b[0]) - EPS <= p[0] <= max(a[0], b[0]) + EPS
        and min(a[1], b[1]) - EPS <= p[1] <= max(a[1], b[1]) + EPS
    )


def point_in_polygon(p: tuple[float, float], polygon: Sequence[tuple[float, float]]) -> bool:
    """True if ``p`` is inside ``polygon`` (convex or concave, either winding).

    Boundary-inclusive: a point exactly on an edge or vertex counts as inside. Returns False for
    fewer than 3 points.
    """
    n = len(polygon)
    if n < 3:
        return False
    x, y = p
    inside = False
    for i in range(n):
        a = polygon[i]
        b = polygon[(i + 1) % n]
        if _on_segment(p, a, b):
            return True
        (x1, y1), (x2, y2) = a, b
        if (y1 > y) != (y2 > y):
            x_at_y = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x < x_at_y:
                inside = not inside
    return inside


def anchor_point(box: Box, anchor: Anchor) -> tuple[float, float]:
    """The point of ``box`` tested against zones: bottom-centre (``foot``) or centre."""
    x1, y1, x2, y2 = box
    cx = (x1 + x2) / 2.0
    if anchor is Anchor.FOOT:
        return (cx, y2)
    return (cx, (y1 + y2) / 2.0)


class Line(ContractModel):
    """Directed counting line ``a -> b`` (e.g. the entrance into the dining room)."""

    a: Point
    """Start point."""
    b: Point
    """End point; must differ from ``a``."""
    in_direction: LineDirection
    """Which crossing is inward: ``left_to_right`` makes the right-hand side of ``a -> b``
    (as seen on screen) the inside."""

    @model_validator(mode="after")
    def _check_length(self) -> Self:
        if abs(self.a[0] - self.b[0]) <= EPS and abs(self.a[1] - self.b[1]) <= EPS:
            raise ValueError("line endpoints a and b must differ")
        return self

    @property
    def in_side(self) -> Literal[-1, 1]:
        """The :func:`segment_side` value of the inside: ``+1`` for ``left_to_right``."""
        return 1 if self.in_direction is LineDirection.LEFT_TO_RIGHT else -1


def line_crossing(
    line: Line, prev: tuple[float, float], curr: tuple[float, float]
) -> Crossing | None:
    """Direction in which the movement ``prev -> curr`` crosses the finite segment ``line``.

    Returns ``Crossing.IN`` / ``Crossing.OUT``, or None when the movement does not cross. The
    movement must go strictly from one side to the other and pass within the segment's extent
    (touching an endpoint counts). A point exactly on the line (side 0) is not on either side,
    so a move that ends on the line is not a crossing yet: callers should keep, per track, the
    last anchor point that was off the line and pass it as ``prev``; a track that pauses on the
    line is then counted exactly once when it leaves it on the other side.
    """
    s_prev = segment_side(line.a, line.b, prev)
    s_curr = segment_side(line.a, line.b, curr)
    if s_prev == 0 or s_curr == 0 or s_prev == s_curr:
        return None
    # The infinite line is crossed; check that the crossing point lies within a..b.
    if segment_side(prev, curr, line.a) * segment_side(prev, curr, line.b) > 0:
        return None
    return Crossing.IN if s_curr == line.in_side else Crossing.OUT
