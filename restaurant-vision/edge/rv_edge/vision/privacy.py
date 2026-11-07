"""Privacy masks: blacked-out regions applied to every frame **before** detection."""

from __future__ import annotations

import dataclasses
from collections.abc import Sequence

import cv2
import numpy as np

from rv_contracts import Anchor, Frame, anchor_point, point_in_polygon

from ..interfaces import SyntheticImage

PolygonLike = Sequence[tuple[float, float]]


def apply_masks(
    frame: Frame, polygons: Sequence[PolygonLike], *, anchor: Anchor = Anchor.FOOT
) -> Frame:
    """Return ``frame`` with every polygon (normalized coordinates) masked out.

    * numpy images: polygons are filled black with ``cv2.fillPoly`` on a copy; the input
      frame is not modified.
    * ``SyntheticImage``: people whose ``anchor`` point lies inside a mask are removed,
      emulating what pixel masking does to a real detector.
    * ``None`` images pass through.

    With no polygons the same frame object is returned.
    """
    if not polygons:
        return frame
    image = frame.image
    if image is None:
        return frame
    if isinstance(image, SyntheticImage):
        kept = tuple(
            person
            for person in image.people
            if not any(
                point_in_polygon(anchor_point(person.box, anchor), poly) for poly in polygons
            )
        )
        if len(kept) == len(image.people):
            return frame
        return dataclasses.replace(frame, image=SyntheticImage(people=kept))
    if isinstance(image, np.ndarray):
        height, width = image.shape[:2]
        scale = np.array([width, height], dtype=np.float64)
        pts = [
            np.round(np.asarray(poly, dtype=np.float64).reshape(-1, 2) * scale).astype(np.int32)
            for poly in polygons
            if len(poly) >= 3
        ]
        masked = image.copy()
        cv2.fillPoly(masked, pts, (0, 0, 0))
        return dataclasses.replace(frame, image=masked)
    raise TypeError(f"cannot mask frame image of type {type(image).__name__}")
