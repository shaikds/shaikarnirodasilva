"""Question structure from the blank PDF's text layer.

Word-processor exams carry a real text layer, so question markers ("6.",
"א", "b)") are read directly with coordinates — no OCR, any script. Marker
candidates are validated structurally (line-start position, x-column
clustering, numeric/alphabetic sequence) because prose can also start a line
with a short token.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

import fitz

_MAIN_RE = re.compile(r"^(\d{1,2})[.)]?$")
_SUB_RE = re.compile(r"^([A-Za-zא-תء-ي])[.)]?$")
_PUNCT = {".", ")", "(", ":"}

# Alphabets for sub-marker sequence validation and A/B/C ordinal naming
_ALPHABETS = [
    "abcdefghijklmnopqrstuvwxyz",
    "אבגדהוזחטיכלמנסעפצקרשת",
    "ابتثجحخدذرزسشصضطظعغفقكلمنهوي",
]

_X_COLUMN_TOL = 12.0  # pts: main markers of one exam share a margin column
_DOT_GAP = 8.0  # pts: max gap between a bare letter marker and its dot token


@dataclass
class Anchor:
    label: str  # marker without punctuation: "6", "א", "b"
    level: str  # "main" | "sub"
    page: int
    y: float  # pts, top of the marker's line
    x: float  # pts


@dataclass
class Zone:
    main: str
    sub: str | None  # raw sub label ("א") or None for the main-level zone
    sub_ordinal: str | None  # "A", "B", ... for filenames
    # (page, y0, y1) in pts; more than one segment when a question crosses pages
    segments: list[tuple[int, float, float]] = field(default_factory=list)

    @property
    def name(self) -> str:
        return f"Q{self.main}{self.sub_ordinal or ''}"


def _is_rtl(text: str) -> bool:
    return any(unicodedata.bidirectional(c) in ("R", "AL") for c in text)


def _visual_lines(words) -> list[list]:
    """Group PyMuPDF word tuples into visual lines by vertical overlap."""
    lines: list[list] = []
    for w in sorted(words, key=lambda w: (w[1], w[0])):
        for line in lines:
            y0 = max(w[1], line[0][1])
            y1 = min(w[3], line[0][3])
            if y1 - y0 > 0.5 * min(w[3] - w[1], line[0][3] - line[0][1]):
                line.append(w)
                break
        else:
            lines.append([w])
    return lines


def _line_start_candidate(line: list, rtl: bool):
    """Return (marker_word, has_dot) if the line starts with a marker token."""
    words = sorted(line, key=lambda w: -w[2] if rtl else w[0])
    # skip leading pure-punctuation tokens but remember an adjacent dot
    lead_punct = []
    for w in words:
        if w[4] in _PUNCT:
            lead_punct.append(w)
            continue
        text = w[4]
        has_dot = text.endswith(".") or text.endswith(")")
        if not has_dot:
            for p in lead_punct + words[words.index(w) + 1 : words.index(w) + 2]:
                if p[4] in (".", ")"):
                    gap = min(abs(w[0] - p[2]), abs(p[0] - w[2]))
                    if gap <= _DOT_GAP:
                        has_dot = True
                        break
        return w, has_dot
    return None, False


def _alpha_index(ch: str) -> int | None:
    low = ch.lower()
    for alphabet in _ALPHABETS:
        if low in alphabet:
            return alphabet.index(low)
    return None


def _collect_candidates(doc: fitz.Document) -> tuple[list[Anchor], list[Anchor]]:
    mains: list[Anchor] = []
    subs: list[Anchor] = []
    for pi, page in enumerate(doc):
        words = page.get_text("words")
        rtl = _is_rtl(page.get_text())
        for line in _visual_lines(words):
            w, has_dot = _line_start_candidate(line, rtl)
            if w is None or not has_dot:
                continue
            text = w[4]
            m = _MAIN_RE.match(text)
            if m:
                mains.append(Anchor(m.group(1), "main", pi, w[1], w[0]))
                continue
            s = _SUB_RE.match(text)
            if s and _alpha_index(s.group(1)) is not None:
                subs.append(Anchor(s.group(1), "sub", pi, w[1], w[0]))
    return mains, subs


def _validate_mains(mains: list[Anchor]) -> list[Anchor]:
    """Keep the x-column whose anchors form the longest increasing sequence."""
    best: list[Anchor] = []
    for ref in mains:
        column = [a for a in mains if abs(a.x - ref.x) <= _X_COLUMN_TOL]
        # longest strictly-increasing subsequence of question numbers,
        # in document order (columns are small, O(n^2) is fine)
        seqs: list[list[Anchor]] = []
        for a in column:
            extend = max(
                (s for s in seqs if int(s[-1].label) < int(a.label)),
                key=len,
                default=None,
            )
            seqs.append((extend + [a]) if extend else [a])
        cand = max(seqs, key=len, default=[])
        if len(cand) > len(best):
            best = cand
    return best


def _validate_subs(subs: list[Anchor], mains: list[Anchor]) -> list[Anchor]:
    """Under each main, keep the run of alphabet-consecutive sub markers
    starting at the alphabet's first letter."""
    keep: list[Anchor] = []
    bounds = [(a.page, a.y) for a in mains] + [(10**9, 0.0)]
    for i, (start, end) in enumerate(zip(bounds[:-1], bounds[1:])):
        group = [s for s in subs if start <= (s.page, s.y) < end]
        expected = 0
        for s in group:
            if _alpha_index(s.label) == expected:
                keep.append(s)
                expected += 1
    return keep


def detect_zones(blank_pdf_path: str) -> list[Zone]:
    """Extract validated question/sub-question zones from a blank exam PDF.

    Returns [] when the PDF has no usable text layer.
    """
    with fitz.open(blank_pdf_path) as doc:
        page_heights = [p.rect.height for p in doc]
        mains, subs = _collect_candidates(doc)
    mains = _validate_mains(mains)
    subs = _validate_subs(subs, mains)
    if not mains:
        return []

    anchors = sorted(mains + subs, key=lambda a: (a.page, a.y))

    def _segments(start_i: int, stop) -> list[tuple[int, float, float]]:
        """Band from anchors[start_i] to `stop` anchor (or document end)."""
        a = anchors[start_i]
        end_page = stop.page if stop else len(page_heights) - 1
        end_y = stop.y if stop else page_heights[end_page]
        segs = []
        for p in range(a.page, end_page + 1):
            y0 = a.y if p == a.page else 0.0
            y1 = end_y if p == end_page else page_heights[p]
            if y1 > y0:
                segs.append((p, y0, y1))
        return segs

    zones: list[Zone] = []
    current_main: str | None = None
    for i, a in enumerate(anchors):
        if a.level == "main":
            current_main = a.label
            nxt = next((b for b in anchors[i + 1 :] if b.level == "main"), None)
            zones.append(Zone(main=a.label, sub=None, sub_ordinal=None, segments=_segments(i, nxt)))
        else:
            nxt = anchors[i + 1] if i + 1 < len(anchors) else None
            idx = _alpha_index(a.label)
            zones.append(
                Zone(
                    main=current_main or "?",
                    sub=a.label,
                    sub_ordinal=chr(ord("A") + idx) if idx is not None else None,
                    segments=_segments(i, nxt),
                )
            )
    return zones


def zones_on_page(zones: list[Zone], page: int, dpi: float) -> list[tuple[Zone, float, float]]:
    """(zone, y0_px, y1_px) for every zone segment on `page`."""
    s = dpi / 72.0
    out = []
    for z in zones:
        for p, y0, y1 in z.segments:
            if p == page:
                out.append((z, y0 * s, y1 * s))
    return out


def assign(zones_px: list[tuple[Zone, float, float]], center_y: float) -> Zone | None:
    """Deepest zone (sub before main) whose band contains center_y."""
    hit = None
    for z, y0, y1 in zones_px:
        if y0 <= center_y < y1:
            if hit is None or (z.sub is not None and hit.sub is None):
                hit = z
    return hit
