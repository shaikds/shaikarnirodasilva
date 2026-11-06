import pytest
from pydantic import ValidationError

from rv_contracts import (
    Anchor,
    CameraConfig,
    Crossing,
    Line,
    LineDirection,
    anchor_point,
    line_crossing,
    point_in_polygon,
    polygon_area,
    segment_side,
)

SQUARE = [(0.2, 0.2), (0.6, 0.2), (0.6, 0.6), (0.2, 0.6)]
# U shape opening upwards: notch between x 0.4..0.6 above y 0.5.
U_SHAPE = [
    (0.2, 0.2), (0.4, 0.2), (0.4, 0.5), (0.6, 0.5), (0.6, 0.2), (0.8, 0.2), (0.8, 0.8), (0.2, 0.8)
]


# --------------------------------------------------------------------------- point_in_polygon


@pytest.mark.parametrize(
    ("point", "expected"),
    [
        ((0.4, 0.4), True),
        ((0.1, 0.4), False),
        ((0.7, 0.4), False),
        ((0.4, 0.1), False),
        ((0.4, 0.9), False),
    ],
)
def test_point_in_square(point: tuple[float, float], expected: bool) -> None:
    assert point_in_polygon(point, SQUARE) is expected


@pytest.mark.parametrize(
    "point",
    [(0.2, 0.4), (0.6, 0.4), (0.4, 0.2), (0.4, 0.6), (0.2, 0.2), (0.6, 0.6), (0.6, 0.2)],
)
def test_points_on_edges_and_vertices_are_inside(point: tuple[float, float]) -> None:
    assert point_in_polygon(point, SQUARE)


def test_winding_order_does_not_matter() -> None:
    reversed_square = list(reversed(SQUARE))
    assert point_in_polygon((0.4, 0.4), reversed_square)
    assert not point_in_polygon((0.7, 0.4), reversed_square)


@pytest.mark.parametrize(
    ("point", "expected"),
    [
        ((0.3, 0.3), True),  # left arm
        ((0.7, 0.3), True),  # right arm
        ((0.5, 0.3), False),  # inside the notch: outside the polygon
        ((0.5, 0.7), True),  # base
        ((0.5, 0.5), True),  # on the notch's bottom edge
        ((0.4, 0.35), True),  # on the notch's left edge
        ((0.5, 0.2), False),  # in the notch opening, at the arms' top y
    ],
)
def test_point_in_concave_polygon(point: tuple[float, float], expected: bool) -> None:
    assert point_in_polygon(point, U_SHAPE) is expected


def test_ray_through_vertex_is_counted_once() -> None:
    diamond = [(0.5, 0.1), (0.9, 0.5), (0.5, 0.9), (0.1, 0.5)]
    # Horizontal ray from these points passes exactly through the vertex (0.9, 0.5).
    assert point_in_polygon((0.5, 0.5), diamond)
    assert not point_in_polygon((0.05, 0.5), diamond)
    assert not point_in_polygon((0.95, 0.5), diamond)


def test_degenerate_polygons_contain_nothing() -> None:
    assert not point_in_polygon((0.5, 0.5), [])
    assert not point_in_polygon((0.5, 0.5), [(0.1, 0.1), (0.9, 0.9)])


# --------------------------------------------------------------------------- polygon_area


def test_polygon_area() -> None:
    assert polygon_area(SQUARE) == pytest.approx(0.16)
    assert polygon_area(list(reversed(SQUARE))) == pytest.approx(0.16)
    assert polygon_area([(0.0, 0.0), (1.0, 0.0), (0.0, 1.0)]) == pytest.approx(0.5)
    assert polygon_area([(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]) == pytest.approx(1.0)
    assert polygon_area(U_SHAPE) == pytest.approx(0.36 - 0.06)


def test_polygon_area_degenerate() -> None:
    assert polygon_area([]) == 0.0
    assert polygon_area([(0.1, 0.1), (0.2, 0.2)]) == 0.0
    assert polygon_area([(0.1, 0.1), (0.2, 0.2), (0.3, 0.3)]) == 0.0


# --------------------------------------------------------------------------- segment_side


def test_segment_side_uses_screen_right_hand_with_y_down() -> None:
    a, b = (0.0, 0.5), (1.0, 0.5)  # walking right on screen
    assert segment_side(a, b, (0.5, 0.8)) == 1  # below on screen = right-hand side
    assert segment_side(a, b, (0.5, 0.2)) == -1
    assert segment_side(a, b, (0.3, 0.5)) == 0
    assert segment_side(a, b, (2.0, 0.5)) == 0  # on the infinite line


def test_segment_side_vertical_line() -> None:
    up_a, up_b = (0.5, 1.0), (0.5, 0.0)  # drawn bottom to top
    assert segment_side(up_a, up_b, (0.8, 0.5)) == 1
    assert segment_side(up_a, up_b, (0.2, 0.5)) == -1
    # Reversing the direction swaps the sides.
    assert segment_side(up_b, up_a, (0.8, 0.5)) == -1


# --------------------------------------------------------------------------- Line, line_crossing


def _entrance(direction: LineDirection = LineDirection.LEFT_TO_RIGHT) -> Line:
    # Vertical line at x=0.5 drawn bottom to top: right-hand side is x > 0.5.
    return Line(a=(0.5, 0.9), b=(0.5, 0.1), in_direction=direction)


def test_line_in_side() -> None:
    assert _entrance().in_side == 1
    assert _entrance(LineDirection.RIGHT_TO_LEFT).in_side == -1


def test_crossing_directions() -> None:
    line = _entrance()
    assert line_crossing(line, (0.3, 0.5), (0.7, 0.5)) is Crossing.IN
    assert line_crossing(line, (0.7, 0.5), (0.3, 0.5)) is Crossing.OUT
    flipped = _entrance(LineDirection.RIGHT_TO_LEFT)
    assert line_crossing(flipped, (0.3, 0.5), (0.7, 0.5)) is Crossing.OUT
    assert line_crossing(flipped, (0.7, 0.5), (0.3, 0.5)) is Crossing.IN


def test_diagonal_crossing() -> None:
    assert line_crossing(_entrance(), (0.4, 0.2), (0.6, 0.8)) is Crossing.IN


def test_no_crossing_cases() -> None:
    line = _entrance()
    assert line_crossing(line, (0.3, 0.5), (0.4, 0.5)) is None  # same side
    assert line_crossing(line, (0.3, 0.5), (0.3, 0.5)) is None  # no movement
    assert line_crossing(line, (0.3, 0.95), (0.7, 0.95)) is None  # beyond endpoint b..a extent
    assert line_crossing(line, (0.3, 0.05), (0.7, 0.05)) is None
    assert line_crossing(line, (0.5, 0.2), (0.5, 0.8)) is None  # moving along the line


def test_touching_an_endpoint_counts() -> None:
    assert line_crossing(_entrance(), (0.3, 0.9), (0.7, 0.9)) is Crossing.IN


def test_pausing_on_the_line_counts_once() -> None:
    line = _entrance()
    # Track: left side -> exactly on the line -> right side.
    assert line_crossing(line, (0.3, 0.5), (0.5, 0.5)) is None
    # Caller keeps the last off-line point as prev, so the crossing is reported once.
    assert line_crossing(line, (0.3, 0.5), (0.7, 0.5)) is Crossing.IN
    # Naive (on-line point as prev) never reports it twice either.
    assert line_crossing(line, (0.5, 0.5), (0.7, 0.5)) is None


def test_line_validation() -> None:
    with pytest.raises(ValidationError, match="must differ"):
        Line(a=(0.5, 0.5), b=(0.5, 0.5), in_direction=LineDirection.LEFT_TO_RIGHT)
    with pytest.raises(ValidationError):
        Line(a=(0.5, 1.5), b=(0.5, 0.5), in_direction=LineDirection.LEFT_TO_RIGHT)
    with pytest.raises(ValidationError):
        Line.model_validate({"a": [0.1, 0.1], "b": [0.2, 0.2]})  # in_direction required
    with pytest.raises(ValidationError):
        Line.model_validate({"a": [0.1, 0.1], "b": [0.2, 0.2], "in_direction": "up"})


def test_line_json_shape() -> None:
    line = _entrance()
    assert line.model_dump(mode="json") == {
        "a": [0.5, 0.9],
        "b": [0.5, 0.1],
        "in_direction": "left_to_right",
    }
    assert Line.model_validate_json(line.model_dump_json()) == line


# --------------------------------------------------------------------------- Polygon validation


def _camera_with_mask(mask: object) -> CameraConfig:
    return CameraConfig.model_validate({"camera_id": "c1", "name": "Cam", "privacy_masks": [mask]})


def test_polygon_validation_accepts_valid_polygon() -> None:
    camera = _camera_with_mask([[0.1, 0.1], [0.3, 0.1], [0.2, 0.3]])
    assert camera.privacy_masks == [[(0.1, 0.1), (0.3, 0.1), (0.2, 0.3)]]


@pytest.mark.parametrize(
    ("mask", "message"),
    [
        ([[0.1, 0.1], [0.3, 0.1]], "at least 3 points"),
        ([[0.1, 0.1], [0.2, 0.2], [0.3, 0.3]], "zero area"),
        ([[0.1, 0.1], [0.1, 0.1], [0.1, 0.1]], "zero area"),
        ([[0.1, 0.1], [1.3, 0.1], [0.2, 0.3]], "less than or equal to 1"),
        ([[-0.1, 0.1], [0.3, 0.1], [0.2, 0.3]], "greater than or equal to 0"),
        ([[0.1, 0.1, 0.1], [0.3, 0.1], [0.2, 0.3]], "at most 2 items"),
    ],
)
def test_polygon_validation_rejects(mask: object, message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        _camera_with_mask(mask)


# --------------------------------------------------------------------------- anchor_point


def test_anchor_point() -> None:
    box = (0.2, 0.1, 0.4, 0.5)
    assert anchor_point(box, Anchor.FOOT) == pytest.approx((0.3, 0.5))
    assert anchor_point(box, Anchor.CENTER) == pytest.approx((0.3, 0.3))
