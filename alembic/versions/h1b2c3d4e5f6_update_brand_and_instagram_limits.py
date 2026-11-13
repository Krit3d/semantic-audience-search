"""Update brand and Instagram account limits

Revision ID: h1b2c3d4e5f6
Revises: g0a1b2c3d4e5
Create Date: 2026-11-12
"""

from alembic import op
import sqlalchemy as sa


revision = "h1b2c3d4e5f6"
down_revision = "g0a1b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE subscription_plans
            SET limits = limits || '{"brand_limit": 2, "instagram_account_limit": 3}'::jsonb
            WHERE name = 'basic'
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE subscription_plans
            SET limits = limits || '{"brand_limit": 5, "instagram_account_limit": 10}'::jsonb
            WHERE name = 'pro'
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE subscription_plans
            SET limits = (limits - 'instagram_account_limit') || '{"brand_limit": 2}'::jsonb
            WHERE name = 'basic'
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE subscription_plans
            SET limits = (limits - 'instagram_account_limit') || '{"brand_limit": 10}'::jsonb
            WHERE name = 'pro'
            """
        )
    )
