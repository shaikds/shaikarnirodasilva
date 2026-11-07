"""Multi-tenant cloud backend for Restaurant Vision (architecture section 7).

Layers: ``api`` (FastAPI routers and auth dependencies) -> ``services`` (use cases, one
transaction each) -> ``repositories`` (SQLAlchemy queries, always scoped by tenant) -> ``db``
(ORM models, engine, migrations). ``metrics`` holds pure KPI/ROI functions, ``realtime`` the
WebSocket event broker, ``push`` the Web Push notifier and ``integrations`` phase-2 seams.
"""

__version__ = "0.1.0"
