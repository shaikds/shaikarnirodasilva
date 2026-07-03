"""Denoise the handwriting mask and group ink into answer regions."""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

# All pixel constants below are expressed at the reference DPI and scaled at
# runtime, so the pipeline behaves the same at any rendering resolution.
REF_DPI = 300.0
MIN_COMPONENT_AREA = 40  # px^2: below this is sensor speckle / JPEG noise
CLUSTER_KERNEL = 33  # px: closing kernel that merges strokes into blocks
REGION_PAD = 12  # px: padding around each region crop
MIN_REGION_INK = 150  # px^2: total ink a region needs to survive


@dataclass
class Region:
    bbox: tuple[int, int, int, int]  # x0, y0, x1, y1 in template pixel frame
    ink_area: int  # handwriting pixels inside the bbox


def _scaled(value: float, dpi: float) -> int:
    return max(1, int(round(value * dpi / REF_DPI)))


BORDER_MARGIN = 25  # px: a component this close to the frame edge is "touching"
BORDER_JUNK_AREA = 1200  # px^2: border-touching blobs above this are scan junk
# Components confined to the outer band of the page are photo edge/shadow
# junk: printed A4 documents keep >= 12mm margins, so nothing legitimate
# lives entirely within the outer 6% of the page.
OUTER_BAND_FRAC = 0.06


def denoise(mask: np.ndarray, dpi: float = REF_DPI) -> np.ndarray:
    """Drop specks, hairline ghosts of printed rules, and scan-border junk."""
    min_area = _scaled(MIN_COMPONENT_AREA, dpi) ** 1  # area scales ~linearly after thinning
    H, W = mask.shape
    margin = _scaled(BORDER_MARGIN, dpi)
    junk_area = _scaled(BORDER_JUNK_AREA, dpi)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    keep = np.zeros(n, dtype=bool)
    for i in range(1, n):
        area = stats[i, cv2.CC_STAT_AREA]
        w = stats[i, cv2.CC_STAT_WIDTH]
        h = stats[i, cv2.CC_STAT_HEIGHT]
        if area < min_area:
            continue
        # Photo edges, shadows and page curl produce big blobs pressed
        # against the frame border; real answers sit inside the page.
        x0, y0 = stats[i, cv2.CC_STAT_LEFT], stats[i, cv2.CC_STAT_TOP]
        touches_border = x0 <= margin or y0 <= margin or x0 + w >= W - margin or y0 + h >= H - margin
        if touches_border and (area > junk_area or max(w, h) > 0.25 * max(W, H)):
            continue
        band = OUTER_BAND_FRAC * min(W, H)
        in_outer_band = x0 + w <= band or y0 + h <= band or x0 >= W - band or y0 >= H - band
        if in_outer_band:
            continue
        # Hairline ghost of a printed rule: extremely elongated and thin.
        # Real handwritten lines (e.g. fraction bars) are thicker than 2px
        # of residual ghosting at 300 DPI.
        thickness = area / max(w, h)
        if max(w, h) > 40 * min(w, h) and thickness < _scaled(2.5, dpi):
            continue
        keep[i] = True
    return (keep[labels] * 255).astype(np.uint8)


def group_regions(mask: np.ndarray, dpi: float = REF_DPI) -> list[Region]:
    """Cluster handwriting ink into regions via morphological closing."""
    k = _scaled(CLUSTER_KERNEL, dpi)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    blocks = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    pad = _scaled(REGION_PAD, dpi)
    min_ink = _scaled(MIN_REGION_INK, dpi)
    h, w = mask.shape
    n, labels = cv2.connectedComponents(blocks, connectivity=8)
    regions: list[Region] = []
    for i in range(1, n):
        ys, xs = np.nonzero((labels == i) & (mask > 0))
        if len(xs) == 0:
            continue
        ink = int(len(xs))
        if ink < min_ink:
            continue
        x0, x1 = int(xs.min()), int(xs.max())
        y0, y1 = int(ys.min()), int(ys.max())
        regions.append(
            Region(
                bbox=(max(0, x0 - pad), max(0, y0 - pad), min(w, x1 + pad + 1), min(h, y1 + pad + 1)),
                ink_area=ink,
            )
        )
    regions = _merge_overlapping(regions)
    regions.sort(key=lambda r: (r.bbox[1], r.bbox[0]))
    return regions


def _merge_overlapping(regions: list[Region]) -> list[Region]:
    """Union intersecting bounding boxes so no answer is cropped twice."""
    merged = True
    while merged:
        merged = False
        for i in range(len(regions)):
            for j in range(i + 1, len(regions)):
                a, b = regions[i].bbox, regions[j].bbox
                if a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]:
                    regions[i] = Region(
                        bbox=(min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])),
                        ink_area=regions[i].ink_area + regions[j].ink_area,
                    )
                    del regions[j]
                    merged = True
                    break
            if merged:
                break
    return regions
