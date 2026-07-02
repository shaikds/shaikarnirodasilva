"""
macOS-specific sampling: frontmost app, window title, and system idle time.
Uses only tools that ship with macOS (osascript, ioreg) - no extra installs.
"""
import subprocess
import time

from .models import PollSample

_FRONTMOST_SCRIPT = """
tell application "System Events"
    set frontApp to first application process whose frontmost is true
    set appName to name of frontApp
    try
        set winTitle to name of front window of frontApp
    on error
        set winTitle to ""
    end try
end tell
return appName & "|||" & winTitle
"""


def get_frontmost() -> tuple[str, str]:
    try:
        out = subprocess.run(
            ["osascript", "-e", _FRONTMOST_SCRIPT],
            capture_output=True, text=True, timeout=5, check=True,
        ).stdout.strip()
        app, _, title = out.partition("|||")
        return app.strip(), title.strip()
    except (subprocess.SubprocessError, OSError):
        return "Unknown", ""


def get_idle_seconds() -> float:
    try:
        out = subprocess.run(
            ["ioreg", "-c", "IOHIDSystem"],
            capture_output=True, text=True, timeout=5, check=True,
        ).stdout
        for line in out.splitlines():
            if "HIDIdleTime" in line:
                nanos = int(line.split("=")[-1].strip())
                return nanos / 1_000_000_000
    except (subprocess.SubprocessError, OSError, ValueError):
        pass
    return 0.0


def sample() -> PollSample:
    app, title = get_frontmost()
    idle = get_idle_seconds()
    return PollSample(ts=time.time(), app=app, title=title, idle_seconds=idle)
