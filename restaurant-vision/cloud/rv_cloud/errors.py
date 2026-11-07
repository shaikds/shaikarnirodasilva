"""Domain errors raised by services and mapped to HTTP responses in :mod:`rv_cloud.main`.

Services never import FastAPI; routers never build error responses by hand.
"""


class DomainError(Exception):
    """Base class. ``status_code`` is the HTTP status the API layer responds with."""

    status_code = 400

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class InvalidInput(DomainError):
    """Well-formed request that violates a business rule (e.g. unknown time zone)."""

    status_code = 422


class Unauthorized(DomainError):
    """Missing, invalid or expired credentials."""

    status_code = 401


class Forbidden(DomainError):
    """Authenticated, but the role does not allow this."""

    status_code = 403


class NotFound(DomainError):
    """Missing, or outside the caller's tenancy (never revealed as forbidden)."""

    status_code = 404


class Conflict(DomainError):
    """State conflict, e.g. duplicate email or removing the last owner."""

    status_code = 409


class RateLimited(DomainError):
    """Too many attempts; retry after ``retry_after_s``."""

    status_code = 429

    def __init__(self, detail: str, retry_after_s: float) -> None:
        super().__init__(detail)
        self.retry_after_s = retry_after_s


class ServiceUnavailable(DomainError):
    """A feature is not configured on this deployment (e.g. Web Push without VAPID keys)."""

    status_code = 503
