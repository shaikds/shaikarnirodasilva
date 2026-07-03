"""End-to-end orchestration: blank PDF + filled scan -> handwriting regions."""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field

import cv2
import numpy as np

from . import dropout as dropout_mod
from . import ingest, pagematch, regions as regions_mod
from .register import RegistrationResult, register


@dataclass
class RegionOut:
    id: int
    bbox_px: tuple[int, int, int, int]
    bbox_pts: tuple[float, float, float, float] | None
    ink_area: int
    crop_path: str
    mask_crop_path: str


@dataclass
class PageOut:
    filled_page: int
    template_page: int
    page_match_score: float
    low_confidence: bool
    confidence_reasons: list[str]
    inlier_ratio: float
    ecc_score: float
    median_residual_px: float
    regions: list[RegionOut] = field(default_factory=list)


def _px_to_pts(bbox: tuple[int, int, int, int], page: ingest.Page) -> tuple | None:
    if page.pdf_size_pts is None:
        return None
    s = 72.0 / page.dpi
    return tuple(round(v * s, 2) for v in bbox)


def _save_debug(out_dir: str, name: str, img: np.ndarray) -> None:
    cv2.imwrite(os.path.join(out_dir, name), img)


# Peer consensus (shape-based): a component matching the shape of ink in
# another student's copy nearby is print, not handwriting. See
# dropout.drop_shape_matched_components for the thresholds' meaning.
PEER_SEARCH_PX = 60
PEER_DIST_PX = 3
PEER_FRAC = 0.92


def extract_handwriting(
    blank_path: str,
    filled_path: str,
    out_dir: str,
    dpi: float = ingest.DEFAULT_DPI,
    debug: bool = False,
    peers: list[str] | None = None,
) -> list[PageOut]:
    """Run the full pipeline and write crops + regions.json under `out_dir`.

    `peers` are other filled copies of the same exam. They enable consensus
    filtering: strokes that repeat at the same location in a peer copy are
    print artifacts (e.g. the paper was printed from a slightly different
    version than the blank PDF), not this student's handwriting.
    """
    os.makedirs(out_dir, exist_ok=True)
    template_doc = ingest.load_document(blank_path, dpi=dpi)
    filled_doc = ingest.load_document(filled_path, dpi=dpi)

    if filled_doc.annotations:
        # Lossless fast path: the filled PDF carries a digital ink layer.
        return _extract_from_annotations(filled_doc, out_dir)

    # Template ink maps are computed once per template page (vector PDFs
    # render clean, so plain Otsu would work too — Sauvola keeps one code path).
    template_inks: dict[int, np.ndarray] = {}

    peer_docs = [ingest.load_document(p, dpi=dpi) for p in (peers or [])]
    peer_assignments = [
        {ti: fi for fi, ti, _ in pagematch.match_pages(pd.pages, template_doc.pages)}
        for pd in peer_docs
    ]
    peer_ink_cache: dict[tuple[int, int], np.ndarray | None] = {}

    def _peer_inks(ti: int) -> list[np.ndarray]:
        """Ink maps of peer pages matching template page ti, in template frame."""
        inks = []
        for pi, (pdoc, assign) in enumerate(zip(peer_docs, peer_assignments)):
            key = (pi, ti)
            if key not in peer_ink_cache:
                peer_ink_cache[key] = None
                if ti in assign:
                    preg = register(pdoc.pages[assign[ti]].image, template_doc.pages[ti].image)
                    if preg.aligned is not None and not preg.low_confidence:
                        peer_ink_cache[key] = dropout_mod.ink_mask(preg.aligned)
            if peer_ink_cache[key] is not None:
                inks.append(peer_ink_cache[key])
        return inks

    pages_out: list[PageOut] = []
    assignments = pagematch.match_pages(filled_doc.pages, template_doc.pages)
    for fi, ti, score in assignments:
        fpage, tpage = filled_doc.pages[fi], template_doc.pages[ti]
        page_dir = os.path.join(out_dir, f"page_{fi + 1:02d}")
        os.makedirs(page_dir, exist_ok=True)

        reg: RegistrationResult = register(fpage.image, tpage.image)
        out = PageOut(
            filled_page=fi + 1,
            template_page=ti + 1,
            page_match_score=round(score, 4),
            low_confidence=reg.low_confidence,
            confidence_reasons=list(reg.reasons),
            inlier_ratio=round(reg.inlier_ratio, 4),
            ecc_score=round(reg.ecc_score, 4),
            median_residual_px=round(reg.median_residual_px, 2),
        )
        if reg.aligned is None:
            pages_out.append(out)
            continue

        if ti not in template_inks:
            template_inks[ti] = dropout_mod.ink_mask(tpage.image)
        filled_ink = dropout_mod.ink_mask(reg.aligned)
        hw_mask = dropout_mod.dropout(filled_ink, template_inks[ti])
        hw_mask = regions_mod.denoise(hw_mask, dpi=dpi)
        for peer_ink in _peer_inks(ti):
            hw_mask = dropout_mod.drop_shape_matched_components(
                hw_mask, peer_ink, search_px=PEER_SEARCH_PX, dist_px=PEER_DIST_PX, frac=PEER_FRAC
            )

        if debug:
            _save_debug(page_dir, "debug_aligned.png", reg.aligned)
            _save_debug(page_dir, "debug_filled_ink.png", filled_ink)
            _save_debug(page_dir, "debug_template_ink.png", template_inks[ti])
            _save_debug(page_dir, "debug_handwriting_mask.png", hw_mask)
            overlay = cv2.cvtColor(reg.aligned, cv2.COLOR_GRAY2BGR)
            overlay[hw_mask > 0] = (0, 0, 255)
            _save_debug(page_dir, "debug_overlay.png", overlay)

        for k, region in enumerate(regions_mod.group_regions(hw_mask, dpi=dpi), start=1):
            x0, y0, x1, y1 = region.bbox
            crop = reg.aligned[y0:y1, x0:x1]
            mask_crop = 255 - hw_mask[y0:y1, x0:x1]  # ink-only view, white bg
            crop_path = os.path.join(page_dir, f"region_{k:02d}.png")
            mask_path = os.path.join(page_dir, f"region_{k:02d}_ink.png")
            cv2.imwrite(crop_path, crop)
            cv2.imwrite(mask_path, mask_crop)
            out.regions.append(
                RegionOut(
                    id=k,
                    bbox_px=region.bbox,
                    bbox_pts=_px_to_pts(region.bbox, tpage),
                    ink_area=region.ink_area,
                    crop_path=os.path.relpath(crop_path, out_dir),
                    mask_crop_path=os.path.relpath(mask_path, out_dir),
                )
            )
        pages_out.append(out)

    with open(os.path.join(out_dir, "regions.json"), "w") as f:
        json.dump([asdict(p) for p in pages_out], f, indent=2)
    return pages_out


def _extract_from_annotations(doc: ingest.Document, out_dir: str) -> list[PageOut]:
    """Digitally-filled PDF: annotation rects give exact regions, no vision."""
    pages: dict[int, PageOut] = {}
    for i, page in enumerate(doc.pages):
        pages[i] = PageOut(
            filled_page=i + 1,
            template_page=i + 1,
            page_match_score=1.0,
            low_confidence=False,
            confidence_reasons=[],
            inlier_ratio=1.0,
            ecc_score=1.0,
            median_residual_px=0.0,
        )
    scale_cache = {i: p.dpi / 72.0 for i, p in enumerate(doc.pages)}
    counters: dict[int, int] = {}
    for annot in doc.annotations:
        i = annot.page_index
        page = doc.pages[i]
        s = scale_cache[i]
        x0, y0, x1, y1 = (int(v * s) for v in annot.bbox_pts)
        h, w = page.image.shape
        x0, y0 = max(0, x0), max(0, y0)
        x1, y1 = min(w, x1), min(h, y1)
        if x1 <= x0 or y1 <= y0:
            continue
        k = counters.get(i, 0) + 1
        counters[i] = k
        page_dir = os.path.join(out_dir, f"page_{i + 1:02d}")
        os.makedirs(page_dir, exist_ok=True)
        crop_path = os.path.join(page_dir, f"region_{k:02d}.png")
        cv2.imwrite(crop_path, page.image[y0:y1, x0:x1])
        pages[i].regions.append(
            RegionOut(
                id=k,
                bbox_px=(x0, y0, x1, y1),
                bbox_pts=annot.bbox_pts,
                ink_area=(x1 - x0) * (y1 - y0),
                crop_path=os.path.relpath(crop_path, out_dir),
                mask_crop_path="",
            )
        )
    result = [pages[i] for i in sorted(pages)]
    with open(os.path.join(out_dir, "regions.json"), "w") as f:
        json.dump([asdict(p) for p in result], f, indent=2)
    return result
