"""Initial schema: tenancy, devices, raw events, projections, push and commands.

Portable across SQLite and Postgres: epoch-second DOUBLE timestamps, string enums, generic
JSON, BIGINT autoincrement keys (INTEGER rowid on SQLite) and named constraints.

Revision ID: 0001_initial
Revises:
Create Date: 2026-11-06 20:52:02.408880
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("plan", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.Double(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_organizations")),
    )
    op.create_table(
        "sites",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("org_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("locale", sa.String(length=8), nullable=False),
        sa.Column("currency", sa.String(length=8), nullable=False),
        sa.Column("avg_check_per_guest", sa.Double(), nullable=False),
        sa.Column("config_json", sa.JSON(), nullable=False),
        sa.Column("config_version", sa.Integer(), nullable=False),
        sa.Column("floor_plan_json", sa.JSON(), nullable=False),
        sa.Column("command_seq", sa.Integer(), nullable=False),
        sa.Column("first_event_ts", sa.Double(), nullable=True),
        sa.Column("created_at", sa.Double(), nullable=False),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_sites_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sites")),
    )
    op.create_index(op.f("ix_sites_org_id"), "sites", ["org_id"], unique=False)

    op.create_table(
        "users",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("org_id", sa.String(length=64), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("locale", sa.String(length=8), nullable=False),
        sa.Column("token_version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.Double(), nullable=False),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_users_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
    )
    op.create_index(op.f("ix_users_org_id"), "users", ["org_id"], unique=False)

    op.create_table(
        "alerts",
        sa.Column("site_id", sa.String(length=64), nullable=False),
        sa.Column("alert_id", sa.String(length=64), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("severity", sa.String(length=32), nullable=False),
        sa.Column("table_id", sa.String(length=64), nullable=True),
        sa.Column("zone_id", sa.String(length=64), nullable=True),
        sa.Column("raised_at", sa.Double(), nullable=False),
        sa.Column("acked_at", sa.Double(), nullable=True),
        sa.Column("ack_via", sa.String(length=32), nullable=True),
        sa.Column("resolved_at", sa.Double(), nullable=True),
        sa.Column("resolve_reason", sa.String(length=32), nullable=True),
        sa.ForeignKeyConstraint(
            ["site_id"], ["sites.id"], name=op.f("fk_alerts_site_id_sites"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("site_id", "alert_id", name=op.f("pk_alerts")),
    )
    op.create_index("ix_alerts_site_raised", "alerts", ["site_id", "raised_at"], unique=False)
    op.create_index("ix_alerts_site_resolved", "alerts", ["site_id", "resolved_at"], unique=False)

    op.create_table(
        "commands",
        sa.Column(
            "id",
            sa.BigInteger().with_variant(sa.Integer(), "sqlite"),
            autoincrement=True,
            nullable=False,
        ),
        sa.Column("command_id", sa.String(length=36), nullable=False),
        sa.Column("site_id", sa.String(length=64), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.Double(), nullable=False),
        sa.ForeignKeyConstraint(
            ["site_id"], ["sites.id"], name=op.f("fk_commands_site_id_sites"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_commands")),
        sa.UniqueConstraint("command_id", name=op.f("uq_commands_command_id")),
        sa.UniqueConstraint("site_id", "seq", name="uq_commands_site_seq"),
    )
    op.create_table(
        "devices",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("site_id", sa.String(length=64), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.Double(), nullable=False),
        sa.Column("last_seen_at", sa.Double(), nullable=True),
        sa.Column("version", sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(
            ["site_id"], ["sites.id"], name=op.f("fk_devices_site_id_sites"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_devices")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_devices_token_hash")),
    )
    op.create_index(op.f("ix_devices_site_id"), "devices", ["site_id"], unique=False)

    op.create_table(
        "events",
        sa.Column("event_id", sa.String(length=36), nullable=False),
        sa.Column("site_id", sa.String(length=64), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("ts", sa.Double(), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("received_at", sa.Double(), nullable=False),
        sa.Column("device_id", sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(
            ["site_id"], ["sites.id"], name=op.f("fk_events_site_id_sites"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("event_id", name=op.f("pk_events")),
    )
    op.create_index("ix_events_site_type_ts", "events", ["site_id", "type", "ts"], unique=False)

    op.create_table(
        "memberships",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("org_id", sa.String(length=64), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("site_id", sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_memberships_org_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["site_id"], ["sites.id"], name=op.f("fk_memberships_site_id_sites"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_memberships_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_memberships")),
    )
    op.create_index(op.f("ix_memberships_org_id"), "memberships", ["org_id"], unique=False)
    op.create_index(op.f("ix_memberships_site_id"), "memberships", ["site_id"], unique=False)
    op.create_index(op.f("ix_memberships_user_id"), "memberships", ["user_id"], unique=False)

    op.create_table(
        "metric_snapshots",
        sa.Column(
            "id",
            sa.BigInteger().with_variant(sa.Integer(), "sqlite"),
            autoincrement=True,
            nullable=False,
        ),
        sa.Column("site_id", sa.String(length=64), nullable=False),
        sa.Column("ts", sa.Double(), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("zone_id", sa.String(length=64), nullable=True),
        sa.Column("value", sa.Double(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(
            ["site_id"],
            ["sites.id"],
            name=op.f("fk_metric_snapshots_site_id_sites"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_metric_snapshots")),
    )
    op.create_index(
        "ix_metric_snapshots_site_kind_ts",
        "metric_snapshots",
        ["site_id", "kind", "ts"],
        unique=False,
    )

    op.create_table(
        "occupancy_latest",
        sa.Column("site_id", sa.String(length=64), nullable=False),
        sa.Column("ts", sa.Double(), nullable=False),
        sa.Column("guests", sa.Integer(), nullable=False),
        sa.Column("tables_occupied", sa.Integer(), nullable=False),
        sa.Column("tables_total", sa.Integer(), nullable=False),
        sa.Column("staff_on_floor", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["site_id"],
            ["sites.id"],
            name=op.f("fk_occupancy_latest_site_id_sites"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("site_id", name=op.f("pk_occupancy_latest")),
    )
    op.create_table(
        "pairing_codes",
        sa.Column("code", sa.String(length=16), nullable=False),
        sa.Column("site_id", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.Double(), nullable=False),
        sa.Column("created_at", sa.Double(), nullable=False),
        sa.ForeignKeyConstraint(
            ["site_id"],
            ["sites.id"],
            name=op.f("fk_pairing_codes_site_id_sites"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("code", name=op.f("pk_pairing_codes")),
    )
    op.create_index(op.f("ix_pairing_codes_site_id"), "pairing_codes", ["site_id"], unique=False)

    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("site_id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("endpoint", sa.String(length=2048), nullable=False),
        sa.Column("endpoint_hash", sa.String(length=64), nullable=False),
        sa.Column("keys_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.Double(), nullable=False),
        sa.ForeignKeyConstraint(
            ["site_id"],
            ["sites.id"],
            name=op.f("fk_push_subscriptions_site_id_sites"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_push_subscriptions_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_push_subscriptions")),
        sa.UniqueConstraint("endpoint_hash", name=op.f("uq_push_subscriptions_endpoint_hash")),
    )
    op.create_index(
        op.f("ix_push_subscriptions_site_id"), "push_subscriptions", ["site_id"], unique=False
    )
    op.create_index(
        op.f("ix_push_subscriptions_user_id"), "push_subscriptions", ["user_id"], unique=False
    )

    op.create_table(
        "queue_events",
        sa.Column(
            "id",
            sa.BigInteger().with_variant(sa.Integer(), "sqlite"),
            autoincrement=True,
            nullable=False,
        ),
        sa.Column("event_id", sa.String(length=36), nullable=False),
        sa.Column("site_id", sa.String(length=64), nullable=False),
        sa.Column("zone_id", sa.String(length=64), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("ts", sa.Double(), nullable=False),
        sa.Column("waited_s", sa.Double(), nullable=False),
        sa.Column("party_size_est", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["site_id"],
            ["sites.id"],
            name=op.f("fk_queue_events_site_id_sites"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_queue_events")),
        sa.UniqueConstraint("event_id", name=op.f("uq_queue_events_event_id")),
    )
    op.create_index("ix_queue_events_site_ts", "queue_events", ["site_id", "ts"], unique=False)

    op.create_table(
        "queue_latest",
        sa.Column("site_id", sa.String(length=64), nullable=False),
        sa.Column("zone_id", sa.String(length=64), nullable=False),
        sa.Column("ts", sa.Double(), nullable=False),
        sa.Column("people", sa.Integer(), nullable=False),
        sa.Column("parties_est", sa.Integer(), nullable=False),
        sa.Column("longest_wait_s", sa.Double(), nullable=False),
        sa.Column("avg_wait_s", sa.Double(), nullable=False),
        sa.ForeignKeyConstraint(
            ["site_id"],
            ["sites.id"],
            name=op.f("fk_queue_latest_site_id_sites"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("site_id", "zone_id", name=op.f("pk_queue_latest")),
    )
    op.create_table(
        "table_sessions",
        sa.Column("site_id", sa.String(length=64), nullable=False),
        sa.Column("session_id", sa.String(length=64), nullable=False),
        sa.Column("table_id", sa.String(length=64), nullable=False),
        sa.Column("seated_at", sa.Double(), nullable=True),
        sa.Column("left_at", sa.Double(), nullable=True),
        sa.Column("bussed_at", sa.Double(), nullable=True),
        sa.Column("max_guests", sa.Integer(), nullable=True),
        sa.Column("first_visit_delay_s", sa.Double(), nullable=True),
        sa.Column("visits", sa.Integer(), nullable=True),
        sa.Column("bussing_delay_s", sa.Double(), nullable=True),
        sa.ForeignKeyConstraint(
            ["site_id"],
            ["sites.id"],
            name=op.f("fk_table_sessions_site_id_sites"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("site_id", "session_id", name=op.f("pk_table_sessions")),
    )
    op.create_index(
        "ix_table_sessions_site_left", "table_sessions", ["site_id", "left_at"], unique=False
    )

    op.create_table(
        "table_state_current",
        sa.Column("site_id", sa.String(length=64), nullable=False),
        sa.Column("table_id", sa.String(length=64), nullable=False),
        sa.Column("state", sa.String(length=32), nullable=False),
        sa.Column("guest_count", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.String(length=64), nullable=True),
        sa.Column("since_ts", sa.Double(), nullable=False),
        sa.ForeignKeyConstraint(
            ["site_id"],
            ["sites.id"],
            name=op.f("fk_table_state_current_site_id_sites"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("site_id", "table_id", name=op.f("pk_table_state_current")),
    )
    op.create_table(
        "device_health",
        sa.Column("device_id", sa.String(length=64), nullable=False),
        sa.Column("site_id", sa.String(length=64), nullable=False),
        sa.Column("ts", sa.Double(), nullable=False),
        sa.Column("version", sa.String(length=64), nullable=False),
        sa.Column("cameras_json", sa.JSON(), nullable=False),
        sa.Column("cpu_pct", sa.Double(), nullable=False),
        sa.Column("mem_mb", sa.Double(), nullable=False),
        sa.Column("outbox_depth", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["device_id"],
            ["devices.id"],
            name=op.f("fk_device_health_device_id_devices"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["site_id"],
            ["sites.id"],
            name=op.f("fk_device_health_site_id_sites"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("device_id", name=op.f("pk_device_health")),
    )
    op.create_index(op.f("ix_device_health_site_id"), "device_health", ["site_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_device_health_site_id"), table_name="device_health")

    op.drop_table("device_health")
    op.drop_table("table_state_current")
    op.drop_index("ix_table_sessions_site_left", table_name="table_sessions")

    op.drop_table("table_sessions")
    op.drop_table("queue_latest")
    op.drop_index("ix_queue_events_site_ts", table_name="queue_events")

    op.drop_table("queue_events")
    op.drop_index(op.f("ix_push_subscriptions_user_id"), table_name="push_subscriptions")
    op.drop_index(op.f("ix_push_subscriptions_site_id"), table_name="push_subscriptions")

    op.drop_table("push_subscriptions")
    op.drop_index(op.f("ix_pairing_codes_site_id"), table_name="pairing_codes")

    op.drop_table("pairing_codes")
    op.drop_table("occupancy_latest")
    op.drop_index("ix_metric_snapshots_site_kind_ts", table_name="metric_snapshots")

    op.drop_table("metric_snapshots")
    op.drop_index(op.f("ix_memberships_user_id"), table_name="memberships")
    op.drop_index(op.f("ix_memberships_site_id"), table_name="memberships")
    op.drop_index(op.f("ix_memberships_org_id"), table_name="memberships")

    op.drop_table("memberships")
    op.drop_index("ix_events_site_type_ts", table_name="events")

    op.drop_table("events")
    op.drop_index(op.f("ix_devices_site_id"), table_name="devices")

    op.drop_table("devices")
    op.drop_table("commands")
    op.drop_index("ix_alerts_site_resolved", table_name="alerts")
    op.drop_index("ix_alerts_site_raised", table_name="alerts")

    op.drop_table("alerts")
    op.drop_index(op.f("ix_users_org_id"), table_name="users")

    op.drop_table("users")
    op.drop_index(op.f("ix_sites_org_id"), table_name="sites")

    op.drop_table("sites")
    op.drop_table("organizations")
