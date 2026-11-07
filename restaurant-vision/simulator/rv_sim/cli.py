"""``rv-sim``: describe, run and evaluate simulator scenarios.

* ``rv-sim describe SCENARIO``: validate a scenario and print what it simulates.
* ``rv-sim run SCENARIO [--truth-out F] [--log-out F]``: run the world (no edge) as fast as
  possible and print/write the ground truth.
* ``rv-sim eval SCENARIO [--tracker fallback|bytetrack] [--json F]``: run the edge pipeline on
  a manual clock and score the events against ground truth.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
from collections.abc import Sequence
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from pydantic import ValidationError

from .adapter import build_simulation
from .evaluate import AnalyticsUnavailable, evaluate, format_report
from .scenario import Scenario, load_scenario
from .world import World


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="rv-sim", description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("scenario", type=Path, help="scenario YAML file")
    common.add_argument("--seed", type=int, default=0, help="added to the scenario's seed")

    sub.add_parser("describe", parents=[common], help="validate and summarize a scenario")
    run = sub.add_parser("run", parents=[common], help="simulate and report ground truth")
    run.add_argument("--truth-out", type=Path, help="write the full ground truth as JSON")
    run.add_argument("--log-out", type=Path, help="write the true event log as JSON lines")
    ev = sub.add_parser("eval", parents=[common], help="score the edge analytics")
    ev.add_argument("--tracker", choices=["fallback", "bytetrack"], default="fallback")
    ev.add_argument(
        "--detector",
        choices=["auto", "edge", "fallback"],
        default="auto",
        help="bytetrack only: rv_edge SimulatedDetector (edge) or pass-through",
    )
    ev.add_argument("--json", type=Path, help="write the scores as JSON")
    ev.add_argument("--events-out", type=Path, help="write the emitted events as JSON lines")
    ev.add_argument("--quiet", action="store_true", help="no progress output")
    args = parser.parse_args(argv)

    try:
        scenario = load_scenario(args.scenario)
    except (OSError, ValueError, ValidationError) as exc:
        print(f"error: {args.scenario}: {exc}", file=sys.stderr)
        return 2
    if args.command == "describe":
        print(describe(scenario, seed=args.seed))
        return 0
    if args.command == "run":
        return _run(scenario, args)
    return _eval(scenario, args)


def describe(scenario: Scenario, *, seed: int = 0) -> str:
    """Human summary of a scenario (arrivals are drawn with the given seed)."""
    config = scenario.site_config
    world = World(scenario, seed=seed)
    tz = ZoneInfo(config.timezone)
    start = dt.datetime.fromtimestamp(world.start_ts, tz)
    end = dt.datetime.fromtimestamp(world.end_ts, tz)
    seats = sum(t.seats for t in config.tables)
    sizes = [p.size for p in world.plans]
    staff = scenario.staff
    th = config.thresholds
    lines = [
        f"scenario {scenario.name}: {scenario.description}".rstrip(": "),
        f"  site        {config.site_id} ({config.timezone}); cameras "
        f"{', '.join(world.camera_ids)}; {len(config.tables)} tables, {seats} seats",
        f"  window      {start:%Y-%m-%d %H:%M} -> {end:%H:%M} local "
        f"({scenario.run.duration / 60:.0f} min at {world.fps:g} fps, "
        f"{world.end_tick + 1} frames per camera)",
        f"  seed        {world.seed} (scenario {scenario.seed} + {seed})",
    ]
    if scenario.arrivals.hourly_rates is not None:
        rates = ", ".join(
            f"{h:02d}h:{r:g}" for h, r in sorted(scenario.arrivals.hourly_rates.items())
        )
        lines.append(f"  arrivals    hourly rates (parties/h) {rates}")
    else:
        lines.append(f"  arrivals    {len(scenario.arrivals.explicit or [])} scripted parties")
    mean_size = sum(sizes) / len(sizes) if sizes else 0.0
    lines += [
        f"  parties     {len(sizes)} drawn, {sum(sizes)} guests, mean size {mean_size:.2f}",
        f"  staff       {staff.count} waiters; first visit ~{staff.first_visit_delay.mean():.0f} s"
        f" (max {staff.first_visit_delay.bounds()[1]:.0f} s); check-in every "
        f"~{staff.checkin_interval.mean():.0f} s; "
        f"bussing after ~{staff.bussing_delay.mean():.0f} s",
        f"  dwell       ~{scenario.dwell.default.mean() / 60:.0f} min default; patience "
        f"~{scenario.patience.mean() / 60:.1f} min",
        f"  noise       jitter {scenario.noise.box_jitter}, seated miss "
        f"{scenario.noise.seated_miss_prob:.0%}, false positives "
        f"{scenario.noise.false_positives_per_frame}/frame",
        f"  thresholds  seat {th.seat_confirm_s:g} s, leave {th.leave_confirm_s:g} s, "
        f"first visit {th.first_visit_timeout_s:g} s, walk-away {th.walkaway_min_wait_s:g} s",
        f"  layout      ok: {len(world.geometry.queue_slots)} queue spots, "
        f"{len(world.geometry.staff_spots)} staff spots",
    ]
    return "\n".join(lines)


def _run(scenario: Scenario, args: argparse.Namespace) -> int:
    world = World(scenario, seed=args.seed)
    started = time.perf_counter()
    world.run_to_end()
    wall = time.perf_counter() - started
    truth = world.truth
    print(
        f"rv-sim run: {scenario.name} (seed {world.seed}): "
        f"{scenario.run.duration:.0f} s simulated in {wall:.1f} s"
    )
    print(json.dumps(truth.summary(), indent=2))
    if args.truth_out:
        _write_json(args.truth_out, truth.to_dict())
    if args.log_out:
        _write_lines(args.log_out, truth.event_log())
    return 0


def _eval(scenario: Scenario, args: argparse.Namespace) -> int:
    sim = build_simulation(scenario, seed=args.seed, manual=True)

    def progress(fraction: float) -> None:
        if not args.quiet:
            print(f"\r  simulating {fraction:4.0%}", end="", file=sys.stderr, flush=True)

    try:
        report, run = evaluate(sim, tracker=args.tracker, detector=args.detector, progress=progress)
    except AnalyticsUnavailable as exc:
        print(f"\nerror: {exc}", file=sys.stderr)
        return 3
    if not args.quiet:
        print("\r" + " " * 24 + "\r", end="", file=sys.stderr)
    print(format_report(report))
    if args.json:
        _write_json(args.json, report.to_dict())
    if args.events_out:
        _write_lines(args.events_out, [e.model_dump(mode="json") for e in run.events])
    return 0


def _write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def _write_lines(path: Path, rows: Sequence[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row) + "\n")


if __name__ == "__main__":
    raise SystemExit(main())
