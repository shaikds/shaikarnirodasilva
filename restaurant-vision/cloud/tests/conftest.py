from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from support import Account, Api, FakeClock, FakeNotifier, make_settings

from rv_cloud.db.base import Base
from rv_cloud.main import create_app


@pytest.fixture
def api() -> Iterator[Api]:
    clock = FakeClock()
    notifier = FakeNotifier()
    app = create_app(make_settings(), clock=clock, notifier=notifier)
    Base.metadata.create_all(app.state.rv.engine)
    with TestClient(app) as client:
        yield Api(client=client, clock=clock, notifier=notifier, app=app)


@pytest.fixture
def owner(api: Api) -> Account:
    return api.signup()
