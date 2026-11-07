"""Small statistics helpers (no numpy dependency)."""

import math
from collections.abc import Iterable


def percentile(values: Iterable[float], q: float) -> float | None:
    """``q``-th percentile (0-100) with linear interpolation between closest ranks (the
    default method of numpy/Excel ``PERCENTILE.INC``). None for no values."""
    xs = sorted(values)
    if not xs:
        return None
    if not 0.0 <= q <= 100.0:
        raise ValueError("q must be within [0, 100]")
    pos = (len(xs) - 1) * q / 100.0
    lo = math.floor(pos)
    hi = math.ceil(pos)
    return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo)


def median(values: Iterable[float]) -> float | None:
    return percentile(values, 50.0)


def mean(values: Iterable[float]) -> float | None:
    xs = list(values)
    if not xs:
        return None
    return math.fsum(xs) / len(xs)
