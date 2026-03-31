from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.database import get_db
from src.middleware.auth import get_current_user
from src.models.user import User
from src.schemas.user import TokenResponse, UserLogin, UserRegister, UserResponse
from src.services import auth_service

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


@router.post("/register", response_model=UserResponse, status_code=201)
def register(data: UserRegister, db: Session = Depends(get_db)):
    """Register a new user account."""
    return auth_service.register_user(db, data)


@router.post("/login", response_model=TokenResponse)
def login(data: UserLogin, db: Session = Depends(get_db)):
    """Login with email and password. Returns JWT access token."""
    return auth_service.login_user(db, data.email, data.password)


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Get the currently authenticated user's profile."""
    return current_user
