"""
Pure-logic efficiency engine: no OS calls, no I/O.
Feed it PollSample objects; it returns Flag objects when it detects
being stuck, skimming, over-context-switching, or working too long
without a break. Kept OS-independent so it can be unit tested anywhere.
"""
from collections import deque
from .models import PollSample, Flag, Segment


def normalize_title(title: str) -> str:
    """Collapse a window title down to a stable 'topic' key.

    Browsers append " - Google Chrome" etc, and tab titles often carry a
    trailing site name after a dash/pipe; strip that noise so the same
    page doesn't look like a new topic on every poll.
    """
    if not title:
        return ""
    for sep in (" — ", " – ", " - ", " | "):
        if sep in title:
            title = title.split(sep)[0]
    return title.strip().lower()


def categorize(app: str, title: str, config: dict) -> str:
    for category, names in config.get("categories", {}).items():
        if any(name.lower() in app.lower() for name in names):
            if category == "research":
                t = title.lower()
                subs = config.get("research_subcategories", {})
                if any(k in t for k in subs.get("distraction", [])):
                    return "distraction"
                if any(k in t for k in subs.get("learning", [])):
                    return "research_learning"
                return "research"
            return category
    return "other"


class EfficiencyEngine:
    def __init__(self, config: dict):
        self.cfg = config
        self.segment: Segment | None = None
        self.app_switches: deque[float] = deque()
        self.quick_tabs: deque[float] = deque()
        self.last_break_ts: float | None = None
        self.active_seconds_since_break = 0.0
        self._cooldowns: dict[tuple, float] = {}

    def _cooled_down(self, kind: str, app: str, title: str, ts: float) -> bool:
        key = (kind, app, title)
        last = self._cooldowns.get(key)
        cooldown = self.cfg["flag_cooldown_minutes"] * 60
        if last is not None and ts - last < cooldown:
            return False
        self._cooldowns[key] = ts
        return True

    def poll(self, sample: PollSample) -> list[Flag]:
        flags: list[Flag] = []
        cfg = self.cfg
        title_norm = normalize_title(sample.title)
        category = categorize(sample.app, sample.title, cfg)

        # --- idle => break ---
        if sample.idle_seconds >= cfg["idle_break_seconds"]:
            if self.segment is not None:
                self._close_segment(sample.ts)
            self.last_break_ts = sample.ts
            self.active_seconds_since_break = 0.0
            return flags

        # --- same topic continues ---
        if self.segment and self.segment.app == sample.app and self.segment.title == title_norm:
            self.segment.last_seen_ts = sample.ts
            duration_min = (sample.ts - self.segment.start_ts) / 60
            if (category in ("coding", "research", "research_learning")
                    and duration_min >= cfg["stuck_minutes"]
                    and not self.segment.stuck_flagged):
                self.segment.stuck_flagged = True
                if self._cooled_down("stuck", sample.app, title_norm, sample.ts):
                    tip_key = "stuck_coding" if category == "coding" else "stuck_research"
                    flags.append(Flag(
                        ts=sample.ts, kind="stuck", app=sample.app, title=sample.title,
                        minutes=round(duration_min, 1),
                        detail=f"{round(duration_min)} min on the same thing without switching.",
                        tip=cfg["tips"][tip_key],
                    ))
        else:
            # --- topic changed: close old segment, evaluate skim/context switches ---
            if self.segment is not None:
                self._close_segment(sample.ts)

            skim_flag = self.check_skimming(sample.ts)
            if skim_flag is not None:
                skim_flag.app, skim_flag.title = sample.app, sample.title
                flags.append(skim_flag)

            self.app_switches.append(sample.ts)
            self._trim(self.app_switches, sample.ts, cfg["context_switch_window_minutes"] * 60)
            if (len(self.app_switches) > cfg["context_switch_threshold"]
                    and self._cooled_down("context_switch", "*", "*", sample.ts)):
                flags.append(Flag(
                    ts=sample.ts, kind="context_switch", app=sample.app, title=sample.title,
                    minutes=cfg["context_switch_window_minutes"],
                    detail=f"{len(self.app_switches)} app/window switches in the last "
                           f"{cfg['context_switch_window_minutes']} min.",
                    tip=cfg["tips"]["context_switch"],
                ))

            self.segment = Segment(
                app=sample.app, title=title_norm, category=category,
                start_ts=sample.ts, last_seen_ts=sample.ts,
            )

        # --- passive learning (idle blips inside a learning app, e.g. watching video) ---
        if category == "research_learning" and 0 < sample.idle_seconds < cfg["idle_break_seconds"]:
            self.active_seconds_since_break += cfg["poll_interval_seconds"] * 0.3
        else:
            self.active_seconds_since_break += cfg["poll_interval_seconds"]

        # --- no break for too long ---
        no_break_seconds = cfg["no_break_minutes"] * 60
        if self.active_seconds_since_break >= no_break_seconds:
            if self._cooled_down("no_break", "*", "*", sample.ts):
                flags.append(Flag(
                    ts=sample.ts, kind="no_break", app=sample.app, title=sample.title,
                    minutes=round(self.active_seconds_since_break / 60),
                    detail=f"~{round(self.active_seconds_since_break / 60)} min active with no break.",
                    tip=cfg["tips"]["no_break"],
                ))
            self.active_seconds_since_break = 0.0

        return flags

    def _close_segment(self, ts: float):
        seg = self.segment
        duration = ts - seg.start_ts
        if seg.category in ("research", "research_learning") and duration <= self.cfg["skim_max_segment_seconds"]:
            self.quick_tabs.append(ts)
        self._trim(self.quick_tabs, ts, self.cfg["skim_window_minutes"] * 60)
        self.segment = None

    def check_skimming(self, ts: float) -> Flag | None:
        if (len(self.quick_tabs) > self.cfg["skim_count_threshold"]
                and self._cooled_down("skimming", "*", "*", ts)):
            return Flag(
                ts=ts, kind="skimming", app="", title="",
                minutes=self.cfg["skim_window_minutes"],
                detail=f"{len(self.quick_tabs)} quick tab switches "
                       f"(<{self.cfg['skim_max_segment_seconds']}s each) in the last "
                       f"{self.cfg['skim_window_minutes']} min.",
                tip=self.cfg["tips"]["skimming"],
            )
        return None

    @staticmethod
    def _trim(dq: deque, now: float, window_seconds: float):
        while dq and now - dq[0] > window_seconds:
            dq.popleft()
