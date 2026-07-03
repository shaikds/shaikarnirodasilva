"""Pair each filled page with the template page it was scanned from.

Scans can arrive out of order or with missing pages, so pairing is solved as
an assignment problem over ORB descriptor match scores.
"""

from __future__ import annotations

import cv2
import numpy as np
from scipy.optimize import linear_sum_assignment

from .ingest import Page

_MATCH_SIZE = 900  # longest side used for scoring; keeps this step fast


def _downscale(img: np.ndarray) -> np.ndarray:
    scale = _MATCH_SIZE / max(img.shape)
    if scale >= 1.0:
        return img
    return cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)


def _orb_features(img: np.ndarray, orb: cv2.ORB):
    return orb.detectAndCompute(_downscale(img), None)


def _score(des_a, des_b, matcher) -> float:
    if des_a is None or des_b is None or len(des_a) < 2 or len(des_b) < 2:
        return 0.0
    matches = matcher.knnMatch(des_a, des_b, k=2)
    good = sum(1 for pair in matches if len(pair) == 2 and pair[0].distance < 0.75 * pair[1].distance)
    return good / max(len(des_a), 1)


def match_pages(filled: list[Page], template: list[Page]) -> list[tuple[int, int, float]]:
    """Return (filled_index, template_index, score) for the best assignment.

    Every filled page gets a template page (there are at least as many
    template pages in the normal case); pairs with near-zero score are still
    returned so the caller can flag them.
    """
    orb = cv2.ORB_create(nfeatures=1500)
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
    des_f = [_orb_features(p.image, orb)[1] for p in filled]
    des_t = [_orb_features(p.image, orb)[1] for p in template]

    scores = np.zeros((len(filled), len(template)))
    for i, df in enumerate(des_f):
        for j, dt in enumerate(des_t):
            scores[i, j] = _score(df, dt, matcher)

    # Hungarian assignment on negative score (maximize total match quality)
    rows, cols = linear_sum_assignment(-scores)
    return [(int(i), int(j), float(scores[i, j])) for i, j in zip(rows, cols)]
