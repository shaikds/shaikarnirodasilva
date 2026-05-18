import json
import zipfile
from pathlib import Path

from ai_export.adapters.chatgpt import ChatGPTAdapter


def _fixture_conversations() -> list[dict]:
    """A miniature `conversations.json` mirroring ChatGPT's real shape."""
    return [
        {
            "title": "Hello world chat",
            "create_time": 1_700_000_000.0,
            "update_time": 1_700_000_300.0,
            "default_model_slug": "gpt-4o",
            "conversation_id": "conv-1",
            "current_node": "n3",
            "mapping": {
                "root": {"id": "root", "parent": None, "children": ["n1"], "message": None},
                "n1": {
                    "id": "n1",
                    "parent": "root",
                    "children": ["n2"],
                    "message": {
                        "author": {"role": "system"},
                        "create_time": None,
                        "content": {"content_type": "text", "parts": [""]},
                    },
                },
                "n2": {
                    "id": "n2",
                    "parent": "n1",
                    "children": ["n3"],
                    "message": {
                        "author": {"role": "user"},
                        "create_time": 1_700_000_100.0,
                        "content": {"content_type": "text", "parts": ["Hello?"]},
                    },
                },
                "n3": {
                    "id": "n3",
                    "parent": "n2",
                    "children": [],
                    "message": {
                        "author": {"role": "assistant"},
                        "create_time": 1_700_000_200.0,
                        "content": {
                            "content_type": "text",
                            "parts": ["Hi! How can I help?"],
                        },
                    },
                },
            },
        }
    ]


def test_parses_directory(tmp_path: Path):
    src = tmp_path / "export"
    src.mkdir()
    (src / "conversations.json").write_text(json.dumps(_fixture_conversations()))

    dump = ChatGPTAdapter().parse(src)

    assert dump.service == "chatgpt"
    assert len(dump.conversations) == 1
    conv = dump.conversations[0]
    assert conv.title == "Hello world chat"
    assert conv.model == "gpt-4o"
    assert [m.role for m in conv.messages] == ["user", "assistant"]
    assert conv.messages[0].content == "Hello?"
    assert conv.messages[1].content == "Hi! How can I help?"
    # Empty system message is dropped.
    assert all(m.content.strip() for m in conv.messages)
    # Timestamps converted to ISO.
    assert conv.created_at and "T" in conv.created_at
    assert conv.messages[0].timestamp and "T" in conv.messages[0].timestamp


def test_parses_zip(tmp_path: Path):
    zpath = tmp_path / "export.zip"
    with zipfile.ZipFile(zpath, "w") as zf:
        zf.writestr("conversations.json", json.dumps(_fixture_conversations()))

    dump = ChatGPTAdapter().parse(zpath)
    assert len(dump.conversations) == 1
    assert dump.conversations[0].messages[0].content == "Hello?"


def test_chronological_order(tmp_path: Path):
    """Walking from current_node back should still produce user → assistant order."""
    src = tmp_path / "export"
    src.mkdir()
    (src / "conversations.json").write_text(json.dumps(_fixture_conversations()))

    dump = ChatGPTAdapter().parse(src)
    roles = [m.role for m in dump.conversations[0].messages]
    assert roles == ["user", "assistant"]
