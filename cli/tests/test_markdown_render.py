from pathlib import Path

from ai_export.store.canonical import (
    CanonicalConversation,
    CanonicalDump,
    CanonicalMessage,
)
from ai_export.store import markdown as md


def _dump() -> CanonicalDump:
    return CanonicalDump(
        service="chatgpt",
        exported_at="2026-05-18T00:00:00+00:00",
        source_export_id="abc123",
        conversations=[
            CanonicalConversation(
                id="c1",
                title="Hello world",
                created_at="2025-12-01T00:00:00+00:00",
                model="gpt-4o",
                messages=[
                    CanonicalMessage(role="user", content="Hi"),
                    CanonicalMessage(role="assistant", content="Hello, how can I help?"),
                ],
            ),
            CanonicalConversation(
                id="c2",
                title="Project plan: Q1",
                created_at="2026-01-15T00:00:00+00:00",
                messages=[
                    CanonicalMessage(role="user", content="Let's plan Q1"),
                    CanonicalMessage(role="assistant", content="Sure — three goals..."),
                ],
            ),
        ],
    )


def test_render_conversation_has_role_headers():
    out = md.render_conversation(_dump().conversations[0])
    assert "# Hello world" in out
    assert "## user" in out
    assert "## assistant" in out
    assert "Hi" in out
    assert "Hello, how can I help?" in out


def test_index_lists_all_conversations():
    out = md.render_index(_dump())
    assert "| date | title | messages | file |" in out
    assert "Hello world" in out
    assert "Project plan: Q1" in out
    assert "2025-12-01" in out
    assert "2026-01-15" in out


def test_paste_chunks_single_when_small():
    chunks = md.render_paste_chunks(_dump())
    assert len(chunks) == 1
    assert "Hello world" in chunks[0]
    assert "Project plan: Q1" in chunks[0]


def test_write_bundle_creates_expected_files(tmp_path: Path):
    md.write_bundle(_dump(), tmp_path)
    assert (tmp_path / "INDEX.md").exists()
    assert (tmp_path / "PASTE.md").exists()
    files = list((tmp_path / "conversations").iterdir())
    names = sorted(f.name for f in files)
    assert names == [
        "2025-12-01_hello-world.md",
        "2026-01-15_project-plan-q1.md",
    ]


def test_paste_chunks_split_when_large():
    # Force chunking by lowering the threshold.
    original = md.PASTE_CHUNK_CHARS
    try:
        md.PASTE_CHUNK_CHARS = 50
        chunks = md.render_paste_chunks(_dump())
        assert len(chunks) >= 2
    finally:
        md.PASTE_CHUNK_CHARS = original
