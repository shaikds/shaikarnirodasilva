"""Structured (JSON) logging and an access-log ASGI middleware.

Secrets never reach the logs: the access log records paths without query strings (the
WebSocket ``token`` travels in the query), and uvicorn's own access log is filtered too.
"""

import json
import logging
import re
import sys
import time
import uuid
from typing import Any

from starlette.types import ASGIApp, Message, Receive, Scope, Send

_RESERVED = set(vars(logging.makeLogRecord({})).keys()) | {"message", "asctime"}
_TOKEN_RE = re.compile(r"(token=)[^&\s\"]+")
_HANDLER_NAME = "rv_cloud"

access_log = logging.getLogger("rv_cloud.access")


class JsonFormatter(logging.Formatter):
    """One JSON object per line: ts, level, logger, msg, extra fields, exception text."""

    def format(self, record: logging.LogRecord) -> str:
        data: dict[str, Any] = {
            "ts": round(record.created, 3),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key, value in vars(record).items():
            if key not in _RESERVED and not key.startswith("_"):
                data[key] = value
        if record.exc_info:
            data["exc"] = self.formatException(record.exc_info)
        return json.dumps(data, default=str, ensure_ascii=False)


class RedactTokensFilter(logging.Filter):
    """Masks ``token=...`` in log messages and arguments (e.g. uvicorn access lines)."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = _TOKEN_RE.sub(r"\1***", record.msg)
        if isinstance(record.args, tuple):
            record.args = tuple(
                _TOKEN_RE.sub(r"\1***", a) if isinstance(a, str) else a for a in record.args
            )
        return True


def configure_logging(level: str = "INFO", json_format: bool = True) -> None:
    """Install one stderr handler on the root logger (idempotent)."""
    root = logging.getLogger()
    root.setLevel(level.upper())
    if any(getattr(h, "name", None) == _HANDLER_NAME for h in root.handlers):
        return
    handler = logging.StreamHandler(sys.stderr)
    handler.name = _HANDLER_NAME
    handler.setFormatter(
        JsonFormatter() if json_format else logging.Formatter("%(levelname)s %(name)s %(message)s")
    )
    handler.addFilter(RedactTokensFilter())
    root.addHandler(handler)
    for name in ("uvicorn.access", "uvicorn.error"):
        logging.getLogger(name).addFilter(RedactTokensFilter())


class AccessLogMiddleware:
    """Assigns ``X-Request-ID`` and logs method, path (no query), status and duration."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return
        request_id = uuid.uuid4().hex[:16]
        scope.setdefault("state", {})["request_id"] = request_id
        started = time.perf_counter()
        status = 0

        async def send_wrapper(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = int(message["status"])
                headers = list(message.get("headers", []))
                headers.append((b"x-request-id", request_id.encode()))
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            access_log.info(
                "request",
                extra={
                    "request_id": request_id,
                    "kind": scope["type"],
                    "method": scope.get("method", "WS"),
                    "path": scope.get("path", ""),
                    "status": status,
                    "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                },
            )
