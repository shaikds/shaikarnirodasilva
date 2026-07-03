"""Synthetic exam generator: blank PDF, simulated filled camera scan, ground truth.

Lets the end-to-end test verify the pipeline with zero real exam data:
the "handwriting" is random strokes/shapes whose bounding boxes we know.
"""

from __future__ import annotations

import os
import random
from dataclasses import dataclass

import cv2
import fitz
import numpy as np

PAGE_W, PAGE_H = 595, 842  # A4 in points
DPI = 300
SCALE = DPI / 72.0


@dataclass
class GroundTruth:
    page: int
    bbox_px: tuple[int, int, int, int]  # in the 300-DPI template pixel frame


def make_blank_pdf(path: str) -> None:
    """Two-page 'exam': multilingual printed text, answer lines, boxes, a table."""
    doc = fitz.open()
    for page_no in range(2):
        page = doc.new_page(width=PAGE_W, height=PAGE_H)
        page.insert_text((60, 60), f"FINAL EXAM — page {page_no + 1}", fontsize=16)
        questions = [
            "Q1. Explain the theorem below and prove it:",
            "Q2. Complete la phrase suivante:",
            "Q3. Zeichnen Sie das Diagramm:",
            "Q4. Answer inside the box only:",
        ]
        y = 110
        for q in questions:
            page.insert_text((60, y), q, fontsize=11)
            for line in range(2):
                ly = y + 25 + line * 28
                page.draw_line((60, ly), (535, ly), width=0.7)
            y += 100
        page.draw_rect(fitz.Rect(60, y, 535, y + 160), width=1.0)
        # a small grid/table
        for i in range(4):
            page.draw_line((60, y + 200 + i * 22), (300, y + 200 + i * 22), width=0.5)
        for i in range(5):
            page.draw_line((60 + i * 60, y + 200), (60 + i * 60, y + 266), width=0.5)
    doc.save(path)
    doc.close()


def render_pdf_page(path: str, index: int) -> np.ndarray:
    with fitz.open(path) as doc:
        pix = doc[index].get_pixmap(matrix=fitz.Matrix(SCALE, SCALE))
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        gray = cv2.cvtColor(img[:, :, :3], cv2.COLOR_RGB2GRAY) if pix.n >= 3 else img[:, :, 0]
    return gray.copy()


def _scribble(img: np.ndarray, x0: int, y0: int, w: int, h: int, rng: random.Random) -> None:
    """Handwriting-like polyline scribbles inside the given box."""
    n_strokes = rng.randint(3, 7)
    for _ in range(n_strokes):
        pts = []
        x, y = rng.randint(x0, x0 + w // 3), rng.randint(y0, y0 + h - 1)
        for _ in range(rng.randint(4, 10)):
            x += rng.randint(10, max(11, w // 8))
            y += rng.randint(-h // 3, h // 3)
            pts.append((min(x, x0 + w - 1), min(max(y, y0), y0 + h - 1)))
        if len(pts) > 1:
            cv2.polylines(img, [np.array(pts)], False, 40, thickness=rng.randint(3, 5), lineType=cv2.LINE_AA)


def add_handwriting(template: np.ndarray, page: int, rng: random.Random) -> tuple[np.ndarray, list[GroundTruth]]:
    """Overlay dense text-like scribbles, a sparse check-mark, and a drawn shape."""
    img = template.copy()
    truths: list[GroundTruth] = []

    def s(v: float) -> int:
        return int(v * SCALE)

    # dense scribble over the Q1 answer lines (crosses printed rules on purpose)
    box = (s(70), s(125), s(430), s(60))
    _scribble(img, *box, rng)
    truths.append(GroundTruth(page, (box[0], box[1], box[0] + box[2], box[1] + box[3])))

    # sparse mark: a lone check-mark near Q2
    cx, cy = s(120), s(240)
    pts = np.array([(cx, cy), (cx + s(6), cy + s(8)), (cx + s(18), cy - s(10))])
    cv2.polylines(img, [pts], False, 30, thickness=5, lineType=cv2.LINE_AA)
    truths.append(GroundTruth(page, (cx - 8, cy - s(10) - 8, cx + s(18) + 8, cy + s(8) + 8)))

    # a drawn shape (circle + arrow) inside the big box region
    cx, cy, r = s(200), s(560), s(28)
    cv2.circle(img, (cx, cy), r, 50, thickness=4, lineType=cv2.LINE_AA)
    cv2.arrowedLine(img, (cx + r, cy), (cx + r + s(60), cy - s(20)), 50, 4, line_type=cv2.LINE_AA)
    truths.append(GroundTruth(page, (cx - r - 8, cy - r - s(20) - 8, cx + r + s(60) + 8, cy + r + 8)))

    return img, truths


def simulate_camera(img: np.ndarray, rng: random.Random) -> np.ndarray:
    """Approximate a CamScanner/iPhone capture: residual perspective, paper
    bend, brightness gradient, blur, JPEG artifacts."""
    h, w = img.shape

    # residual perspective (CamScanner corrects most, not all)
    jitter = 0.008
    src = np.float32([(0, 0), (w, 0), (w, h), (0, h)])
    dst = src + np.float32([[rng.uniform(-jitter, jitter) * w, rng.uniform(-jitter, jitter) * h] for _ in range(4)])
    H = cv2.getPerspectiveTransform(src, dst)
    out = cv2.warpPerspective(img, H, (w, h), borderValue=255)

    # low-frequency paper bend: smooth sinusoidal displacement
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    bend = 4.0
    map_x = gx + bend * np.sin(gy / h * 2.2 * np.pi + rng.uniform(0, 3))
    map_y = gy + bend * np.cos(gx / w * 1.7 * np.pi + rng.uniform(0, 3))
    out = cv2.remap(out, map_x, map_y, cv2.INTER_LINEAR, borderValue=255)

    # brightness gradient + mild blur + sensor noise
    gradient = (gx / w * 30 + gy / h * 20).astype(np.float32)
    out = np.clip(out.astype(np.float32) - gradient + 15, 0, 255).astype(np.uint8)
    out = cv2.GaussianBlur(out, (3, 3), 0)
    noise = np.random.default_rng(rng.randint(0, 10**9)).normal(0, 4, out.shape)
    out = np.clip(out.astype(np.float32) + noise, 0, 255).astype(np.uint8)

    # JPEG round-trip
    ok, enc = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 82])
    assert ok
    return cv2.imdecode(enc, cv2.IMREAD_GRAYSCALE)


def build_dataset(tmp_dir: str, seed: int = 7):
    """Create blank.pdf + filled page images + ground truth; returns paths."""
    rng = random.Random(seed)
    blank_pdf = os.path.join(tmp_dir, "blank.pdf")
    make_blank_pdf(blank_pdf)

    truths: list[GroundTruth] = []
    filled_paths: list[str] = []
    for page in range(2):
        template = render_pdf_page(blank_pdf, page)
        filled, page_truths = add_handwriting(template, page, rng)
        captured = simulate_camera(filled, rng)
        p = os.path.join(tmp_dir, f"filled_page{page + 1}.png")
        cv2.imwrite(p, captured)
        filled_paths.append(p)
        truths.extend(page_truths)
    return blank_pdf, filled_paths, truths
