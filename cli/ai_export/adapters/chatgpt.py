from __future__ import annotations

import json
import re
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from ..store.canonical import (
    CanonicalConversation,
    CanonicalDump,
    CanonicalMessage,
)
from . import register
from .base import Adapter, ExportPlan, PollResult, RequestRef

_LINK_RE = re.compile(r"https?://[^\s\"'<>]+")


class ChatGPTAdapter(Adapter):
    name = "chatgpt"

    def discover(self) -> ExportPlan:
        return ExportPlan(
            instructions=(
                "1. Open https://chatgpt.com/#settings/DataControls\n"
                "2. Click 'Export data' → 'Confirm export'\n"
                "3. Wait for an email from noreply@tm.openai.com with subject "
                "'ChatGPT - Your data export is ready'.\n"
                "4. ai-export poll will pick the email up automatically once the cron job is installed."
            ),
            url="https://chatgpt.com/#settings/DataControls",
            email_from="noreply@tm.openai.com",
            email_subject_contains="ChatGPT - Your data export is ready",
        )

    def request_export(self, plan: ExportPlan) -> RequestRef:
        return RequestRef(
            service=self.name,
            request_id=uuid.uuid4().hex[:12],
            created_at=datetime.now(timezone.utc).isoformat(),
            plan=plan,
        )

    def poll(
        self,
        ref: RequestRef,
        email_messages: list[dict[str, Any]],
    ) -> PollResult:
        subj = (ref.plan.email_subject_contains or "").lower()
        sender = (ref.plan.email_from or "").lower()
        for msg in email_messages:
            from_h = (msg.get("from") or "").lower()
            subject = (msg.get("subject") or "").lower()
            body = msg.get("body") or ""
            if subj and subj not in subject:
                continue
            if sender and sender not in from_h:
                continue
            for link in _LINK_RE.findall(body):
                if "openai" in link.lower() and (".zip" in link.lower() or "download" in link.lower()):
                    return PollResult(status="READY", artifact_url=link)
        return PollResult(status="PENDING")

    def download(self, ref: RequestRef, artifact_url: str, dest_dir: Path) -> Path:
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / f"{ref.request_id}.zip"
        with httpx.stream("GET", artifact_url, follow_redirects=True, timeout=300.0) as r:
            r.raise_for_status()
            with dest.open("wb") as fh:
                for chunk in r.iter_bytes():
                    fh.write(chunk)
        return dest

    def parse(self, raw_path: Path) -> CanonicalDump:
        conversations_json = _read_conversations_json(raw_path)
        convs = [_normalize_conversation(c) for c in conversations_json]
        return CanonicalDump(
            service=self.name,
            exported_at=datetime.now(timezone.utc).isoformat(),
            source_export_id=raw_path.stem,
            conversations=convs,
        )


def _read_conversations_json(raw_path: Path) -> list[dict[str, Any]]:
    if raw_path.is_dir():
        return json.loads((raw_path / "conversations.json").read_text(encoding="utf-8"))
    if raw_path.suffix.lower() == ".json":
        return json.loads(raw_path.read_text(encoding="utf-8"))
    with zipfile.ZipFile(raw_path) as zf:
        with zf.open("conversations.json") as fh:
            return json.loads(fh.read().decode("utf-8"))


def _normalize_conversation(conv: dict[str, Any]) -> CanonicalConversation:
    """Walk ChatGPT's `mapping` tree in chronological order and flatten it
    into a list of role/content messages."""
    title = conv.get("title") or "Untitled"
    created = _ts_to_iso(conv.get("create_time"))
    updated = _ts_to_iso(conv.get("update_time"))
    model = conv.get("default_model_slug") or conv.get("model")
    cid = conv.get("conversation_id") or conv.get("id") or uuid.uuid4().hex

    mapping = conv.get("mapping") or {}
    # Walk from current_node back to root, then reverse — gives chronological order.
    ordered: list[dict[str, Any]] = []
    node_id = conv.get("current_node")
    seen: set[str] = set()
    while node_id and node_id not in seen and node_id in mapping:
        seen.add(node_id)
        node = mapping[node_id]
        ordered.append(node)
        node_id = node.get("parent")
    ordered.reverse()

    messages: list[CanonicalMessage] = []
    for node in ordered:
        msg = node.get("message")
        if not msg:
            continue
        role = (msg.get("author") or {}).get("role")
        if role not in {"user", "assistant", "system", "tool"}:
            continue
        content = _extract_content(msg.get("content") or {})
        if not content.strip():
            continue
        messages.append(
            CanonicalMessage(
                role=role,
                content=content,
                timestamp=_ts_to_iso(msg.get("create_time")),
            )
        )

    return CanonicalConversation(
        id=cid,
        title=title,
        created_at=created,
        updated_at=updated,
        model=model,
        messages=messages,
    )


def _extract_content(content: dict[str, Any]) -> str:
    ctype = content.get("content_type")
    parts = content.get("parts") or []
    if ctype in {"text", "multimodal_text"}:
        return "\n\n".join(p for p in parts if isinstance(p, str))
    if ctype == "code":
        return f"```\n{content.get('text', '')}\n```"
    # Fallback: stringify any text-ish parts
    return "\n\n".join(p for p in parts if isinstance(p, str))


def _ts_to_iso(ts: Any) -> str | None:
    if ts in (None, "", 0):
        return None
    try:
        return datetime.fromtimestamp(float(ts), tz=timezone.utc).isoformat()
    except (TypeError, ValueError):
        return None


register("chatgpt", ChatGPTAdapter)
