from __future__ import annotations

import math
import random
from collections.abc import Iterable, Mapping, Sequence
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np
import pytest
from pydantic import TypeAdapter
from rv_contracts import Anchor, Detection, Frame, Polygon
from rv_contracts.geometry import anchor_point, point_in_polygon, polygon_area

from rv_edge.vision import table_suggest
from rv_edge.vision.detectors import (
    DEFAULT_MODEL_DIR,
    build_detector,
    clear_shared_detectors,
)
from rv_edge.vision.detectors.yolox_onnx import (
    YoloxOnnxDetector,
    decode_classes,
    decode_persons,
    make_grids,
)
from rv_edge.vision.factory import inference_threads
from rv_edge.vision.table_suggest import (
    COCO_CHAIR,
    COCO_COUCH,
    COCO_DINING_TABLE,
    DEFAULT_PARAMS,
    SUGGEST_MODEL_NAME,
    MultiClassDetector,
    SuggestParams,
    TableSuggestion,
    clip_to_unit,
    convex_hull,
    default_table_detector,
    mask_overlap,
    reading_order,
    simplify,
    suggest_tables,
    suggest_tables_in_frame,
    suggestion_model_path,
)

from .fakes import pixel_frame, synthetic_frame

TINY = DEFAULT_MODEL_DIR / "yolox_tiny.onnx"
needs_tiny = pytest.mark.skipif(not TINY.is_file(), reason="yolox_tiny.onnx not downloaded")

SQUARE = (1000, 1000)
"""Image size where pixels are normalized coordinates x 1000 (padding is 0.03)."""
HD = (1920, 1080)
POLYGON = TypeAdapter(Polygon)

Box = tuple[float, float, float, float]


def det(x1: float, y1: float, x2: float, y2: float, score: float = 0.8) -> Detection:
    return Detection(box=(x1, y1, x2, y2), score=score)


def chair_at(
    cx: float, cy: float, w: float = 0.04, h: float = 0.06, score: float = 0.7
) -> Detection:
    return det(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, score)


def run(
    tables: Iterable[Detection] = (),
    chairs: Iterable[Detection] = (),
    couches: Iterable[Detection] = (),
    *,
    image_size: tuple[int, int] = SQUARE,
    masks: Sequence[Sequence[tuple[float, float]]] = (),
    **kwargs: object,
) -> list[TableSuggestion]:
    detections = {
        COCO_DINING_TABLE: list(tables),
        COCO_CHAIR: list(chairs),
        COCO_COUCH: list(couches),
    }
    return suggest_tables(detections, image_size=image_size, privacy_masks=masks, **kwargs)  # type: ignore[arg-type]


def rect(x1: float, y1: float, x2: float, y2: float) -> list[tuple[float, float]]:
    return [(x1, y1), (x2, y1), (x2, y2), (x1, y2)]


def corners(box: Box) -> list[tuple[float, float]]:
    return rect(*box)


def assert_valid(s: TableSuggestion, max_points: int = 12) -> None:
    assert 3 <= len(s.polygon) <= max_points
    POLYGON.validate_python(list(s.polygon))  # 0..1, >= 3 points, non-zero area
    assert polygon_area(s.polygon) > 0
    assert s.seats_est >= 1
    assert 0.0 <= s.confidence <= 1.0
    x1, y1, x2, y2 = s.table_box
    assert 0.0 <= x1 < x2 <= 1.0 and 0.0 <= y1 < y2 <= 1.0


# ------------------------------------------------------------------ empty and trivial input
def test_empty_input() -> None:
    assert suggest_tables({}, image_size=HD, privacy_masks=[]) == []
    assert run() == []
    assert run(chairs=[chair_at(0.5, 0.5)]) == []  # one chair alone is not a table
    person = {0: [det(0.4, 0.4, 0.5, 0.8)]}
    assert suggest_tables(person, image_size=HD, privacy_masks=[]) == []
    assert run([det(0.3, 0.3, 0.3, 0.5)]) == []  # zero-width box
    with pytest.raises(ValueError, match="image_size"):
        suggest_tables({}, image_size=(0, 480), privacy_masks=[])


# ------------------------------------------------------------------ merge
def test_heavily_overlapping_tables_merge_into_their_union() -> None:
    (one,) = run([det(0.40, 0.40, 0.60, 0.60, 0.6), det(0.42, 0.42, 0.62, 0.62, 0.8)])
    assert one.table_box == (0.40, 0.40, 0.62, 0.62)
    assert one.confidence == pytest.approx(0.8 - DEFAULT_PARAMS.no_seat_penalty)


def test_a_table_inside_another_merges() -> None:
    (one,) = run([det(0.10, 0.10, 0.50, 0.50, 0.5), det(0.20, 0.20, 0.30, 0.30, 0.9)])
    assert one.table_box == (0.10, 0.10, 0.50, 0.50)
    assert one.confidence == pytest.approx(0.85)  # best score kept


def test_separate_and_slightly_overlapping_tables_stay_apart() -> None:
    far = run([det(0.10, 0.10, 0.20, 0.20), det(0.60, 0.60, 0.70, 0.70)])
    assert len(far) == 2
    touching = run([det(0.10, 0.10, 0.30, 0.30), det(0.28, 0.10, 0.48, 0.30)])  # IoU ~0.05
    assert [s.table_box for s in touching] == [(0.10, 0.10, 0.30, 0.30), (0.28, 0.10, 0.48, 0.30)]


def test_merging_repeats_until_stable() -> None:
    # B merges into A (IoU 0.39); the union then contains C, which merges too.
    tables = [
        det(0.10, 0.10, 0.30, 0.30, 0.9),
        det(0.15, 0.15, 0.35, 0.35, 0.8),
        det(0.25, 0.25, 0.34, 0.34, 0.7),
    ]
    (one,) = run(tables)
    assert one.table_box == (0.10, 0.10, 0.35, 0.35)


# ------------------------------------------------------------------ chair assignment
def test_each_chair_goes_to_the_nearest_table_or_nowhere() -> None:
    t1 = det(0.20, 0.40, 0.30, 0.50)
    t2 = det(0.38, 0.40, 0.48, 0.50)
    chairs = [
        chair_at(0.16, 0.45),  # only near t1
        chair_at(0.33, 0.45),  # in both grown boxes, nearer t1 (0.03 vs 0.05)
        chair_at(0.355, 0.45),  # in both grown boxes, nearer t2 (0.055 vs 0.025)
        chair_at(0.52, 0.45),  # only near t2
        chair_at(0.53, 0.48),  # only near t2
        chair_at(0.90, 0.90),  # far from every table: ignored
    ]
    left, right = run([t1, t2], chairs)
    assert left.table_box == (0.20, 0.40, 0.30, 0.50) and left.seats_est == 2
    assert right.table_box == (0.38, 0.40, 0.48, 0.50) and right.seats_est == 3
    for s, near in ((left, chairs[:2]), (right, chairs[2:5])):
        for chair in near:
            assert all(point_in_polygon(c, s.polygon) for c in corners(chair.box))
    assert not any(point_in_polygon((0.90, 0.90), s.polygon) for s in (left, right))


def test_a_chair_beyond_the_grown_box_is_not_assigned() -> None:
    table = det(0.40, 0.40, 0.50, 0.50)  # grown by 60%: x 0.34..0.56
    (only,) = run([table], [chair_at(0.57, 0.45), chair_at(0.55, 0.45)])
    assert only.seats_est == 1


def test_couches_count_as_seating() -> None:
    table = det(0.40, 0.40, 0.55, 0.52)
    couch = det(0.30, 0.38, 0.39, 0.56, 0.6)
    (s,) = run([table], [chair_at(0.58, 0.46)], [couch])
    assert s.seats_est == 1 + DEFAULT_PARAMS.seats_per_couch
    assert all(point_in_polygon(c, s.polygon) for c in corners(couch.box))
    no_couch = SuggestParams(include_couches=False)
    (s2,) = run([table], [chair_at(0.58, 0.46)], [couch], params=no_couch)
    assert s2.seats_est == 1


# ------------------------------------------------------------------ polygon
FOUR_TOP = det(0.40, 0.40, 0.60, 0.55, 0.8)
FOUR_CHAIRS = [
    det(0.33, 0.42, 0.39, 0.56, 0.7),  # left
    det(0.61, 0.42, 0.67, 0.56, 0.7),  # right
    det(0.46, 0.32, 0.54, 0.41, 0.6),  # back (partly behind the table)
    det(0.46, 0.54, 0.54, 0.66, 0.7),  # front
]


def seated_person(chair: Box) -> Box:
    """A guest on ``chair``: wider, much taller, feet a little below the chair's bottom."""
    x1, y1, x2, y2 = chair
    return (x1 - 0.01, y1 - 0.12, x2 + 0.01, y2 + 0.01)


@pytest.mark.parametrize("image_size", [SQUARE, HD, (640, 480)])
def test_polygon_covers_table_chairs_and_seated_guests(image_size: tuple[int, int]) -> None:
    (s,) = run([FOUR_TOP], FOUR_CHAIRS, image_size=image_size)
    assert_valid(s)
    assert s.seats_est == 4
    for box in [FOUR_TOP.box, *(c.box for c in FOUR_CHAIRS)]:
        assert all(point_in_polygon(c, s.polygon) for c in corners(box))
    for chair in FOUR_CHAIRS:
        person = seated_person(chair.box)
        for anchor in (Anchor.FOOT, Anchor.CENTER):
            assert point_in_polygon(anchor_point(person, anchor), s.polygon), (chair, anchor)


def test_polygon_is_padded_by_three_percent_of_the_shorter_side() -> None:
    (s,) = run([FOUR_TOP], FOUR_CHAIRS, image_size=HD)
    xs, ys = [p[0] for p in s.polygon], [p[1] for p in s.polygon]
    pad_x, pad_y = 0.03 * 1080 / 1920, 0.03  # the same 32.4 px on both axes
    assert min(xs) == pytest.approx(0.33 - pad_x, abs=2e-3)
    assert max(xs) == pytest.approx(0.67 + pad_x, abs=2e-3)
    assert min(ys) == pytest.approx(0.32 - pad_y, abs=2e-3)
    assert max(ys) == pytest.approx(0.66 + pad_y, abs=2e-3)
    unpadded = run([FOUR_TOP], FOUR_CHAIRS, image_size=HD, params=SuggestParams(pad_frac=0.0))
    assert polygon_area(unpadded[0].polygon) < polygon_area(s.polygon)


@pytest.mark.parametrize("image_size", [SQUARE, HD])
def test_a_table_without_chairs_gets_room_for_seated_guests(image_size: tuple[int, int]) -> None:
    (s,) = run([FOUR_TOP], image_size=image_size)
    # Guests on chairs that were not detected still fall inside.
    for chair in FOUR_CHAIRS:
        person = seated_person(chair.box)
        for anchor in (Anchor.FOOT, Anchor.CENTER):
            assert point_in_polygon(anchor_point(person, anchor), s.polygon), (chair, anchor)


def test_polygon_is_clipped_to_the_image() -> None:
    (corner,) = run([det(0.0, 0.0, 0.15, 0.12)], [chair_at(0.02, 0.15)])
    assert_valid(corner)
    assert point_in_polygon((0.0, 0.0), corner.polygon)
    (edge,) = run([det(0.85, 0.40, 1.0, 0.60)], image_size=HD)
    assert_valid(edge)
    assert max(p[0] for p in edge.polygon) == 1.0


def test_polygon_point_limit_keeps_every_chair_inside() -> None:
    table = det(0.42, 0.42, 0.58, 0.58)
    chairs = [
        chair_at(0.5 + 0.13 * math.cos(a), 0.5 + 0.13 * math.sin(a), 0.05, 0.05)
        for a in (2 * math.pi * k / 10 + 0.1 for k in range(10))
    ]
    (s,) = run([table], chairs, image_size=HD)
    assert_valid(s)
    assert s.seats_est == 10
    for chair in chairs:
        assert all(point_in_polygon(c, s.polygon) for c in corners(chair.box))
    # A hexagon cannot hold all 40 chair corners: the limit wins, the table stays covered.
    (few,) = run([table], chairs, image_size=HD, params=SuggestParams(max_points=6))
    assert_valid(few, max_points=6)
    assert all(point_in_polygon(c, few.polygon) for c in corners(table.box))


def test_geometry_helpers() -> None:
    hull = convex_hull([(0, 0), (1, 0), (1, 1), (0, 1), (0.5, 0.5), (0.5, 0)])
    assert sorted(hull) == [(0, 0), (0, 1), (1, 0), (1, 1)]  # interior and collinear dropped
    clipped = clip_to_unit([(-0.25, 0.5), (0.5, -0.25), (1.25, 0.5), (0.5, 1.25)])
    assert all(0.0 <= v <= 1.0 for p in clipped for v in p)
    assert len(clipped) == 8  # each corner of the square cut off
    assert polygon_area(clipped) == pytest.approx(1.0 - 4 * 0.25 * 0.25 / 2)
    assert clip_to_unit([(2.0, 2.0), (3.0, 2.0), (3.0, 3.0)]) == []
    circle = [(0.5 + 0.4 * math.cos(a), 0.5 + 0.4 * math.sin(a)) for a in np.linspace(0, 6.28, 40)]
    inner = [(0.5 + 0.3 * math.cos(a), 0.5 + 0.3 * math.sin(a)) for a in np.linspace(0, 6.2, 12)]
    reduced = simplify(circle, 12, inner)
    assert len(reduced) == 12
    assert all(point_in_polygon(p, reduced) for p in inner)


# ------------------------------------------------------------------ seats
@pytest.mark.parametrize(
    ("box", "seats"),
    [
        ((0.50, 0.50, 0.55, 0.58), 2),  # small: 96 x 86 px, 0.4% of the image
        ((0.40, 0.40, 0.52, 0.60), 4),  # medium, about square in pixels
        ((0.30, 0.40, 0.60, 0.50), 6),  # long, horizontal
        ((0.45, 0.20, 0.50, 0.60), 6),  # long, vertical
    ],
)
def test_seat_estimate_without_chairs(box: Box, seats: int) -> None:
    (s,) = run([det(*box)], image_size=HD)
    assert s.seats_est == seats


def test_seat_estimate_counts_assigned_chairs() -> None:
    long_table = det(0.30, 0.40, 0.60, 0.50)
    (s,) = run([long_table], [chair_at(0.35, 0.53), chair_at(0.45, 0.53)], image_size=HD)
    assert s.seats_est == 2


# ------------------------------------------------------------------ confidence
@pytest.mark.parametrize(
    ("score", "n_chairs", "expected"),
    [(0.6, 0, 0.55), (0.6, 2, 0.68), (0.6, 6, 0.76), (0.95, 4, 1.0), (0.27, 0, 0.0)],
)
def test_confidence_is_the_table_score_adjusted_by_chairs(
    score: float, n_chairs: int, expected: float
) -> None:
    table = det(0.40, 0.40, 0.60, 0.55, score)
    chairs = [chair_at(0.38 + 0.045 * k, 0.58) for k in range(n_chairs)]
    found = run([table], chairs, min_confidence=0.0 if expected == 0.0 else 0.25)
    if expected == 0.0:
        assert found[0].confidence == pytest.approx(score - 0.05)
    else:
        assert found[0].confidence == pytest.approx(expected)


def test_min_confidence_filters_detections_and_results() -> None:
    weak = det(0.10, 0.10, 0.30, 0.30, 0.2)
    strong = det(0.60, 0.60, 0.80, 0.80, 0.9)
    assert [s.table_box for s in run([weak, strong])] == [(0.60, 0.60, 0.80, 0.80)]
    assert len(run([weak, strong], min_confidence=0.1)) == 2
    # Detected at 0.27 but 0.22 after the no-chair penalty: below the default 0.25.
    assert run([det(0.1, 0.1, 0.3, 0.3, 0.27)]) == []


# ------------------------------------------------------------------ chair clusters
def test_a_cluster_of_chairs_without_a_table_is_a_weak_suggestion() -> None:
    cluster = [chair_at(0.70, 0.70, score=0.8), chair_at(0.76, 0.70, score=0.8)]
    cluster.append(chair_at(0.73, 0.77, score=0.7))
    lone = chair_at(0.10, 0.90, score=0.9)
    table = det(0.20, 0.20, 0.35, 0.32, 0.6)
    found = run([table], [*cluster, lone])
    assert len(found) == 2
    (weak,) = [s for s in found if s.table_box != (0.20, 0.20, 0.35, 0.32)]
    assert weak.seats_est == 3
    assert weak.confidence == pytest.approx(round(0.6 * (0.8 + 0.8 + 0.7) / 3, 3))
    assert weak.confidence < found[0].confidence
    assert weak.table_box == pytest.approx((0.68, 0.67, 0.78, 0.80))
    assert all(point_in_polygon(c, weak.polygon) for ch in cluster for c in corners(ch.box))
    assert not point_in_polygon((0.10, 0.90), weak.polygon)
    assert len(run([table], cluster, params=SuggestParams(chair_clusters=False))) == 1
    assert run(chairs=[chair_at(0.1, 0.5), chair_at(0.8, 0.5)]) == []  # far apart
    assert run(chairs=[chair_at(0.5, 0.5, score=0.35), chair_at(0.55, 0.5, score=0.35)]) == []


# ------------------------------------------------------------------ order and ids
GRID = [
    det(0.10, 0.20, 0.25, 0.30),
    det(0.40, 0.22, 0.55, 0.33),  # a little lower, same row
    det(0.70, 0.19, 0.85, 0.29),
    det(0.08, 0.60, 0.28, 0.75),
    det(0.38, 0.62, 0.58, 0.77),
    det(0.68, 0.58, 0.88, 0.74),
]


def test_reading_order_and_stable_ids() -> None:
    expected = [d.box for d in GRID]
    rng = random.Random(7)
    results = []
    for _ in range(6):
        shuffled = GRID[:]
        rng.shuffle(shuffled)
        found = run(shuffled)
        assert [s.suggestion_id for s in found] == ["s1", "s2", "s3", "s4", "s5", "s6"]
        assert [s.table_box for s in found] == expected
        results.append(found)
    assert all(r == results[0] for r in results)  # identical output, whatever the input order


def test_reading_order_helper() -> None:
    boxes: list[Box] = [(0.6, 0.1, 0.7, 0.2), (0.1, 0.5, 0.2, 0.6), (0.1, 0.12, 0.2, 0.22)]
    assert reading_order(boxes) == [2, 0, 1]
    assert reading_order([]) == []


# ------------------------------------------------------------------ privacy masks
def test_suggestions_inside_privacy_masks_are_dropped() -> None:
    a = det(0.10, 0.10, 0.25, 0.25)
    b = det(0.60, 0.60, 0.75, 0.75)
    covered = rect(0.0, 0.0, 0.40, 0.40)
    (only,) = run([a, b], masks=[covered])
    assert only.table_box == (0.60, 0.60, 0.75, 0.75) and only.suggestion_id == "s1"
    corner_only = rect(0.70, 0.70, 1.0, 1.0)  # a small part of b's polygon
    assert len(run([a, b], masks=[corner_only])) == 2
    # Two masks that each cover under half of a's polygon but together most of it.
    halves = [rect(0.0, 0.0, 0.17, 0.40), rect(0.16, 0.0, 0.40, 0.40)]
    assert [s.table_box for s in run([a, b], masks=halves)] == [(0.60, 0.60, 0.75, 0.75)]
    assert len(run([a, b], masks=[[(0.1, 0.1), (0.2, 0.2)]])) == 2  # not a polygon: ignored


def test_mask_overlap() -> None:
    square = rect(0.2, 0.2, 0.4, 0.4)
    assert mask_overlap(square, []) == 0.0
    assert mask_overlap(square, [rect(0.0, 0.0, 1.0, 1.0)]) == pytest.approx(1.0)
    assert mask_overlap(square, [rect(0.6, 0.6, 0.9, 0.9)]) == 0.0
    assert mask_overlap(square, [rect(0.0, 0.0, 0.3, 1.0)]) == pytest.approx(0.5, abs=0.05)


# ------------------------------------------------------------------ multi-class YOLOX decode
def _raw_with(rows: Mapping[int, Sequence[float]], classes: Mapping[int, float]) -> np.ndarray:
    grids, _ = make_grids((64, 64))
    raw = np.zeros((grids.shape[0], 85), dtype=np.float32)
    for row, values in rows.items():
        raw[row, : len(values)] = values
    for row_cls, score in classes.items():
        row, cls = divmod(row_cls, 1000)
        raw[row, 5 + cls] = score
    return raw


def test_decode_classes_is_class_aware() -> None:
    grids, strides = make_grids((64, 64))
    cell, dup, other = 2 * 8 + 3, 2 * 8 + 4, 5 * 8 + 5
    box = [0.5, 0.5, math.log(2.0), math.log(4.0)]
    raw = _raw_with(
        {
            cell: [*box, 0.9],
            dup: [-0.4, 0.5, math.log(2.0), math.log(4.0), 0.8],
            other: [*box, 0.9],
        },
        {
            cell * 1000 + COCO_DINING_TABLE: 0.9,
            cell * 1000 + COCO_CHAIR: 0.6,  # same anchor, another class: kept separately
            dup * 1000 + COCO_DINING_TABLE: 0.8,  # duplicate table, suppressed by NMS
            other * 1000 + 0: 0.9,  # a person
        },
    )
    out = decode_classes(
        raw,
        grids,
        strides,
        classes=[COCO_DINING_TABLE, COCO_CHAIR, COCO_COUCH],
        ratio=0.5,
        width=128,
        height=128,
        score_thr=0.25,
        nms_thr=0.45,
    )
    assert set(out) == {COCO_DINING_TABLE, COCO_CHAIR, COCO_COUCH}
    assert len(out[COCO_DINING_TABLE]) == 1 and out[COCO_COUCH] == []
    assert out[COCO_DINING_TABLE][0].box == pytest.approx((0.3125, 0.0625, 0.5625, 0.5625))
    assert out[COCO_DINING_TABLE][0].score == pytest.approx(0.81)
    assert out[COCO_CHAIR][0].box == out[COCO_DINING_TABLE][0].box
    assert out[COCO_CHAIR][0].score == pytest.approx(0.54)
    kwargs = {"ratio": 0.5, "width": 128, "height": 128, "score_thr": 0.35, "nms_thr": 0.45}
    persons = decode_persons(raw, grids, strides, **kwargs)  # type: ignore[arg-type]
    assert decode_classes(raw, grids, strides, classes=[0], **kwargs)[0] == persons  # type: ignore[arg-type]
    assert len(persons) == 1
    with pytest.raises(ValueError, match="out of range"):
        decode_classes(raw, grids, strides, classes=[80], **kwargs)  # type: ignore[arg-type]


# ------------------------------------------------------------------ frame wrapper
class FakeMultiDetector:
    def __init__(self, detections: Mapping[int, Sequence[Detection]]) -> None:
        self.detections = detections
        self.calls: list[tuple[Frame, tuple[int, ...], float | None]] = []

    def detect_classes(
        self, frame: Frame, classes: Iterable[int], *, score_thr: float | None = None
    ) -> Mapping[int, Sequence[Detection]]:
        self.calls.append((frame, tuple(classes), score_thr))
        return self.detections


def test_suggest_tables_in_frame_runs_the_detector_once() -> None:
    detections = {COCO_DINING_TABLE: [FOUR_TOP], COCO_CHAIR: FOUR_CHAIRS}
    fake = FakeMultiDetector(detections)
    assert isinstance(fake, MultiClassDetector)
    frame = pixel_frame()  # 640 x 360
    masks = [rect(0.0, 0.0, 0.1, 0.1)]
    found = suggest_tables_in_frame(frame, fake, privacy_masks=masks)
    assert found == suggest_tables(detections, image_size=(640, 360), privacy_masks=masks)
    assert len(fake.calls) == 1
    assert fake.calls[0][1] == (COCO_DINING_TABLE, COCO_CHAIR, COCO_COUCH)
    assert fake.calls[0][2] == 0.25
    suggest_tables_in_frame(frame, fake, min_confidence=0.0)
    assert fake.calls[-1][2] == 0.05  # floor for the detector threshold
    with pytest.raises(ValueError, match="real camera image"):
        suggest_tables_in_frame(synthetic_frame([]), fake)


# ------------------------------------------------------------------ real model
def dining_scene(width: int = 960, height: int = 540) -> np.ndarray:
    """A crude drawing of a dining room: wooden table tops with legs and chairs around them."""
    image = np.full((height, width, 3), (200, 210, 215), dtype=np.uint8)
    image[int(height * 0.55) :, :] = (120, 140, 160)  # floor
    rng = np.random.default_rng(1)
    for cx, cy, tw in ((0.25, 0.62, 0.18), (0.62, 0.66, 0.22), (0.45, 0.40, 0.14)):
        x1, x2 = int((cx - tw / 2) * width), int((cx + tw / 2) * width)
        top, depth = int(cy * height), int(tw * height * 0.35)
        cv2.rectangle(image, (x1, top), (x2, top + depth), (40, 80, 140), -1)  # table top
        for lx in (x1 + 6, x2 - 12):
            cv2.rectangle(image, (lx, top + depth), (lx + 6, top + depth + 60), (30, 50, 90), -1)
        for side in (-1, 1):  # a chair on each side
            sx = (x1 - 40) if side < 0 else (x2 + 10)
            cv2.rectangle(image, (sx, top - 50), (sx + 30, top + 20), (60, 60, 60), -1)
            cv2.rectangle(image, (sx, top + 20), (sx + 30, top + 30), (70, 70, 70), -1)
            for lx in (sx, sx + 26):
                cv2.rectangle(image, (lx, top + 30), (lx + 4, top + 75), (50, 50, 50), -1)
    noise = rng.integers(-8, 9, size=image.shape)
    return np.clip(image.astype(np.int16) + noise, 0, 255).astype(np.uint8)


@needs_tiny
def test_real_yolox_tiny_on_a_synthetic_dining_room() -> None:
    clear_shared_detectors()
    try:
        detector = default_table_detector(TINY)
        shared = build_detector("yolox", TINY, threads=inference_threads(), shared=True)
        if suggestion_model_path(TINY) == TINY:
            assert detector is shared  # reuses the camera pipelines' ONNX session
        else:  # yolox_s is downloaded: a private, better-on-furniture session
            assert detector is not shared
        frame = pixel_frame(dining_scene())
        raw = detector.detect_classes(frame, [COCO_DINING_TABLE, COCO_CHAIR], score_thr=0.05)
        assert set(raw) == {COCO_DINING_TABLE, COCO_CHAIR}
        for dets in raw.values():
            for d in dets:
                assert all(0.0 <= v <= 1.0 for v in d.box) and d.score > 0.05
        # Person path unchanged: detect() is detect_classes() for class 0.
        assert detector.detect(frame) == detector.detect_classes(frame, [0])[0]
        for s in suggest_tables_in_frame(frame, detector, min_confidence=0.05):
            assert_valid(s)
        assert isinstance(detector, YoloxOnnxDetector)
    finally:
        clear_shared_detectors()


def test_suggestions_prefer_yolox_s_when_downloaded(tmp_path: Path) -> None:
    tiny = tmp_path / "yolox_tiny.onnx"
    tiny.write_bytes(b"x")
    alone = tmp_path / "other" / "custom.onnx"
    alone.parent.mkdir()
    alone.write_bytes(b"x")
    with patch.object(table_suggest, "DEFAULT_MODEL_DIR", tmp_path / "nowhere"):
        assert suggestion_model_path(tiny) == tiny  # no yolox_s: the runtime model
        (tmp_path / SUGGEST_MODEL_NAME).write_bytes(b"x")
        assert suggestion_model_path(tiny) == tmp_path / SUGGEST_MODEL_NAME
        assert suggestion_model_path(alone) == alone
    with patch.object(table_suggest, "DEFAULT_MODEL_DIR", tmp_path):
        assert suggestion_model_path(alone) == tmp_path / SUGGEST_MODEL_NAME
