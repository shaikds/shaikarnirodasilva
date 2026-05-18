from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ..store.canonical import CanonicalDump


@dataclass
class ExportPlan:
    """How to ask the service for a data export."""
    instructions: str                  # human-readable steps
    url: str | None = None             # where to go in the UI
    email_from: str | None = None      # who the export-ready email comes from
    email_subject_contains: str | None = None
    extras: dict[str, Any] = field(default_factory=dict)


@dataclass
class RequestRef:
    service: str
    request_id: str
    created_at: str
    plan: ExportPlan
    status: str = "PENDING"            # PENDING | READY | DOWNLOADED | DONE | FAILED
    artifact_path: str | None = None


@dataclass
class PollResult:
    status: str                        # PENDING | READY | FAILED
    artifact_url: str | None = None
    detail: str | None = None


class Adapter(ABC):
    name: str

    @abstractmethod
    def discover(self) -> ExportPlan: ...

    @abstractmethod
    def request_export(self, plan: ExportPlan) -> RequestRef: ...

    @abstractmethod
    def poll(self, ref: RequestRef, email_messages: list[dict[str, Any]]) -> PollResult: ...

    @abstractmethod
    def download(self, ref: RequestRef, artifact_url: str, dest_dir: Path) -> Path: ...

    @abstractmethod
    def parse(self, raw_path: Path) -> CanonicalDump: ...

    def request_deletion(self, ref: RequestRef) -> None:
        raise NotImplementedError(
            f"{self.name}: deletion not implemented. Use the service's UI."
        )
