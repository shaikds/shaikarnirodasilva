"""Thin seam over ``cv2.VideoCapture`` so sources can be tested with fake captures."""

from __future__ import annotations

import contextlib
import os
from collections.abc import Callable
from typing import Any, Protocol

import cv2


class CaptureLike(Protocol):
    """The subset of ``cv2.VideoCapture`` used by the sources."""

    def isOpened(self) -> bool: ...  # noqa: N802 (OpenCV naming)

    def read(self) -> tuple[bool, Any]: ...

    def grab(self) -> bool: ...

    def get(self, prop_id: int) -> float: ...

    def release(self) -> None: ...


CaptureFactory = Callable[[str], CaptureLike]
"""Opens a capture for a URL or path. Must not raise for unreachable streams (return a capture
whose ``isOpened()`` is False instead)."""

FFMPEG_OPTIONS_ENV = "OPENCV_FFMPEG_CAPTURE_OPTIONS"


def open_ffmpeg_capture(
    url: str, *, open_timeout_s: float = 10.0, read_timeout_s: float = 10.0
) -> CaptureLike:
    """Open ``url`` with OpenCV's FFmpeg backend and bounded open/read timeouts.

    RTSP over TCP is requested via ``OPENCV_FFMPEG_CAPTURE_OPTIONS`` unless the operator set
    that variable already (TCP survives Wi-Fi packet loss far better than UDP).
    """
    if url.lower().startswith(("rtsp://", "rtsps://")):
        os.environ.setdefault(FFMPEG_OPTIONS_ENV, "rtsp_transport;tcp")
    params = [
        cv2.CAP_PROP_OPEN_TIMEOUT_MSEC,
        int(open_timeout_s * 1000),
        cv2.CAP_PROP_READ_TIMEOUT_MSEC,
        int(read_timeout_s * 1000),
    ]
    capture: CaptureLike = cv2.VideoCapture(url, cv2.CAP_FFMPEG, params)
    return capture


def safe_release(capture: CaptureLike | None) -> None:
    """Release a capture, ignoring errors from a broken stream."""
    if capture is None:
        return
    with contextlib.suppress(Exception):
        capture.release()
