import sys
import os

# Add the platform directory to sys.path so that imports like
# "from database import ..." work (matching how the app runs).
# Add the platform directory itself so "from database import ..." works
_platform_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_platform_pkg = os.path.join(_platform_dir)  # i.e. .../platform/..  -> .../
# Actually, the app does `from database import Base` meaning the CWD should be the platform dir
_platform_pkg_dir = os.path.dirname(os.path.abspath(__file__))  # .../platform/tests
_platform_src_dir = os.path.dirname(_platform_pkg_dir)          # .../platform
if _platform_src_dir not in sys.path:
    sys.path.insert(0, _platform_src_dir)

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base, get_db
from app import app

TEST_DB = "sqlite:///./test_platform.db"
engine = create_engine(TEST_DB, connect_args={"check_same_thread": False})
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


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
