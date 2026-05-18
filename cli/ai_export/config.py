from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

DEFAULT_CONFIG_PATH = Path(
    os.environ.get("AI_EXPORT_CONFIG", "~/.config/ai-export/config.yaml")
).expanduser()

DEFAULTS: dict[str, Any] = {
    "llm": {
        "provider": "anthropic",
        "model": "claude-opus-4-7",
        "anthropic": {},
        "openai": {},
        "ollama": {"host": "http://localhost:11434"},
        "llamacpp": {"base_url": "http://localhost:8080/v1"},
    },
    "data_dir": "~/ai-export-data",
    "email": {
        "imap_host": "imap.gmail.com",
        "imap_port": 993,
        "mailbox": "INBOX",
    },
    "services": {},
}


@dataclass
class Config:
    raw: dict[str, Any] = field(default_factory=dict)
    source: Path | None = None

    @property
    def data_dir(self) -> Path:
        return Path(self.raw.get("data_dir", DEFAULTS["data_dir"])).expanduser()

    def llm_provider(self) -> str:
        return os.environ.get(
            "AI_EXPORT_PROVIDER",
            self.raw.get("llm", {}).get("provider") or DEFAULTS["llm"]["provider"],
        )

    def llm_model(self) -> str:
        return os.environ.get(
            "AI_EXPORT_MODEL",
            self.raw.get("llm", {}).get("model") or DEFAULTS["llm"]["model"],
        )

    def llm_options(self, provider: str) -> dict[str, Any]:
        base = DEFAULTS["llm"].get(provider, {}) or {}
        override = (self.raw.get("llm", {}) or {}).get(provider, {}) or {}
        return {**base, **override}

    def email(self) -> dict[str, Any]:
        merged = {**DEFAULTS["email"], **(self.raw.get("email") or {})}
        if pw := os.environ.get("AI_EXPORT_EMAIL_PASSWORD"):
            merged["password"] = pw
        return merged

    def service(self, name: str) -> dict[str, Any]:
        return (self.raw.get("services") or {}).get(name, {}) or {}


def load(path: Path | None = None) -> Config:
    p = path or DEFAULT_CONFIG_PATH
    if not p.exists():
        return Config(raw={}, source=None)
    with p.open() as fh:
        data = yaml.safe_load(fh) or {}
    return Config(raw=data, source=p)
