"""Event bus (Observer): analytics publishes ``EdgeEvent``s, sinks receive them in order.

Sinks: :class:`OutboxSink` (durable, first), :class:`LocalBroadcastSink` (LAN WebSocket
clients) and :class:`LogSink`. A failing sink is logged and never blocks the others.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from collections.abc import Callable, Iterable

from rv_contracts import EdgeEvent, EventSink, EventType

from .outbox import Outbox

log = logging.getLogger(__name__)


class EventBus:
    """Fans each published event out to every subscribed sink, in subscription order."""

    def __init__(self, sinks: Iterable[EventSink] = ()) -> None:
        self._lock = threading.Lock()
        self._sinks: list[EventSink] = list(sinks)

    def subscribe(self, sink: EventSink) -> None:
        with self._lock:
            self._sinks.append(sink)

    def unsubscribe(self, sink: EventSink) -> None:
        with self._lock:
            if sink in self._sinks:
                self._sinks.remove(sink)

    def publish(self, event: EdgeEvent) -> None:
        with self._lock:
            sinks = list(self._sinks)
        for sink in sinks:
            try:
                sink.publish(event)
            except Exception:
                log.exception("event sink %s failed on %s", type(sink).__name__, event.type)

    def publish_all(self, events: Iterable[EdgeEvent]) -> None:
        for event in events:
            self.publish(event)


class OutboxSink:
    """Persists events for the cloud sync.

    ``enabled`` gates persistence (the runtime only persists while paired with a cloud, so an
    unpaired or local-only edge does not accumulate undeliverable rows); ``on_append`` wakes
    the sync thread.
    """

    def __init__(
        self,
        outbox: Outbox,
        *,
        enabled: Callable[[], bool] = lambda: True,
        on_append: Callable[[], None] | None = None,
    ) -> None:
        self._outbox = outbox
        self._enabled = enabled
        self._on_append = on_append

    def publish(self, event: EdgeEvent) -> None:
        if not self._enabled():
            return
        self._outbox.append(event)
        if self._on_append is not None:
            self._on_append()


class Subscriber:
    """One WebSocket client's bounded message queue, bound to the client's event loop.
    When the client is slow, the oldest queued message is dropped."""

    def __init__(self, loop: asyncio.AbstractEventLoop, maxsize: int) -> None:
        self.loop = loop
        self.queue: asyncio.Queue[str] = asyncio.Queue(maxsize=maxsize)
        self.dropped = 0

    def put(self, message: str) -> None:
        """Enqueue on the subscriber's loop (call through ``loop.call_soon_threadsafe``)."""
        if self.queue.full():
            self.queue.get_nowait()
            self.dropped += 1
        self.queue.put_nowait(message)


class LocalBroadcastSink:
    """Thread-safe fan-out of events (as JSON text) to local WebSocket subscribers.

    ``publish`` may be called from any thread; each message is handed to the subscriber's own
    event loop with ``call_soon_threadsafe``, which preserves publish order.
    """

    def __init__(self, maxsize: int = 256) -> None:
        self._maxsize = maxsize
        self._lock = threading.Lock()
        self._subscribers: set[Subscriber] = set()

    def subscribe(self) -> Subscriber:
        """Register a subscriber on the *running* event loop (call from async code)."""
        sub = Subscriber(asyncio.get_running_loop(), self._maxsize)
        with self._lock:
            self._subscribers.add(sub)
        return sub

    def unsubscribe(self, sub: Subscriber) -> None:
        with self._lock:
            self._subscribers.discard(sub)

    @property
    def subscriber_count(self) -> int:
        with self._lock:
            return len(self._subscribers)

    def publish(self, event: EdgeEvent) -> None:
        self.broadcast(event.model_dump_json())

    def broadcast(self, message: str) -> None:
        with self._lock:
            subscribers = list(self._subscribers)
        for sub in subscribers:
            try:
                sub.loop.call_soon_threadsafe(sub.put, message)
            except RuntimeError:  # the client's loop is closed
                self.unsubscribe(sub)


_INFO_TYPES = frozenset(
    {
        EventType.ALERT_RAISED,
        EventType.ALERT_ACKNOWLEDGED,
        EventType.ALERT_RESOLVED,
        EventType.TABLE_STATE_CHANGED,
        EventType.QUEUE_WALKAWAY,
    }
)


class LogSink:
    """Logs events: alerts and state changes at INFO, snapshots and heartbeats at DEBUG."""

    def __init__(self, logger: logging.Logger | None = None) -> None:
        self._log = logger or logging.getLogger("rv_edge.events")

    def publish(self, event: EdgeEvent) -> None:
        level = logging.INFO if event.type in _INFO_TYPES else logging.DEBUG
        if self._log.isEnabledFor(level):
            self._log.log(level, "event %s %s", event.type.value, event.model_dump_json())
