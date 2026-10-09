from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'f8a2b3c4d5e6'
down_revision: str | Sequence[str] | None = 'e7f1a2b3c4d5'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'tickets',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('ticket_number', sa.String(length=20), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('email', sa.String(length=254), nullable=False),
        sa.Column('category', sa.String(length=20), nullable=False),
        sa.Column('subject', sa.String(length=120), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('page_url', sa.String(length=2048), nullable=True),
        sa.Column('user_agent', sa.String(length=512), nullable=True),
        sa.Column('status', sa.String(length=20), server_default='new', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "category IN ('bug', 'question', 'suggestion', 'other')",
            name='ck_tickets_category',
        ),
        sa.CheckConstraint(
            "status IN ('new', 'in_progress', 'resolved', 'closed')",
            name='ck_tickets_status',
        ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('ticket_number'),
        schema='public',
    )
    op.create_index('ix_tickets_user_id', 'tickets', ['user_id'], schema='public')
    op.create_index('ix_tickets_status', 'tickets', ['status'], schema='public')
    op.create_index('ix_tickets_status_created', 'tickets', ['status', 'created_at'], schema='public')
    op.create_index('ix_tickets_category_created', 'tickets', ['category', 'created_at'], schema='public')


def downgrade() -> None:
    op.drop_index('ix_tickets_category_created', table_name='tickets', schema='public')
    op.drop_index('ix_tickets_status_created', table_name='tickets', schema='public')
    op.drop_index('ix_tickets_status', table_name='tickets', schema='public')
    op.drop_index('ix_tickets_user_id', table_name='tickets', schema='public')
    op.drop_table('tickets', schema='public')
