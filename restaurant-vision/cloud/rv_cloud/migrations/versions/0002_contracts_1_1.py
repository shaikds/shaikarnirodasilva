"""Contracts 1.1: backdated table state start, alert condition start, edge LAN URL.

* ``table_state_current.changed_at``: the transition's ``ts`` (ordering key); ``since_ts`` now
  holds the backdated ``TableStateChanged.since_ts``.
* ``alerts.condition_since_ts``: ``AlertRaised.condition_since_ts``.
* ``device_health.local_url``: ``EdgeHeartbeat.local_url``.

All columns are nullable; existing rows keep working (``changed_at`` falls back to
``since_ts``).

Revision ID: 0002_contracts_1_1
Revises: 0001_initial
Create Date: 2026-11-08 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_contracts_1_1"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("table_state_current", sa.Column("changed_at", sa.Double(), nullable=True))
    op.add_column("alerts", sa.Column("condition_since_ts", sa.Double(), nullable=True))
    op.add_column("device_health", sa.Column("local_url", sa.String(length=256), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("device_health") as batch:
        batch.drop_column("local_url")
    with op.batch_alter_table("alerts") as batch:
        batch.drop_column("condition_since_ts")
    with op.batch_alter_table("table_state_current") as batch:
        batch.drop_column("changed_at")
