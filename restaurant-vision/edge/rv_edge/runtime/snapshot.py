"""Setup snapshots: one camera frame with every person blurred, encoded to JPEG in memory.

Privacy: images are processed and encoded in RAM only (``cv2.imencode``); nothing here
touches the filesystem. Privacy masks are filled black again (defence in depth, the vision
pipeline already masks before detection). Frames without pixels (simulated sources) become a
placeholder drawing with each person as a filled grey rectangle.

Live view (``GET /local/cameras/{id}/live.mjpeg``, 1.3): :func:`compose_live_frame` is the
snapshot plus every table zone of the camera drawn as a translucent polygon coloured by its
live state (:data:`STATE_COLORS_RGB`), its label and the time since ``since_ts``. Masks are
filled again after the overlay, so they stay solid black.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np
from rv_contracts import Frame, SiteConfig, TableLive, TableState, ZoneKind

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


# --------------------------------------------------------------------------- live view overlay

STATE_COLORS_RGB: Mapping[TableState, tuple[int, int, int]] = {
    TableState.EMPTY: (156, 163, 175),  # gray
    TableState.SEATED: (245, 158, 11),  # amber
    TableState.ATTENDED: (34, 197, 94),  # green
    TableState.NEEDS_BUSSING: (59, 130, 246),  # blue
}
"""Live-view fill colour of each table state (RGB; the edge-ui legend uses the same)."""

OVERLAY_ALPHA = 0.4
"""Opacity of the table fill."""


def state_color_bgr(state: TableState) -> tuple[int, int, int]:
    r, g, b = STATE_COLORS_RGB[state]
    return (b, g, r)


@dataclass(frozen=True, slots=True)
class TableOverlay:
    """One table zone to draw on the live view."""

    polygon: Sequence[tuple[float, float]]
    label: str
    state: TableState
    since_ts: float | None


def table_overlays(
    config: SiteConfig | None, camera_id: str, tables: Sequence[TableLive]
) -> list[TableOverlay]:
    """Table zones drawn on ``camera_id`` with the live state of their table (``empty`` when
    the table has no live state, e.g. the tables module is off)."""
    if config is None:
        return []
    live = {t.table_id: t for t in tables}
    labels = {t.table_id: t.label for t in config.tables}
    out: list[TableOverlay] = []
    for zone in config.zones_for(camera_id, ZoneKind.TABLE):
        if zone.polygon is None or zone.table_id is None:
            continue
        state = live.get(zone.table_id)
        out.append(
            TableOverlay(
                polygon=[(float(x), float(y)) for x, y in zone.polygon],
                label=labels.get(zone.table_id, zone.table_id),
                state=state.state if state is not None else TableState.EMPTY,
                since_ts=state.since_ts if state is not None else None,
            )
        )
    return out


def format_elapsed(seconds: float) -> str:
    """``m:ss`` below an hour, ``h:mm`` from then on."""
    total = max(0, int(seconds))
    if total < 3600:
        return f"{total // 60}:{total % 60:02d}"
    return f"{total // 3600}:{(total % 3600) // 60:02d}"


def _ascii_label(label: str, fallback: str) -> str:
    """OpenCV's Hershey fonts draw ASCII only (a Hebrew label would show as ``???``)."""
    return label if label.isascii() and label.isprintable() else fallback


def draw_table_overlays(
    image: np.ndarray, overlays: Sequence[TableOverlay], now: float
) -> np.ndarray:
    """Draw ``overlays`` on a BGR ``image`` in place (translucent fill, outline, label and
    timer). Returns ``image``."""
    if not overlays:
        return image
    height, width = image.shape[:2]
    shapes = []
    fill = image.copy()
    for i, ov in enumerate(overlays):
        if len(ov.polygon) < 3:
            continue
        pts = np.array(
            [[round(x * (width - 1)), round(y * (height - 1))] for x, y in ov.polygon],
            dtype=np.int32,
        )
        cv2.fillPoly(fill, [pts], state_color_bgr(ov.state))
        shapes.append((i, ov, pts))
    cv2.addWeighted(fill, OVERLAY_ALPHA, image, 1.0 - OVERLAY_ALPHA, 0.0, dst=image)
    scale = max(0.4, min(1.0, width / 1280.0))
    for i, ov, pts in shapes:
        cv2.polylines(image, [pts], True, state_color_bgr(ov.state), 2, cv2.LINE_AA)
        lines = [_ascii_label(ov.label, f"T{i + 1}")]
        if ov.since_ts is not None and ov.state is not TableState.EMPTY:
            lines.append(format_elapsed(now - ov.since_ts))
        cx, cy = (int(v) for v in pts.mean(axis=0))
        y = cy - int(10 * scale * (len(lines) - 1))
        for text in lines:
            (tw, th), base = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.6 * scale * 1.4, 2)
            x = cx - tw // 2
            cv2.rectangle(image, (x - 3, y - th - 3), (x + tw + 3, y + base), (32, 32, 32), -1)
            cv2.putText(
                image,
                text,
                (x, y),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6 * scale * 1.4,
                (255, 255, 255),
                2,
                cv2.LINE_AA,
            )
            y += th + base + 6
    return image


def compose_live_frame(
    frame: Frame | None,
    boxes: Sequence[Box],
    masks: Sequence[Sequence[tuple[float, float]]],
    overlays: Sequence[TableOverlay],
    *,
    now: float,
    placeholder_label: str = "simulated camera",
) -> np.ndarray:
    """One live-view frame: the snapshot (people blurred, masks black, placeholder for
    simulated sources) with the table overlay, masks filled black again on top."""
    image = compose_snapshot(frame, boxes, masks, placeholder_label=placeholder_label)
    if image.ndim == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    draw_table_overlays(image, overlays, now)
    return fill_masks(image, masks)
