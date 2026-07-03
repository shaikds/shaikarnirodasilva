"""End-to-end test: every synthetic handwriting region must be recovered,
with bounded false-positive ink."""

import os
import sys

import cv2
import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from exam_ink import dropout as dropout_mod
from exam_ink import regions as regions_mod
from exam_ink.register import register
from tests.synth import build_dataset, render_pdf_page


@pytest.fixture(scope="module")
def dataset(tmp_path_factory):
    tmp = str(tmp_path_factory.mktemp("synth"))
    return build_dataset(tmp)


def _center_covered(truth_bbox, regions) -> bool:
    tx = (truth_bbox[0] + truth_bbox[2]) / 2
    ty = (truth_bbox[1] + truth_bbox[3]) / 2
    for r in regions:
        x0, y0, x1, y1 = r.bbox
        if x0 <= tx <= x1 and y0 <= ty <= y1:
            return True
    return False


def test_recovers_all_handwriting_and_little_noise(dataset):
    blank_pdf, filled_paths, truths = dataset

    for page_idx, filled_path in enumerate(filled_paths):
        template = render_pdf_page(blank_pdf, page_idx)
        filled = cv2.imread(filled_path, cv2.IMREAD_GRAYSCALE)

        reg = register(filled, template)
        assert reg.aligned is not None, f"registration failed on page {page_idx}"
        assert not reg.low_confidence, f"page {page_idx} flagged low confidence: {reg.reasons}"

        template_ink = dropout_mod.ink_mask(template)
        filled_ink = dropout_mod.ink_mask(reg.aligned)
        hw_mask = dropout_mod.dropout(filled_ink, template_ink)
        hw_mask = regions_mod.denoise(hw_mask)
        regions = regions_mod.group_regions(hw_mask)

        page_truths = [t for t in truths if t.page == page_idx]
        for t in page_truths:
            assert _center_covered(t.bbox_px, regions), (
                f"page {page_idx}: ground-truth region {t.bbox_px} not recovered; "
                f"found {[r.bbox for r in regions]}"
            )

        # False-positive budget: handwriting ink outside all ground-truth
        # areas must be a small fraction of total detected ink.
        gt_mask = np.zeros_like(hw_mask)
        margin = 20
        for t in page_truths:
            x0, y0, x1, y1 = t.bbox_px
            gt_mask[max(0, y0 - margin) : y1 + margin, max(0, x0 - margin) : x1 + margin] = 255
        total_ink = int((hw_mask > 0).sum())
        stray_ink = int(((hw_mask > 0) & (gt_mask == 0)).sum())
        assert total_ink > 0
        assert stray_ink / total_ink < 0.10, (
            f"page {page_idx}: {stray_ink}/{total_ink} handwriting pixels are noise"
        )


def test_full_pipeline_cli_outputs(dataset, tmp_path):
    """Exercise extract_handwriting() itself on page 1 (single-image input)."""
    from exam_ink.pipeline import extract_handwriting

    blank_pdf, filled_paths, truths = dataset
    out = str(tmp_path / "out")
    pages = extract_handwriting(blank_pdf, filled_paths[0], out, debug=True)

    assert len(pages) == 1
    page = pages[0]
    assert page.template_page == 1  # page pairing picked the right template
    assert not page.low_confidence
    assert len(page.regions) >= 3  # scribbles + check-mark + drawing
    assert os.path.exists(os.path.join(out, "regions.json"))
    for r in page.regions:
        assert os.path.exists(os.path.join(out, r.crop_path))
        crop = cv2.imread(os.path.join(out, r.crop_path), cv2.IMREAD_GRAYSCALE)
        assert crop is not None and crop.size > 0


def test_question_zone_crops(dataset, tmp_path):
    """Every truth stroke lands in its expected Q-crop; crops respect zones."""
    from exam_ink.pipeline import extract_handwriting
    from exam_ink.questions import detect_zones
    from tests.synth import SCALE

    blank_pdf, filled_paths, truths = dataset

    # anchor detection on the synthetic blank: 4 mains + a/b subs per page,
    # numbering continues across pages
    zones = detect_zones(blank_pdf)
    names = {z.name for z in zones}
    assert {"Q1", "Q1A", "Q1B", "Q2", "Q3", "Q4", "Q5", "Q5A", "Q5B", "Q6", "Q7", "Q8"} <= names

    out = str(tmp_path / "outq")
    page = extract_handwriting(blank_pdf, filled_paths[0], out)[0]
    by_name = {q.name: q for q in page.questions}

    for t in [t for t in truths if t.page == 0]:
        assert t.qname in by_name, f"no crop emitted for {t.qname}; got {sorted(by_name)}"
        x0, y0, x1, y1 = by_name[t.qname].bbox_px
        cx = (t.bbox_px[0] + t.bbox_px[2]) / 2
        cy = (t.bbox_px[1] + t.bbox_px[3]) / 2
        assert x0 <= cx <= x1 and y0 <= cy <= y1, f"{t.qname} truth not inside its crop"
        assert os.path.exists(os.path.join(out, by_name[t.qname].crop_path))

    # zone purity: Q1A's crop must stop before sub-question b's anchor (190pt),
    # and no crop may reach into the next main question's band
    tol = int(8 * SCALE)
    assert by_name["Q1A"].bbox_px[3] <= int(190 * SCALE) + tol
    next_main_anchor = {"Q1A": 250, "Q1B": 250, "Q2": 340, "Q3": 530}
    for name, limit in next_main_anchor.items():
        if name in by_name:
            assert by_name[name].bbox_px[3] <= int(limit * SCALE) + tol, f"{name} bleeds into next question"
