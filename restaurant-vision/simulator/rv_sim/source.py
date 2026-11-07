"""``SimulatedSource``: a ``rv_contracts.FrameSource`` backed by a shared :class:`World`.

``read()`` looks at the clock, advances the world (lazily, deterministically) to the frame
interval containing ``clock.now()`` and returns that camera's frame:

* ``Frame.ts`` is ``clock.now()``; ``Frame.index`` is the world tick (frame interval number),
  so it increases strictly and skips when frames were missed (like a camera dropping frames);
* ``Frame.width/height`` are 1280x720; ``Frame.image`` is a ``SyntheticImage`` of the boxes the
  camera sees (detector noise already applied: jitter, occlusion, false positives);
* ``None`` if the frame interval was already returned, before the run starts, after it ends
  (finite source exhausted), or after :meth:`close`.

Several sources share one world; their reads are serialized by the world's lock.
"""

from __future__ import annotations

from collections import OrderedDict

from rv_contracts import Clock, Frame

from .world import CameraObservation, World

FRAME_WIDTH = 1280
FRAME_HEIGHT = 720
_HISTORY = 256


class SimulatedSource:
    """Frames of one camera of a simulated world (see module docstring)."""

    def __init__(
        self,
        world: World,
        camera_id: str,
        clock: Clock,
        *,
        width: int = FRAME_WIDTH,
        height: int = FRAME_HEIGHT,
    ) -> None:
        if camera_id not in {c.camera_id for c in world.config.cameras}:
            raise ValueError(f"unknown camera {camera_id!r}")
        self._world = world
        self._camera_id = camera_id
        self._clock = clock
        self._width = width
        self._height = height
        self._last_tick = -1
        self._closed = False
        self._history: OrderedDict[int, CameraObservation] = OrderedDict()

    @property
    def camera_id(self) -> str:
        return self._camera_id

    @property
    def exhausted(self) -> bool:
        """True once the last frame of the run has been returned."""
        return self._last_tick >= self._world.end_tick

    def open(self) -> None:
        self._closed = False

    def close(self) -> None:
        self._closed = True

    def read(self) -> Frame | None:
        if self._closed:
            return None
        world = self._world
        with world.lock:
            now = self._clock.now()
            tick = min(world.tick_at(now), world.end_tick)
            if tick < 0 or tick <= self._last_tick:
                return None
            world.advance_to_tick(tick)
            tick = world.tick
            if tick <= self._last_tick:
                return None
            obs = world.observe(self._camera_id)
        self._last_tick = tick
        self._history[tick] = obs
        while len(self._history) > _HISTORY:
            self._history.popitem(last=False)
        return Frame(
            camera_id=self._camera_id,
            ts=now,
            index=tick,
            width=self._width,
            height=self._height,
            image=obs.image(),
        )

    def observation(self, index: int) -> CameraObservation | None:
        """The truth behind a recently returned frame (the last 256 frames)."""
        return self._history.get(index)
