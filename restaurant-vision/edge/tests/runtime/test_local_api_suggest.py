"""``POST /local/cameras/{camera_id}/suggest-tables`` (automatic table suggestions)."""

from __future__ import annotations

import builtins
import io
import os
from collections.abc import Callable, Iterable, Iterator, Mapping, Sequence
from typing import Any

import cv2
import numpy as np
import pytest
from rv_contracts import Detection, Frame, SiteConfig
from rv_contracts.fixtures import CAM_DINING, CAM_ENTRANCE
from starlette.testclient import TestClient

from rv_edge.interfaces import SourceSpec
from rv_edge.runtime.local_api import create_local_app
from rv_edge.runtime.runtime import EdgeRuntime
from rv_edge.runtime.settings import EdgeSettings
from rv_edge.runtime.setup_pin import hash_pin
from rv_edge.vision.table_suggest import (
    COCO_CHAIR,
    COCO_COUCH,
    COCO_DINING_TABLE,
    suggest_tables,
)

from .conftest import sim_specs
from .fakes import EngineHolder, FakeFactory, checkerboard, wait_until

PIN = "2468"
AUTH = {"X-Setup-Pin": PIN}
URL = f"/local/cameras/{CAM_DINING}/suggest-tables"
Build = Callable[..., tuple[EdgeRuntime, FakeFactory, EngineHolder]]

TABLE = Detection(box=(0.40, 0.40, 0.60, 0.55), score=0.8)
CHAIRS = [
    Detection(box=(0.33, 0.42, 0.39, 0.56), score=0.7),
    Detection(box=(0.61, 0.42, 0.67, 0.56), score=0.7),
]
MASKED_TABLE = Detection(box=(0.01, 0.01, 0.09, 0.12), score=0.9)
"""Inside the sample config's restroom privacy zone (0, 0)-(0.12, 0.18) on cam-dining."""
WEAK_TABLE = Detection(box=(0.75, 0.70, 0.90, 0.85), score=0.27)
"""Detected above 0.25 but 0.22 after the no-chair penalty: kept only with a lower bar."""
DETECTIONS: dict[int, list[Detection]] = {
    COCO_DINING_TABLE: [TABLE, MASKED_TABLE, WEAK_TABLE],
    COCO_CHAIR: CHAIRS,
    COCO_COUCH: [],
}


class FakeTableDetector:
    """``MultiClassDetector`` returning fixed detections (filtered by ``score_thr``, like the
    real one) and recording every call."""

    def __init__(self, detections: Mapping[int, Sequence[Detection]] = DETECTIONS) -> None:
        self.detections = detections
        self.calls: list[tuple[Frame, tuple[int, ...], float | None]] = []

    def detect_classes(
        self, frame: Frame, classes: Iterable[int], *, score_thr: float | None = None
    ) -> Mapping[int, Sequence[Detection]]:
        wanted = tuple(classes)
        self.calls.append((frame, wanted, score_thr))
        thr = 0.0 if score_thr is None else score_thr
        return {c: [d for d in self.detections.get(c, []) if d.score > thr] for c in wanted}


def rtsp_specs(config: SiteConfig) -> dict[str, SourceSpec]:
    return {**sim_specs(config), CAM_DINING: SourceSpec(CAM_DINING, "rtsp", url="rtsp://cam/1")}


class SuggestApi:
    def __init__(self, runtime: EdgeRuntime, factory: FakeFactory, client: TestClient) -> None:
        self.runtime = runtime
        self.factory = factory
        self.client = client

    def wait_for_pipeline(self, camera_id: str = CAM_DINING) -> None:
        """Until the camera thread serves ``camera_id`` (no temporary capture pipeline)."""
        assert wait_until(lambda: self.runtime._workers[camera_id].pipeline is not None)


@pytest.fixture
def make_api(make_runtime: Build, settings: EdgeSettings) -> Iterator[Callable[..., SuggestApi]]:
    clients: list[TestClient] = []

    def build(
        *, detector: Callable[[], Any] | None = None, frames: bool = True, **kw: Any
    ) -> SuggestApi:
        kw.setdefault(
            "factory", FakeFactory(image=checkerboard(), max_frames=10_000 if frames else 0)
        )
        runtime, factory, _ = make_runtime(**kw)
        runtime.secrets.set_setup_pin_hash(hash_pin(PIN, iterations=1000))
        runtime.start()
        app = create_local_app(runtime, settings, state_interval_s=0.2, table_detector=detector)
        client = TestClient(app)
        clients.append(client)
        return SuggestApi(runtime, factory, client)

    yield build
    for client in clients:
        client.close()


def forbid_disk(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(*args: Any, **kwargs: Any) -> Any:
        raise AssertionError("table suggestions must not write or encode the frame")

    monkeypatch.setattr(builtins, "open", boom)
    monkeypatch.setattr(io, "open", boom)
    monkeypatch.setattr(os, "open", boom)
    monkeypatch.setattr(cv2, "imwrite", boom)
    monkeypatch.setattr(cv2, "VideoWriter", boom)
    monkeypatch.setattr(cv2, "imencode", boom)  # not even an in-memory image is produced


# ------------------------------------------------------------------ access
def test_suggest_tables_requires_the_pin(make_api: Callable[..., SuggestApi]) -> None:
    fake = FakeTableDetector()
    api = make_api(detector=lambda: fake)
    assert api.client.post(URL).status_code == 401
    assert api.client.post(URL, headers={"X-Setup-Pin": "0000"}).status_code == 401
    assert api.client.post(URL, json={"min_confidence": 0.3}).status_code == 401
    assert fake.calls == []


def test_unknown_camera_is_404(make_api: Callable[..., SuggestApi]) -> None:
    fake = FakeTableDetector()
    api = make_api(detector=lambda: fake)
    resp = api.client.post("/local/cameras/cam-nope/suggest-tables", headers=AUTH)
    assert resp.status_code == 404
    assert (
        api.client.post("/local/cameras/bad%20id/suggest-tables", headers=AUTH).status_code == 422
    )
    assert fake.calls == []


# ------------------------------------------------------------------ degraded results
def test_simulated_camera_is_noted(make_api: Callable[..., SuggestApi]) -> None:
    fake = FakeTableDetector()
    api = make_api(detector=lambda: fake)  # the sample config's cameras are simulated
    resp = api.client.post(f"/local/cameras/{CAM_ENTRANCE}/suggest-tables", headers=AUTH)
    assert resp.status_code == 200
    assert resp.json() == {"camera_id": CAM_ENTRANCE, "suggestions": [], "note": "simulated_camera"}
    assert fake.calls == []


def test_missing_model_is_noted(make_api: Callable[..., SuggestApi], config: SiteConfig) -> None:
    def no_model() -> Any:
        raise FileNotFoundError("yolox_tiny.onnx")

    api = make_api(detector=no_model, specs=rtsp_specs(config))
    api.wait_for_pipeline()
    assert wait_until(lambda: any(p.count for p in api.factory.built))
    resp = api.client.post(URL, headers=AUTH)
    assert resp.status_code == 200
    assert resp.json() == {"camera_id": CAM_DINING, "suggestions": [], "note": "no_model"}


def test_no_frame_is_noted(make_api: Callable[..., SuggestApi], config: SiteConfig) -> None:
    fake = FakeTableDetector()
    api = make_api(detector=lambda: fake, specs=rtsp_specs(config), frames=False)
    api.wait_for_pipeline()
    resp = api.client.post(URL, headers=AUTH)
    assert resp.status_code == 200
    assert resp.json() == {"camera_id": CAM_DINING, "suggestions": [], "note": "no_frame"}
    assert fake.calls == []


def test_capture_failures_degrade_to_notes(
    make_api: Callable[..., SuggestApi], config: SiteConfig, monkeypatch: pytest.MonkeyPatch
) -> None:
    api = make_api(detector=FakeTableDetector, specs=rtsp_specs(config))

    def fail(exc: Exception) -> Callable[..., Any]:
        def capture(camera_id: str, **kwargs: Any) -> Any:
            raise exc

        return capture

    monkeypatch.setattr(api.runtime, "capture", fail(FileNotFoundError("model")))
    assert api.client.post(URL, headers=AUTH).json()["note"] == "no_model"
    monkeypatch.setattr(api.runtime, "capture", fail(ConnectionError("rtsp down")))
    assert api.client.post(URL, headers=AUTH).json()["note"] == "no_frame"


# ------------------------------------------------------------------ suggestions
def test_fake_detector_produces_the_expected_json(
    make_api: Callable[..., SuggestApi], config: SiteConfig, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake = FakeTableDetector()
    api = make_api(detector=lambda: fake, specs=rtsp_specs(config))
    api.wait_for_pipeline()
    assert wait_until(lambda: any(p.count for p in api.factory.built))
    with monkeypatch.context() as m:
        forbid_disk(m)
        resp = api.client.post(URL, headers=AUTH)
    assert resp.status_code == 200, resp.text
    body = resp.json()

    # Contract shape.
    assert set(body) == {"camera_id", "suggestions", "note"}
    assert body["camera_id"] == CAM_DINING and body["note"] is None
    (s,) = body["suggestions"]  # the masked table and the weak one are gone
    assert set(s) == {"suggestion_id", "polygon", "table_box", "seats_est", "confidence"}
    assert s["suggestion_id"] == "s1"
    assert s["table_box"] == [0.4, 0.4, 0.6, 0.55]
    assert s["seats_est"] == 2
    assert s["confidence"] == pytest.approx(0.88)  # 0.8 + 2 chairs x 0.04
    assert 3 <= len(s["polygon"]) <= 12
    assert all(len(p) == 2 and 0.0 <= p[0] <= 1.0 and 0.0 <= p[1] <= 1.0 for p in s["polygon"])

    # Exactly what the pure algorithm gives for this frame and the camera's privacy masks.
    masks = config.privacy_masks_for(CAM_DINING)
    expected = suggest_tables(
        {c: [d for d in v if d.score > 0.25] for c, v in DETECTIONS.items()},
        image_size=(320, 240),
        privacy_masks=masks,
    )
    assert body["suggestions"] == [
        {
            "suggestion_id": e.suggestion_id,
            "polygon": [list(p) for p in e.polygon],
            "table_box": list(e.table_box),
            "seats_est": e.seats_est,
            "confidence": e.confidence,
        }
        for e in expected
    ]

    # The detector ran once, on the raw in-memory frame (not the blurred snapshot).
    ((frame, classes, score_thr),) = fake.calls
    assert np.array_equal(frame.image, checkerboard())
    assert classes == (COCO_DINING_TABLE, COCO_CHAIR, COCO_COUCH)
    assert score_thr == 0.25
    assert b"image" not in resp.content and len(resp.content) < 2048  # polygons only


def test_min_confidence_body(make_api: Callable[..., SuggestApi], config: SiteConfig) -> None:
    fake = FakeTableDetector()
    api = make_api(detector=lambda: fake, specs=rtsp_specs(config))
    api.wait_for_pipeline()
    assert wait_until(lambda: any(p.count for p in api.factory.built))

    low = api.client.post(URL, json={"min_confidence": 0.1}, headers=AUTH).json()
    assert [s["table_box"] for s in low["suggestions"]] == [
        [0.4, 0.4, 0.6, 0.55],
        [0.75, 0.7, 0.9, 0.85],
    ]
    assert fake.calls[-1][2] == 0.1
    high = api.client.post(URL, json={"min_confidence": 0.9}, headers=AUTH).json()
    assert high["suggestions"] == [] and high["note"] is None
    assert fake.calls[-1][2] == 0.9
    assert len(api.client.post(URL, json={}, headers=AUTH).json()["suggestions"]) == 1
    assert fake.calls[-1][2] == 0.25

    for bad in ({"min_confidence": 1.5}, {"min_confidence": -0.1}, {"other": 1}):
        assert api.client.post(URL, json=bad, headers=AUTH).status_code == 422


def test_detector_errors_are_503(make_api: Callable[..., SuggestApi], config: SiteConfig) -> None:
    class Broken(FakeTableDetector):
        def detect_classes(self, *args: Any, **kwargs: Any) -> Mapping[int, Sequence[Detection]]:
            raise RuntimeError("onnx failed")

    api = make_api(detector=Broken, specs=rtsp_specs(config))
    api.wait_for_pipeline()
    assert wait_until(lambda: any(p.count for p in api.factory.built))
    assert api.client.post(URL, headers=AUTH).status_code == 503
