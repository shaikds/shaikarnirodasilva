"""Native macOS notification banners via osascript - no extra installs."""
import subprocess

from .models import Flag

TITLES = {
    "stuck": "You might be stuck",
    "skimming": "Skimming, not learning",
    "context_switch": "Too many context switches",
    "no_break": "Time for a break",
    "passive": "Passive learning stretch",
}


def notify(flag: Flag):
    title = TITLES.get(flag.kind, "Efficiency check")
    body = f"{flag.detail} {flag.tip}"
    # AppleScript string literals: escape quotes/backslashes to keep this injection-safe.
    def esc(s: str) -> str:
        return s.replace("\\", "\\\\").replace('"', '\\"')

    script = f'display notification "{esc(body)}" with title "{esc(title)}" sound name "Glass"'
    try:
        subprocess.run(["osascript", "-e", script], capture_output=True, timeout=5)
    except (subprocess.SubprocessError, OSError):
        pass
