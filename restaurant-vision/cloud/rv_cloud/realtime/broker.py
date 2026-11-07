"""Fan-out of live site messages to WebSocket subscribers.

:class:`EventBroker` is the interface; :class:`InMemoryBroker` serves a single worker process.

Multi-worker deployments (several uvicorn/gunicorn workers or hosts) need a shared bus,
because an event ingested by worker A must reach sockets held by worker B. A Redis
implementation (not shipped, to keep the MVP dependency-free) looks like this::

    class RedisBroker:
        def __init__(self, url: str) -> None:
            self._sync = redis.Redis.from_url(url)              # publish from request threads
            self._async = redis.asyncio.Redis.from_url(url)     # subscribe in the event loop

        def publish(self, message: BrokerMessage) -> None:
            self._sync.publish(f"rv:site:{message.site_id}",
                               json.dumps([message.event_type, message.data]))

        @asynccontextmanager
        async def subscribe(self, site_id: str) -> AsyncIterator[Subscription]:
            pubsub = self._async.pubsub()
            await pubsub.subscribe(f"rv:site:{site_id}")
            try:
                yield RedisSubscription(pubsub)  # get(): await pubsub.get_message(...) -> decode
            finally:
                await pubsub.unsubscribe()
                await pubsub.aclose()

Choose it with a setting (e.g. ``RV_REDIS_URL``) in ``create_app``. Delivery stays
best-effort (at most once); clients re-sync from ``GET /sites/{id}/live`` after reconnecting.
"""

import asyncio
import logging
import threading
from collections.abc import AsyncIterator
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from dataclasses import dataclass
from typing import Protocol

log = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class BrokerMessage:
    """One live message: ``data`` is the JSON text of one ``EdgeEvent``."""

    site_id: str
    event_type: str
    data: str


class Subscription(Protocol):
    async def get(self) -> BrokerMessage:
        """Wait for the next message of the subscribed site."""
        ...


class EventBroker(Protocol):
    def publish(self, message: BrokerMessage) -> None:
        """Deliver to every current subscriber of ``message.site_id``. Thread-safe and
        non-blocking; callable from sync request handlers after their transaction commits."""
        ...

    def subscribe(self, site_id: str) -> AbstractAsyncContextManager[Subscription]:
        """``async with broker.subscribe(site_id) as sub: msg = await sub.get()``."""
        ...


class _QueueSubscription:
    def __init__(self, loop: asyncio.AbstractEventLoop, maxsize: int) -> None:
        self.loop = loop
        self.queue: asyncio.Queue[BrokerMessage] = asyncio.Queue(maxsize=maxsize)

    async def get(self) -> BrokerMessage:
        return await self.queue.get()

    def deliver(self, message: BrokerMessage) -> None:
        """Runs in the subscriber's event loop. Drops the oldest message if the client is too
        slow, so one stuck socket cannot grow memory without bound."""
        if self.queue.full():
            self.queue.get_nowait()
            log.warning("ws subscriber queue full; dropped oldest message")
        self.queue.put_nowait(message)


class InMemoryBroker:
    """Per-process broker: one bounded asyncio queue per subscriber, delivered through the
    subscriber's own event loop (``call_soon_threadsafe``), so publishers may be threads."""

    def __init__(self, max_queue: int = 1000) -> None:
        self._max_queue = max_queue
        self._subscribers: dict[str, set[_QueueSubscription]] = {}
        self._lock = threading.Lock()

    def publish(self, message: BrokerMessage) -> None:
        with self._lock:
            targets = list(self._subscribers.get(message.site_id, ()))
        for sub in targets:
            try:
                sub.loop.call_soon_threadsafe(sub.deliver, message)
            except RuntimeError:  # loop closed: the socket is gone
                self._remove(message.site_id, sub)

    def subscriber_count(self, site_id: str) -> int:
        with self._lock:
            return len(self._subscribers.get(site_id, ()))

    @asynccontextmanager
    async def subscribe(self, site_id: str) -> AsyncIterator[Subscription]:
        sub = _QueueSubscription(asyncio.get_running_loop(), self._max_queue)
        with self._lock:
            self._subscribers.setdefault(site_id, set()).add(sub)
        try:
            yield sub
        finally:
            self._remove(site_id, sub)

    def _remove(self, site_id: str, sub: _QueueSubscription) -> None:
        with self._lock:
            subs = self._subscribers.get(site_id)
            if subs is not None:
                subs.discard(sub)
                if not subs:
                    del self._subscribers[site_id]
