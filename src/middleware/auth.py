import hashlib
import hmac
import json
import time
from base64 import urlsafe_b64decode, urlsafe_b64encode
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from src.config import settings
from src.database import get_db
from src.models.user import User

security = HTTPBearer()


def _b64encode(data: bytes) -> str:
    return urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64decode(data: str) -> bytes:
    padding = 4 - len(data) % 4
    return urlsafe_b64decode(data + "=" * padding)


def create_access_token(user_id: int) -> str:
    """Create a simple HMAC-signed JWT-like token."""
    expire = time.time() + (settings.jwt_access_token_expire_minutes * 60)
    payload = {"sub": str(user_id), "exp": expire}
    payload_bytes = json.dumps(payload).encode()
    header = _b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = _b64encode(payload_bytes)
    message = f"{header}.{body}"
    signature = hmac.new(
        settings.jwt_secret_key.encode(), message.encode(), hashlib.sha256
    ).digest()
    sig = _b64encode(signature)
    return f"{message}.{sig}"


def _verify_token(token: str) -> dict:
    """Verify and decode the token. Raises ValueError on failure."""
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Invalid token format")

    message = f"{parts[0]}.{parts[1]}"
    expected_sig = hmac.new(
        settings.jwt_secret_key.encode(), message.encode(), hashlib.sha256
    ).digest()
    actual_sig = _b64decode(parts[2])

    if not hmac.compare_digest(expected_sig, actual_sig):
        raise ValueError("Invalid signature")

    payload = json.loads(_b64decode(parts[1]))
    if payload.get("exp", 0) < time.time():
        raise ValueError("Token expired")

    return payload


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """Dependency that extracts and validates the current user from JWT token."""
    token = credentials.credentials
    try:
        payload = _verify_token(token)
        user_id = int(payload.get("sub"))
    except (ValueError, TypeError, KeyError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )
    return user
