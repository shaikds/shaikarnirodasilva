from __future__ import annotations

import cv2
import numpy as np
import pytest

from rv_edge.interfaces import Box, HintExtractor, SyntheticPerson
from rv_edge.vision.hints import (
    NullHints,
    SyntheticHints,
    UniformColorHints,
    measure_uniform_hsv,
)

from .fakes import H, W, pixel_frame, synthetic_frame

BOX: Box = (0.40, 0.20, 0.50, 0.90)
RED = (30, 30, 200)  # BGR
BLUE = (200, 60, 30)
BLACK = (25, 25, 25)
WHITE = (240, 240, 240)


def scene(
    shirt: tuple[int, int, int], *, logo: tuple[int, int, int] | None = None, logo_frac: float = 0.0
) -> np.ndarray:
    """Grey background with one person in ``BOX`` wearing ``shirt`` (optionally a logo)."""
    image = np.full((H, W, 3), 128, dtype=np.uint8)
    x1, y1, x2, y2 = int(BOX[0] * W), int(BOX[1] * H), int(BOX[2] * W), int(BOX[3] * H)
    image[y1:y2, x1:x2] = shirt
    if logo is not None and logo_frac > 0:
        cols = int((x2 - x1) * logo_frac)
        image[y1:y2, x1 : x1 + cols] = logo
    return image


def hsv_bgr(h_deg: float, s: float, v: float) -> tuple[int, int, int]:
    px = np.array([[[round(h_deg / 2) % 180, round(s * 255), round(v * 255)]]], dtype=np.uint8)
    b, g, r = cv2.cvtColor(px, cv2.COLOR_HSV2BGR)[0, 0]
    return (int(b), int(g), int(r))


def score(extractor: UniformColorHints, image: np.ndarray, box: Box = BOX) -> float | None:
    return extractor.hints_for(pixel_frame(image), box).uniform_score


def test_measure_uniform_hsv_on_red_shirt() -> None:
    hue, sat, val = measure_uniform_hsv(pixel_frame(scene(RED)), BOX)
    assert min(hue, 360 - hue) < 5
    assert sat > 0.8 and val == pytest.approx(200 / 255, abs=0.02)
    assert measure_uniform_hsv(scene(RED), BOX) == (hue, sat, val), "accepts a bare image"


def test_red_uniform_scores() -> None:
    hints = UniformColorHints(measure_uniform_hsv(pixel_frame(scene(RED)), BOX))
    assert score(hints, scene(RED)) == pytest.approx(1.0)
    assert score(hints, scene(BLUE)) == pytest.approx(0.0, abs=0.02)
    assert score(hints, scene(WHITE)) == pytest.approx(0.0, abs=0.02)
    assert score(hints, scene(BLACK)) == pytest.approx(0.0, abs=0.02)
    # A logo on 30% of the torso still reads as uniform; 70% blue is mostly not.
    assert score(hints, scene(RED, logo=BLUE, logo_frac=0.3)) == pytest.approx(1.0)
    partial = score(hints, scene(RED, logo=BLUE, logo_frac=0.7))
    assert partial is not None and 0.2 < partial < 0.8


def test_hue_wraps_around_red() -> None:
    hints = UniformColorHints((358.0, 0.85, 0.8))
    assert score(hints, scene(hsv_bgr(4.0, 0.85, 0.8))) == pytest.approx(1.0)


def test_black_uniform_matched_by_value() -> None:
    hsv = measure_uniform_hsv(pixel_frame(scene(BLACK)), BOX)
    assert hsv[2] < 0.15
    hints = UniformColorHints(hsv)
    assert score(hints, scene(BLACK)) == pytest.approx(1.0)
    assert score(hints, scene((20, 15, 60))) == pytest.approx(1.0)  # dark red: still "dark"
    assert score(hints, scene(WHITE)) == pytest.approx(0.0, abs=0.02)
    assert score(hints, scene(RED)) == pytest.approx(0.0, abs=0.02)
    assert score(hints, scene((128, 128, 128))) == pytest.approx(0.0, abs=0.02)


def test_white_uniform_matched_by_low_saturation_and_value() -> None:
    hints = UniformColorHints(measure_uniform_hsv(pixel_frame(scene(WHITE)), BOX))
    assert score(hints, scene(WHITE)) == pytest.approx(1.0)
    assert score(hints, scene(BLACK)) == pytest.approx(0.0, abs=0.02)
    assert score(hints, scene(RED)) == pytest.approx(0.0, abs=0.02)


def test_uncomputable_hints_are_none() -> None:
    assert score(UniformColorHints(None), scene(RED)) is None
    hints = UniformColorHints((0.0, 0.8, 0.8))
    assert score(hints, scene(RED), box=(0.40, 0.20, 0.405, 0.21)) is None  # too small
    assert hints.hints_for(synthetic_frame([BOX]), BOX).uniform_score is None
    with pytest.raises(ValueError):
        UniformColorHints((0.0, 200.0, 255.0))  # OpenCV units are rejected
    with pytest.raises(ValueError):
        measure_uniform_hsv(synthetic_frame([BOX]), BOX)
    with pytest.raises(ValueError):
        measure_uniform_hsv(pixel_frame(scene(RED)), (0.40, 0.20, 0.405, 0.21))


def test_synthetic_hints_use_best_overlapping_person() -> None:
    staff = SyntheticPerson(box=(0.10, 0.10, 0.20, 0.60), uniform_score=0.95)
    guest = SyntheticPerson(box=(0.60, 0.10, 0.70, 0.60), uniform_score=0.05)
    frame = synthetic_frame([staff, guest])
    hints = SyntheticHints()
    assert hints.hints_for(frame, (0.11, 0.11, 0.21, 0.61)).uniform_score == 0.95
    assert hints.hints_for(frame, (0.60, 0.12, 0.70, 0.62)).uniform_score == 0.05
    assert hints.hints_for(frame, (0.35, 0.10, 0.45, 0.60)).uniform_score is None
    assert hints.hints_for(synthetic_frame([]), BOX).uniform_score is None
    assert hints.hints_for(pixel_frame(), BOX).uniform_score is None


def test_null_hints_and_protocol() -> None:
    extractors: list[HintExtractor] = [NullHints(), SyntheticHints(), UniformColorHints(None)]
    for extractor in extractors:
        assert extractor.hints_for(pixel_frame(), BOX).uniform_score is None
