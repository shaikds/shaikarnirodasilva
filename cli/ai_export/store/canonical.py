from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class CanonicalMessage:
    role: str
    content: str
    timestamp: str | None = None


@dataclass
class CanonicalConversation:
    id: str
    title: str
    messages: list[CanonicalMessage]
    created_at: str | None = None
    updated_at: str | None = None
    model: str | None = None


@dataclass
class CanonicalDump:
    service: str
    exported_at: str
    conversations: list[CanonicalConversation]
    source_export_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def write(dump: CanonicalDump, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("w", encoding="utf-8") as fh:
        json.dump(dump.to_dict(), fh, ensure_ascii=False, indent=2)
    return dest
