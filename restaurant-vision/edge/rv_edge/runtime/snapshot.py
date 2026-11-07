"""Setup snapshots: one camera frame with every person blurred, encoded to JPEG in memory.

Privacy: images are processed and encoded in RAM only (``cv2.imencode``); nothing here
touches the filesystem. Privacy masks are filled black again (defence in depth, the vision
pipeline already masks before detection). Frames without pixels (simulated sources) become a
placeholder drawing with each person as a filled grey rectangle.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

import cv2
import numpy as np
from rv_contracts import Frame

from rv_edge.interfaces import Box, SyntheticImage

JPEG_QUALITY = 80
PLACEHOLDER_SIZE = (640, 360)
BOX_PAD = 0.12
"""Fraction of each box's size added on every side before blurring (covers small offsets)."""

_BG = (236, 236, 236)
_PERSON = (128, 128, 128)
_TEXT = (90, 90, 90)


def _is_pixels(image: Any) -> bool:
    return isinstance(image, np.ndarray) and image.ndim in (2, 3) and image.size > 0


def _pixel_rect(box: Box, width: int, height: int, pad: float) -> tuple[int, int, int, int]:
    x1, y1, x2, y2 = box
    bw, bh = max(0.0, x2 - x1), max(0.0, y2 - y1)
    px1 = int(np.floor((x1 - pad * bw) * width))
    py1 = int(np.floor((y1 - pad * bh) * height))
    px2 = int(np.ceil((x2 + pad * bw) * width))
    py2 = int(np.ceil((y2 + pad * bh) * height))
    return (
        max(0, min(width, px1)),
        max(0, min(height, py1)),
        max(0, min(width, px2)),
        max(0, min(height, py2)),
    )


def blur_boxes(image: np.ndarray, boxes: Sequence[Box], *, pad: float = BOX_PAD) -> np.ndarray:
    """Return a copy of ``image`` with a strong Gaussian blur over every (padded) box."""
    out = image.copy()
    height, width = out.shape[:2]
    for box in boxes:
        x1, y1, x2, y2 = _pixel_rect(box, width, height, pad)
        if x2 - x1 < 2 or y2 - y1 < 2:
            continue
        roi = out[y1:y2, x1:x2]
        rh, rw = roi.shape[:2]
        # Blur a downscaled copy (cheap, very strong), then blur again at full size so no
        # blocky detail survives.
        small = cv2.resize(roi, (max(1, rw // 12), max(1, rh // 12)), interpolation=cv2.INTER_AREA)
        small = cv2.GaussianBlur(small, (0, 0), sigmaX=2.0)
        restored = cv2.resize(small, (rw, rh), interpolation=cv2.INTER_LINEAR)
        sigma = max(3.0, min(rw, rh) / 8.0)
        out[y1:y2, x1:x2] = cv2.GaussianBlur(restored, (0, 0), sigmaX=sigma)
    return out


def fill_masks(image: np.ndarray, masks: Sequence[Sequence[tuple[float, float]]]) -> np.ndarray:
    """Fill each normalized polygon black, in place. Returns ``image``."""
    height, width = image.shape[:2]
    color = (0, 0, 0) if image.ndim == 3 else 0
    for polygon in masks:
        if len(polygon) < 3:
            continue
        pts = np.array(
            [[round(x * (width - 1)), round(y * (height - 1))] for x, y in polygon], dtype=np.int32
        )
        cv2.fillPoly(image, [pts], color)
    return image


def render_placeholder(
    boxes: Sequence[Box],
    *,
    width: int = PLACEHOLDER_SIZE[0],
    height: int = PLACEHOLDER_SIZE[1],
    label: str = "simulated camera",
) -> np.ndarray:
    """A neutral drawing with every person as a filled grey rectangle (no real pixels)."""
    image = np.full((height, width, 3), _BG, dtype=np.uint8)
    for box in boxes:
        x1, y1, x2, y2 = _pixel_rect(box, width, height, 0.0)
        if x2 > x1 and y2 > y1:
            cv2.rectangle(image, (x1, y1), (x2 - 1, y2 - 1), _PERSON, thickness=-1)
    cv2.putText(image, label, (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.7, _TEXT, 2, cv2.LINE_AA)
    return image


def _placeholder_size(frame: Frame | None) -> tuple[int, int]:
    if frame is None or frame.width <= 0 or frame.height <= 0:
        return PLACEHOLDER_SIZE
    scale = min(1.0, PLACEHOLDER_SIZE[0] / frame.width)
    return max(64, int(frame.width * scale)), max(36, int(frame.height * scale))


def compose_snapshot(
    frame: Frame | None,
    boxes: Sequence[Box],
    masks: Sequence[Sequence[tuple[float, float]]] = (),
    *,
    placeholder_label: str = "simulated camera",
) -> np.ndarray:
    """The image to show in setup: real pixels with people blurred and masks blacked out,
    or a placeholder when the frame has no pixels."""
    if frame is not None and _is_pixels(frame.image):
        image = blur_boxes(np.ascontiguousarray(frame.image), boxes)
        return fill_masks(image, masks)
    people = list(boxes)
    if frame is not None and isinstance(frame.image, SyntheticImage):
        people.extend(p.box for p in frame.image.people)
    width, height = _placeholder_size(frame)
    image = render_placeholder(people, width=width, height=height, label=placeholder_label)
    return fill_masks(image, masks)


def encode_jpeg(image: np.ndarray, quality: int = JPEG_QUALITY) -> bytes:
    """Encode to JPEG bytes in memory."""
    ok, buf = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, int(quality)])
    if not ok:
        raise ValueError("JPEG encoding failed")
    return buf.tobytes()
