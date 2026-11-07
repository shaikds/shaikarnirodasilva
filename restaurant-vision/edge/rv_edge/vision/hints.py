"""Appearance hints: scalar cues computed in RAM per detection and immediately discarded.

The only hint is ``uniform_score``: how similar a person's torso colour is to the site's
calibrated staff uniform, 0..1. No crops, histograms or embeddings are kept or returned.

Colours are ``(hue_deg, saturation, value)`` with hue in ``[0, 360)`` and saturation/value in
``[0, 1]`` (not OpenCV's 0..180 / 0..255 units).
"""

from __future__ import annotations

import math

import cv2
import numpy as np
import numpy.typing as npt

from rv_contracts import AppearanceHints, Frame

from ..interfaces import Box, SyntheticImage
from .bytetrack import box_iou

HSV = tuple[float, float, float]

TORSO_X = (0.25, 0.75)
"""Horizontal extent of the torso crop, as fractions of the box width."""
TORSO_Y = (0.20, 0.50)
"""Vertical extent of the torso crop, as fractions of the box height."""
MIN_CROP_PX = 4
H_BINS, S_BINS, V_BINS = 36, 8, 8
FULL_MATCH_FRACTION = 0.6
"""Fraction of torso pixels in the uniform colour that counts as a perfect match (logos, arms
and shadows cover the rest)."""
ACHROMATIC_S = 0.25
"""Below this saturation a uniform is black/grey/white and is matched by value, not hue."""
DARK_V = 0.25
"""Below this value a uniform is dark/black and is matched by value only."""
HUE_SIGMA_DEG = 20.0

_NO_HINTS = AppearanceHints()


def torso_crop(image: npt.NDArray[np.uint8], box: Box) -> npt.NDArray[np.uint8] | None:
    """View of the torso region of ``box`` (normalized) in ``image``; None if too small."""
    height, width = image.shape[:2]
    x1, y1, x2, y2 = box
    bw, bh = x2 - x1, y2 - y1
    cx1 = max(0, round((x1 + TORSO_X[0] * bw) * width))
    cx2 = min(width, round((x1 + TORSO_X[1] * bw) * width))
    cy1 = max(0, round((y1 + TORSO_Y[0] * bh) * height))
    cy2 = min(height, round((y1 + TORSO_Y[1] * bh) * height))
    if cx2 - cx1 < MIN_CROP_PX or cy2 - cy1 < MIN_CROP_PX:
        return None
    return image[cy1:cy2, cx1:cx2]


def _hsv_histogram(crop: npt.NDArray[np.uint8]) -> npt.NDArray[np.float32]:
    """Normalized ``(H_BINS, S_BINS, V_BINS)`` HSV histogram of a BGR crop."""
    hsv = cv2.cvtColor(np.ascontiguousarray(crop), cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1, 2], None, [H_BINS, S_BINS, V_BINS], [0, 180, 0, 256, 0, 256])
    total = float(hist.sum())
    return np.asarray(hist / total if total > 0 else hist, dtype=np.float32)


def uniform_weights(uniform_hsv: HSV) -> npt.NDArray[np.float32]:
    """How much each histogram bin looks like the uniform colour (0..1 per bin).

    Chromatic uniforms match by hue (Gaussian, circular) among reasonably saturated, lit
    pixels. Dark/black uniforms match by low value regardless of hue (hue is noise in the
    dark). Grey/white uniforms match low-saturation pixels of similar value.
    """
    hue_ref, s_ref, v_ref = uniform_hsv
    h_c = (np.arange(H_BINS) + 0.5) * (360.0 / H_BINS)
    s_c = (np.arange(S_BINS) + 0.5) / S_BINS
    v_c = (np.arange(V_BINS) + 0.5) / V_BINS
    hh, ss, vv = np.meshgrid(h_c, s_c, v_c, indexing="ij")
    if v_ref < DARK_V:
        excess = np.clip(vv - (v_ref + 0.12), 0.0, None)
        weights = np.exp(-0.5 * (excess / 0.06) ** 2)
    elif s_ref < ACHROMATIC_S:
        low_sat = ss <= max(ACHROMATIC_S, s_ref + 0.1)
        weights = low_sat * np.exp(-0.5 * ((vv - v_ref) / 0.2) ** 2)
    else:
        dh = np.abs(hh - hue_ref) % 360.0
        dh = np.minimum(dh, 360.0 - dh)
        sat_ok = ss >= max(0.15, 0.5 * s_ref)
        val_ok = vv >= max(0.15, 0.35 * v_ref)
        weights = np.exp(-0.5 * (dh / HUE_SIGMA_DEG) ** 2) * sat_ok * val_ok
    return np.asarray(weights, dtype=np.float32)


def _validate_hsv(uniform_hsv: HSV) -> HSV:
    hue, sat, val = (float(v) for v in uniform_hsv)
    if not (0.0 <= sat <= 1.0 and 0.0 <= val <= 1.0 and math.isfinite(hue)):
        raise ValueError(
            "uniform_hsv must be (hue_deg 0..360, saturation 0..1, value 0..1), "
            f"got {uniform_hsv!r}"
        )
    return (hue % 360.0, sat, val)


class UniformColorHints:
    """``HintExtractor`` for real frames: torso colour similarity to the calibrated uniform.

    Without a calibration (``uniform_hsv=None``) every hint is ``None``.
    """

    def __init__(self, uniform_hsv: HSV | None) -> None:
        self.uniform_hsv = None if uniform_hsv is None else _validate_hsv(uniform_hsv)
        self._weights = None if self.uniform_hsv is None else uniform_weights(self.uniform_hsv)

    def score(self, image: npt.NDArray[np.uint8], box: Box) -> float | None:
        """0..1 uniform similarity of the person in ``box``; None if not computable."""
        if self._weights is None or image.ndim != 3 or image.shape[2] != 3:
            return None
        crop = torso_crop(image, box)
        if crop is None:
            return None
        matched = float(np.sum(_hsv_histogram(crop) * self._weights))
        return min(1.0, max(0.0, matched / FULL_MATCH_FRACTION))

    def hints_for(self, frame: Frame, box: Box) -> AppearanceHints:
        image = frame.image
        if self._weights is None or not isinstance(image, np.ndarray):
            return _NO_HINTS
        return AppearanceHints(uniform_score=self.score(image, box))


def measure_uniform_hsv(frame: Frame, box: Box) -> HSV:
    """Calibration: the dominant torso colour of the staff member in ``box``.

    Returns ``(hue_deg, saturation, value)``: circular mean hue and median saturation/value of
    the coloured pixels when most of the torso is coloured, else of all pixels (black, grey
    or white uniforms). Raises ``ValueError`` if the frame has no pixels or the box is too
    small.
    """
    image = frame.image
    if not isinstance(image, np.ndarray) or image.ndim != 3 or image.shape[2] != 3:
        raise ValueError("uniform calibration needs a BGR camera frame")
    crop = torso_crop(image, box)
    if crop is None:
        raise ValueError("the selected person is too small to calibrate")
    hsv = cv2.cvtColor(np.ascontiguousarray(crop), cv2.COLOR_BGR2HSV).reshape(-1, 3)
    hue = hsv[:, 0].astype(np.float64) * 2.0
    sat = hsv[:, 1].astype(np.float64) / 255.0
    val = hsv[:, 2].astype(np.float64) / 255.0
    chromatic = (sat >= ACHROMATIC_S) & (val >= DARK_V)
    if chromatic.mean() >= 0.5:
        hue, sat, val = hue[chromatic], sat[chromatic], val[chromatic]
    rad = np.deg2rad(hue)
    mean_hue = math.degrees(math.atan2(float(np.sin(rad).mean()), float(np.cos(rad).mean())))
    return (mean_hue % 360.0, float(np.median(sat)), float(np.median(val)))


class SyntheticHints:
    """``HintExtractor`` for simulated frames: the ``uniform_score`` of the ground-truth person
    that best overlaps the box (IoU >= ``min_iou``)."""

    def __init__(self, min_iou: float = 0.3) -> None:
        self.min_iou = min_iou

    def hints_for(self, frame: Frame, box: Box) -> AppearanceHints:
        image = frame.image
        if not isinstance(image, SyntheticImage) or not image.people:
            return _NO_HINTS
        ious = box_iou(
            np.array([box], dtype=np.float64),
            np.array([p.box for p in image.people], dtype=np.float64),
        )[0]
        best = int(np.argmax(ious))
        if ious[best] < self.min_iou:
            return _NO_HINTS
        return AppearanceHints(uniform_score=image.people[best].uniform_score)


class NullHints:
    """``HintExtractor`` that computes nothing."""

    def hints_for(self, frame: Frame, box: Box) -> AppearanceHints:
        return _NO_HINTS
