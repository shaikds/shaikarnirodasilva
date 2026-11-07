"""Windows service wrapper for the Restaurant Vision edge engine (pywin32).

``install.ps1`` copies this file to ``C:\\Program Files\\RestaurantVision\\service\\`` and
registers it with the venv's Python::

    <venv>\\Scripts\\python.exe rv_edge_service.py --startup delayed install   # or: update
    <venv>\\Scripts\\python.exe rv_edge_service.py start | stop | remove
    <venv>\\Scripts\\python.exe rv_edge_service.py debug     # run in the console (Ctrl-C stops)

pywin32 hosts the service in ``pythonservice.exe``, which it copies into the venv root so the
venv's packages are used. The service runs the same code path as ``rv-edge run`` in-process:
build the ``EdgeRuntime``, serve the LAN API with uvicorn, and stop both when Windows asks the
service to stop. An unhandled error stops the service with a non-zero exit code, and the
recovery actions set by ``install.ps1`` (``sc.exe failure`` + ``failureflag``) restart it.

Settings: ``%RV_EDGE_CONFIG%`` if set, else ``%ProgramData%\\RestaurantVision\\edge.yaml``.
Logs: ``%ProgramData%\\RestaurantVision\\logs\\rv-edge.log`` (rotated, 5 x 5 MB); start, stop
and fatal errors also go to the Windows Application event log (source RestaurantVisionEdge).

Alternative without pywin32: wrap ``<venv>\\Scripts\\rv-edge.exe run --config <yaml>`` with a
service host such as WinSW or NSSM (see docs/runbooks/install-edge.md).
"""

from __future__ import annotations

import logging
import logging.handlers
import os
import sys
import threading
import traceback
from pathlib import Path
from typing import Any

import servicemanager
import win32service
import win32serviceutil

SERVICE_NAME = "RestaurantVisionEdge"
DISPLAY_NAME = "Restaurant Vision Edge"
DESCRIPTION = (
    "Anonymous on-site video analytics for Restaurant Vision: table states, waiter alerts, "
    "queue and occupancy from the restaurant's existing cameras. Video never leaves this PC."
)

PROGRAM_DATA = Path(os.environ.get("PROGRAMDATA", r"C:\ProgramData")) / "RestaurantVision"
DEFAULT_CONFIG = PROGRAM_DATA / "edge.yaml"
LOG_FILE = PROGRAM_DATA / "logs" / "rv-edge.log"


def _config_path() -> Path:
    return Path(os.environ.get("RV_EDGE_CONFIG") or DEFAULT_CONFIG)


def _setup_logging(level: str) -> None:
    """Rotating file log. A service has no console, so stdout/stderr go to the log too."""
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    handler = logging.handlers.RotatingFileHandler(
        LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=5, encoding="utf-8"
    )
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    if sys.stdout is None or sys.stderr is None:
        out_log = LOG_FILE.with_suffix(".out.log")
        stream = open(out_log, "a", encoding="utf-8", buffering=1)  # noqa: SIM115 (kept open)
        sys.stdout = sys.stdout or stream
        sys.stderr = sys.stderr or stream


def _below_normal_priority() -> None:
    """BelowNormal CPU priority, so the POS/office work on this PC stays responsive. The
    engine's ResourceGovernor does the same; this covers the time before it starts."""
    try:
        import psutil

        psutil.Process().nice(psutil.BELOW_NORMAL_PRIORITY_CLASS)
    except Exception:  # best effort
        logging.getLogger(__name__).warning("could not set BelowNormal priority", exc_info=True)


class RestaurantVisionEdgeService(win32serviceutil.ServiceFramework):
    _svc_name_ = SERVICE_NAME
    _svc_display_name_ = DISPLAY_NAME
    _svc_description_ = DESCRIPTION

    def __init__(self, args: Any) -> None:
        super().__init__(args)
        self._stop_requested = threading.Event()
        self._server: Any = None

    # Called by the Service Control Manager on stop and on system shutdown.
    def SvcStop(self) -> None:  # pywin32 API name
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING, waitHint=30_000)
        self._stop_requested.set()
        server = self._server
        if server is not None:
            server.should_exit = True

    SvcShutdown = SvcStop

    def SvcDoRun(self) -> None:  # pywin32 API name
        servicemanager.LogMsg(
            servicemanager.EVENTLOG_INFORMATION_TYPE,
            servicemanager.PYS_SERVICE_STARTED,
            (self._svc_name_, ""),
        )
        try:
            self._run()
        except BaseException:
            detail = traceback.format_exc()
            logging.getLogger(__name__).critical("edge service failed:\n%s", detail)
            servicemanager.LogErrorMsg(f"{SERVICE_NAME} failed:\n{detail}")
            raise  # pythonservice reports SERVICE_STOPPED with an error code -> recovery restarts
        servicemanager.LogMsg(
            servicemanager.EVENTLOG_INFORMATION_TYPE,
            servicemanager.PYS_SERVICE_STOPPED,
            (self._svc_name_, ""),
        )

    def _run(self) -> None:
        _below_normal_priority()
        # Imported here so that `install`/`remove` work even if the engine is broken.
        import uvicorn
        from rv_edge.runtime.governor import ResourceGovernor
        from rv_edge.runtime.local_api import create_local_app
        from rv_edge.runtime.runtime import EdgeRuntime
        from rv_edge.runtime.settings import load_settings

        config = _config_path()
        settings = load_settings(config if config.is_file() else None)
        _setup_logging(settings.log_level)
        log = logging.getLogger("rv_edge.service")
        log.info("starting with settings %s", config)

        ResourceGovernor.configure_threads()  # before any model is loaded
        runtime = EdgeRuntime(settings)
        runtime.start()
        try:
            level = settings.log_level.lower()
            if level not in {"critical", "error", "warning", "info", "debug"}:
                level = "info"
            server = uvicorn.Server(
                uvicorn.Config(
                    create_local_app(runtime, settings),
                    host=settings.local_host,
                    port=settings.local_port,
                    log_level=level,
                    log_config=None,  # keep the file handler configured above
                    access_log=False,
                )
            )
            self._server = server
            if not self._stop_requested.is_set():
                server.run()  # not the main thread: uvicorn skips signal handlers
            if not self._stop_requested.is_set():
                raise RuntimeError("the LAN API stopped unexpectedly")
        finally:
            log.info("stopping")
            runtime.stop()


if __name__ == "__main__":
    if len(sys.argv) == 1:
        # Started by the Service Control Manager with this script as the program.
        servicemanager.Initialize()
        servicemanager.PrepareToHostSingle(RestaurantVisionEdgeService)
        servicemanager.StartServiceCtrlDispatcher()
    else:
        # install / update / remove / start / stop / debug; non-zero exit on failure.
        sys.exit(win32serviceutil.HandleCommandLine(RestaurantVisionEdgeService))
