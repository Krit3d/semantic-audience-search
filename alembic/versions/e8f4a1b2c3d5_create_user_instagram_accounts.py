from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e8f4a1b2c3d5"
down_revision: str | None = "d4b8e2a6c1f9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_instagram_accounts",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("brand_id", sa.BigInteger(), nullable=True),
        sa.Column("login", sa.String(length=254), nullable=False),
        sa.Column("normalized_login", sa.String(length=254), nullable=False),
        sa.Column("country", sa.String(length=2), nullable=True),
        sa.Column("password_ciphertext", sa.LargeBinary(), nullable=True),
        sa.Column("password_nonce", sa.LargeBinary(), nullable=True),
        sa.Column("status", sa.String(length=30), server_default="in_queue", nullable=False),
        sa.Column("last_error_code", sa.String(length=100), nullable=True),
        sa.Column("billing", sa.Text(), nullable=True),
        sa.Column("promo", sa.Text(), nullable=True),
        sa.Column("remote_status", sa.String(length=100), nullable=True),
        sa.Column("confirmation_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_polled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_poll_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("stuck_warning_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lease_owner", sa.String(length=100), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "status IN ('in_queue', 'needcheck', 'ok', 'bad_password', 'rate_limit_error', 'not_logged_in', 'not_logged_in_bad', 'email_code', 'error', 'deleted')",
            name="ck_user_instagram_accounts_status",
        ),
        sa.CheckConstraint("country IS NULL OR country ~ '^[a-z]{2}$'", name="ck_user_instagram_accounts_country"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["brand_id"], ["brands.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_instagram_accounts_user_id", "user_instagram_accounts", ["user_id"])
    op.create_index("ix_user_instagram_accounts_brand_id", "user_instagram_accounts", ["brand_id"])
    op.create_index("ix_user_instagram_accounts_poll", "user_instagram_accounts", ["next_poll_at", "deleted_at"])
    op.create_index("ix_user_instagram_accounts_lease", "user_instagram_accounts", ["lease_expires_at"])
    op.create_index(
        "uq_user_instagram_accounts_active_login",
        "user_instagram_accounts",
        ["user_id", "normalized_login"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "uq_user_instagram_accounts_active_brand",
        "user_instagram_accounts",
        ["brand_id"],
        unique=True,
        postgresql_where=sa.text("brand_id IS NOT NULL AND deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_user_instagram_accounts_active_brand", table_name="user_instagram_accounts")
    op.drop_index("uq_user_instagram_accounts_active_login", table_name="user_instagram_accounts")
    op.drop_index("ix_user_instagram_accounts_lease", table_name="user_instagram_accounts")
    op.drop_index("ix_user_instagram_accounts_poll", table_name="user_instagram_accounts")
    op.drop_index("ix_user_instagram_accounts_brand_id", table_name="user_instagram_accounts")
    op.drop_index("ix_user_instagram_accounts_user_id", table_name="user_instagram_accounts")
    op.drop_table("user_instagram_accounts")
