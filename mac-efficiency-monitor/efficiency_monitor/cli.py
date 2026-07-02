import argparse
import json
import sys
import time
from pathlib import Path

from . import storage, report, tracker, notifier, coach
from .heuristics import EfficiencyEngine, categorize, normalize_title

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.json"


def load_config() -> dict:
    with open(CONFIG_PATH) as f:
        return json.load(f)


def cmd_run(args):
    cfg = load_config()
    engine = EfficiencyEngine(cfg)
    conn = storage.connect()
    print(f"mac-efficiency-monitor running (poll every {cfg['poll_interval_seconds']}s). Ctrl+C to stop.")
    try:
        while True:
            s = tracker.sample()
            category = categorize(s.app, s.title, cfg)
            storage.log_event(conn, s.ts, s.app, s.title, category, s.idle_seconds)

            for flag in engine.poll(s):
                flag.tip = coach.sharpen(flag)
                storage.log_flag(conn, flag)
                notifier.notify(flag)
                print(f"[{time.strftime('%H:%M:%S')}] {flag.kind}: {flag.detail}")

            time.sleep(cfg["poll_interval_seconds"])
    except KeyboardInterrupt:
        print("\nStopped.")


def cmd_today(args):
    conn = storage.connect()
    print(report.build_today_report(conn))


def cmd_revisit(args):
    conn = storage.connect()
    print(report.build_revisit_list(conn))


def cmd_resolve(args):
    conn = storage.connect()
    storage.resolve_revisit(conn, args.id)
    print(f"Marked #{args.id} as resolved.")


def main(argv=None):
    parser = argparse.ArgumentParser(prog="efficiency-monitor")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("run", help="Start the background tracker (runs in foreground; used by launchd).").set_defaults(func=cmd_run)
    sub.add_parser("today", help="Print today's efficiency report.").set_defaults(func=cmd_today)
    sub.add_parser("revisit", help="List open items to go back to.").set_defaults(func=cmd_revisit)

    resolve = sub.add_parser("resolve", help="Mark a revisit item as done.")
    resolve.add_argument("id", type=int)
    resolve.set_defaults(func=cmd_resolve)

    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    sys.exit(main())
