from __future__ import annotations

from .base import Adapter, ExportPlan, PollResult, RequestRef

_REGISTRY: dict[str, type[Adapter]] = {}


def register(name: str, cls: type[Adapter]) -> None:
    _REGISTRY[name] = cls


def get_adapter(name: str) -> Adapter:
    if name not in _REGISTRY:
        raise ValueError(
            f"Unknown service {name!r}. Known: {sorted(_REGISTRY)}"
        )
    return _REGISTRY[name]()


def _autoregister() -> None:
    from . import chatgpt as _c  # noqa: F401


_autoregister()

__all__ = ["Adapter", "ExportPlan", "PollResult", "RequestRef", "get_adapter", "register"]
