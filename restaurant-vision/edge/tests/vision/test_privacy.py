from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import pytest
from rv_contracts import Anchor

from rv_edge.interfaces import SyntheticImage, SyntheticPerson
from rv_edge.vision.privacy import apply_masks

from .fakes import H, W, pixel_frame, synthetic_frame

RIGHT_HALF = [(0.5, 0.0), (1.0, 0.0), (1.0, 1.0), (0.5, 1.0)]
TOP_LEFT = [(0.0, 0.0), (0.25, 0.0), (0.25, 0.25), (0.0, 0.25)]


def test_numpy_masks_fill_black_on_a_copy() -> None:
    frame = pixel_frame()
    masked = apply_masks(frame, [RIGHT_HALF, TOP_LEFT])
    img = masked.image
    assert masked is not frame and img is not frame.image
    assert np.all(frame.image == 128), "input frame must not be modified"
    assert np.all(img[:, W // 2 + 1 :] == 0)
    assert np.all(img[: H // 4 - 1, : W // 4 - 1] == 0)
    assert np.all(img[H // 2 :, : W // 2 - 1] == 128)
    assert (masked.ts, masked.index, masked.width, masked.height) == (
        frame.ts,
        frame.index,
        frame.width,
        frame.height,
    )


def test_no_masks_returns_same_frame() -> None:
    frame = pixel_frame()
    assert apply_masks(frame, []) is frame


def test_synthetic_masks_drop_people_whose_anchor_is_masked() -> None:
    inside = SyntheticPerson(box=(0.6, 0.2, 0.7, 0.8), uniform_score=0.9)
    straddling = SyntheticPerson(box=(0.45, 0.2, 0.53, 0.8))  # foot point x=0.49: outside
    outside = SyntheticPerson(box=(0.1, 0.5, 0.2, 0.9))
    frame = synthetic_frame([inside, straddling, outside])
    masked = apply_masks(frame, [RIGHT_HALF])
    assert isinstance(masked.image, SyntheticImage)
    assert masked.image.people == (straddling, outside)


def test_synthetic_anchor_choice_matters() -> None:
    # Box whose centre is in the top-left mask but whose feet are below it.
    person = SyntheticPerson(box=(0.05, 0.05, 0.15, 0.4))
    frame = synthetic_frame([person])
    assert apply_masks(frame, [TOP_LEFT], anchor=Anchor.FOOT) is frame
    centre = apply_masks(frame, [TOP_LEFT], anchor=Anchor.CENTER)
    assert isinstance(centre.image, SyntheticImage) and centre.image.people == ()


def test_none_image_passes_and_unknown_image_type_fails() -> None:
    frame = pixel_frame()
    empty = type(frame)("c", 0.0, 0, 0, 0, None)
    assert apply_masks(empty, [RIGHT_HALF]) is empty
    with pytest.raises(TypeError):
        apply_masks(type(frame)("c", 0.0, 0, 0, 0, "jpeg bytes"), [RIGHT_HALF])


FORBIDDEN = re.compile(r"\b(imwrite|VideoWriter|imsave)\b")


def test_no_frame_persistence_calls_in_ingest_vision_or_scripts() -> None:
    edge = Path(__file__).resolve().parents[2]
    roots = [edge / "rv_edge" / "ingest", edge / "rv_edge" / "vision", edge / "scripts"]
    offenders = [
        f"{path.relative_to(edge)}:{n}"
        for root in roots
        for path in root.rglob("*.py")
        for n, line in enumerate(path.read_text().splitlines(), 1)
        if FORBIDDEN.search(line)
    ]
    assert offenders == []
