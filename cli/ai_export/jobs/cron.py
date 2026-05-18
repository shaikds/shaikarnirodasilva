from __future__ import annotations

import platform
import shutil
import subprocess
from pathlib import Path

LAUNCHD_PLIST = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.aiexport.poll</string>
  <key>ProgramArguments</key>
  <array>
    <string>{binary}</string>
    <string>poll</string>
  </array>
  <key>StartInterval</key><integer>{seconds}</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>{log}</string>
  <key>StandardErrorPath</key><string>{log}</string>
</dict></plist>
"""

LAUNCHD_LABEL = "com.aiexport.poll"
CRON_MARK = "# ai-export poll"


def install(interval_seconds: int) -> str:
    binary = shutil.which("ai-export") or "ai-export"
    system = platform.system()
    if system == "Darwin":
        return _install_launchd(binary, interval_seconds)
    if system == "Linux":
        return _install_crontab(binary, interval_seconds)
    raise RuntimeError(f"Unsupported OS for cron install: {system}")


def remove() -> str:
    system = platform.system()
    if system == "Darwin":
        return _remove_launchd()
    if system == "Linux":
        return _remove_crontab()
    raise RuntimeError(f"Unsupported OS for cron remove: {system}")


def _install_launchd(binary: str, interval_seconds: int) -> str:
    plist_dir = Path("~/Library/LaunchAgents").expanduser()
    plist_dir.mkdir(parents=True, exist_ok=True)
    plist_path = plist_dir / f"{LAUNCHD_LABEL}.plist"
    log_path = Path("~/Library/Logs/ai-export.log").expanduser()
    plist_path.write_text(
        LAUNCHD_PLIST.format(
            binary=binary,
            seconds=interval_seconds,
            log=str(log_path),
        )
    )
    subprocess.run(["launchctl", "unload", str(plist_path)], check=False)
    subprocess.run(["launchctl", "load", str(plist_path)], check=True)
    return str(plist_path)


def _remove_launchd() -> str:
    plist_path = Path(
        f"~/Library/LaunchAgents/{LAUNCHD_LABEL}.plist"
    ).expanduser()
    if plist_path.exists():
        subprocess.run(["launchctl", "unload", str(plist_path)], check=False)
        plist_path.unlink()
    return str(plist_path)


def _install_crontab(binary: str, interval_seconds: int) -> str:
    # crontab is minute-granular; round up.
    minutes = max(1, interval_seconds // 60)
    if minutes >= 60:
        spec = f"0 */{max(1, minutes // 60)} * * *"
    else:
        spec = f"*/{minutes} * * * *"
    existing = subprocess.run(
        ["crontab", "-l"], capture_output=True, text=True
    ).stdout
    lines = [ln for ln in existing.splitlines() if CRON_MARK not in ln and "ai-export" not in ln]
    lines.append(f"{spec} {binary} poll {CRON_MARK}")
    new = "\n".join(lines) + "\n"
    subprocess.run(["crontab", "-"], input=new, text=True, check=True)
    return spec


def _remove_crontab() -> str:
    existing = subprocess.run(
        ["crontab", "-l"], capture_output=True, text=True
    ).stdout
    lines = [ln for ln in existing.splitlines() if CRON_MARK not in ln and "ai-export" not in ln]
    new = "\n".join(lines) + "\n"
    subprocess.run(["crontab", "-"], input=new, text=True, check=True)
    return "removed"
