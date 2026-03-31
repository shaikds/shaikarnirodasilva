import hashlib
import secrets

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from src.middleware.auth import create_access_token
from src.models.user import User
from src.schemas.user import TokenResponse, UserRegister


def _hash_password(password: str, salt: str | None = None) -> str:
    """Hash a password with a random salt using SHA-256.

    In production, use bcrypt or argon2. This uses SHA-256 + salt
    for environments where bcrypt/cffi is unavailable.
    """
    if salt is None:
        salt = secrets.token_hex(16)
    hashed = hashlib.sha256(f"{salt}{password}".encode()).hexdigest()
    return f"{salt}${hashed}"


def _verify_password(password: str, hashed: str) -> bool:
    """Verify a password against its hash."""
    salt = hashed.split("$")[0]
    return _hash_password(password, salt) == hashed


def register_user(db: Session, data: UserRegister) -> User:
    """Register a new user. Raises HTTPException if email/username already exists."""
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )
    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already taken",
        )

    user = User(
        email=data.email,
        username=data.username,
        hashed_password=_hash_password(data.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def login_user(db: Session, email: str, password: str) -> TokenResponse:
    """Authenticate user and return JWT token."""
    user = db.query(User).filter(User.email == email).first()
    if not user or not _verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )

    token = create_access_token(user.id)
    return TokenResponse(access_token=token)
