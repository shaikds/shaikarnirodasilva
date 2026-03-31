"""Shared test fixtures for all tests.

This module sets up:
- A separate test database (SQLite in-memory)
- A test client that uses the test database
- Helper functions to create test users and tokens
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.database import Base, get_db
from src.main import app
from src.middleware.auth import create_access_token
from src.models.user import User
from src.services.auth_service import _hash_password

# Test database - in-memory SQLite (fresh for each test)
TEST_DATABASE_URL = "sqlite:///./test.db"
test_engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(autouse=True)
def setup_database():
    """Create all tables before each test, drop after."""
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def db():
    """Provide a test database session."""
    session = TestSession()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db):
    """Provide a test HTTP client with test database."""

    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def test_user(db) -> User:
    """Create and return a test user."""
    user = User(
        email="test@example.com",
        username="testuser",
        hashed_password=_hash_password("password123"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def auth_headers(test_user) -> dict:
    """Return authorization headers with a valid JWT token."""
    token = create_access_token(test_user.id)
    return {"Authorization": f"Bearer {token}"}
