"""Credentials: argon2 password hashing, JWT user tokens, device tokens, rate limiting."""

import hashlib
import secrets
import threading
from collections import deque
from dataclasses import dataclass
from typing import Literal

import jwt
from argon2 import PasswordHasher as _Argon2Hasher
from argon2.exceptions import InvalidHashError, VerificationError
from rv_contracts import TokenPair

from .clock import Clock
from .config import Settings
from .errors import RateLimited, Unauthorized

TokenType = Literal["access", "refresh"]
DEVICE_TOKEN_PREFIX = "rvd_"


class PasswordHasher:
    """argon2id hashing with a constant-time miss path (no user enumeration by timing)."""

    def __init__(self, settings: Settings) -> None:
        self._hasher = _Argon2Hasher(
            time_cost=settings.argon2_time_cost,
            memory_cost=settings.argon2_memory_cost_kib,
            parallelism=settings.argon2_parallelism,
        )
        self._dummy_hash = self._hasher.hash(secrets.token_urlsafe(16))

    def hash(self, password: str) -> str:
        return self._hasher.hash(password)

    def verify(self, password_hash: str | None, password: str) -> bool:
        """True if ``password`` matches. With ``password_hash=None`` a dummy hash is checked so
        unknown emails take as long as wrong passwords."""
        try:
            return self._hasher.verify(password_hash or self._dummy_hash, password) and (
                password_hash is not None
            )
        except (VerificationError, InvalidHashError):
            return False


@dataclass(frozen=True, slots=True)
class TokenClaims:
    user_id: str
    org_id: str
    token_type: TokenType
    token_version: int


class TokenService:
    """Issues and verifies HS256 JWTs. Claims: ``sub`` (user), ``org``, ``typ``
    (``access``/``refresh``), ``ver`` (user ``token_version``), ``iat``, ``exp``, ``jti``."""

    def __init__(self, settings: Settings, clock: Clock) -> None:
        self._secret = settings.jwt_secret.get_secret_value()
        self._algorithm = settings.jwt_algorithm
        self._access_ttl = settings.access_token_ttl_s
        self._refresh_ttl = settings.refresh_token_ttl_s
        self._clock = clock

    def issue_pair(self, user_id: str, org_id: str, token_version: int) -> TokenPair:
        return TokenPair(
            access_token=self._encode(user_id, org_id, "access", token_version, self._access_ttl),
            refresh_token=self._encode(
                user_id, org_id, "refresh", token_version, self._refresh_ttl
            ),
            expires_in=self._access_ttl,
        )

    def decode(self, token: str, expected: TokenType) -> TokenClaims:
        """Verify signature, expiry and type; raise :class:`Unauthorized` otherwise."""
        try:
            claims = jwt.decode(
                token,
                self._secret,
                algorithms=[self._algorithm],
                options={
                    "require": ["sub", "org", "typ", "ver", "exp", "iat"],
                    "verify_exp": False,
                    "verify_iat": False,
                    "verify_nbf": False,
                },
            )
        except jwt.PyJWTError as exc:
            raise Unauthorized("Invalid token") from exc
        # Expiry is checked against the injected clock (testable, single time source).
        if float(claims["exp"]) <= self._clock.now():
            raise Unauthorized("Token expired")
        if claims["typ"] != expected:
            raise Unauthorized("Wrong token type")
        return TokenClaims(
            user_id=str(claims["sub"]),
            org_id=str(claims["org"]),
            token_type=expected,
            token_version=int(claims["ver"]),
        )

    def _encode(
        self, user_id: str, org_id: str, token_type: TokenType, version: int, ttl: int
    ) -> str:
        now = int(self._clock.now())
        payload = {
            "sub": user_id,
            "org": org_id,
            "typ": token_type,
            "ver": version,
            "iat": now,
            "exp": now + ttl,
            "jti": secrets.token_urlsafe(12),
        }
        return jwt.encode(payload, self._secret, algorithm=self._algorithm)


def new_device_token() -> tuple[str, str]:
    """A fresh random device bearer token and its SHA-256 hex digest (the stored form)."""
    token = DEVICE_TOKEN_PREFIX + secrets.token_urlsafe(32)
    return token, hash_token(token)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class RateLimiter:
    """In-memory sliding-window limiter (per process). ``check`` raises when ``key`` already
    has ``max_attempts`` recorded attempts inside ``window_s``; ``hit`` records one;
    ``reset`` clears a key (e.g. after a successful login)."""

    def __init__(self, max_attempts: int, window_s: float, clock: Clock) -> None:
        self._max = max_attempts
        self._window = window_s
        self._clock = clock
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        now = self._clock.now()
        with self._lock:
            hits = self._prune(key, now)
            if hits is not None and len(hits) >= self._max:
                retry_after = max(1.0, hits[0] + self._window - now)
                raise RateLimited("Too many attempts, try again later", retry_after)

    def hit(self, key: str) -> None:
        now = self._clock.now()
        with self._lock:
            hits = self._prune(key, now)
            if hits is None:
                hits = self._hits[key] = deque()
            hits.append(now)

    def reset(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)

    def _prune(self, key: str, now: float) -> deque[float] | None:
        hits = self._hits.get(key)
        if hits is None:
            return None
        while hits and hits[0] <= now - self._window:
            hits.popleft()
        if not hits:
            del self._hits[key]
            return None
        return hits
