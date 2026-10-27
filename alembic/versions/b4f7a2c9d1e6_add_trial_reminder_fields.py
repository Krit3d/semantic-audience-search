"""add trial reminder delivery timestamps

Revision ID: b4f7a2c9d1e6
Revises: a1b2c3d4e5f7
Create Date: 2026-10-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b4f7a2c9d1e6"
down_revision: str | None = "a1b2c3d4e5f7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("trial_reminder_3d_sent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("trial_reminder_1d_sent_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "trial_reminder_1d_sent_at")
    op.drop_column("users", "trial_reminder_3d_sent_at")
