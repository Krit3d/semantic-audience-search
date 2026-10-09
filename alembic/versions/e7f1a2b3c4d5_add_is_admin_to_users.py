from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'e7f1a2b3c4d5'
down_revision: str | Sequence[str] | None = 'c3d9e1f7a2b4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('is_admin', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        schema='public',
    )


def downgrade() -> None:
    op.drop_column('users', 'is_admin', schema='public')
