"""Idempotency across retention.

* ``metric_snapshots.event_id`` (nullable, unique): snapshots are inserted once per edge event,
  even after the raw event was deleted by retention.
* ``ix_events_received_at``: raw-event retention is measured from the cloud receive time.

Revision ID: 0003_idempotency_retention
Revises: 0002_contracts_1_1
Create Date: 2026-11-09 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_idempotency_retention"
down_revision: str | None = "0002_contracts_1_1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("metric_snapshots") as batch:
        batch.add_column(sa.Column("event_id", sa.String(length=36), nullable=True))
        batch.create_unique_constraint(op.f("uq_metric_snapshots_event_id"), ["event_id"])
    op.create_index("ix_events_received_at", "events", ["received_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_events_received_at", table_name="events")
    with op.batch_alter_table("metric_snapshots") as batch:
        batch.drop_constraint(op.f("uq_metric_snapshots_event_id"), type_="unique")
        batch.drop_column("event_id")
