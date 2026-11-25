"""Live view (1.3): ``GET /local/cameras/{id}/live.mjpeg`` and the table overlay."""

from __future__ import annotations

import builtins
import io
import logging
import os
from collections.abc import Callable
from typing import Any

import cv2
import numpy as np
import pytest
from rv_contracts import TableLive, TableState
from rv_contracts.fixtures import CAM_DINING, CAM_ENTRANCE

from rv_edge.interfaces import LiveState
from rv_edge.runtime.local_api import MJPEG_BOUNDARY
from rv_edge.runtime.snapshot import (
    OVERLAY_ALPHA,
    STATE_COLORS_RGB,
    TableOverlay,
    draw_table_overlays,
    format_elapsed,
    state_color_bgr,
)

from . import test_local_api as base
from .fakes import FakeFactory, checkerboard, wait_until
from .test_local_api import AUTH, PIN, Api

make_api = base.make_api  # fixtures shared with the other local API tests
api = base.api

URL = f"/local/cameras/{CAM_DINING}/live.mjpeg"
_WRITE_FLAGS = os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_APPEND | os.O_TRUNC


def _forbid_disk_writes(m: pytest.MonkeyPatch, writes: list[str]) -> None:
    """Fail every write to disk (any thread) and record it. Reads stay allowed: the runtime's
    own threads keep reading ``/proc`` (resource governor) while the stream runs."""

    def boom(*args: Any, **kwargs: Any) -> Any:
        writes.append(repr(args[:1]))
        raise AssertionError("the live view must not touch the disk")

    def guarded(real: Callable[..., Any]) -> Callable[..., Any]:
        def open_(file: Any, mode: str = "r", *args: Any, **kwargs: Any) -> Any:
            if any(c in mode for c in "wax+"):
                return boom(file)
            return real(file, mode, *args, **kwargs)

        return open_

    real_os_open = os.open

    def os_open(path: Any, flags: int, *args: Any, **kwargs: Any) -> Any:
        if flags & _WRITE_FLAGS:
            return boom(path)
        return real_os_open(path, flags, *args, **kwargs)

    m.setattr(builtins, "open", guarded(builtins.open))
    m.setattr(io, "open", guarded(io.open))
    m.setattr(os, "open", os_open)
    m.setattr(cv2, "imwrite", boom)
    m.setattr(cv2, "VideoWriter", boom)


def frames_of(body: bytes) -> list[np.ndarray]:
    out = []
    for part in body.split(f"--{MJPEG_BOUNDARY}\r\n".encode())[1:]:
        head, _, rest = part.partition(b"\r\n\r\n")
        assert b"Content-Type: image/jpeg" in head
        length = int(head.split(b"Content-Length: ")[1].split(b"\r\n")[0])
        image = cv2.imdecode(np.frombuffer(rest[:length], np.uint8), cv2.IMREAD_COLOR)
        assert image is not None
        out.append(image)
    return out


def with_states(api: Api, **states: TableState) -> None:
    real = api.runtime.live_state

    def live_state() -> LiveState:
        live = real()
        tables = [
            TableLive.model_validate(
                {
                    **t.model_dump(),
                    "state": states.get(t.table_id, t.state),
                    "since_ts": api.runtime.clock.now() - 75 if t.table_id in states else None,
                }
            )
            for t in live.tables
        ]
        return LiveState(
            tables=tables,
            occupancy=live.occupancy,
            queues=live.queues,
            open_alerts=live.open_alerts,
        )

    api.runtime.live_state = live_state  # type: ignore[method-assign]


# --------------------------------------------------------------------------- endpoint


def test_live_view_needs_the_pin(api: Api) -> None:
    assert api.client.get(URL).status_code == 401
    assert api.client.get(URL, params={"pin": "0000"}).status_code == 401
    assert api.client.get(URL, headers={"X-Setup-Pin": "0000"}).status_code == 401


def test_live_view_streams_privacy_safe_frames_in_memory(
    make_api: Callable[..., Api],
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    api = make_api(factory=FakeFactory(image=checkerboard()))
    assert wait_until(lambda: any(p.count for p in api.factory.built))
    with_states(api, t5=TableState.NEEDS_BUSSING, t1=TableState.SEATED)
    caplog.set_level(logging.DEBUG)
    writes: list[str] = []
    with monkeypatch.context() as m:
        _forbid_disk_writes(m, writes)
        resp = api.client.get(URL, params={"pin": PIN, "frames": 3})  # <img>: PIN as query
    assert writes == []
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("multipart/x-mixed-replace")
    assert MJPEG_BOUNDARY in resp.headers["content-type"]
    assert "no-store" in resp.headers["cache-control"]
    images = frames_of(resp.content)
    assert len(images) == 3
    image = images[-1]
    assert image.shape == (240, 320, 3)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    person = gray[70:170, 110:150]  # inside PERSON_BOX, away from table zones
    assert person.std() < 25 < gray[200:240, 200:320].std()
    assert image[2:40, 2:34].mean() < 10  # privacy mask stays black over the overlay
    # t5 (needs_bussing, x 0.04-0.24 y 0.52-0.84) is tinted blue; t1 (seated) amber
    b, g, r = (float(c) for c in image[128:140, 15:40].reshape(-1, 3).mean(axis=0))
    assert b > r + 40
    b, g, r = (float(c) for c in image[62:70, 16:40].reshape(-1, 3).mean(axis=0))
    assert r > b + 40 and g > b
    assert all(PIN not in rec.getMessage() for rec in caplog.records if "rv_edge" in rec.name)

    # the header works too, and unknown cameras are 404
    assert api.client.get(URL, headers=AUTH, params={"frames": 1}).status_code == 200
    missing = api.client.get("/local/cameras/nope/live.mjpeg", headers=AUTH)
    assert missing.status_code == 404


def test_simulated_camera_shows_the_placeholder_with_the_overlay(
    api: Api, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert wait_until(lambda: any(p.count for p in api.factory.built))
    with_states(api, t5=TableState.ATTENDED)
    writes: list[str] = []
    with monkeypatch.context() as m:
        _forbid_disk_writes(m, writes)
        resp = api.client.get(
            f"/local/cameras/{CAM_ENTRANCE}/live.mjpeg", headers=AUTH, params={"frames": 1}
        )
    assert writes == [] and resp.status_code == 200
    (image,) = frames_of(resp.content)
    assert image[5:20, 200:300].mean() > 200  # light placeholder background
    # z-t5-entrance (x 0.74-0.97, y 0.62-0.95) is tinted green
    b, g, r = (float(c) for c in image[155:165, 240:255].reshape(-1, 3).mean(axis=0))
    assert g > r + 20 and g > b + 20


# --------------------------------------------------------------------------- overlay


@pytest.mark.parametrize("state", list(TableState))
def test_overlay_colours_map_to_states(state: TableState) -> None:
    image = np.full((100, 100, 3), 100, dtype=np.uint8)
    poly = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]
    draw_table_overlays(image, [TableOverlay(poly, "5", state, None)], now=0.0)
    expected = np.array(state_color_bgr(state)) * OVERLAY_ALPHA + 100 * (1 - OVERLAY_ALPHA)
    assert np.abs(image[20, 50].astype(float) - expected).max() <= 1.0
    assert state_color_bgr(state) == tuple(reversed(STATE_COLORS_RGB[state]))


def test_state_colour_semantics() -> None:
    r, g, b = STATE_COLORS_RGB[TableState.EMPTY]
    assert max(r, g, b) - min(r, g, b) < 25  # gray
    r, g, b = STATE_COLORS_RGB[TableState.SEATED]
    assert r > g > b  # amber
    r, g, b = STATE_COLORS_RGB[TableState.ATTENDED]
    assert g > r and g > b  # green
    r, g, b = STATE_COLORS_RGB[TableState.NEEDS_BUSSING]
    assert b > r and b > g  # blue


def test_overlay_draws_label_and_timer_and_skips_tiny_polygons() -> None:
    blank = np.full((120, 160, 3), 100, dtype=np.uint8)
    image = blank.copy()
    poly = [(0.1, 0.1), (0.9, 0.1), (0.9, 0.9), (0.1, 0.9)]
    draw_table_overlays(
        image,
        [
            TableOverlay(poly, "שולחן", TableState.SEATED, 1000.0),  # non-ASCII: fallback
            TableOverlay([(0.0, 0.0), (0.1, 0.1)], "x", TableState.SEATED, None),
        ],
        now=1075.0,
    )
    assert (image[55:65, 60:100] == 255).any()  # white label/timer text
    assert draw_table_overlays(blank.copy(), [], now=0.0).tolist() == blank.tolist()


@pytest.mark.parametrize(
    ("seconds", "text"),
    [(-5, "0:00"), (75, "1:15"), (3599, "59:59"), (3600, "1:00"), (5430, "1:30")],
)
def test_format_elapsed(seconds: float, text: str) -> None:
    assert format_elapsed(seconds) == text
