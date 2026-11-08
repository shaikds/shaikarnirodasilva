"""``rv-edge`` command line.

* ``rv-edge run [--config edge.yaml]``: run the edge engine and the LAN API (uvicorn).
* ``rv-edge pair --code ABC123 --cloud https://...``: pair this edge with a site.
* ``rv-edge discover``: ONVIF camera discovery on the LAN.
* ``rv-edge check``: estimate how many cameras this PC can handle.
* ``rv-edge simulate --scenario PATH [--speed 20] [--cloud URL] [--seed 0]``: run the engine on
  a simulator scenario (``rv_sim``) with the simulated detector and the LAN API. The scenario
  is moved to start now (``--rebase-to-now``, the default) so live timers and today's shift
  report work in demos; ``--no-rebase-to-now`` keeps the scenario's own date and time for
  reproducible runs.

Every command accepts ``--config`` (YAML settings), ``--data-dir`` and ``--log-level``.
"""

from __future__ import annotations

import argparse
import importlib
import json
import logging
import signal
import sys
import threading
import time
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from typing import TYPE_CHECKING, Any

from rv_contracts import SiteConfig

from rv_edge.interfaces import SourceSpec

from . import EDGE_VERSION
from .config_store import ConfigStore
from .governor import ResourceGovernor
from .pairing import PairingError, pair
from .probes import run_capacity_check, run_discovery
from .secrets_store import SecretsStore
from .settings import EdgeSettings, load_settings

if TYPE_CHECKING:
    import httpx

    from .runtime import EdgeRuntime

log = logging.getLogger("rv_edge")

_UVICORN_LEVELS = {"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG", "TRACE"}


def build_parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--config", type=Path, help="YAML settings file (default: edge.yaml)")
    common.add_argument("--data-dir", type=Path, help="override settings.data_dir")
    common.add_argument("--log-level", help="DEBUG, INFO, WARNING ...")

    parser = argparse.ArgumentParser(prog="rv-edge", description="Restaurant Vision edge engine")
    parser.add_argument("--version", action="version", version=f"rv-edge {EDGE_VERSION}")
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", parents=[common], help="run the edge engine and LAN API")
    run.add_argument("--host", help="LAN API bind address (default 0.0.0.0)")
    run.add_argument("--port", type=int, help="LAN API port (default 8787)")

    pair_p = sub.add_parser("pair", parents=[common], help="pair with a cloud site")
    pair_p.add_argument("--code", required=True, help="6-character pairing code")
    pair_p.add_argument("--cloud", required=True, help="cloud base URL, e.g. https://...")

    disc = sub.add_parser("discover", parents=[common], help="find ONVIF cameras on the LAN")
    disc.add_argument("--timeout", type=float, default=4.0, help="seconds to listen")

    sub.add_parser("check", parents=[common], help="estimate camera capacity of this PC")

    sim = sub.add_parser("simulate", parents=[common], help="run on a simulator scenario")
    sim.add_argument("--scenario", type=Path, required=True, help="scenario YAML")
    sim.add_argument("--speed", type=float, default=20.0, help="time acceleration")
    sim.add_argument("--seed", type=int, default=0)
    sim.add_argument("--cloud", help="send events to this cloud (needs pairing)")
    sim.add_argument("--pair-code", help="pair with --cloud first, using this code")
    sim.add_argument("--host", help="LAN API bind address")
    sim.add_argument("--port", type=int, help="LAN API port")
    sim.add_argument("--duration", type=float, help="stop after this many wall-clock seconds")
    sim.add_argument("--no-api", action="store_true", help="do not serve the LAN API")
    sim.add_argument(
        "--rebase-to-now",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="start the scenario at the current time (default) instead of its own date/time",
    )
    return parser


def _configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def _print_json(data: Any) -> None:
    print(json.dumps(data, indent=2, ensure_ascii=False))


def serve(
    runtime: EdgeRuntime,
    settings: EdgeSettings,
    *,
    host: str | None = None,
    port: int | None = None,
    duration_s: float | None = None,
) -> None:
    """Serve the LAN API for a started ``EdgeRuntime`` until interrupted (or ``duration_s``)."""
    import uvicorn

    from .local_api import create_local_app

    app = create_local_app(runtime, settings)
    level = settings.log_level if settings.log_level in _UVICORN_LEVELS else "INFO"
    server = uvicorn.Server(
        uvicorn.Config(
            app,
            host=host if host is not None else settings.local_host,
            port=port if port is not None else settings.local_port,
            log_level=level.lower(),
            access_log=False,
        )
    )
    if duration_s:
        timer = threading.Timer(duration_s, lambda: setattr(server, "should_exit", True))
        timer.daemon = True
        timer.start()
    server.run()


def _wait(duration_s: float | None) -> None:
    """Block until Ctrl-C, SIGTERM or ``duration_s``."""
    done = threading.Event()
    previous = signal.signal(signal.SIGTERM, lambda *_: done.set())
    try:
        done.wait(duration_s)
    except KeyboardInterrupt:
        pass
    finally:
        signal.signal(signal.SIGTERM, previous)


def with_listen_address(
    settings: EdgeSettings, host: str | None, port: int | None
) -> EdgeSettings:
    """``settings`` with the LAN API address from ``--host``/``--port`` (port 0, an ephemeral
    test port, is ignored), so the reported ``local_url`` matches what is served."""
    update: dict[str, Any] = {}
    if host:
        update["local_host"] = host
    if port:
        update["local_port"] = port
    if not update:
        return settings
    return EdgeSettings.model_validate({**settings.model_dump(), **update})


def cmd_run(args: argparse.Namespace, settings: EdgeSettings) -> int:
    from .runtime import EdgeRuntime

    ResourceGovernor.configure_threads()  # before any model is loaded
    settings = with_listen_address(settings, args.host, args.port)
    runtime = EdgeRuntime(settings)
    runtime.start()
    try:
        serve(runtime, settings, host=args.host, port=args.port)
    finally:
        runtime.stop()
    return 0


def cmd_pair(args: argparse.Namespace, settings: EdgeSettings) -> int:
    secrets = SecretsStore(settings.data_dir)
    try:
        result = pair(args.cloud, args.code, secrets)
    except PairingError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(f"paired: device {result.device_id} for site {result.site_id}")
    return 0


def cmd_discover(args: argparse.Namespace, settings: EdgeSettings) -> int:
    result = run_discovery(args.timeout)
    _print_json(result)
    return 0 if result["available"] and not result["error"] else 1


def cmd_check(args: argparse.Namespace, settings: EdgeSettings) -> int:
    ResourceGovernor.configure_threads()
    result = run_capacity_check(
        model_path=settings.model_path, detector_backend=settings.detector_backend
    )
    _print_json(result)
    return 0 if result.get("available") and not result.get("error") else 1


class SimulationSetupError(RuntimeError):
    """``rv-edge simulate`` cannot start (pairing failed, or --cloud without pairing)."""


def simulation_settings(
    settings: EdgeSettings, *, data_dir: Path | None = None, cloud_url: str | None = None
) -> EdgeSettings:
    """Settings for a simulated run: simulated detector, and state kept apart from a real
    deployment (``<data_dir>/simulate``) unless ``data_dir`` is given."""
    return EdgeSettings.model_validate(
        {
            **settings.model_dump(),
            "data_dir": data_dir or settings.data_dir / "simulate",
            "detector_backend": "simulated",
            "cloud_url": cloud_url or settings.cloud_url,
        }
    )


def build_simulated_runtime(
    sim: Any,
    settings: EdgeSettings,
    *,
    cloud_url: str | None = None,
    pair_code: str | None = None,
    transport: httpx.BaseTransport | None = None,
    **runtime_options: Any,
) -> EdgeRuntime:
    """The (not yet started) ``EdgeRuntime`` that ``rv-edge simulate`` runs on ``sim`` (an
    ``rv_sim.adapter.Simulation``), with ``settings`` from :func:`simulation_settings`.

    With ``cloud_url`` the edge pairs first (``pair_code``) or must already be paired; the
    scenario's config is re-keyed to the paired site and pushed to the cloud. ``transport``
    and ``runtime_options`` are passed to pairing and to ``EdgeRuntime`` (tests, e2e).
    Raises :class:`SimulationSetupError`."""
    from .runtime import EdgeRuntime

    secrets = SecretsStore(settings.data_dir)
    use_cloud = bool(cloud_url)
    if cloud_url and pair_code:
        try:
            pair(cloud_url, pair_code, secrets, transport=transport)
        except PairingError as exc:
            raise SimulationSetupError(str(exc)) from exc
    if use_cloud and not secrets.paired:
        raise SimulationSetupError("--cloud needs a paired edge; add --pair-code CODE")

    config: SiteConfig = sim.config
    store = ConfigStore(settings.data_dir)
    if use_cloud:
        if secrets.site_id and config.site_id != secrets.site_id:
            # The scenario's site id is arbitrary; events must carry the paired site's id.
            config = SiteConfig.model_validate({**config.model_dump(), "site_id": secrets.site_id})
        store.save_local(config)  # pushed to the cloud so it knows the tables and zones
    else:
        store.replace(config)

    specs: Mapping[str, SourceSpec] = {
        camera_id: SourceSpec(camera_id, "simulated", options={"source": source})
        for camera_id, source in sim.sources.items()
    }
    return EdgeRuntime(
        settings,
        clock=sim.clock,
        secrets=secrets,
        config_store=store,
        source_specs=specs,
        enable_sync=use_cloud,
        cloud_transport=transport,
        **runtime_options,
    )


def cmd_simulate(args: argparse.Namespace, settings: EdgeSettings) -> int:
    try:
        adapter = importlib.import_module("rv_sim.adapter")
    except ImportError as exc:
        print(f"error: the simulator (rv_sim.adapter) is not available: {exc}", file=sys.stderr)
        return 1
    options: dict[str, Any] = {"speed": args.speed, "seed": args.seed}
    if args.rebase_to_now:
        options["start_ts"] = time.time()
    sim = adapter.load_simulation(args.scenario, **options)
    sim_settings = simulation_settings(
        with_listen_address(settings, args.host, args.port),
        data_dir=args.data_dir,
        cloud_url=args.cloud,
    )
    try:
        runtime = build_simulated_runtime(
            sim, sim_settings, cloud_url=args.cloud, pair_code=args.pair_code
        )
    except SimulationSetupError as exc:
        print(f"error: {exc}", file=sys.stderr)
        close = getattr(sim, "close", None)
        if callable(close):
            close()
        return 1
    runtime.start()
    try:
        if args.no_api:
            _wait(args.duration)
        else:
            serve(runtime, sim_settings, host=args.host, port=args.port, duration_s=args.duration)
    finally:
        runtime.stop()
        close = getattr(sim, "close", None)
        if callable(close):
            close()
    return 0


COMMANDS: dict[str, Callable[[argparse.Namespace, EdgeSettings], int]] = {
    "run": cmd_run,
    "pair": cmd_pair,
    "discover": cmd_discover,
    "check": cmd_check,
    "simulate": cmd_simulate,
}


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        settings = load_settings(
            args.config, overrides={"data_dir": args.data_dir, "log_level": args.log_level}
        )
    except (OSError, ValueError) as exc:
        print(f"error: invalid settings: {exc}", file=sys.stderr)
        return 2
    _configure_logging(settings.log_level)
    return COMMANDS[args.command](args, settings)
