"""Factory: build the ``FrameSource`` for a :class:`SourceSpec` (Strategy per source kind)."""

from __future__ import annotations

from rv_contracts import Clock, FrameSource

from ..interfaces import SourceSpec
from .file import FileSource
from .rtsp import RtspSource


def build_source(spec: SourceSpec, *, clock: Clock, target_fps: float) -> FrameSource:
    """Create the source for ``spec``.

    * ``rtsp``: :class:`RtspSource` on ``spec.url``.
    * ``file``: :class:`FileSource`; ``spec.options["realtime"]`` (default True) sets pacing.
    * ``simulated``: the ``FrameSource`` the simulator put in ``spec.options["source"]``
      (its frames carry a ``SyntheticImage``).
    """
    if spec.kind == "rtsp":
        return RtspSource(spec, clock=clock, target_fps=target_fps)
    if spec.kind == "file":
        realtime = bool(spec.options.get("realtime", True))
        return FileSource(spec, clock=clock, target_fps=target_fps, realtime=realtime)
    if spec.kind == "simulated":
        source = spec.options.get("source")
        if source is None:
            raise ValueError(
                f"camera {spec.camera_id!r}: simulated sources need the simulator's FrameSource "
                'in spec.options["source"]'
            )
        if not isinstance(source, FrameSource):
            raise TypeError(
                f"camera {spec.camera_id!r}: spec.options['source'] is not a FrameSource "
                f"({type(source).__name__})"
            )
        return source
    raise ValueError(f"camera {spec.camera_id!r}: unknown source kind {spec.kind!r}")
