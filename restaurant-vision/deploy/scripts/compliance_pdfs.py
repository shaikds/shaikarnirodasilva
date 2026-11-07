#!/usr/bin/env python3
"""Render the compliance pack (docs/compliance/*.md) to PDF for the dashboard's Compliance page.

Usage::

    python deploy/scripts/compliance_pdfs.py docs/compliance <out_dir>

Every ``<name>-he.md`` / ``<name>-en.md`` becomes ``<name>-he.pdf`` / ``<name>-en.pdf`` (Hebrew
right to left), and ``non-identification-statement.pdf`` combines the English and Hebrew
statements. The cloud image runs this at build time and serves the PDFs at ``/compliance/``.

Needs ``markdown`` and ``weasyprint`` (with Pango) and a font with Hebrew glyphs
(DejaVu Sans: ``fonts-dejavu-core`` on Debian).
"""

from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

import markdown
from weasyprint import HTML

LANG_RE = re.compile(r"^(?P<name>.+)-(?P<lang>he|en)\.md$")
COMBINED = {"non-identification-statement": ("en", "he")}

CSS = """
@page {
  size: A4;
  margin: 18mm 16mm 20mm 16mm;
  @bottom-center { content: counter(page) " / " counter(pages); font-size: 8pt; color: #666; }
}
html { font-family: "DejaVu Sans", "Noto Sans Hebrew", "Arial", sans-serif; font-size: 10pt;
       line-height: 1.45; color: #111; }
h1 { font-size: 17pt; margin: 0 0 8pt; color: #0f4c4e; }
h2 { font-size: 13pt; margin: 16pt 0 6pt; color: #0f4c4e; break-after: avoid; }
h3 { font-size: 11pt; margin: 12pt 0 4pt; break-after: avoid; }
blockquote { margin: 0 0 12pt; padding: 6pt 10pt; background: #fff4e5;
             border-inline-start: 3pt solid #e8a33d; }
blockquote p { margin: 2pt 0; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0 10pt; font-size: 9pt; }
th, td { border: 0.5pt solid #999; padding: 3pt 5pt; vertical-align: top; text-align: start; }
th { background: #eef3f3; }
code, pre { font-family: "DejaVu Sans Mono", monospace; font-size: 8.5pt; }
pre { background: #f4f4f4; padding: 6pt; white-space: pre-wrap; }
hr { border: 0; border-top: 0.5pt solid #bbb; margin: 12pt 0; }
.part { break-before: page; }
"""


def _body(md_text: str) -> str:
    return markdown.markdown(md_text, extensions=["tables", "fenced_code", "sane_lists"])


def _section(path: Path, lang: str, *, new_page: bool = False) -> str:
    direction = "rtl" if lang == "he" else "ltr"
    cls = ' class="part"' if new_page else ""
    body = _body(path.read_text(encoding="utf-8"))
    return f'<section lang="{lang}" dir="{direction}"{cls}>{body}</section>'


def _document(title: str, lang: str, sections: list[str]) -> str:
    direction = "rtl" if lang == "he" else "ltr"
    return (
        f'<!doctype html><html lang="{lang}" dir="{direction}"><head><meta charset="utf-8">'
        f"<title>{html.escape(title)}</title><style>{CSS}</style></head>"
        f"<body>{''.join(sections)}</body></html>"
    )


def _title(path: Path) -> str:
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return path.stem


def render(src: Path, out: Path) -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for path in sorted(src.glob("*.md")):
        match = LANG_RE.match(path.name)
        if not match:
            continue  # README.md (index) and other non-template files
        lang = match["lang"]
        target = out / f"{path.stem}.pdf"
        HTML(string=_document(_title(path), lang, [_section(path, lang)])).write_pdf(target)
        written.append(target)
    for name, langs in COMBINED.items():
        parts = [src / f"{name}-{lang}.md" for lang in langs]
        if not all(p.is_file() for p in parts):
            continue
        pairs = zip(parts, langs, strict=True)
        sections = [_section(p, lang, new_page=i > 0) for i, (p, lang) in enumerate(pairs)]
        target = out / f"{name}.pdf"
        HTML(string=_document(_title(parts[0]), langs[0], sections)).write_pdf(target)
        written.append(target)
    return written


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0] if __doc__ else None)
    parser.add_argument("src", type=Path, help="docs/compliance directory")
    parser.add_argument("out", type=Path, help="output directory for the PDFs")
    args = parser.parse_args(argv)
    written = render(args.src, args.out)
    if not written:
        print(f"error: no <name>-he.md / <name>-en.md files in {args.src}", file=sys.stderr)
        return 1
    for path in written:
        print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
