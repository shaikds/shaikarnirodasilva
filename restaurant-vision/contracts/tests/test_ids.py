import re
import time
import uuid

import pytest

from rv_contracts import UUID7_PATTERN, new_event_id, new_uuid7, uuid7_timestamp
from rv_contracts.ids import _Uuid7Generator


def test_format_and_version() -> None:
    value = new_event_id()
    assert re.fullmatch(UUID7_PATTERN, value)
    parsed = uuid.UUID(value)
    assert parsed.version == 7
    assert parsed.variant == uuid.RFC_4122
    assert str(parsed) == value  # canonical lowercase


def test_embedded_timestamp_is_now() -> None:
    before = time.time()
    value = new_uuid7()
    after = time.time()
    assert before - 0.002 <= uuid7_timestamp(value) <= after + 0.002


def test_strictly_increasing_and_unique() -> None:
    ids = [new_event_id() for _ in range(20_000)]
    assert ids == sorted(ids)
    assert len(set(ids)) == len(ids)
    as_ints = [uuid.UUID(i).int for i in ids]
    assert as_ints == sorted(as_ints)


def test_monotonic_when_clock_goes_backwards() -> None:
    gen = _Uuid7Generator()
    first = gen.next(1_000_000)
    second = gen.next(999_000)  # clock jumped back one second
    third = gen.next(1_000_000)
    assert first < second < third
    assert uuid7_timestamp(second) == uuid7_timestamp(first) == 1000.0


def test_counter_overflow_advances_timestamp() -> None:
    gen = _Uuid7Generator()
    ids = [gen.next(5_000) for _ in range(5_000)]  # > 4096 ids within one millisecond
    assert ids == sorted(ids)
    assert len(set(ids)) == len(ids)
    assert uuid7_timestamp(ids[-1]) > 5.0


def test_uuid7_timestamp_rejects_other_versions() -> None:
    with pytest.raises(ValueError, match="not a UUIDv7"):
        uuid7_timestamp(str(uuid.uuid4()))
