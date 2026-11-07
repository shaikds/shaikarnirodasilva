from __future__ import annotations

import re

import numpy as np
from rv_contracts import Detection, Tracker

from rv_edge.interfaces import Box
from rv_edge.vision.bytetrack import ByteTrack, box_iou
from rv_edge.vision.tracking import ByteTrackTracker

from .fakes import synthetic_frame, walking_people

HEX12 = re.compile(r"^[0-9a-f]{12}$")
T0 = 1_700_000_000.0


def feed(
    tracker: ByteTrackTracker, frames: list[list[Box]], *, t0: float = T0, fps: float = 5.0
) -> list[dict[Box, str]]:
    """Run frames through the tracker; per frame, map each detection box to its track id."""
    out: list[dict[Box, str]] = []
    for i, boxes in enumerate(frames):
        frame = synthetic_frame(boxes, ts=t0 + i / fps, index=i)
        tracks = tracker.update([Detection(box=b, score=0.9) for b in boxes], frame)
        out.append({t.box: t.track_id for t in tracks})
    return out


def test_implements_tracker_protocol() -> None:
    assert isinstance(ByteTrackTracker(), Tracker)


def test_stable_random_ids_on_moving_boxes() -> None:
    frames = walking_people(40)
    result = feed(ByteTrackTracker(frame_rate=5), frames)
    per_person = [{result[i][frames[i][p]] for i in range(40)} for p in range(3)]
    assert all(len(ids) == 1 for ids in per_person), "each person keeps one id"
    ids = [next(iter(s)) for s in per_person]
    assert len(set(ids)) == 3
    assert all(HEX12.match(i) for i in ids)


def test_ids_are_random_not_sequential() -> None:
    frames = walking_people(3)
    a = set(feed(ByteTrackTracker(), frames)[-1].values())
    b = set(feed(ByteTrackTracker(), frames)[-1].values())
    assert a.isdisjoint(b), "two trackers never produce the same ids"
    assert not {"0", "1", "2"} & a


def test_track_carries_detection_box_score_and_first_seen() -> None:
    tracker = ByteTrackTracker()
    boxes = walking_people(5)
    for i, frame_boxes in enumerate(boxes):
        dets = [Detection(box=b, score=0.5 + 0.1 * k) for k, b in enumerate(frame_boxes)]
        tracks = tracker.update(dets, synthetic_frame(frame_boxes, ts=T0 + i))
    assert {(t.box, t.score) for t in tracks} == {(d.box, d.score) for d in dets}
    assert all(t.first_seen_ts == T0 for t in tracks)
    assert all(t.hints.uniform_score is None for t in tracks)


def test_new_person_is_confirmed_on_second_frame_with_own_first_seen() -> None:
    tracker = ByteTrackTracker()
    seated = (0.45, 0.10, 0.52, 0.40)
    newcomer = (0.10, 0.50, 0.18, 0.95)
    out = feed(tracker, [[seated], [seated], [seated, newcomer], [seated, newcomer]])
    assert newcomer not in out[2]  # ByteTrack confirms new tracks on their second frame
    frame = synthetic_frame([seated, newcomer], ts=T0 + 10)
    tracks = tracker.update([Detection(seated, 0.9), Detection(newcomer, 0.9)], frame)
    first_seen = {t.box: t.first_seen_ts for t in tracks}
    assert first_seen[seated] == T0 and first_seen[newcomer] == T0 + 3 / 5


def test_short_occlusion_keeps_id_long_absence_gets_new_id() -> None:
    person = (0.30, 0.20, 0.40, 0.90)
    tracker = ByteTrackTracker(frame_rate=5)  # lost buffer ~3 s = 15 frames
    before = feed(tracker, [[person]] * 3)[-1][person]
    after_gap = feed(tracker, [[]] * 10 + [[person]], t0=T0 + 1)[-1][person]
    assert after_gap == before
    feed(tracker, [[]] * 20, t0=T0 + 4)
    out = feed(tracker, [[person], [person]], t0=T0 + 9)
    assert out[-1][person] != before


def test_ids_rotate_after_ttl_and_on_reset() -> None:
    frames = walking_people(3)
    tracker = ByteTrackTracker(track_id_ttl_h=1.0)
    first = set(feed(tracker, frames)[-1].values())
    same_hour = set(feed(tracker, walking_people(4)[3:], t0=T0 + 0.6)[-1].values())
    assert same_hour == first
    rotated = feed(tracker, walking_people(6)[4:], t0=T0 + 3600.0)
    assert set(rotated[-1].values()).isdisjoint(first)
    assert tracker.epoch_ts == T0 + 3600.0
    tracks = tracker.update(
        [Detection(b, 0.9) for b in frames[0]], synthetic_frame(frames[0], ts=T0 + 3601)
    )
    assert all(t.first_seen_ts == T0 + 3600.0 for t in tracks), "state reset on rotation"
    tracker.reset()
    assert tracker.epoch_ts is None
    again = set(feed(tracker, frames, t0=T0 + 3700)[-1].values())
    assert again.isdisjoint(set(rotated[-1].values()))


def test_clock_going_backwards_rotates_ids() -> None:
    frames = walking_people(2)
    tracker = ByteTrackTracker()
    first = set(feed(tracker, frames)[-1].values())
    back = set(feed(tracker, frames, t0=T0 - 100)[-1].values())
    assert back.isdisjoint(first)


def test_handles_frames_without_dimensions_and_empty_detections() -> None:
    tracker = ByteTrackTracker()
    frame = synthetic_frame([], ts=T0)
    zero = type(frame)("cam-1", T0, 0, 0, 0, frame.image)
    assert tracker.update([], zero) == []
    box = (0.1, 0.1, 0.2, 0.5)
    tracker.update([Detection(box, 0.9)], zero)
    assert len(tracker.update([Detection(box, 0.9)], zero)) == 1


def test_bytetrack_core_low_score_second_association() -> None:
    core = ByteTrack(frame_rate=5, lost_track_buffer=30)
    box = np.array([[100.0, 100.0, 150.0, 250.0]])
    ((tid, _),) = core.update(box, np.array([0.9]))
    # A weak (0.2) detection still continues an existing track, but never starts one.
    assert core.update(box + 2, np.array([0.2])) == [(tid, 0)]
    assert core.update(np.array([[400.0, 100.0, 450.0, 250.0]]), np.array([0.2])) == []
    assert tid in core.alive_ids()
    core.reset()
    assert core.alive_ids() == set()


def test_box_iou() -> None:
    a = np.array([[0.0, 0.0, 2.0, 2.0]])
    b = np.array([[1.0, 1.0, 3.0, 3.0], [5.0, 5.0, 6.0, 6.0], [0.0, 0.0, 0.0, 0.0]])
    assert box_iou(a, b)[0].tolist() == [1 / 7, 0.0, 0.0]
