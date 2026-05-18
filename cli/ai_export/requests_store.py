from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Iterator

from .adapters.base import ExportPlan, RequestRef


def path(data_dir: Path) -> Path:
    return data_dir / "requests.jsonl"


def append(data_dir: Path, ref: RequestRef) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    with path(data_dir).open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(_serialize(ref)) + "\n")


def load_all(data_dir: Path) -> list[RequestRef]:
    p = path(data_dir)
    if not p.exists():
        return []
    out: list[RequestRef] = []
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        out.append(_deserialize(json.loads(line)))
    # Keep only the latest record per request_id
    by_id: dict[str, RequestRef] = {}
    for ref in out:
        by_id[ref.request_id] = ref
    return list(by_id.values())


def update(data_dir: Path, ref: RequestRef) -> None:
    append(data_dir, ref)


def active(data_dir: Path) -> Iterator[RequestRef]:
    for ref in load_all(data_dir):
        if ref.status in {"PENDING", "READY", "DOWNLOADED"}:
            yield ref


def find(data_dir: Path, request_id: str) -> RequestRef | None:
    for ref in load_all(data_dir):
        if ref.request_id == request_id:
            return ref
    return None


def _serialize(ref: RequestRef) -> dict:
    d = asdict(ref)
    return d


def _deserialize(d: dict) -> RequestRef:
    plan_d = d.get("plan") or {}
    plan = ExportPlan(
        instructions=plan_d.get("instructions", ""),
        url=plan_d.get("url"),
        email_from=plan_d.get("email_from"),
        email_subject_contains=plan_d.get("email_subject_contains"),
        extras=plan_d.get("extras") or {},
    )
    return RequestRef(
        service=d["service"],
        request_id=d["request_id"],
        created_at=d["created_at"],
        plan=plan,
        status=d.get("status", "PENDING"),
        artifact_path=d.get("artifact_path"),
    )
