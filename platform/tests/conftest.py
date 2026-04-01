from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from database import Base, get_db
from app import app

TEST_DB_URL = "sqlite:///./test_v2.db"
test_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def db():
    session = TestSession()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db):
    def override():
        yield db

    app.dependency_overrides[get_db] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def sample_client(client):
    res = client.post(
        "/api/clients",
        json={"name": "Test User", "company": "Acme Corp", "email": "test@acme.com"},
    )
    return res.json()


@pytest.fixture
def sample_project(client, sample_client):
    res = client.post(
        "/api/projects",
        json={
            "client_id": sample_client["id"],
            "name": "Test Dashboard",
            "service_type": "ai_agents",
            "budget": 5000,
            "timeline_weeks": 4,
        },
    )
    return res.json()
