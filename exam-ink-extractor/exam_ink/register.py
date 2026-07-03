"""Three-stage registration of a filled scan onto the blank template.

1. Coarse: SIFT keypoints + Lowe ratio test + RANSAC homography.
2. Fine:   ECC (enhanced correlation coefficient) refinement.
3. Local:  per-tile phase correlation -> smooth displacement field, to absorb
           non-rigid residuals from paper bend that no homography can model.

Every stage reports a quality metric; `RegistrationResult.low_confidence`
flags pages where alignment cannot be trusted instead of failing silently.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

# Quality thresholds tuned for 300 DPI exam pages
MIN_INLIER_RATIO = 0.15
MIN_INLIERS = 25
MIN_ECC = 0.35
MAX_MEDIAN_RESIDUAL_PX = 6.0

_ECC_SIZE = 1200  # longest side for ECC refinement (dense, so keep small)
# Local realignment runs coarse-to-fine; each pass is (cols, rows, max_shift_px).
# Camera scans show residuals of 10px+ that vary across the page (paper bend,
# print scale), so the first pass allows large shifts and the second tightens.
_LOCAL_PASSES = [(8, 6, 25.0), (16, 12, 8.0)]


@dataclass
class RegistrationResult:
    aligned: np.ndarray | None  # filled scan warped into template frame
    inlier_ratio: float = 0.0
    n_inliers: int = 0
    ecc_score: float = 0.0
    median_residual_px: float = 0.0
    low_confidence: bool = True
    reasons: list[str] = field(default_factory=list)


def _coarse_homography(filled: np.ndarray, template: np.ndarray):
    sift = cv2.SIFT_create(nfeatures=4000)
    kp_f, des_f = sift.detectAndCompute(filled, None)
    kp_t, des_t = sift.detectAndCompute(template, None)
    if des_f is None or des_t is None or len(kp_f) < 10 or len(kp_t) < 10:
        return None, 0.0, 0
    matcher = cv2.BFMatcher(cv2.NORM_L2)
    matches = matcher.knnMatch(des_f, des_t, k=2)
    good = [m for m, n in (p for p in matches if len(p) == 2) if m.distance < 0.75 * n.distance]
    if len(good) < 10:
        return None, 0.0, 0
    src = np.float32([kp_f[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    dst = np.float32([kp_t[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
    H, mask = cv2.findHomography(src, dst, cv2.RANSAC, 4.0)
    if H is None:
        return None, 0.0, 0
    n_inliers = int(mask.sum())
    return H, n_inliers / len(good), n_inliers


def _ecc_refine(warped: np.ndarray, template: np.ndarray) -> tuple[np.ndarray | None, float]:
    """Refine alignment with ECC on downscaled images; returns (H_refine, ecc)."""
    scale = min(1.0, _ECC_SIZE / max(template.shape))
    small_w = cv2.resize(warped, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    small_t = cv2.resize(template, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    warp = np.eye(3, dtype=np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 100, 1e-6)
    try:
        ecc, warp = cv2.findTransformECC(
            small_t, small_w, warp, cv2.MOTION_HOMOGRAPHY, criteria, None, 5
        )
    except cv2.error:
        return None, 0.0
    # Rescale the homography from the small frame back to full resolution
    S = np.diag([scale, scale, 1.0]).astype(np.float32)
    H_full = np.linalg.inv(S) @ warp @ S
    # findTransformECC maps template->warped; we need the inverse to correct warped
    return np.linalg.inv(H_full).astype(np.float32), float(ecc)


def _ink_emphasis(gray: np.ndarray) -> np.ndarray:
    """Lighting-invariant view for correlation: bright strokes on black."""
    bg = cv2.medianBlur(gray, 51)
    flat = np.clip(bg.astype(np.int16) - gray.astype(np.int16), 0, 255).astype(np.uint8)
    return cv2.GaussianBlur(flat, (5, 5), 0).astype(np.float32)


def _local_displacement(
    warped: np.ndarray, template: np.ndarray, cols: int, rows: int, max_shift: float
) -> tuple[np.ndarray, float]:
    """Per-tile phase correlation -> dense smooth displacement field.

    Returns (flow HxWx2 mapping template coords -> warped coords offsets,
    median residual shift in px). Correlation runs on ink-emphasized images
    so it locks onto strokes rather than illumination.
    """
    h, w = template.shape
    t_ink = _ink_emphasis(template)
    w_ink = _ink_emphasis(warped)
    th, tw = h // rows, w // cols
    win = cv2.createHanningWindow((tw, th), cv2.CV_32F)
    shifts = np.zeros((rows, cols, 2), dtype=np.float32)
    weights = np.zeros((rows, cols), dtype=np.float32)
    for r in range(rows):
        for c in range(cols):
            y0, x0 = r * th, c * tw
            t_tile = t_ink[y0 : y0 + th, x0 : x0 + tw]
            w_tile = w_ink[y0 : y0 + th, x0 : x0 + tw]
            if t_tile.std() < 1.0 or w_tile.std() < 1.0:
                continue  # blank tile, no signal to correlate
            (dx, dy), response = cv2.phaseCorrelate(t_tile, w_tile, win)
            if response < 0.03 or abs(dx) > max_shift or abs(dy) > max_shift:
                continue
            shifts[r, c] = (dx, dy)
            weights[r, c] = response

    valid = weights > 0
    if not valid.any():
        return np.zeros((h, w, 2), dtype=np.float32), 0.0
    # Fill empty tiles with the weighted mean, then smooth across the grid so
    # the field varies gently (paper bend is low-frequency).
    mean_shift = (shifts * weights[..., None]).sum((0, 1)) / weights.sum()
    shifts[~valid] = mean_shift
    shifts = cv2.GaussianBlur(shifts, (3, 3), 0)
    flow = cv2.resize(shifts, (w, h), interpolation=cv2.INTER_CUBIC)
    residual = float(np.median(np.linalg.norm(shifts[valid], axis=-1)))
    return flow, residual


def _apply_flow(img: np.ndarray, flow: np.ndarray) -> np.ndarray:
    h, w = img.shape
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    map_x = gx + flow[:, :, 0]
    map_y = gy + flow[:, :, 1]
    return cv2.remap(img, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def register(filled: np.ndarray, template: np.ndarray) -> RegistrationResult:
    """Warp `filled` into the pixel frame of `template`."""
    res = RegistrationResult(aligned=None)
    H, inlier_ratio, n_inliers = _coarse_homography(filled, template)
    res.inlier_ratio, res.n_inliers = inlier_ratio, n_inliers
    if H is None:
        res.reasons.append("coarse homography failed")
        return res

    h, w = template.shape
    aligned = cv2.warpPerspective(
        filled, H, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE
    )

    H_ecc, ecc = _ecc_refine(aligned, template)
    res.ecc_score = ecc
    if H_ecc is not None and ecc > 0:
        aligned = cv2.warpPerspective(
            aligned, H_ecc, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE
        )

    for cols, rows, max_shift in _LOCAL_PASSES:
        flow, residual = _local_displacement(aligned, template, cols, rows, max_shift)
        aligned = _apply_flow(aligned, flow)
        res.median_residual_px = residual

    res.aligned = aligned
    if n_inliers < MIN_INLIERS or inlier_ratio < MIN_INLIER_RATIO:
        res.reasons.append(f"weak keypoint support ({n_inliers} inliers, ratio {inlier_ratio:.2f})")
    if ecc < MIN_ECC:
        res.reasons.append(f"low ECC correlation ({ecc:.2f})")
    if residual > MAX_MEDIAN_RESIDUAL_PX:
        res.reasons.append(f"large local residual ({residual:.1f}px)")
    res.low_confidence = bool(res.reasons)
    return res
