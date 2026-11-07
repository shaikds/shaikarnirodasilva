"""Wall-clock time source (``rv_contracts.Clock``). The simulator passes its own ``SimClock``."""

from __future__ import annotations

import time


class SystemClock:
    """``Clock`` backed by the system wall clock (Unix epoch seconds)."""

    def now(self) -> float:
        return time.time()
