from __future__ import annotations

import warnings
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import pytest
from rv_contracts import PairResponse, SiteConfig
from rv_contracts.fixtures import sample_site_config

from rv_edge.interfaces import SourceSpec
from rv_edge.runtime.config_store import ConfigStore
from rv_edge.runtime.governor import ResourceGovernor
from rv_edge.runtime.runtime import EdgeRuntime
from rv_edge.runtime.secrets_store import SecretsStore
from rv_edge.runtime.settings import EdgeSettings

from .fakes import TOKEN, EngineHolder, FakeFactory, ManualClock

with warnings.catch_warnings():
    # starlette prefers httpx2 for its TestClient; httpx works the same for these tests.
    warnings.simplefilter("ignore")
    import starlette.testclient  # noqa: F401

SITE_ID = "site-demo"
DEVICE_ID = "dev-1"
CLOUD = "https://cloud.test"


@pytest.fixture
def settings(tmp_path: Path) -> EdgeSettings:
    return EdgeSettings(data_dir=tmp_path / "data", edge_ui_dir=tmp_path / "no-ui")


@pytest.fixture
def config() -> SiteConfig:
    return sample_site_config()


def pair_secrets(secrets: SecretsStore, site_id: str = SITE_ID) -> None:
    secrets.set_pairing(PairResponse(device_id=DEVICE_ID, site_id=site_id, token=TOKEN), CLOUD)


def sim_specs(config: SiteConfig) -> dict[str, SourceSpec]:
    return {
        c.camera_id: SourceSpec(c.camera_id, "simulated", options={"source": object()})
        for c in config.cameras
    }


@pytest.fixture
def make_runtime(
    settings: EdgeSettings, config: SiteConfig
) -> Iterator[Callable[..., tuple[EdgeRuntime, FakeFactory, EngineHolder]]]:
    """Build an ``EdgeRuntime`` with fakes; every runtime is stopped at teardown.

    Camera specs default to simulated specs for the sample config; ``use_secrets`` reads them
    from the secrets store like a real deployment."""
    runtimes: list[EdgeRuntime] = []

    def build(
        *,
        paired: bool = True,
        with_config: bool = True,
        specs: dict[str, SourceSpec] | None = None,
        use_secrets: bool = False,
        factory: FakeFactory | None = None,
        clock: Any = None,
        **kwargs: Any,
    ) -> tuple[EdgeRuntime, FakeFactory, EngineHolder]:
        secrets = SecretsStore(settings.data_dir)
        if paired:
            pair_secrets(secrets)
        store = ConfigStore(settings.data_dir)
        if with_config:
            store.replace(config)
        factory = factory or FakeFactory()
        holder = EngineHolder()
        kwargs.setdefault("enable_sync", False)
        runtime = EdgeRuntime(
            settings,
            clock=clock or ManualClock(),
            secrets=secrets,
            config_store=store,
            governor=ResourceGovernor(settings.cpu_limit_pct, manage_priority=False),
            pipeline_factory=factory,
            engine_builder=holder,
            source_specs=None if use_secrets else (sim_specs(config) if specs is None else specs),
            **kwargs,
        )
        runtimes.append(runtime)
        return runtime, factory, holder

    yield build
    for runtime in runtimes:
        runtime.stop(timeout=2.0)
