"""Wall clock used by services (``rv_contracts.Clock``); tests inject a fake one."""

import time

from rv_contracts import Clock


class SystemClock:
    """Real time, Unix epoch seconds."""

    def now(self) -> float:
        return time.time()


__all__ = ["Clock", "SystemClock"]
