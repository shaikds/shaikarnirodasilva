from __future__ import annotations

import os
from typing import Any, Iterator

from . import register
from .base import Message


class OpenAIProvider:
    name = "openai"

    def __init__(self, model: str, options: dict[str, Any]) -> None:
        self.model = model
        self.options = options
        self._client = None

    def _client_lazy(self):
        if self._client is not None:
            return self._client
        try:
            from openai import OpenAI
        except ImportError as e:
            raise RuntimeError(
                "openai SDK not installed. `pip install ai-export[openai]`."
            ) from e
        api_key = self.options.get("api_key") or os.environ.get("OPENAI_API_KEY")
        self._client = OpenAI(api_key=api_key)
        return self._client

    def _payload(self, system: str, messages: list[Message]) -> list[dict[str, str]]:
        out: list[dict[str, str]] = []
        if system:
            out.append({"role": "system", "content": system})
        out.extend({"role": m.role, "content": m.content} for m in messages)
        return out

    def chat(self, system: str, messages: list[Message], **opts: Any) -> str:
        client = self._client_lazy()
        resp = client.chat.completions.create(
            model=self.model,
            messages=self._payload(system, messages),
            max_tokens=opts.get("max_tokens", 4096),
        )
        return resp.choices[0].message.content or ""

    def stream(self, system: str, messages: list[Message], **opts: Any) -> Iterator[str]:
        client = self._client_lazy()
        s = client.chat.completions.create(
            model=self.model,
            messages=self._payload(system, messages),
            max_tokens=opts.get("max_tokens", 4096),
            stream=True,
        )
        for chunk in s:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta


register("openai", OpenAIProvider)
