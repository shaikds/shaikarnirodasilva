from __future__ import annotations

import os
from typing import Any, Iterator

from . import register
from .base import Message


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, model: str, options: dict[str, Any]) -> None:
        self.model = model
        self.options = options
        self._client = None

    def _client_lazy(self):
        if self._client is not None:
            return self._client
        try:
            from anthropic import Anthropic
        except ImportError as e:
            raise RuntimeError(
                "anthropic SDK not installed. `pip install ai-export[anthropic]`."
            ) from e
        api_key = self.options.get("api_key") or os.environ.get("ANTHROPIC_API_KEY")
        self._client = Anthropic(api_key=api_key) if api_key else Anthropic()
        return self._client

    def chat(self, system: str, messages: list[Message], **opts: Any) -> str:
        client = self._client_lazy()
        resp = client.messages.create(
            model=self.model,
            system=system,
            max_tokens=opts.get("max_tokens", 4096),
            messages=[{"role": m.role, "content": m.content} for m in messages],
        )
        return "".join(
            block.text for block in resp.content if getattr(block, "type", "") == "text"
        )

    def stream(self, system: str, messages: list[Message], **opts: Any) -> Iterator[str]:
        client = self._client_lazy()
        with client.messages.stream(
            model=self.model,
            system=system,
            max_tokens=opts.get("max_tokens", 4096),
            messages=[{"role": m.role, "content": m.content} for m in messages],
        ) as s:
            for text in s.text_stream:
                yield text


register("anthropic", AnthropicProvider)
