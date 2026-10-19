"""add subscription plans, subscription fields on users and payment_events

Revision ID: a1b2c3d4e5f7
Revises: d7e9f1a3b5c7
Create Date: 2026-10-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a1b2c3d4e5f7"
down_revision: str | None = "d7e9f1a3b5c7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "subscription_plans",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("price", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("period_days", sa.Integer(), nullable=False),
        sa.Column("prodamus_plan_id", sa.String(length=255), nullable=True),
        sa.Column("payment_url", sa.String(length=1024), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("is_custom", sa.Boolean(), server_default="false", nullable=False),
        sa.Column(
            "limits",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "features",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_subscription_plans_name"),
        sa.UniqueConstraint("prodamus_plan_id", name="uq_subscription_plans_prodamus_plan_id"),
    )

    op.execute(
        sa.text(
            """
            INSERT INTO subscription_plans
                (name, price, period_days, prodamus_plan_id, is_active, is_custom, limits, features)
            VALUES
                ('trial', 0, 14, NULL, true, false,
                 '{"brand_limit": 1, "dialogs_monthly_limit": 50}'::jsonb,
                 '{"automation_dialogs": false, "automation_contracts": false, "automation_marking": false}'::jsonb),
                ('basic', 7900, 31, NULL, true, false,
                 '{"brand_limit": 2, "dialogs_monthly_limit": 350}'::jsonb,
                 '{"automation_dialogs": false, "automation_contracts": false, "automation_marking": false}'::jsonb),
                ('pro', 39900, 31, NULL, false, false,
                 '{"brand_limit": 10, "dialogs_monthly_limit": 1000}'::jsonb,
                 '{"automation_dialogs": true, "automation_contracts": true, "automation_marking": true}'::jsonb),
                ('enterprise', NULL, 31, NULL, true, true,
                 '{}'::jsonb,
                 '{"automation_dialogs": true, "automation_contracts": true, "automation_marking": true}'::jsonb)
            """
        )
    )

    op.add_column(
        "users",
        sa.Column(
            "subscription_status",
            sa.String(length=20),
            server_default="trial",
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "subscription_expires_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "users",
        sa.Column("gateway_subscription_id", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("billing_email", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("billing_phone", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("plan_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_users_plan_id",
        "users",
        "subscription_plans",
        ["plan_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_check_constraint(
        "ck_users_subscription_status",
        "users",
        "subscription_status IN ('free', 'trial', 'active', 'past_due', 'expired')",
    )

    op.create_table(
        "payment_events",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("event_key", sa.String(length=512), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=True),
        sa.Column("raw_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_payment_events_event_key", "payment_events", ["event_key"], unique=True
    )
    op.create_index("ix_payment_events_user_id", "payment_events", ["user_id"])
    op.create_index("ix_payment_events_received_at", "payment_events", ["received_at"])


def downgrade() -> None:
    op.drop_index("ix_payment_events_received_at", table_name="payment_events")
    op.drop_index("ix_payment_events_user_id", table_name="payment_events")
    op.drop_index("uq_payment_events_event_key", table_name="payment_events")
    op.drop_table("payment_events")
    op.drop_constraint("ck_users_subscription_status", "users", type_="check")
    op.drop_constraint("fk_users_plan_id", "users", type_="foreignkey")
    op.drop_column("users", "plan_id")
    op.drop_column("users", "billing_phone")
    op.drop_column("users", "billing_email")
    op.drop_column("users", "gateway_subscription_id")
    op.drop_column("users", "subscription_expires_at")
    op.drop_column("users", "subscription_status")
    op.drop_table("subscription_plans")
