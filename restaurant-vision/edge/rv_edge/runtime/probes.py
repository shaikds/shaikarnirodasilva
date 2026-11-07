"""Bridges to optional vision/ingest tools (ONVIF discovery, capacity check).

Those modules are built separately and may be missing or have slightly different signatures;
these helpers import them lazily, adapt to what they find and degrade gracefully. Any URL in a
result is redacted before it leaves this module.
"""

from __future__ import annotations

import dataclasses
import importlib
import inspect
import logging
import os
from collections.abc import Callable
from typing import Any

import psutil
from pydantic import BaseModel

from .secrets_store import redact_url

log = logging.getLogger(__name__)

DISCOVERY_MODULE = "rv_edge.ingest.discovery"
CAPACITY_MODULE = "rv_edge.vision.capacity"


def to_jsonable(value: Any) -> Any:
    """Plain JSON data from pydantic models, dataclasses, mappings and sequences, with every
    URL-looking string redacted."""
    if isinstance(value, BaseModel):
        return to_jsonable(value.model_dump(mode="json"))
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return to_jsonable(dataclasses.asdict(value))
    if isinstance(value, dict):
        return {str(k): to_jsonable(v) for k, v in value.items()}
    if isinstance(value, list | tuple | set | frozenset):
        return [to_jsonable(v) for v in value]
    if isinstance(value, str):
        return redact_url(value) if "://" in value else value
    if value is None or isinstance(value, bool | int | float):
        return value
    return str(value)


def _find(module_name: str, names: tuple[str, ...]) -> Callable[..., Any] | None:
    try:
        module = importlib.import_module(module_name)
    except ImportError:
        return None
    for name in names:
        fn = getattr(module, name, None)
        if callable(fn):
            return fn  # type: ignore[no-any-return]
    return None


def _call_with_supported(fn: Callable[..., Any], **kwargs: Any) -> Any:
    """Call ``fn`` with the subset of ``kwargs`` its signature accepts."""
    try:
        params = inspect.signature(fn).parameters
    except (TypeError, ValueError):
        return fn()
    if any(p.kind is inspect.Parameter.VAR_KEYWORD for p in params.values()):
        return fn(**kwargs)
    return fn(**{k: v for k, v in kwargs.items() if k in params})


def run_discovery(timeout_s: float = 4.0) -> dict[str, Any]:
    """ONVIF discovery through ``rv_edge.ingest.discovery``.

    Returns ``{"available": bool, "devices": [...], "error": str | None}``.
    """
    fn = _find(DISCOVERY_MODULE, ("discover", "discover_onvif", "discover_cameras"))
    if fn is None:
        return {"available": False, "devices": [], "error": "camera discovery is not available"}
    try:
        found = _call_with_supported(fn, timeout_s=timeout_s, timeout=timeout_s)
    except Exception as exc:
        log.warning("camera discovery failed: %s", exc)
        return {"available": True, "devices": [], "error": f"discovery failed: {exc}"}
    devices = to_jsonable(list(found) if found is not None else [])
    return {"available": True, "devices": devices, "error": None}


def system_summary() -> dict[str, Any]:
    vm = psutil.virtual_memory()
    freq = psutil.cpu_freq()
    return {
        "cpu_logical": psutil.cpu_count(logical=True),
        "cpu_physical": psutil.cpu_count(logical=False),
        "cpu_max_mhz": round(freq.max, 0) if freq and freq.max else None,
        "mem_total_mb": round(vm.total / (1024 * 1024)),
        "mem_available_mb": round(vm.available / (1024 * 1024)),
        "os": os.name,
    }


def run_capacity_check(**kwargs: Any) -> dict[str, Any]:
    """System capacity estimate through ``rv_edge.vision.capacity`` (how many cameras this PC
    can handle). Falls back to a plain system summary when the estimator is missing."""
    result: dict[str, Any] = {"system": system_summary()}
    fn = _find(CAPACITY_MODULE, ("estimate_capacity", "check_capacity", "run_check", "check"))
    if fn is None:
        result["available"] = False
        result["error"] = "capacity estimator is not available"
        return result
    try:
        result["capacity"] = to_jsonable(_call_with_supported(fn, **kwargs))
        result["available"] = True
    except Exception as exc:
        log.warning("capacity check failed: %s", exc)
        result["available"] = True
        result["error"] = f"capacity check failed: {exc}"
    return result
