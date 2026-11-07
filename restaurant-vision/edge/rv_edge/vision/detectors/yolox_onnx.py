"""YOLOX person detector on ONNX Runtime (YOLOX: Apache-2.0, ONNX Runtime: MIT).

Pre- and post-processing follow the official demo ``demo/ONNXRuntime/onnx_inference.py``
(YOLOX 0.1.1rc0 release models): letterbox resize with pad value 114 at the bottom/right, BGR
``float32`` CHW **without** normalization, grid/stride decode over strides 8/16/32,
``score = objectness * class``, then NMS. Only the person class (COCO 0) is returned, as
normalized boxes.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import numpy.typing as npt
import onnxruntime as ort  # type: ignore[import-untyped]
from rv_contracts import Detection, Frame

log = logging.getLogger(__name__)

PAD_VALUE = 114
STRIDES = (8, 16, 32)
PERSON_CLASS = 0
OPENVINO_EP = "OpenVINOExecutionProvider"
CPU_EP = "CPUExecutionProvider"

F32 = npt.NDArray[np.float32]


def preprocess(image: npt.NDArray[np.uint8], input_size: tuple[int, int]) -> tuple[F32, float]:
    """Official YOLOX ``preproc``: aspect-preserving resize, pad 114, HWC BGR -> CHW float32."""
    in_h, in_w = input_size
    h, w = image.shape[:2]
    ratio = min(in_h / h, in_w / w)
    new_w, new_h = int(w * ratio), int(h * ratio)
    padded = np.full((in_h, in_w, 3), PAD_VALUE, dtype=np.uint8)
    resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
    padded[:new_h, :new_w] = resized
    chw = np.ascontiguousarray(padded.transpose(2, 0, 1), dtype=np.float32)
    return chw, ratio


def make_grids(input_size: tuple[int, int], strides: Sequence[int] = STRIDES) -> tuple[F32, F32]:
    """Grid cell offsets ``(N, 2)`` and strides ``(N, 1)`` matching the model's output rows."""
    in_h, in_w = input_size
    grids: list[F32] = []
    expanded: list[F32] = []
    for stride in strides:
        hsize, wsize = in_h // stride, in_w // stride
        xv, yv = np.meshgrid(np.arange(wsize), np.arange(hsize))
        grids.append(np.stack((xv, yv), 2).reshape(-1, 2).astype(np.float32))
        expanded.append(np.full((hsize * wsize, 1), stride, dtype=np.float32))
    return np.concatenate(grids), np.concatenate(expanded)


def nms(boxes: npt.NDArray[Any], scores: npt.NDArray[Any], nms_thr: float) -> list[int]:
    """Greedy NMS exactly as in the YOLOX demo (``+1`` pixel area convention)."""
    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    areas = (x2 - x1 + 1) * (y2 - y1 + 1)
    order = scores.argsort()[::-1]
    keep: list[int] = []
    while order.size > 0:
        i = int(order[0])
        keep.append(i)
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        w = np.maximum(0.0, xx2 - xx1 + 1)
        h = np.maximum(0.0, yy2 - yy1 + 1)
        inter = w * h
        ovr = inter / (areas[i] + areas[order[1:]] - inter)
        order = order[np.where(ovr <= nms_thr)[0] + 1]
    return keep


def select_providers(available: Sequence[str] | None = None) -> list[str]:
    """OpenVINO (Intel CPUs/iGPUs) when installed, CPU otherwise."""
    available = list(available if available is not None else ort.get_available_providers())
    if OPENVINO_EP in available:
        return [OPENVINO_EP, CPU_EP]
    return [CPU_EP]


def resolve_input_size(
    input_size: int | tuple[int, int] | None, model_shape: Sequence[Any], model_path: Path
) -> tuple[int, int]:
    """Explicit size, else the model's static input shape, else by name (tiny/nano 416, 640)."""
    if input_size is not None:
        if isinstance(input_size, int):
            return (input_size, input_size)
        return (int(input_size[0]), int(input_size[1]))
    dims = list(model_shape)
    if len(dims) == 4 and isinstance(dims[2], int) and isinstance(dims[3], int):
        return (dims[2], dims[3])
    name = model_path.name.lower()
    side = 416 if ("tiny" in name or "nano" in name) else 640
    return (side, side)


class YoloxOnnxDetector:
    """``Detector`` running a YOLOX ONNX model. ``detect`` is thread-safe (one session can be
    shared by several camera threads)."""

    def __init__(
        self,
        model_path: str | Path,
        input_size: int | tuple[int, int] | None = None,
        score_thr: float = 0.35,
        nms_thr: float = 0.45,
        threads: int | None = None,
    ) -> None:
        path = Path(model_path)
        if not path.is_file():
            raise FileNotFoundError(f"YOLOX model not found: {path}")
        options = ort.SessionOptions()
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        options.log_severity_level = 3
        options.inter_op_num_threads = 1
        if threads:
            options.intra_op_num_threads = threads
        self._session = ort.InferenceSession(
            str(path), sess_options=options, providers=select_providers()
        )
        model_input = self._session.get_inputs()[0]
        self._input_name: str = model_input.name
        self.model_path = path
        self.input_size = resolve_input_size(input_size, model_input.shape, path)
        self.score_thr = score_thr
        self.nms_thr = nms_thr
        self.threads = threads
        self.providers: tuple[str, ...] = tuple(self._session.get_providers())
        self._grids, self._strides = make_grids(self.input_size)
        log.info(
            "YOLOX %s: input %dx%d, providers %s",
            path.name,
            self.input_size[1],
            self.input_size[0],
            ",".join(self.providers),
        )

    def detect(self, frame: Frame) -> list[Detection]:
        image = frame.image
        if not isinstance(image, np.ndarray) or image.ndim != 3 or image.shape[2] != 3:
            raise TypeError("YoloxOnnxDetector needs BGR HxWx3 numpy frames")
        blob, ratio = preprocess(image, self.input_size)
        outputs = self._session.run(None, {self._input_name: blob[None]})
        raw = np.asarray(outputs[0])[0]
        return self.postprocess(raw, ratio, image.shape[1], image.shape[0])

    def postprocess(self, raw: F32, ratio: float, width: int, height: int) -> list[Detection]:
        """Decode raw ``(N, 5 + classes)`` output into normalized person detections."""
        if raw.shape[0] != self._grids.shape[0]:
            raise ValueError(
                f"model output has {raw.shape[0]} rows, expected {self._grids.shape[0]} for "
                f"input {self.input_size}; the model must be exported without decoding"
            )
        return decode_persons(
            raw,
            self._grids,
            self._strides,
            ratio=ratio,
            width=width,
            height=height,
            score_thr=self.score_thr,
            nms_thr=self.nms_thr,
        )


def decode_persons(
    raw: F32,
    grids: F32,
    strides: F32,
    *,
    ratio: float,
    width: int,
    height: int,
    score_thr: float,
    nms_thr: float,
) -> list[Detection]:
    """YOLOX ``demo_postprocess`` + NMS for the person class, as normalized boxes.

    ``raw`` rows are ``(dx, dy, log_w, log_h, objectness, class scores...)`` in grid units;
    ``score = objectness * person``, kept when ``> score_thr``.
    """
    scores = raw[:, 4] * raw[:, 5 + PERSON_CLASS]
    keep = scores > score_thr
    if not np.any(keep):
        return []
    pred = raw[keep]
    kept_scores = scores[keep]
    centers = (pred[:, :2] + grids[keep]) * strides[keep]
    sizes = np.exp(pred[:, 2:4]) * strides[keep]
    boxes = np.concatenate([centers - sizes / 2.0, centers + sizes / 2.0], axis=1) / ratio
    detections: list[Detection] = []
    for i in nms(boxes, kept_scores, nms_thr):
        x1, y1, x2, y2 = (float(v) for v in boxes[i])
        box = (
            min(1.0, max(0.0, x1 / width)),
            min(1.0, max(0.0, y1 / height)),
            min(1.0, max(0.0, x2 / width)),
            min(1.0, max(0.0, y2 / height)),
        )
        detections.append(Detection(box=box, score=float(kept_scores[i])))
    return detections
