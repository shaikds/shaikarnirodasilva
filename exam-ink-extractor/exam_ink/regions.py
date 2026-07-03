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


def group_regions(
    mask: np.ndarray, dpi: float = REF_DPI, cut_lines: list[int] | None = None
) -> list[Region]:
    """Cluster handwriting ink into regions via morphological closing.

    `cut_lines` are horizontal question-zone boundaries (px): clustering never
    bridges them, so answers to adjacent (sub)questions stay separate regions.
    Ink strokes are never split — a stroke crossing a boundary follows the
    side holding most of its pixels.
    """
    k = _scaled(CLUSTER_KERNEL, dpi)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    blocks = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    h, w = mask.shape
    cuts = sorted(int(y) for y in (cut_lines or []) if 0 < y < h)
    for y in cuts:
        blocks[y, :] = 0  # a 1px gap: 8-connectivity cannot jump 2 rows

    n, labels = cv2.connectedComponents(blocks, connectivity=8)
    ni, ilabels, istats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if ni <= 1 or n <= 1:
        return []
    # Assign each ink component wholly to the block owning most of its pixels
    pair = ilabels.astype(np.int64) * np.int64(n) + labels.astype(np.int64)
    counts = np.bincount(pair[mask > 0], minlength=ni * n).reshape(ni, n)
    counts[:, 0] = 0  # pixels landing on a cut row / outside any block
    owner = counts.argmax(axis=1)

    groups: dict[int, list[int]] = {}
    for ic in range(1, ni):
        if counts[ic].sum() > 0 and owner[ic] > 0:
            groups.setdefault(int(owner[ic]), []).append(ic)

    pad = _scaled(REGION_PAD, dpi)
    min_ink = _scaled(MIN_REGION_INK, dpi)
    regions: list[Region] = []
    for comps in groups.values():
        ink = int(sum(istats[c, cv2.CC_STAT_AREA] for c in comps))
        if ink < min_ink:
            continue
        x0 = int(min(istats[c, cv2.CC_STAT_LEFT] for c in comps))
        y0 = int(min(istats[c, cv2.CC_STAT_TOP] for c in comps))
        x1 = int(max(istats[c, cv2.CC_STAT_LEFT] + istats[c, cv2.CC_STAT_WIDTH] for c in comps))
        y1 = int(max(istats[c, cv2.CC_STAT_TOP] + istats[c, cv2.CC_STAT_HEIGHT] for c in comps))
        regions.append(
            Region(
                bbox=(max(0, x0 - pad), max(0, y0 - pad), min(w, x1 + pad + 1), min(h, y1 + pad + 1)),
                ink_area=ink,
            )
        )
    regions = _merge_overlapping(regions, cuts)
    regions.sort(key=lambda r: (r.bbox[1], r.bbox[0]))
    return regions


def _band(cuts: list[int], y: float) -> int:
    import bisect

    return bisect.bisect(cuts, y)


def _merge_overlapping(regions: list[Region], cuts: list[int]) -> list[Region]:
    """Union intersecting boxes so no answer is cropped twice — but never
    across a question-zone boundary."""
    merged = True
    while merged:
        merged = False
        for i in range(len(regions)):
            for j in range(i + 1, len(regions)):
                a, b = regions[i].bbox, regions[j].bbox
                if not (a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]):
                    continue
                if _band(cuts, (a[1] + a[3]) / 2) != _band(cuts, (b[1] + b[3]) / 2):
                    continue
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
