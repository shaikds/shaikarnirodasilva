"""Resource governor: keeps the edge a polite guest on a shared restaurant PC.

* Lowers the process priority (``nice`` on POSIX, BELOW_NORMAL on Windows).
* Caps math-library threads through environment variables before any model is loaded.
* Adaptive frame pacing: when this process uses more than ``cpu_limit_pct`` of the machine's
  total CPU, camera threads wait longer between frames (multiplicative back-off), and recover
  slowly once usage drops below 80% of the limit.
* Samples process CPU and memory for heartbeats.
"""

from __future__ import annotations

import logging
import os
import sys
import threading
from dataclasses import dataclass

import psutil

log = logging.getLogger(__name__)

THREAD_ENV_VARS = (
    "OMP_NUM_THREADS",
    "OPENBLAS_NUM_THREADS",
    "MKL_NUM_THREADS",
    "NUMEXPR_NUM_THREADS",
    "VECLIB_MAXIMUM_THREADS",
    "OPENCV_FOR_THREADS_NUM",
)
POSIX_NICENESS = 10
MAX_PACE_FACTOR = 8.0
_BACKOFF_STEP = 1.25
_RECOVER_STEP = 1.1


def default_inference_threads() -> int:
    """Half the logical CPUs, between 1 and 4."""
    return max(1, min(4, (os.cpu_count() or 2) // 2))


@dataclass(frozen=True, slots=True)
class ResourceSample:
    cpu_pct: float
    """Process CPU in percent of one core (heartbeat convention; may exceed 100)."""
    mem_mb: float
    """Process resident memory in MiB."""
    machine_share_pct: float
    """Process CPU as a percent of the whole machine (0-100), compared to the limit."""


class ResourceGovernor:
    """See module docstring. ``update`` is called about once per second by the runtime."""

    def __init__(
        self,
        cpu_limit_pct: float = 70.0,
        *,
        process: psutil.Process | None = None,
        cpu_count: int | None = None,
        manage_priority: bool = True,
    ) -> None:
        self.cpu_limit_pct = cpu_limit_pct
        self._process = process or psutil.Process()
        self._cpu_count = cpu_count or psutil.cpu_count(logical=True) or 1
        self._manage_priority = manage_priority
        self._lock = threading.Lock()
        self._factor = 1.0
        self._last = ResourceSample(0.0, 0.0, 0.0)
        self._process.cpu_percent(None)  # prime the CPU counter

    # one-time setup ----------------------------------------------------------------------
    @staticmethod
    def configure_threads(threads: int | None = None) -> int:
        """Cap math-library thread pools. Call before the detector model is loaded. Values
        already set in the environment win."""
        n = threads or default_inference_threads()
        for var in THREAD_ENV_VARS:
            os.environ.setdefault(var, str(n))
        try:
            import cv2

            cv2.setNumThreads(n)
        except Exception:  # pragma: no cover - OpenCV missing or built without threading
            pass
        return n

    def lower_priority(self) -> None:
        """Lower this process's CPU priority. Best effort; failures are logged."""
        if not self._manage_priority:
            return
        try:
            if sys.platform == "win32":
                self._process.nice(psutil.BELOW_NORMAL_PRIORITY_CLASS)
            else:
                current = os.getpriority(os.PRIO_PROCESS, 0)
                if current < POSIX_NICENESS:
                    os.nice(POSIX_NICENESS - current)
        except (OSError, psutil.Error) as exc:
            log.warning("could not lower process priority: %s", exc)

    # periodic ----------------------------------------------------------------------------
    def update(self) -> ResourceSample:
        """Sample CPU/memory and adjust the pacing factor."""
        try:
            cpu = float(self._process.cpu_percent(None))
            mem = float(self._process.memory_info().rss) / (1024 * 1024)
        except psutil.Error:
            cpu, mem = 0.0, 0.0
        return self.observe(cpu, mem)

    def observe(self, cpu_pct: float, mem_mb: float) -> ResourceSample:
        """Apply one CPU observation (separate from sampling so it can be tested)."""
        share = cpu_pct / self._cpu_count
        sample = ResourceSample(max(0.0, cpu_pct), max(0.0, mem_mb), max(0.0, share))
        with self._lock:
            if share > self.cpu_limit_pct:
                self._factor = min(MAX_PACE_FACTOR, self._factor * _BACKOFF_STEP)
            elif share < 0.8 * self.cpu_limit_pct:
                self._factor = max(1.0, self._factor / _RECOVER_STEP)
            self._last = sample
        return sample

    @property
    def last_sample(self) -> ResourceSample:
        with self._lock:
            return self._last

    @property
    def pace_factor(self) -> float:
        """1.0 = full speed; larger = frames are spaced further apart."""
        with self._lock:
            return self._factor

    def frame_delay(self, target_fps: float) -> float:
        """Extra wall-clock seconds a camera thread waits after each frame. 0 at full speed;
        ``(factor - 1) / fps`` under load, i.e. the camera runs at ``fps / factor``."""
        factor = self.pace_factor
        if factor <= 1.0 or target_fps <= 0:
            return 0.0
        return (factor - 1.0) / target_fps
