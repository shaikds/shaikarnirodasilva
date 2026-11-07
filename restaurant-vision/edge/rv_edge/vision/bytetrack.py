"""ByteTrack multi-object tracking core (Zhang et al., ECCV 2022), numpy + scipy only.

``supervision`` dropped ``sv.ByteTrack`` in 0.31 (it moved to Roboflow's ``trackers`` package,
which pulls in non-headless OpenCV and a CLI stack). This module reimplements the same
algorithm and defaults as ``supervision.ByteTrack`` (<= 0.30): constant-velocity Kalman filter
on ``(cx, cy, aspect, height)``, a first association of high-score detections against tracked
and lost tracks (IoU fused with score), a second association of low-score detections against
the remaining tracked ones, confirmation of new tracks on their second frame, and a lost-track
buffer of ``frame_rate / 30 * lost_track_buffer`` frames.

Boxes are pixel ``x1, y1, x2, y2``. Integer ids are internal only; the edge maps them to random
strings (see :mod:`rv_edge.vision.tracking`).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

import numpy as np
import numpy.typing as npt
from scipy.optimize import linear_sum_assignment  # type: ignore[import-untyped]

FloatArray = npt.NDArray[np.float64]

LOW_SCORE_FLOOR = 0.1
SECOND_MATCH_THRESHOLD = 0.5
UNCONFIRMED_MATCH_THRESHOLD = 0.7
DUPLICATE_IOU_DISTANCE = 0.05


class KalmanBoxFilter:
    """Constant-velocity Kalman filter on ``(cx, cy, aspect, height)`` and their velocities."""

    _W_POS = 1.0 / 20
    _W_VEL = 1.0 / 160

    def __init__(self) -> None:
        self._motion = np.eye(8)
        self._motion[:4, 4:] = np.eye(4)
        self._observe = np.eye(4, 8)

    def initiate(self, xyah: FloatArray) -> tuple[FloatArray, FloatArray]:
        h = xyah[3]
        mean = np.r_[xyah, np.zeros(4)]
        std = [
            2 * self._W_POS * h,
            2 * self._W_POS * h,
            1e-2,
            2 * self._W_POS * h,
            10 * self._W_VEL * h,
            10 * self._W_VEL * h,
            1e-5,
            10 * self._W_VEL * h,
        ]
        return mean, np.diag(np.square(std))

    def predict(self, mean: FloatArray, cov: FloatArray) -> tuple[FloatArray, FloatArray]:
        h = mean[3]
        std = [
            self._W_POS * h,
            self._W_POS * h,
            1e-2,
            self._W_POS * h,
            self._W_VEL * h,
            self._W_VEL * h,
            1e-5,
            self._W_VEL * h,
        ]
        mean = self._motion @ mean
        cov = self._motion @ cov @ self._motion.T + np.diag(np.square(std))
        return mean, cov

    def update(
        self, mean: FloatArray, cov: FloatArray, xyah: FloatArray
    ) -> tuple[FloatArray, FloatArray]:
        h = mean[3]
        std = [self._W_POS * h, self._W_POS * h, 1e-1, self._W_POS * h]
        innovation_cov = np.diag(np.square(std))
        projected_mean = self._observe @ mean
        projected_cov = self._observe @ cov @ self._observe.T + innovation_cov
        gain = np.linalg.solve(projected_cov, (cov @ self._observe.T).T).T
        new_mean = mean + gain @ (xyah - projected_mean)
        new_cov = cov - gain @ projected_cov @ gain.T
        return new_mean, new_cov


class _State(Enum):
    NEW = 0
    TRACKED = 1
    LOST = 2
    REMOVED = 3


@dataclass(eq=False)
class _Track:
    tlwh: FloatArray
    score: float
    det_index: int
    track_id: int = -1
    confirmed: bool = False
    mean: FloatArray | None = None
    cov: FloatArray | None = None
    state: _State = _State.NEW
    is_activated: bool = False
    frame_id: int = 0
    start_frame: int = 0
    tracklet_len: int = 0

    @property
    def tlbr(self) -> FloatArray:
        if self.mean is None:
            x, y, w, h = self.tlwh
        else:
            cx, cy, a, h = self.mean[:4]
            w = a * h
            x, y = cx - w / 2, cy - h / 2
        return np.array([x, y, x + w, y + h])


def _xyah(tlwh: FloatArray) -> FloatArray:
    x, y, w, h = tlwh
    return np.array([x + w / 2, y + h / 2, w / h if h > 0 else 0.0, h])


def box_iou(a: FloatArray, b: FloatArray) -> FloatArray:
    """Pairwise IoU of ``(N, 4)`` and ``(M, 4)`` xyxy boxes."""
    area_a = (a[:, 2] - a[:, 0]) * (a[:, 3] - a[:, 1])
    area_b = (b[:, 2] - b[:, 0]) * (b[:, 3] - b[:, 1])
    top_left = np.maximum(a[:, None, :2], b[None, :, :2])
    bottom_right = np.minimum(a[:, None, 2:], b[None, :, 2:])
    inter = np.prod(np.clip(bottom_right - top_left, 0, None), axis=2)
    union = area_a[:, None] + area_b[None, :] - inter
    return np.divide(inter, union, out=np.zeros_like(inter), where=union > 0)


def _iou_distance(a: list[_Track], b: list[_Track]) -> FloatArray:
    if not a or not b:
        return np.zeros((len(a), len(b)))
    return 1.0 - box_iou(np.array([t.tlbr for t in a]), np.array([t.tlbr for t in b]))


def _fuse_score(cost: FloatArray, detections: list[_Track]) -> FloatArray:
    if cost.size == 0:
        return cost
    scores = np.array([d.score for d in detections])[None, :]
    fused: FloatArray = 1.0 - (1.0 - cost) * scores
    return fused


def _linear_assignment(
    cost: FloatArray, thresh: float
) -> tuple[list[tuple[int, int]], list[int], list[int]]:
    rows, cols = cost.shape
    if cost.size == 0:
        return [], list(range(rows)), list(range(cols))
    cost = np.where(cost > thresh, thresh + 1e-4, cost)
    row_ind, col_ind = linear_sum_assignment(cost)
    matches = [
        (int(r), int(c)) for r, c in zip(row_ind, col_ind, strict=True) if cost[r, c] <= thresh
    ]
    matched_rows = {r for r, _ in matches}
    matched_cols = {c for _, c in matches}
    return (
        matches,
        [r for r in range(rows) if r not in matched_rows],
        [c for c in range(cols) if c not in matched_cols],
    )


def _join(a: list[_Track], b: list[_Track]) -> list[_Track]:
    seen: set[int] = set()
    out: list[_Track] = []
    for t in a + b:
        if t.track_id not in seen:
            seen.add(t.track_id)
            out.append(t)
    return out


def _subtract(a: list[_Track], b: list[_Track]) -> list[_Track]:
    ids = {t.track_id for t in b}
    return [t for t in a if t.track_id not in ids]


def _remove_duplicates(a: list[_Track], b: list[_Track]) -> tuple[list[_Track], list[_Track]]:
    dist = _iou_distance(a, b)
    drop_a: set[int] = set()
    drop_b: set[int] = set()
    for i, j in zip(*np.where(dist < DUPLICATE_IOU_DISTANCE), strict=True):
        age_a = a[i].frame_id - a[i].start_frame
        age_b = b[j].frame_id - b[j].start_frame
        if age_a > age_b:
            drop_b.add(int(j))
        else:
            drop_a.add(int(i))
    return (
        [t for i, t in enumerate(a) if i not in drop_a],
        [t for j, t in enumerate(b) if j not in drop_b],
    )


class ByteTrack:
    """ByteTrack association. :meth:`update` returns ``(track_id, detection_index)`` pairs for
    the confirmed tracks matched in this frame."""

    def __init__(
        self,
        track_activation_threshold: float = 0.25,
        lost_track_buffer: int = 30,
        minimum_matching_threshold: float = 0.8,
        frame_rate: float = 30.0,
        minimum_consecutive_frames: int = 1,
    ) -> None:
        self.track_activation_threshold = track_activation_threshold
        self.minimum_matching_threshold = minimum_matching_threshold
        self.det_thresh = track_activation_threshold + 0.1
        self.max_time_lost = int(frame_rate / 30.0 * lost_track_buffer)
        self.minimum_consecutive_frames = minimum_consecutive_frames
        self._kf = KalmanBoxFilter()
        self.reset()

    def reset(self) -> None:
        """Forget every track and restart ids."""
        self.frame_id = 0
        self._next_id = 0
        self._tracked: list[_Track] = []
        self._lost: list[_Track] = []
        self._removed: list[_Track] = []

    def alive_ids(self) -> set[int]:
        """Ids of tracks that are tracked or in the lost buffer (they may still come back)."""
        return {t.track_id for t in self._tracked + self._lost if t.track_id >= 0}

    def update(self, boxes: FloatArray, scores: FloatArray) -> list[tuple[int, int]]:
        """Advance one frame with ``(N, 4)`` pixel xyxy boxes and ``(N,)`` scores."""
        self.frame_id += 1
        boxes = np.asarray(boxes, dtype=np.float64).reshape(-1, 4)
        scores = np.asarray(scores, dtype=np.float64).reshape(-1)
        thr = self.track_activation_threshold
        high = np.flatnonzero(scores > thr)
        low = np.flatnonzero((scores > LOW_SCORE_FLOOR) & (scores < thr))
        dets = [self._candidate(boxes[i], scores[i], int(i)) for i in high]
        dets_low = [self._candidate(boxes[i], scores[i], int(i)) for i in low]

        unconfirmed = [t for t in self._tracked if not t.is_activated]
        tracked = [t for t in self._tracked if t.is_activated]
        activated: list[_Track] = []
        refound: list[_Track] = []
        lost_now: list[_Track] = []
        removed_now: list[_Track] = []

        # 1) high-score detections vs tracked + lost tracks
        pool = _join(tracked, self._lost)
        for t in pool:
            self._predict(t)
        cost = _fuse_score(_iou_distance(pool, dets), dets)
        matches, u_track, u_det = _linear_assignment(cost, self.minimum_matching_threshold)
        for it, idet in matches:
            self._match(pool[it], dets[idet], activated, refound)

        # 2) low-score detections vs the remaining tracked tracks
        remaining = [pool[i] for i in u_track if pool[i].state is _State.TRACKED]
        matches, u_remaining, _ = _linear_assignment(
            _iou_distance(remaining, dets_low), SECOND_MATCH_THRESHOLD
        )
        for it, idet in matches:
            self._match(remaining[it], dets_low[idet], activated, refound)
        for it in u_remaining:
            track = remaining[it]
            if track.state is not _State.LOST:
                track.state = _State.LOST
                lost_now.append(track)

        # 3) unconfirmed tracks (seen once) vs leftover high-score detections
        left = [dets[i] for i in u_det]
        cost = _fuse_score(_iou_distance(unconfirmed, left), left)
        matches, u_unconfirmed, u_left = _linear_assignment(cost, UNCONFIRMED_MATCH_THRESHOLD)
        for it, idet in matches:
            self._update(unconfirmed[it], left[idet])
            activated.append(unconfirmed[it])
        for it in u_unconfirmed:
            unconfirmed[it].state = _State.REMOVED
            removed_now.append(unconfirmed[it])

        # 4) new tracks from confident leftovers
        for idet in u_left:
            det = left[idet]
            if det.score >= self.det_thresh:
                self._activate(det)
                activated.append(det)

        # 5) expire lost tracks and rebuild the lists (same bookkeeping as supervision)
        for t in self._lost:
            if self.frame_id - t.frame_id > self.max_time_lost:
                t.state = _State.REMOVED
                removed_now.append(t)
        kept = [t for t in self._tracked if t.state is _State.TRACKED]
        self._tracked = _join(_join(kept, activated), refound)
        lost = _subtract(self._lost, self._tracked) + lost_now
        self._lost = _subtract(lost, self._removed)
        self._removed = removed_now
        self._tracked, self._lost = _remove_duplicates(self._tracked, self._lost)
        return [(t.track_id, t.det_index) for t in self._tracked if t.is_activated and t.confirmed]

    # ------------------------------------------------------------------ track lifecycle

    @staticmethod
    def _candidate(tlbr: FloatArray, score: float, index: int) -> _Track:
        x1, y1, x2, y2 = tlbr
        tlwh = np.array([x1, y1, x2 - x1, y2 - y1])
        return _Track(tlwh=tlwh, score=float(score), det_index=index)

    def _predict(self, t: _Track) -> None:
        assert t.mean is not None and t.cov is not None
        mean = t.mean.copy()
        if t.state is not _State.TRACKED:
            mean[7] = 0.0
        t.mean, t.cov = self._kf.predict(mean, t.cov)

    def _activate(self, t: _Track) -> None:
        t.track_id = self._next_id
        self._next_id += 1
        t.mean, t.cov = self._kf.initiate(_xyah(t.tlwh))
        t.tracklet_len = 0
        t.state = _State.TRACKED
        if self.frame_id == 1:
            t.is_activated = True
            t.confirmed = self.minimum_consecutive_frames == 1
        t.frame_id = self.frame_id
        t.start_frame = self.frame_id

    def _update(self, t: _Track, det: _Track) -> None:
        assert t.mean is not None and t.cov is not None
        t.frame_id = self.frame_id
        t.tracklet_len += 1
        t.mean, t.cov = self._kf.update(t.mean, t.cov, _xyah(det.tlwh))
        t.state = _State.TRACKED
        if t.tracklet_len == self.minimum_consecutive_frames:
            t.is_activated = True
            t.confirmed = True
        t.score = det.score
        t.det_index = det.det_index

    def _reactivate(self, t: _Track, det: _Track) -> None:
        assert t.mean is not None and t.cov is not None
        t.mean, t.cov = self._kf.update(t.mean, t.cov, _xyah(det.tlwh))
        t.tracklet_len = 0
        t.state = _State.TRACKED
        t.frame_id = self.frame_id
        t.score = det.score
        t.det_index = det.det_index

    def _match(
        self, track: _Track, det: _Track, activated: list[_Track], refound: list[_Track]
    ) -> None:
        if track.state is _State.TRACKED:
            self._update(track, det)
            activated.append(track)
        else:
            self._reactivate(track, det)
            refound.append(track)
