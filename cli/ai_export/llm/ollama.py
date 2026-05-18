from __future__ import annotations

import json
from typing import Any, Iterator

import httpx

from . import register
from .base import Message


class OllamaProvider:
    name = "ollama"

    def __init__(self, model: str, options: dict[str, Any]) -> None:
        self.model = model
        self.options = options
        self.host = options.get("host", "http://localhost:11434").rstrip("/")

    def _payload(self, system: str, messages: list[Message]) -> dict[str, Any]:
        msgs: list[dict[str, str]] = []
        if system:
            msgs.append({"role": "system", "content": system})
        msgs.extend({"role": m.role, "content": m.content} for m in messages)
        return {"model": self.model, "messages": msgs}

    def chat(self, system: str, messages: list[Message], **opts: Any) -> str:
        payload = self._payload(system, messages)
        payload["stream"] = False
        r = httpx.post(f"{self.host}/api/chat", json=payload, timeout=120.0)
        r.raise_for_status()
        return r.json()["message"]["content"]

    def stream(self, system: str, messages: list[Message], **opts: Any) -> Iterator[str]:
        payload = self._payload(system, messages)
        payload["stream"] = True
        with httpx.stream(
            "POST", f"{self.host}/api/chat", json=payload, timeout=None
        ) as r:
            r.raise_for_status()
            for line in r.iter_lines():
                if not line:
                    continue
                obj = json.loads(line)
                chunk = obj.get("message", {}).get("content", "")
                if chunk:
                    yield chunk
                if obj.get("done"):
                    break


register("ollama", OllamaProvider)
