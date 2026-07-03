"""Rasterize PDFs / load images into per-page grayscale arrays."""

from __future__ import annotations

import os
from dataclasses import dataclass, field

import fitz  # PyMuPDF
import numpy as np

DEFAULT_DPI = 300

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp"}


@dataclass
class Page:
    """One page as a grayscale image plus provenance metadata."""

    image: np.ndarray  # uint8 grayscale, HxW
    index: int  # 0-based page index within its source document
    source: str  # file path it came from
    dpi: float = DEFAULT_DPI
    # Set for vector PDF pages: page size in PDF points, to map pixels back
    # to PDF coordinates (pixels * 72 / dpi).
    pdf_size_pts: tuple[float, float] | None = None


@dataclass
class InkAnnotation:
    """A digital annotation found in a filled PDF (lossless fast path)."""

    page_index: int
    kind: str
    bbox_pts: tuple[float, float, float, float]


@dataclass
class Document:
    pages: list[Page] = field(default_factory=list)
    # Non-empty when the filled PDF carries a digital ink/annotation layer,
    # in which case the vision pipeline can be skipped for those regions.
    annotations: list[InkAnnotation] = field(default_factory=list)


def _pixmap_to_gray(pix: fitz.Pixmap) -> np.ndarray:
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    if pix.n == 1:
        return img[:, :, 0].copy()
    # ITU-R BT.601 luma; PyMuPDF pixmaps are RGB(A) ordered
    rgb = img[:, :, :3].astype(np.float32)
    gray = rgb[:, :, 0] * 0.299 + rgb[:, :, 1] * 0.587 + rgb[:, :, 2] * 0.114
    return gray.astype(np.uint8)


ANNOT_KINDS = {"Ink", "FreeText", "Line", "Square", "Circle", "Polygon", "PolyLine", "Highlight", "Squiggle"}


def load_document(path: str, dpi: float = DEFAULT_DPI) -> Document:
    """Load a PDF or image file into grayscale pages.

    For PDFs, each page is rendered at `dpi`. Digital annotations (stylus ink,
    text boxes, shapes) are collected separately: when present they give exact
    handwriting locations with zero noise.
    """
    ext = os.path.splitext(path)[1].lower()
    doc = Document()
    if ext in IMAGE_EXTS:
        import cv2

        img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
        if img is None:
            raise ValueError(f"could not read image: {path}")
        doc.pages.append(Page(image=img, index=0, source=path, dpi=dpi, pdf_size_pts=None))
        return doc

    with fitz.open(path) as pdf:
        zoom = dpi / 72.0
        mat = fitz.Matrix(zoom, zoom)
        for i, page in enumerate(pdf):
            # Render without annotations so digital ink never contaminates
            # the raster when we also extract it losslessly below.
            pix = page.get_pixmap(matrix=mat, annots=False)
            rect = page.rect
            doc.pages.append(
                Page(
                    image=_pixmap_to_gray(pix),
                    index=i,
                    source=path,
                    dpi=dpi,
                    pdf_size_pts=(rect.width, rect.height),
                )
            )
            for annot in page.annots() or []:
                kind = annot.type[1]
                if kind in ANNOT_KINDS:
                    r = annot.rect
                    doc.annotations.append(
                        InkAnnotation(page_index=i, kind=kind, bbox_pts=(r.x0, r.y0, r.x1, r.y1))
                    )
    return doc
