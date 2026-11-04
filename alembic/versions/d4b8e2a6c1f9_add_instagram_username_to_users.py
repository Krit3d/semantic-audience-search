from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d4b8e2a6c1f9"
down_revision: str | None = "c6a1d4e9b2f7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("instagram_username", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "instagram_username")
