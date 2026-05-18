from __future__ import annotations

from ..config import Config
from .base import LLMProvider, Message

_REGISTRY: dict[str, type[LLMProvider]] = {}


def register(name: str, cls: type[LLMProvider]) -> None:
    _REGISTRY[name] = cls


def get_provider(
    cfg: Config,
    provider: str | None = None,
    model: str | None = None,
) -> LLMProvider:
    name = provider or cfg.llm_provider()
    if name not in _REGISTRY:
        raise ValueError(
            f"Unknown LLM provider {name!r}. Known: {sorted(_REGISTRY)}"
        )
    cls = _REGISTRY[name]
    return cls(
        model=model or cfg.llm_model(),
        options=cfg.llm_options(name),
    )


def _autoregister() -> None:
    from . import anthropic as _a  # noqa: F401
    from . import openai as _o  # noqa: F401
    from . import ollama as _ol  # noqa: F401
    from . import llamacpp as _lc  # noqa: F401


_autoregister()

__all__ = ["LLMProvider", "Message", "get_provider", "register"]
