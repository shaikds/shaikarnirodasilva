# mac-efficiency-monitor

A lightweight background watcher for macOS that notices *when you stop working
efficiently* — stuck too long on one thing, skimming instead of learning,
too many context switches, or no break in 90+ minutes — and nudges you in the
moment. At the end of a session it gives you a **revisit list**: what to go
back to, and what to change about how you approached it.

It uses only tools that ship with macOS (`osascript`, `ioreg`) plus the
Python 3 that's already on your Mac — no menu-bar app to install, no
third-party service, no data leaving your machine.

## What it detects

| Signal | How | Nudge |
|---|---|---|
| **Stuck** | Same app + window/tab for 20+ min straight (no switch, no break) | "Re-read the error from the top" / "try the official docs example instead" |
| **Skimming** | 8+ tab switches in 5 min, each under 25s | "Pick one resource, write a 1-line note per section" |
| **Context-switch overload** | 12+ app/window switches in 10 min | "Close unrelated tabs, commit to one task for 25 min" |
| **No break** | 90+ min of continuous active time | "Take 5-10 min away from the screen" |
| **Passive learning** | Long idle-heavy stretch inside docs/video/tutorial | "Pause and try to reproduce it from memory" |

All thresholds live in `config.json` — tune them to your own working style.

## How it works

```
tracker.py  →  every 20s: frontmost app, window title, idle time
                        │
                        ▼
heuristics.py  (pure logic, unit-tested)  →  Flag("stuck" | "skimming" | ...)
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
       notifier.py          storage.py (SQLite)
   macOS notification    event log + revisit queue
              │
              ▼ (optional, only if ANTHROPIC_API_KEY is set)
         coach.py — sharpens the generic tip into one
         specific next action for what you're stuck on
```

`stuck` and `skimming` flags are also queued as **revisit items** — so even
if you dismiss the notification and move on, they resurface in your next
report instead of being lost.

## Install (on your Mac)

```bash
cd mac-efficiency-monitor
./install.sh
```

This registers a LaunchAgent that starts the tracker at login and restarts it
if it crashes. The first launch will prompt for **Accessibility** permission
(System Settings → Privacy & Security → Accessibity) — required so
`System Events` can read the frontmost window's title.

To stop it: `./uninstall.sh`

## Using it day-to-day

```bash
# see today's efficiency report: time by category, flags raised, open revisit items
python3 -m efficiency_monitor today

# just the list of things to go back to
python3 -m efficiency_monitor revisit

# mark item #3 as handled
python3 -m efficiency_monitor resolve 3
```

Example `today` output:

```
============================================
 EFFICIENCY REPORT — TODAY
============================================

Active time tracked: 4h12m

By category:
  coding               2h30m  ( 59.4%)
  research_learning      55m  ( 21.8%)
  communication           30m  ( 11.9%)
  distraction              17m  (  6.9%)

Efficiency flags today:
  stuck            x2
  context_switch   x1

Things to revisit (2 open):
  [7] 14:20  Xcode — LoginViewController.swift
        why: 24 min on the same thing without switching.
        try: Re-read the error from the top, or explain the problem out loud
             (rubber duck) before changing more code.
  [8] 16:05  Google Chrome — android design patterns singleton
        why: 34 min on the same thing without switching.
        try: Long single-source reading without progress is a sign to switch
             source or format: try the official docs example, or a 10-minute
             hands-on instead of more reading.
============================================
```

## Optional: sharper, personalized tips

Set `ANTHROPIC_API_KEY` in your shell before the LaunchAgent starts (or add
an `EnvironmentVariables` block to the plist) and `pip install anthropic`.
When set, each flag's generic tip is replaced by a one-line, context-specific
suggestion generated from what you were actually stuck on. Without it, the
tool still works fully offline using the static tips in `config.json`.

## Project layout

```
mac-efficiency-monitor/
  config.json                  thresholds + app categories, edit freely
  efficiency_monitor/
    tracker.py                 macOS sampling (osascript / ioreg)
    heuristics.py               pure detection logic (unit tested, OS-independent)
    notifier.py                 native notification banners
    storage.py                  SQLite event log + revisit queue
    coach.py                    optional Claude-powered tip sharpening
    report.py                   daily report + revisit list
    cli.py                      `run` / `today` / `revisit` / `resolve`
  launchd/*.plist               background service definition
  install.sh / uninstall.sh
  tests/                        run with: python3 -m pytest tests/
```

## Privacy

Everything is stored locally in `~/.mac_efficiency_monitor/activity.db`
(window titles included). Nothing is sent anywhere unless you opt in to the
Claude coaching tip feature, in which case only the single flagged app name,
window title, and detail string for *that flag* are sent per API call.
