"""Privacy guard (architecture 10): no frame persistence and no face/identity libraries anywhere
in ``rv_edge``. This is a plain text scan, so the forbidden names may not appear even in
comments or docstrings."""

from __future__ import annotations

import re
from pathlib import Path

import rv_edge

FORBIDDEN = re.compile(r"imwrite|VideoWriter|imsave|face_recognition|insightface|\bdlib\b")
PACKAGE_ROOT = Path(rv_edge.__file__).resolve().parent


def test_scan_covers_the_package() -> None:
    files = list(PACKAGE_ROOT.rglob("*.py"))
    assert PACKAGE_ROOT.name == "rv_edge"
    assert any(f.name == "snapshot.py" for f in files)


def test_no_forbidden_calls_or_libraries() -> None:
    hits: list[str] = []
    for path in sorted(PACKAGE_ROOT.rglob("*.py")):
        text = path.read_text(encoding="utf-8")
        for lineno, line in enumerate(text.splitlines(), start=1):
            match = FORBIDDEN.search(line)
            if match:
                rel = path.relative_to(PACKAGE_ROOT.parent)
                hits.append(f"{rel}:{lineno}: {match.group(0)}")
    assert hits == [], "forbidden privacy-sensitive names found:\n" + "\n".join(hits)


def test_guard_pattern_catches_the_forbidden_names() -> None:
    for sample in (
        "cv2.imwrite('x.jpg', img)",
        "cv2.VideoWriter(path, fourcc, 5, size)",
        "plt.imsave('f.png', a)",
        "import face_recognition",
        "import dlib",
        "from insightface.app import FaceAnalysis",
    ):
        assert FORBIDDEN.search(sample), sample
    assert not FORBIDDEN.search("cv2.imencode('.jpg', img)")
