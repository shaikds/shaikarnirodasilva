"""Contracts 1.3: staffing settings on ``sites``: ``guests_per_waiter`` and
``weekend_days_json`` (both nullable; None = the default, see ``views.site_settings``).

Revision ID: 0005_staffing_settings
Revises: 0004_edge_started_at
Create Date: 2026-11-25 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_staffing_settings"
down_revision: str | None = "0004_edge_started_at"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("sites", sa.Column("guests_per_waiter", sa.Double(), nullable=True))
    op.add_column("sites", sa.Column("weekend_days_json", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("sites") as batch:
        batch.drop_column("weekend_days_json")
        batch.drop_column("guests_per_waiter")
