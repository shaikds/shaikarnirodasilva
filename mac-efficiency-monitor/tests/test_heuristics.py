import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from efficiency_monitor.heuristics import EfficiencyEngine, normalize_title, categorize
from efficiency_monitor.models import PollSample

CONFIG = json.loads((Path(__file__).resolve().parent.parent / "config.json").read_text())


def make_engine():
    return EfficiencyEngine(json.loads(json.dumps(CONFIG)))


def test_normalize_title_strips_app_suffix():
    assert normalize_title("Stack Overflow - python list comprehension - Google Chrome") == \
        "stack overflow"
    assert normalize_title("") == ""


def test_categorize_coding_and_learning():
    assert categorize("Xcode", "MyApp.swift", CONFIG) == "coding"
    assert categorize("Google Chrome", "Stack Overflow - how to X", CONFIG) == "research_learning"
    assert categorize("Google Chrome", "Reddit - funny cats", CONFIG) == "distraction"


def test_stuck_detection_fires_after_threshold():
    engine = make_engine()
    t0 = 1_000_000.0
    flags = []
    # same app+title for stuck_minutes + 1, polled every interval
    interval = CONFIG["poll_interval_seconds"]
    steps = int((CONFIG["stuck_minutes"] * 60) / interval) + 2
    for i in range(steps):
        s = PollSample(ts=t0 + i * interval, app="Xcode", title="Bug.swift", idle_seconds=0)
        flags += engine.poll(s)
    kinds = [f.kind for f in flags]
    assert "stuck" in kinds
    # should only fire once per segment (no duplicate spam within same stuck stretch)
    assert kinds.count("stuck") == 1


def test_no_stuck_flag_for_short_session():
    engine = make_engine()
    t0 = 2_000_000.0
    flags = []
    for i in range(5):
        s = PollSample(ts=t0 + i * CONFIG["poll_interval_seconds"], app="Xcode",
                        title="Bug.swift", idle_seconds=0)
        flags += engine.poll(s)
    assert not any(f.kind == "stuck" for f in flags)


def test_skimming_detection_on_rapid_tab_switches():
    engine = make_engine()
    t0 = 3_000_000.0
    flags = []
    # hop across many short-lived tabs, well under skim_max_segment_seconds each
    for i in range(12):
        s = PollSample(ts=t0 + i * 10, app="Google Chrome",
                        title=f"Some Doc Page {i} - Google Chrome", idle_seconds=0)
        flags += engine.poll(s)
    assert any(f.kind == "skimming" for f in flags)


def test_idle_break_resets_stuck_progress():
    engine = make_engine()
    t0 = 4_000_000.0
    interval = CONFIG["poll_interval_seconds"]
    flags = []
    half_steps = int((CONFIG["stuck_minutes"] * 60) / interval / 2)
    for i in range(half_steps):
        s = PollSample(ts=t0 + i * interval, app="Xcode", title="Bug.swift", idle_seconds=0)
        flags += engine.poll(s)
    # take a real break
    break_ts = t0 + half_steps * interval
    flags += engine.poll(PollSample(ts=break_ts, app="Xcode", title="Bug.swift",
                                     idle_seconds=CONFIG["idle_break_seconds"] + 5))
    # resume - should need a fresh full stuck window before flagging again
    for i in range(half_steps + 1):
        s = PollSample(ts=break_ts + i * interval, app="Xcode", title="Bug.swift", idle_seconds=0)
        flags += engine.poll(s)
    assert not any(f.kind == "stuck" for f in flags)


def test_no_break_flag_after_long_continuous_work():
    engine = make_engine()
    t0 = 5_000_000.0
    interval = CONFIG["poll_interval_seconds"]
    flags = []
    steps = int((CONFIG["no_break_minutes"] * 60) / interval) + 2
    # keep switching apps quickly so "stuck" doesn't fire and mask the no_break flag
    for i in range(steps):
        app = "Xcode" if i % 2 == 0 else "Terminal"
        s = PollSample(ts=t0 + i * interval, app=app, title=f"file{i}.swift", idle_seconds=0)
        flags += engine.poll(s)
    assert any(f.kind == "no_break" for f in flags)


if __name__ == "__main__":
    import pytest
    sys.exit(pytest.main([__file__, "-v"]))
