"""Contracts 1.2: ``devices.started_at`` (``EdgeHeartbeat.started_at``), the edge runtime's
boot time. A newer value means the edge restarted: the cloud expires the site's alerts raised
before it and resets table states changed before it (the edge keeps them only in memory).

Revision ID: 0004_edge_started_at
Revises: 0003_idempotency_retention
Create Date: 2026-11-09 18:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_edge_started_at"
down_revision: str | None = "0003_idempotency_retention"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("devices", sa.Column("started_at", sa.Double(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("devices") as batch:
        batch.drop_column("started_at")
