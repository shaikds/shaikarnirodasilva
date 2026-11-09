"""Local setup PIN: PBKDF2-SHA256 hashing, constant-time verification, failure lockout.

Stored format: ``pbkdf2_sha256$<iterations>$<salt hex>$<hash hex>``.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import threading
import time
from collections.abc import Callable

PIN_MIN_LEN = 4
PIN_MAX_LEN = 64
DEFAULT_ITERATIONS = 200_000
_SCHEME = "pbkdf2_sha256"


def hash_pin(pin: str, *, iterations: int = DEFAULT_ITERATIONS) -> str:
    """Hash a setup PIN for storage."""
    if not PIN_MIN_LEN <= len(pin) <= PIN_MAX_LEN:
        raise ValueError(f"PIN must be {PIN_MIN_LEN}-{PIN_MAX_LEN} characters")
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), salt, iterations)
    return f"{_SCHEME}${iterations}${salt.hex()}${digest.hex()}"


def verify_pin(pin: str, stored: str) -> bool:
    """True if ``pin`` matches ``stored``. Constant-time comparison of the derived hashes."""
    try:
        scheme, iterations_s, salt_hex, digest_hex = stored.split("$")
        iterations = int(iterations_s)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(digest_hex)
    except ValueError:
        return False
    if scheme != _SCHEME or iterations <= 0 or len(pin) > PIN_MAX_LEN:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(digest, expected)


BUSY_RETRY_S = 1.0
"""``Retry-After`` while all remaining attempts of a client are being checked right now."""


class PinGuard:
    """Locks a client out for ``lockout_s`` after ``max_failures`` consecutive wrong PINs.

    Checking a PIN is slow on purpose (PBKDF2), so a client must :meth:`acquire` an attempt
    slot *before* hashing and then report the verdict with :meth:`success`, :meth:`failure` or
    :meth:`release`. Slots are reserved under the lock and attempts still in flight count as
    failures for the limit, so concurrent guesses can never evaluate more than
    ``max_failures`` PINs per lockout window.
    """

    def __init__(
        self,
        max_failures: int = 5,
        lockout_s: float = 30.0,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self._max = max_failures
        self._lockout = lockout_s
        self._now = monotonic
        self._lock = threading.Lock()
        self._failures: dict[str, int] = {}
        self._in_flight: dict[str, int] = {}
        self._locked_until: dict[str, float] = {}

    def locked(self, client: str) -> bool:
        return self.retry_after(client) > 0

    def retry_after(self, client: str) -> float:
        """Seconds until ``client`` may try again (0 when it is not locked out)."""
        with self._lock:
            return self._lockout_left(client)

    def acquire(self, client: str) -> float:
        """Reserve one attempt for ``client``. Returns 0 when the attempt may be evaluated (the
        caller must then report the verdict), else the seconds to wait: the lockout left, or
        :data:`BUSY_RETRY_S` while the remaining attempts are all in flight."""
        with self._lock:
            wait = self._lockout_left(client)
            if wait > 0:
                return wait
            in_flight = self._in_flight.get(client, 0)
            if self._failures.get(client, 0) + in_flight >= self._max:
                return BUSY_RETRY_S
            self._in_flight[client] = in_flight + 1
            return 0.0

    def failure(self, client: str) -> None:
        """A wrong PIN (confirms a slot taken with :meth:`acquire`)."""
        with self._lock:
            self._settle(client)
            count = self._failures.get(client, 0) + 1
            if count >= self._max:
                self._locked_until[client] = self._now() + self._lockout
                count = 0
            self._failures[client] = count

    def success(self, client: str) -> None:
        """The right PIN: resets the client's failures and lockout."""
        with self._lock:
            self._settle(client)
            self._failures.pop(client, None)
            self._locked_until.pop(client, None)

    def release(self, client: str) -> None:
        """Give back a slot without a verdict (the PIN could not be checked)."""
        with self._lock:
            self._settle(client)

    def _lockout_left(self, client: str) -> float:
        return max(0.0, self._locked_until.get(client, 0.0) - self._now())

    def _settle(self, client: str) -> None:
        in_flight = self._in_flight.get(client, 0) - 1
        if in_flight > 0:
            self._in_flight[client] = in_flight
        else:
            self._in_flight.pop(client, None)
