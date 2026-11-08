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


class PinGuard:
    """Locks a client out for ``lockout_s`` after ``max_failures`` consecutive wrong PINs."""

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
        self._locked_until: dict[str, float] = {}

    def locked(self, client: str) -> bool:
        return self.retry_after(client) > 0

    def retry_after(self, client: str) -> float:
        """Seconds until ``client`` may try again (0 when it is not locked out)."""
        with self._lock:
            return max(0.0, self._locked_until.get(client, 0.0) - self._now())

    def failure(self, client: str) -> None:
        with self._lock:
            count = self._failures.get(client, 0) + 1
            if count >= self._max:
                self._locked_until[client] = self._now() + self._lockout
                count = 0
            self._failures[client] = count

    def success(self, client: str) -> None:
        with self._lock:
            self._failures.pop(client, None)
            self._locked_until.pop(client, None)
