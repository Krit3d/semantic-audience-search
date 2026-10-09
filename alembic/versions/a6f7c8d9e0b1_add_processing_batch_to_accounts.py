from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'a6f7c8d9e0b1'
down_revision: str | Sequence[str] | None = 'f8a2b3c4d5e6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('accounts', sa.Column('processing_batch', sa.Integer(), nullable=True))
    op.execute('CREATE INDEX IF NOT EXISTS idx_accounts_processing_batch ON accounts (status, processing_batch) WHERE processing_batch IS NOT NULL')


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS idx_accounts_processing_batch')
    op.drop_column('accounts', 'processing_batch')
