from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from alembic import op

revision: str = 'b1c2d3e4f5a7'
down_revision: str | Sequence[str] | None = 'a6f7c8d9e0b1'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'brands',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('category', sa.String(length=120), server_default='Другое', nullable=False),
        sa.Column('status', sa.String(length=20), server_default='Черновик', nullable=False),
        sa.Column('hue', sa.SmallInteger(), server_default='235', nullable=False),
        sa.Column('desc', sa.Text(), server_default='', nullable=False),
        sa.Column('kb', JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("status IN ('Активен', 'Черновик')", name='ck_brands_status'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        schema='public',
    )
    op.create_index('ix_brands_user_id', 'brands', ['user_id'], schema='public')
    op.create_index('ix_brands_user_name', 'brands', ['user_id', 'name'], schema='public')

    op.create_table(
        'erid_records',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('deal_id', sa.BigInteger(), nullable=True),
        sa.Column('brand_id', sa.BigInteger(), nullable=True),
        sa.Column('code', sa.String(length=64), nullable=True),
        sa.Column('status', sa.String(length=30), server_default='Заполняют данные', nullable=False),
        sa.Column('pub_link', sa.String(length=1024), nullable=True),
        sa.Column('verdict', sa.String(length=10), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "status IN ('Заполняют данные', 'Активен', 'Ожидает публикации', 'Опубликован', 'Архивирован')",
            name='ck_erid_records_status',
        ),
        sa.CheckConstraint("verdict IS NULL OR verdict IN ('ok', 'bad')", name='ck_erid_records_verdict'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['deal_id'], ['deals.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['brand_id'], ['brands.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        schema='public',
    )
    op.create_index('ix_erid_records_user_id', 'erid_records', ['user_id'], schema='public')
    op.create_index('ix_erid_records_deal_id', 'erid_records', ['deal_id'], schema='public')
    op.create_index('ix_erid_records_brand_id', 'erid_records', ['brand_id'], schema='public')
    op.create_index('ix_erid_records_code', 'erid_records', ['code'], schema='public')
    op.create_index('ix_erid_records_user_status', 'erid_records', ['user_id', 'status'], schema='public')

    op.create_table(
        'erid_checks',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('erid_id', sa.BigInteger(), nullable=False),
        sa.Column('checked_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('result', sa.String(length=500), nullable=False),
        sa.Column('checked_by', sa.String(length=255), nullable=False),
        sa.ForeignKeyConstraint(['erid_id'], ['erid_records.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        schema='public',
    )
    op.create_index('ix_erid_checks_erid_id', 'erid_checks', ['erid_id'], schema='public')

    op.create_table(
        'publications',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('deal_id', sa.BigInteger(), nullable=True),
        sa.Column('account_id', sa.BigInteger(), nullable=False),
        sa.Column('brand_id', sa.BigInteger(), nullable=True),
        sa.Column('platform', sa.String(length=30), nullable=False),
        sa.Column('type', sa.String(length=50), server_default='Пост', nullable=False),
        sa.Column('text', sa.Text(), server_default='', nullable=False),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('url', sa.String(length=1024), nullable=True),
        sa.Column('views', sa.Integer(), server_default='0', nullable=False),
        sa.Column('clicks', sa.Integer(), server_default='0', nullable=False),
        sa.Column('revenue', sa.Integer(), server_default='0', nullable=False),
        sa.Column('cost', sa.Integer(), server_default='0', nullable=False),
        sa.Column('erid', sa.String(length=64), nullable=True),
        sa.Column('sync_status', sa.String(length=20), server_default='waiting', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("sync_status IN ('ok', 'syncing', 'waiting', 'error')", name='ck_publications_sync_status'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['deal_id'], ['deals.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['brand_id'], ['brands.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        schema='public',
    )
    op.create_index('ix_publications_user_id', 'publications', ['user_id'], schema='public')
    op.create_index('ix_publications_deal_id', 'publications', ['deal_id'], schema='public')
    op.create_index('ix_publications_account_id', 'publications', ['account_id'], schema='public')
    op.create_index('ix_publications_user_published', 'publications', ['user_id', 'published_at'], schema='public')
    op.create_index('ix_publications_user_brand', 'publications', ['user_id', 'brand_id'], schema='public')


def downgrade() -> None:
    op.drop_index('ix_publications_user_brand', table_name='publications', schema='public')
    op.drop_index('ix_publications_user_published', table_name='publications', schema='public')
    op.drop_index('ix_publications_account_id', table_name='publications', schema='public')
    op.drop_index('ix_publications_deal_id', table_name='publications', schema='public')
    op.drop_index('ix_publications_user_id', table_name='publications', schema='public')
    op.drop_table('publications', schema='public')
    op.drop_index('ix_erid_checks_erid_id', table_name='erid_checks', schema='public')
    op.drop_table('erid_checks', schema='public')
    op.drop_index('ix_erid_records_user_status', table_name='erid_records', schema='public')
    op.drop_index('ix_erid_records_code', table_name='erid_records', schema='public')
    op.drop_index('ix_erid_records_brand_id', table_name='erid_records', schema='public')
    op.drop_index('ix_erid_records_deal_id', table_name='erid_records', schema='public')
    op.drop_index('ix_erid_records_user_id', table_name='erid_records', schema='public')
    op.drop_table('erid_records', schema='public')
    op.drop_index('ix_brands_user_name', table_name='brands', schema='public')
    op.drop_index('ix_brands_user_id', table_name='brands', schema='public')
    op.drop_table('brands', schema='public')
