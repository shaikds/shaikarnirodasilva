"""Device pairing: exchange a one-time code from the dashboard for a device token.

``rv-edge pair --code ABC123 --cloud https://...`` -> ``POST /api/v1/edge/pair`` -> the
``PairResponse`` (device id, site id, token) is saved in the local secrets file only.
"""

from __future__ import annotations

import httpx
from pydantic import ValidationError
from rv_contracts import PairRequest, PairResponse

from . import EDGE_VERSION
from .secrets_store import SecretsStore

PAIR_PATH = "/api/v1/edge/pair"
USER_AGENT = f"rv-edge/{EDGE_VERSION}"


class PairingError(Exception):
    """Pairing failed. ``status_code`` is the cloud's HTTP status, or None (network/invalid)."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


def normalize_cloud_url(url: str) -> str:
    url = url.strip().rstrip("/")
    if not url.startswith(("http://", "https://")):
        raise PairingError("cloud URL must start with https:// (or http:// for local testing)")
    return url


def pair(
    cloud_url: str,
    code: str,
    secrets: SecretsStore,
    *,
    transport: httpx.BaseTransport | None = None,
    timeout_s: float = 15.0,
) -> PairResponse:
    """Pair this edge with a site and store the result in ``secrets``."""
    base = normalize_cloud_url(cloud_url)
    try:
        body = PairRequest(code=code.strip().upper())
    except ValidationError as exc:
        raise PairingError("pairing code must be 6 letters or digits") from exc
    try:
        with httpx.Client(
            base_url=base,
            transport=transport,
            timeout=timeout_s,
            headers={"User-Agent": USER_AGENT},
        ) as client:
            resp = client.post(
                PAIR_PATH,
                content=body.model_dump_json(),
                headers={"Content-Type": "application/json"},
            )
    except httpx.HTTPError as exc:
        raise PairingError(f"cannot reach the cloud at {base}: {exc}") from exc
    if resp.status_code >= 400:
        raise PairingError(_error_detail(resp), resp.status_code)
    try:
        result = PairResponse.model_validate_json(resp.content)
    except ValidationError as exc:
        raise PairingError("unexpected pairing response from the cloud") from exc
    secrets.set_pairing(result, base)
    return result


def _error_detail(resp: httpx.Response) -> str:
    try:
        detail = resp.json().get("detail")
    except (ValueError, AttributeError):
        detail = None
    return f"pairing rejected ({resp.status_code}): {detail or resp.reason_phrase}"
