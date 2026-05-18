from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterator, Protocol, runtime_checkable


@dataclass
class Message:
    role: str  # "user" | "assistant" | "system"
    content: str


@runtime_checkable
class LLMProvider(Protocol):
    name: str
    model: str

    def __init__(self, model: str, options: dict[str, Any]) -> None: ...

    def chat(
        self,
        system: str,
        messages: list[Message],
        **opts: Any,
    ) -> str: ...

    def stream(
        self,
        system: str,
        messages: list[Message],
        **opts: Any,
    ) -> Iterator[str]: ...
