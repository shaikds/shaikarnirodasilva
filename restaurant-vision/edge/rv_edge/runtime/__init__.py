"""Edge runtime (architecture 6.3): orchestration, durable outbox, cloud sync, pairing,
resource governor, local LAN API and the ``rv-edge`` CLI.

Import the submodules directly (``from rv_edge.runtime.runtime import EdgeRuntime``); this
package stays light so that importing it does not pull in FastAPI or OpenCV.
"""

from importlib.metadata import PackageNotFoundError, version


def _edge_version() -> str:
    try:
        return version("rv-edge")
    except PackageNotFoundError:  # pragma: no cover - running from a source tree
        return "0.1.0"


EDGE_VERSION: str = _edge_version()
"""``rv_edge`` version string, reported in heartbeats and ``/local/health``."""

__all__ = ["EDGE_VERSION"]
