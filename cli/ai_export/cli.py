from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import typer

from . import config as cfg_mod
from . import requests_store
from .adapters import get_adapter
from .jobs import cron as cron_job
from .jobs import email_poll
from .store import canonical as canonical_store
from .store import markdown as markdown_store

app = typer.Typer(
    add_completion=False,
    help="Own your AI data: export, normalize, re-inject.",
    no_args_is_help=True,
)


def _cfg() -> cfg_mod.Config:
    return cfg_mod.load()


def _service_dir(cfg: cfg_mod.Config, service: str) -> Path:
    return cfg.data_dir / service


# ---------------------------------------------------------------------------
# request
# ---------------------------------------------------------------------------

@app.command()
def request(
    service: str = typer.Argument(..., help="Service name, e.g. chatgpt"),
    provider: Optional[str] = typer.Option(None, "--provider", help="LLM provider override"),
    model: Optional[str] = typer.Option(None, "--model", help="LLM model override"),
) -> None:
    """Start an export request for SERVICE and print the steps to follow."""
    _ = provider, model  # reserved for future LLM-assisted discovery
    cfg = _cfg()
    adapter = get_adapter(service)
    plan = adapter.discover()
    overrides = cfg.service(service)
    if "email_from" in overrides:
        plan.email_from = overrides["email_from"]
    if "email_subject_contains" in overrides:
        plan.email_subject_contains = overrides["email_subject_contains"]
    ref = adapter.request_export(plan)
    requests_store.append(cfg.data_dir, ref)
    typer.echo(f"Created request {ref.request_id} for {service}.")
    typer.echo("")
    typer.echo(plan.instructions)
    typer.echo("")
    typer.echo(f"Once you've kicked off the export, run: ai-export poll")


# ---------------------------------------------------------------------------
# poll
# ---------------------------------------------------------------------------

@app.command()
def poll() -> None:
    """Check the configured mailbox for export-ready emails."""
    cfg = _cfg()
    email_cfg = cfg.email()
    password = email_cfg.get("password")
    if not (email_cfg.get("username") and password):
        typer.echo("Email is not configured (set email.username and AI_EXPORT_EMAIL_PASSWORD).")
        raise typer.Exit(code=2)

    pending = list(requests_store.active(cfg.data_dir))
    if not pending:
        typer.echo("No active export requests.")
        return

    msgs = [
        m.as_dict()
        for m in email_poll.fetch_recent(
            host=email_cfg["imap_host"],
            port=email_cfg["imap_port"],
            username=email_cfg["username"],
            password=password,
            mailbox=email_cfg.get("mailbox", "INBOX"),
        )
    ]

    for ref in pending:
        if ref.status not in {"PENDING", "READY"}:
            continue
        adapter = get_adapter(ref.service)
        result = adapter.poll(ref, msgs)
        if result.status == "READY" and result.artifact_url:
            typer.echo(f"{ref.request_id}: READY → downloading")
            raw_dir = _service_dir(cfg, ref.service) / "raw"
            artifact = adapter.download(ref, result.artifact_url, raw_dir)
            ref.status = "DOWNLOADED"
            ref.artifact_path = str(artifact)
            requests_store.update(cfg.data_dir, ref)
            _process(cfg, ref)
        else:
            typer.echo(f"{ref.request_id}: {result.status}")


# ---------------------------------------------------------------------------
# download / parse / render — also usable manually
# ---------------------------------------------------------------------------

@app.command()
def download(
    request_id: str = typer.Argument(...),
    url: str = typer.Option(..., "--url", help="Direct artifact URL"),
) -> None:
    """Download a ready artifact by URL (manual fallback)."""
    cfg = _cfg()
    ref = requests_store.find(cfg.data_dir, request_id)
    if not ref:
        typer.echo(f"No such request: {request_id}")
        raise typer.Exit(code=1)
    adapter = get_adapter(ref.service)
    raw_dir = _service_dir(cfg, ref.service) / "raw"
    artifact = adapter.download(ref, url, raw_dir)
    ref.status = "DOWNLOADED"
    ref.artifact_path = str(artifact)
    requests_store.update(cfg.data_dir, ref)
    typer.echo(f"Saved → {artifact}")


@app.command()
def parse(
    request_id: str = typer.Argument(...),
) -> None:
    """Parse a downloaded artifact into canonical JSON."""
    cfg = _cfg()
    ref = requests_store.find(cfg.data_dir, request_id)
    if not ref or not ref.artifact_path:
        typer.echo(f"Request not downloaded yet: {request_id}")
        raise typer.Exit(code=1)
    adapter = get_adapter(ref.service)
    dump = adapter.parse(Path(ref.artifact_path))
    dest = _service_dir(cfg, ref.service) / "canonical" / f"{ref.request_id}.json"
    canonical_store.write(dump, dest)
    typer.echo(f"Canonical JSON → {dest}")


@app.command()
def render(
    request_id: str = typer.Argument(...),
) -> None:
    """Render an existing canonical JSON to the Markdown bundle."""
    cfg = _cfg()
    ref = requests_store.find(cfg.data_dir, request_id)
    if not ref:
        typer.echo(f"No such request: {request_id}")
        raise typer.Exit(code=1)
    canon_path = _service_dir(cfg, ref.service) / "canonical" / f"{ref.request_id}.json"
    if not canon_path.exists():
        typer.echo(f"Canonical file missing: {canon_path}")
        raise typer.Exit(code=1)
    dump = _load_canonical(canon_path)
    out_dir = _service_dir(cfg, ref.service) / "markdown" / ref.request_id
    paths = markdown_store.write_bundle(dump, out_dir)
    typer.echo(f"Markdown bundle → {out_dir}")
    typer.echo(f"Paste-ready file → {out_dir / 'PASTE.md'}")
    _ = paths


def _process(cfg: cfg_mod.Config, ref) -> None:
    adapter = get_adapter(ref.service)
    dump = adapter.parse(Path(ref.artifact_path))
    canon_path = _service_dir(cfg, ref.service) / "canonical" / f"{ref.request_id}.json"
    canonical_store.write(dump, canon_path)
    out_dir = _service_dir(cfg, ref.service) / "markdown" / ref.request_id
    markdown_store.write_bundle(dump, out_dir)
    ref.status = "DONE"
    requests_store.update(cfg.data_dir, ref)
    typer.echo(f"{ref.request_id}: DONE — bundle at {out_dir}")


def _load_canonical(path: Path):
    data = json.loads(path.read_text(encoding="utf-8"))
    convs = [
        canonical_store.CanonicalConversation(
            id=c["id"],
            title=c["title"],
            created_at=c.get("created_at"),
            updated_at=c.get("updated_at"),
            model=c.get("model"),
            messages=[
                canonical_store.CanonicalMessage(
                    role=m["role"],
                    content=m["content"],
                    timestamp=m.get("timestamp"),
                )
                for m in c.get("messages", [])
            ],
        )
        for c in data.get("conversations", [])
    ]
    return canonical_store.CanonicalDump(
        service=data["service"],
        exported_at=data["exported_at"],
        source_export_id=data.get("source_export_id"),
        conversations=convs,
    )


# ---------------------------------------------------------------------------
# cron
# ---------------------------------------------------------------------------

cron_app = typer.Typer(help="Manage the background poller.", no_args_is_help=True)
app.add_typer(cron_app, name="cron")


@cron_app.command("install")
def cron_install(
    interval: str = typer.Option("1h", "--interval", help="e.g. 30m, 1h, 6h"),
) -> None:
    seconds = _parse_interval(interval)
    out = cron_job.install(seconds)
    typer.echo(f"Installed poller every {interval} ({seconds}s): {out}")


@cron_app.command("remove")
def cron_remove() -> None:
    typer.echo(cron_job.remove())


def _parse_interval(s: str) -> int:
    s = s.strip().lower()
    if s.endswith("h"):
        return int(float(s[:-1]) * 3600)
    if s.endswith("m"):
        return int(float(s[:-1]) * 60)
    if s.endswith("s"):
        return int(s[:-1])
    return int(s)


# ---------------------------------------------------------------------------
# delete (guarded)
# ---------------------------------------------------------------------------

@app.command()
def delete(
    service: str = typer.Argument(...),
    confirm: bool = typer.Option(
        False,
        "--i-understand-this-is-irreversible",
        help="Required to proceed.",
    ),
) -> None:
    """Request data deletion from SERVICE. Refuses without explicit confirmation."""
    cfg = _cfg()
    if not confirm:
        typer.echo(
            f"Refusing: pass --i-understand-this-is-irreversible to request deletion of {service}."
        )
        raise typer.Exit(code=2)
    typed = typer.prompt(f"Type the service name '{service}' to confirm")
    if typed.strip() != service:
        typer.echo("Mismatch. Aborting.")
        raise typer.Exit(code=2)

    log = cfg.data_dir / "deletion-log.jsonl"
    log.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "service": service,
        "requested_at": datetime.now(timezone.utc).isoformat(),
        "status": "ATTEMPTED",
    }
    try:
        adapter = get_adapter(service)
        adapter.request_deletion(
            requests_store.find(cfg.data_dir, service) or
            _stub_ref(service)
        )
        entry["status"] = "REQUESTED"
        typer.echo(f"Deletion requested for {service}.")
    except NotImplementedError as e:
        entry["status"] = "MANUAL_REQUIRED"
        entry["detail"] = str(e)
        typer.echo(str(e))
    finally:
        with log.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry) + "\n")


def _stub_ref(service: str):
    from .adapters.base import ExportPlan, RequestRef
    return RequestRef(
        service=service,
        request_id="manual",
        created_at=datetime.now(timezone.utc).isoformat(),
        plan=ExportPlan(instructions=""),
    )


# ---------------------------------------------------------------------------
# llm: utility for debugging / verifying provider swap
# ---------------------------------------------------------------------------

@app.command("llm-ping")
def llm_ping(
    provider: Optional[str] = typer.Option(None, "--provider"),
    model: Optional[str] = typer.Option(None, "--model"),
    prompt: str = typer.Option("Say 'pong' and nothing else.", "--prompt"),
) -> None:
    """Send a one-shot prompt to the selected LLM provider (sanity check)."""
    from .llm import Message, get_provider

    cfg = _cfg()
    p = get_provider(cfg, provider=provider, model=model)
    typer.echo(f"[{p.name}/{p.model}] →")
    typer.echo(p.chat("You are a terse assistant.", [Message(role="user", content=prompt)]))


if __name__ == "__main__":
    app()
