"""Photometric normalization and template subtraction (form dropout)."""

from __future__ import annotations

import cv2
import numpy as np
from skimage.filters import threshold_sauvola

# Dilation radius (px at 300 DPI) applied to template ink before subtraction.
# Absorbs residual misalignment so printed strokes never ghost into the
# handwriting mask.
TEMPLATE_DILATE_PX = 5
# A connected component of filled ink is kept (in full) if at least this many
# of its pixels fall outside the dilated template — this reclaims handwriting
# that crosses printed lines instead of amputating it.
MIN_NEW_INK_PX = 30
# ...but only if the new ink is also a meaningful fraction of the component,
# otherwise printed text touched by a stray dot would be swallowed whole.
MIN_NEW_INK_FRAC = 0.12

# Proximity-ghost filter: the physical print can differ slightly from the
# blank PDF (bolder glyphs, different dash style on the same path, small
# reflow). Such elements survive subtraction, but virtually all their pixels
# hug the template structure — unlike handwriting. The template ink is first
# closed with GHOST_CLOSE_PX (bridging dash gaps and glyph spacing into
# continuous bands), then components whose pixels are ≥ GHOST_FRAC within
# GHOST_DIST_PX of that structure are dropped.
GHOST_CLOSE_PX = 21
GHOST_DIST_PX = 6
GHOST_FRAC = 0.80

_SAUVOLA_WINDOW = 41


def flatten_background(gray: np.ndarray) -> np.ndarray:
    """Divide out low-frequency illumination (shadows, camera vignetting)."""
    bg = cv2.medianBlur(gray, 51)
    bg = np.maximum(bg, 1)
    flat = (gray.astype(np.float32) / bg.astype(np.float32)) * 255.0
    return np.clip(flat, 0, 255).astype(np.uint8)


def ink_mask(gray: np.ndarray, window: int = _SAUVOLA_WINDOW) -> np.ndarray:
    """Binary ink map (255 = ink) via background flattening + Sauvola."""
    flat = flatten_background(gray)
    thresh = threshold_sauvola(flat, window_size=window, k=0.2)
    return ((flat < thresh) * 255).astype(np.uint8)


def dropout(
    filled_ink: np.ndarray,
    template_ink: np.ndarray,
    dilate_px: int = TEMPLATE_DILATE_PX,
) -> np.ndarray:
    """Remove template ink from the filled ink map, keeping whole strokes.

    Returns a binary mask (255 = handwriting) in the template pixel frame.
    """
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * dilate_px + 1, 2 * dilate_px + 1))
    template_zone = cv2.dilate(template_ink, kernel)

    # Pixel-level new ink is always kept: the dilated zone has already
    # absorbed misregistration ghosts, so whatever survives is handwriting
    # (possibly with a gap where it crosses a printed stroke).
    new_ink = cv2.bitwise_and(filled_ink, cv2.bitwise_not(template_zone))
    mask = new_ink > 0

    # Component-level reclaim: for each connected blob of filled ink with
    # enough new ink — and where new ink is a meaningful fraction of the blob
    # (so a long printed line touched by a stroke is not swallowed whole) —
    # restore the entire blob, filling the gap across printed strokes.
    n, labels, stats, _ = cv2.connectedComponentsWithStats(filled_ink, connectivity=8)
    new_counts = np.bincount(labels[mask], minlength=n)
    total_counts = stats[:, cv2.CC_STAT_AREA]
    keep = (new_counts >= MIN_NEW_INK_PX) & (
        new_counts.astype(np.float32) / np.maximum(total_counts, 1) >= MIN_NEW_INK_FRAC
    )
    keep[0] = False  # background label
    mask |= keep[labels]

    # Proximity-ghost filter (see constants above): drop components that
    # trace the template structure almost everywhere — print/PDF
    # micro-discrepancies rather than handwriting.
    mask_u8 = (mask * 255).astype(np.uint8)
    return drop_traced_components(
        mask_u8, template_ink, dist_px=GHOST_DIST_PX, frac=GHOST_FRAC, close_px=GHOST_CLOSE_PX
    )


def drop_traced_components(
    mask: np.ndarray,
    reference_ink: np.ndarray,
    dist_px: int,
    frac: float,
    close_px: int = 0,
) -> np.ndarray:
    """Remove mask components whose pixels overwhelmingly hug `reference_ink`.

    Kills print/PDF micro-discrepancies: printed elements that differ
    slightly from the blank PDF still trace its structure almost everywhere,
    unlike handwriting.
    """
    if close_px > 1:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close_px, close_px))
        reference_ink = cv2.morphologyEx(reference_ink, cv2.MORPH_CLOSE, k)
    dist = cv2.distanceTransform(cv2.bitwise_not(reference_ink), cv2.DIST_L2, 5)
    on = mask > 0
    n, labels = cv2.connectedComponents(mask, connectivity=8)
    near_counts = np.bincount(labels[on & (dist <= dist_px)], minlength=n)
    total = np.bincount(labels[on], minlength=n)
    traced = near_counts.astype(np.float32) / np.maximum(total, 1) >= frac
    traced[0] = False
    return ((on & ~traced[labels]) * 255).astype(np.uint8)


_CELL_PX = 72  # locally-rigid matching cell size
_MIN_CELL_PX = 25  # ignore cells with fewer component pixels than this
_COHERENCE_PX = 12  # neighbouring cells' best shifts may differ by this much


def drop_shape_matched_components(
    mask: np.ndarray,
    peer_ink: np.ndarray,
    search_px: int = 80,
    dist_px: int = 3,
    frac: float = 0.90,
) -> np.ndarray:
    """Consensus filter against another filled copy of the same exam.

    A printed element that leaked past template subtraction (e.g. a floating
    drawing object that reflowed between printings) appears in every copy
    with the *same shape*, possibly shifted or gently bent. Each component is
    matched against the peer's ink cell-by-cell (locally rigid, globally
    deformable): a cell matches when some translation within ±search_px puts
    ≥ frac of its pixels within dist_px of peer ink. The component is dropped
    when its overall matched coverage is ≥ frac AND the per-cell shifts form
    a coherent, slowly-varying field. Freehand strokes by different students
    never match that tightly and coherently, so handwriting survives.
    """
    H, W = mask.shape
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * dist_px + 1, 2 * dist_px + 1))
    peer_near = cv2.dilate((peer_ink > 0).astype(np.float32), kernel)
    out = mask.copy()
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        comp = (labels[y : y + h, x : x + w] == i).astype(np.float32)

        covered = 0.0
        shifts: list[tuple[float, float, float]] = []  # (dx, dy, weight)
        for cy in range(0, h, _CELL_PX):
            for cx in range(0, w, _CELL_PX):
                cell = comp[cy : cy + _CELL_PX, cx : cx + _CELL_PX]
                cell_px = float(cell.sum())
                if cell_px < _MIN_CELL_PX:
                    continue
                gy, gx = y + cy, x + cx  # cell origin in page coords
                py0, px0 = max(0, gy - search_px), max(0, gx - search_px)
                py1 = min(H, gy + cell.shape[0] + search_px)
                px1 = min(W, gx + cell.shape[1] + search_px)
                patch = peer_near[py0:py1, px0:px1]
                if patch.shape[0] < cell.shape[0] or patch.shape[1] < cell.shape[1]:
                    continue
                # response at each shift = cell pixels covered by peer ink
                resp = cv2.matchTemplate(patch, cell, cv2.TM_CCORR)
                _, best, _, loc = cv2.minMaxLoc(resp)
                if best / cell_px >= frac:
                    covered += best
                    shifts.append((px0 + loc[0] - gx, py0 + loc[1] - gy, cell_px))
                # cells below frac contribute nothing: partial hits on a
                # peer's unrelated strokes must not accumulate into a match

        if not shifts or covered / area < frac:
            continue
        dxs = np.array([s[0] for s in shifts])
        dys = np.array([s[1] for s in shifts])
        wts = np.array([s[2] for s in shifts])
        mdx = float(np.average(dxs, weights=wts))
        mdy = float(np.average(dys, weights=wts))
        spread = np.sqrt((dxs - mdx) ** 2 + (dys - mdy) ** 2)
        # allow a slowly-varying field (curvature differences) but reject
        # scattered accidental matches
        if float(np.percentile(spread, 75)) <= max(_COHERENCE_PX, 0.05 * max(w, h)):
            out[y : y + h, x : x + w][comp > 0] = 0
    return out
