"""Simulated detector: turns a ``SyntheticImage``'s ground-truth people into detections."""

from __future__ import annotations

import random

from rv_contracts import Detection, Frame

from ...interfaces import Box, SyntheticImage


def _clip01(value: float) -> float:
    return min(1.0, max(0.0, value))


class SimulatedDetector:
    """``Detector`` for simulated sources, with optional, seeded noise.

    * ``jitter``: standard deviation of each box edge, as a fraction of the box size.
    * ``miss_rate``: probability that a person is not detected in a frame.
    * ``false_positive_rate``: probability per frame of one spurious person-sized box.

    The noise sequence is fully determined by ``seed``; with all rates at 0 no random numbers
    are drawn and the output equals the ground truth.
    """

    def __init__(
        self,
        jitter: float = 0.0,
        miss_rate: float = 0.0,
        false_positive_rate: float = 0.0,
        seed: int = 0,
        *,
        score: float = 0.9,
    ) -> None:
        for name, value in (
            ("jitter", jitter),
            ("miss_rate", miss_rate),
            ("false_positive_rate", false_positive_rate),
            ("score", score),
        ):
            if not 0.0 <= value <= 1.0:
                raise ValueError(f"{name} must be in [0, 1], got {value}")
        self.jitter = jitter
        self.miss_rate = miss_rate
        self.false_positive_rate = false_positive_rate
        self.score = score
        self._rng = random.Random(seed)

    def detect(self, frame: Frame) -> list[Detection]:
        image = frame.image
        if image is None:
            return []
        if not isinstance(image, SyntheticImage):
            raise TypeError(
                "SimulatedDetector needs frames from a simulated source (SyntheticImage); "
                "use the yolox backend for real cameras"
            )
        detections: list[Detection] = []
        for person in image.people:
            if self.miss_rate > 0 and self._rng.random() < self.miss_rate:
                continue
            box = self._jittered(person.box) if self.jitter > 0 else person.box
            detections.append(Detection(box=box, score=self.score))
        if self.false_positive_rate > 0 and self._rng.random() < self.false_positive_rate:
            detections.append(self._false_positive())
        return detections

    def _jittered(self, box: Box) -> Box:
        x1, y1, x2, y2 = box
        sx = self.jitter * (x2 - x1)
        sy = self.jitter * (y2 - y1)
        g = self._rng.gauss
        nx1, nx2 = sorted((_clip01(x1 + g(0.0, sx)), _clip01(x2 + g(0.0, sx))))
        ny1, ny2 = sorted((_clip01(y1 + g(0.0, sy)), _clip01(y2 + g(0.0, sy))))
        return (nx1, ny1, nx2, ny2)

    def _false_positive(self) -> Detection:
        u = self._rng.uniform
        w = u(0.03, 0.08)
        h = min(0.9, w * u(2.0, 3.0))
        x1 = u(0.0, 1.0 - w)
        y1 = u(0.0, 1.0 - h)
        return Detection(box=(x1, y1, x1 + w, y1 + h), score=u(0.4, 0.7))
