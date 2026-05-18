from __future__ import annotations

import re
from pathlib import Path

from .canonical import CanonicalConversation, CanonicalDump

_SLUG_RE = re.compile(r"[^a-z0-9]+")
PASTE_CHUNK_CHARS = 200_000  # ~50k tokens at 4 chars/token


def _slug(text: str) -> str:
    s = _SLUG_RE.sub("-", text.lower()).strip("-")
    return s[:60] or "untitled"


def render_conversation(conv: CanonicalConversation) -> str:
    lines: list[str] = [f"# {conv.title}", ""]
    meta_bits: list[str] = []
    if conv.created_at:
        meta_bits.append(f"created: {conv.created_at}")
    if conv.model:
        meta_bits.append(f"model: {conv.model}")
    if meta_bits:
        lines.append("> " + " · ".join(meta_bits))
        lines.append("")
    for msg in conv.messages:
        lines.append(f"## {msg.role}")
        lines.append("")
        lines.append(msg.content.rstrip())
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def render_index(dump: CanonicalDump) -> str:
    lines = [
        f"# {dump.service} export — index",
        "",
        f"Exported at: {dump.exported_at}  ",
        f"Conversations: {len(dump.conversations)}",
        "",
        "| date | title | messages | file |",
        "| --- | --- | --- | --- |",
    ]
    for conv in dump.conversations:
        date = (conv.created_at or "")[:10]
        fname = _filename(conv)
        lines.append(
            f"| {date} | {conv.title} | {len(conv.messages)} "
            f"| [conversations/{fname}](conversations/{fname}) |"
        )
    return "\n".join(lines) + "\n"


def render_paste_chunks(dump: CanonicalDump) -> list[str]:
    """Concatenate everything into chunks small enough to paste into another
    LLM as project context. Each chunk is self-describing."""
    header = (
        f"# {dump.service} export — paste bundle\n\n"
        f"Exported at: {dump.exported_at}\n\n"
        "---\n\n"
    )
    chunks: list[str] = []
    buf = header
    for conv in dump.conversations:
        block = render_conversation(conv) + "\n---\n\n"
        if len(buf) + len(block) > PASTE_CHUNK_CHARS and buf != header:
            chunks.append(buf)
            buf = header + block
        else:
            buf += block
    if buf.strip() != header.strip():
        chunks.append(buf)
    return chunks or [header]


def _filename(conv: CanonicalConversation) -> str:
    date = (conv.created_at or "")[:10] or "undated"
    return f"{date}_{_slug(conv.title)}.md"


def write_bundle(dump: CanonicalDump, out_dir: Path) -> dict[str, Path]:
    conv_dir = out_dir / "conversations"
    conv_dir.mkdir(parents=True, exist_ok=True)
    written: dict[str, Path] = {}
    for conv in dump.conversations:
        path = conv_dir / _filename(conv)
        path.write_text(render_conversation(conv), encoding="utf-8")
        written[conv.id] = path

    index_path = out_dir / "INDEX.md"
    index_path.write_text(render_index(dump), encoding="utf-8")

    chunks = render_paste_chunks(dump)
    if len(chunks) == 1:
        (out_dir / "PASTE.md").write_text(chunks[0], encoding="utf-8")
    else:
        for i, chunk in enumerate(chunks, 1):
            (out_dir / f"PASTE.part{i:02d}.md").write_text(chunk, encoding="utf-8")

    return {"index": index_path, **written}
