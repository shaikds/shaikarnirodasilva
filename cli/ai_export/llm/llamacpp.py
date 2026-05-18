from __future__ import annotations

import json
from typing import Any, Iterator

import httpx

from . import register
from .base import Message


class LlamaCppProvider:
    """Talks to any OpenAI-compatible local server: llama.cpp's `server`,
    LM Studio, vLLM, text-generation-webui's openai extension."""

    name = "llamacpp"

    def __init__(self, model: str, options: dict[str, Any]) -> None:
        self.model = model
        self.options = options
        self.base_url = options.get("base_url", "http://localhost:8080/v1").rstrip("/")
        self.api_key = options.get("api_key", "not-needed")

    def _payload(self, system: str, messages: list[Message]) -> dict[str, Any]:
        msgs: list[dict[str, str]] = []
        if system:
            msgs.append({"role": "system", "content": system})
        msgs.extend({"role": m.role, "content": m.content} for m in messages)
        return {"model": self.model, "messages": msgs}

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}"}

    def chat(self, system: str, messages: list[Message], **opts: Any) -> str:
        payload = self._payload(system, messages)
        payload["max_tokens"] = opts.get("max_tokens", 4096)
        r = httpx.post(
            f"{self.base_url}/chat/completions",
            json=payload,
            headers=self._headers(),
            timeout=120.0,
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"] or ""

    def stream(self, system: str, messages: list[Message], **opts: Any) -> Iterator[str]:
        payload = self._payload(system, messages)
        payload["stream"] = True
        payload["max_tokens"] = opts.get("max_tokens", 4096)
        with httpx.stream(
            "POST",
            f"{self.base_url}/chat/completions",
            json=payload,
            headers=self._headers(),
            timeout=None,
        ) as r:
            r.raise_for_status()
            for line in r.iter_lines():
                if not line or not line.startswith("data: "):
                    continue
                data = line[len("data: ") :]
                if data == "[DONE]":
                    break
                obj = json.loads(data)
                delta = obj["choices"][0].get("delta", {}).get("content")
                if delta:
                    yield delta


register("llamacpp", LlamaCppProvider)
