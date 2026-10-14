from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'd7e9f1a3b5c7'
down_revision: str | Sequence[str] | None = 'b1c2d3e4f5a7'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'discovery_queries',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('platform', sa.String(length=50), nullable=False),
        sa.Column('source', sa.String(length=30), nullable=False),
        sa.Column('query_text', sa.String(length=500), nullable=False),
        sa.Column('category', sa.String(length=100), nullable=True),
        sa.Column('last_run_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('consecutive_misses', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('exhausted', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('exhausted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('platform', 'source', 'query_text', name='uq_discovery_queries_platform_source_query'),
    )
    op.create_index(
        'idx_discovery_queries_exhausted',
        'discovery_queries',
        ['platform', 'exhausted'],
    )


def downgrade() -> None:
    op.drop_index('idx_discovery_queries_exhausted', table_name='discovery_queries')
    op.drop_table('discovery_queries')
