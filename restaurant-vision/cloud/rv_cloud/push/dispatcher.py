"""Sends Web Push off the request path.

Ingest only *submits* a job per batch of raised alerts; a small, bounded thread pool runs it.
So a slow or unreachable push endpoint can never delay ``POST /edge/events`` or tie up the
web server's thread pool. The queue is bounded (excess batches are dropped and logged), and
each job is capped and time-limited by :func:`rv_cloud.services.push.notify_alerts`.

:meth:`PushDispatcher.drain` is the deterministic hook for tests (and shutdown): it waits until
every submitted job has finished.
"""

import logging
import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor

log = logging.getLogger(__name__)


class PushDispatcher:
    def __init__(self, *, workers: int = 4, max_pending: int = 1000) -> None:
        self._executor = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="rv-push")
        self._max_pending = max_pending
        self._lock = threading.Lock()
        self._idle = threading.Condition(self._lock)
        self._pending = 0
        self._closed = False

    @property
    def pending(self) -> int:
        """Jobs submitted and not finished yet."""
        with self._lock:
            return self._pending

    def submit(self, job: Callable[[], object]) -> bool:
        """Queue ``job``. False (and nothing runs) when the queue is full or closed."""
        with self._lock:
            if self._closed:
                return False
            if self._pending >= self._max_pending:
                log.warning("push queue full; alert notifications dropped")
                return False
            self._pending += 1
        try:
            self._executor.submit(self._run, job)
        except RuntimeError:  # shut down meanwhile
            self._finished()
            return False
        return True

    def drain(self, timeout: float | None = 10.0) -> bool:
        """Block until every submitted job has finished. True when idle."""
        with self._idle:
            return self._idle.wait_for(lambda: self._pending == 0, timeout)

    def shutdown(self, timeout: float = 5.0) -> None:
        """Stop accepting jobs, give running ones ``timeout`` seconds, drop the rest."""
        with self._lock:
            self._closed = True
        self.drain(timeout)
        self._executor.shutdown(wait=False, cancel_futures=True)

    def _run(self, job: Callable[[], object]) -> None:
        try:
            job()
        except Exception:  # a job must never kill the worker
            log.exception("push job failed")
        finally:
            self._finished()

    def _finished(self) -> None:
        with self._idle:
            self._pending -= 1
            if self._pending == 0:
                self._idle.notify_all()


__all__ = ["PushDispatcher"]
