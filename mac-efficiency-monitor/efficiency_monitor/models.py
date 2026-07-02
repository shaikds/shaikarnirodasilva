from dataclasses import dataclass, field


@dataclass
class PollSample:
    """One snapshot of what the Mac is doing, taken every poll interval."""
    ts: float
    app: str
    title: str
    idle_seconds: float


@dataclass
class Flag:
    """A detected inefficiency moment (stuck / skimming / no-break / context-switch)."""
    ts: float
    kind: str          # "stuck" | "skimming" | "context_switch" | "no_break" | "passive"
    app: str
    title: str
    detail: str
    minutes: float = 0.0
    tip: str = ""


@dataclass
class RevisitItem:
    """Something to go back to, with a suggestion of what to change next time."""
    ts: float
    app: str
    title: str
    reason: str
    suggestion: str
    resolved: bool = False
    id: int = 0


@dataclass
class Segment:
    """A continuous stretch spent on the same (app, normalized title)."""
    app: str
    title: str
    category: str
    start_ts: float
    last_seen_ts: float
    stuck_flagged: bool = False
