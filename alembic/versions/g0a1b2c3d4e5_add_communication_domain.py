from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "g0a1b2c3d4e5"
down_revision: str | None = "f9a5b2c3d4e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sender_accounts",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("brand_id", sa.BigInteger(), nullable=True),
        sa.Column("legacy_account_id", sa.BigInteger(), nullable=True),
        sa.Column("platform", sa.String(length=30), server_default="instagram", nullable=False),
        sa.Column("provider", sa.String(length=30), server_default="bridgit", nullable=False),
        sa.Column("login", sa.String(length=254), nullable=False),
        sa.Column("normalized_login", sa.String(length=254), nullable=False),
        sa.Column("country", sa.String(length=2), nullable=True),
        sa.Column("password_ciphertext", sa.LargeBinary(), nullable=True),
        sa.Column("password_nonce", sa.LargeBinary(), nullable=True),
        sa.Column("status", sa.String(length=30), server_default="in_queue", nullable=False),
        sa.Column("rotation_enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("last_assigned_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.CheckConstraint("country IS NULL OR country ~ '^[a-z]{2}$'", name="ck_sender_accounts_country"),
        sa.CheckConstraint("platform <> ''", name="ck_sender_accounts_platform"),
        sa.CheckConstraint("provider <> ''", name="ck_sender_accounts_provider"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["brand_id"], ["brands.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["legacy_account_id"], ["user_instagram_accounts.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("legacy_account_id"),
    )
    op.create_index("ix_sender_accounts_user_id", "sender_accounts", ["user_id"])
    op.create_index("ix_sender_accounts_brand_id", "sender_accounts", ["brand_id"])
    op.create_index("ix_sender_accounts_user_brand", "sender_accounts", ["user_id", "brand_id"])
    op.create_index("ix_sender_accounts_poll", "sender_accounts", ["next_poll_at", "deleted_at"])
    op.create_index("ix_sender_accounts_lease", "sender_accounts", ["lease_expires_at"])
    op.create_index(
        "ix_sender_accounts_rotation",
        "sender_accounts",
        ["user_id", "platform", "deleted_at", "rotation_enabled", "last_assigned_at"],
    )
    op.create_index(
        "uq_sender_accounts_active_platform_login",
        "sender_accounts",
        ["platform", "normalized_login"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.create_table(
        "channel_identities",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("sender_account_id", sa.BigInteger(), nullable=False),
        sa.Column("author_account_id", sa.BigInteger(), nullable=False),
        sa.Column("replaced_by_id", sa.BigInteger(), nullable=True),
        sa.Column("platform", sa.String(length=30), nullable=False),
        sa.Column("status", sa.String(length=30), server_default="active", nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "status IN ('active', 'blocked', 'deleted', 'replaced', 'pending_verification')",
            name="ck_channel_identities_status",
        ),
        sa.CheckConstraint("platform <> ''", name="ck_channel_identities_platform"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["sender_account_id"], ["sender_accounts.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["author_account_id"], ["accounts.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["replaced_by_id"], ["channel_identities.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_channel_identities_user_id", "channel_identities", ["user_id"])
    op.create_index("ix_channel_identities_sender_account_id", "channel_identities", ["sender_account_id"])
    op.create_index("ix_channel_identities_author_account_id", "channel_identities", ["author_account_id"])
    op.create_index(
        "ix_channel_identities_author_status",
        "channel_identities",
        ["user_id", "author_account_id", "status"],
    )
    op.create_index(
        "ix_channel_identities_sender_status",
        "channel_identities",
        ["sender_account_id", "status"],
    )
    op.create_index(
        "uq_channel_identities_current_pair",
        "channel_identities",
        ["user_id", "sender_account_id", "author_account_id", "platform"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL AND status != 'replaced'"),
    )

    op.add_column("deals", sa.Column("brand_id", sa.BigInteger(), nullable=True))
    op.add_column(
        "deals",
        sa.Column("communication_state", sa.String(length=30), server_default="no_channel", nullable=False),
    )
    op.add_column("deals", sa.Column("last_contact_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key("fk_deals_brand_id", "deals", "brands", ["brand_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_deals_brand_id", "deals", ["brand_id"])
    op.create_check_constraint(
        "ck_deals_communication_state",
        "deals",
        "communication_state IN ('active', 'interrupted', 'recontact_required', 'resumed', 'no_channel')",
    )

    op.create_table(
        "threads",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("channel_identity_id", sa.BigInteger(), nullable=False),
        sa.Column("author_account_id", sa.BigInteger(), nullable=False),
        sa.Column("deal_id", sa.BigInteger(), nullable=True),
        sa.Column("is_read_only", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["channel_identity_id"], ["channel_identities.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["author_account_id"], ["accounts.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["deal_id"], ["deals.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("channel_identity_id"),
    )
    op.create_index("ix_threads_user_id", "threads", ["user_id"])
    op.create_index("ix_threads_author_account_id", "threads", ["author_account_id"])
    op.create_index("ix_threads_user_author_deal", "threads", ["user_id", "author_account_id", "deal_id"])
    op.create_index("ix_threads_deal_id", "threads", ["deal_id"])

    op.add_column("deals", sa.Column("primary_thread_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_deals_primary_thread_id",
        "deals",
        "threads",
        ["primary_thread_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_deals_primary_thread_id", "deals", ["primary_thread_id"])

    op.add_column("creator_messages", sa.Column("thread_id", sa.BigInteger(), nullable=True))
    op.add_column("creator_messages", sa.Column("sender_account_id", sa.BigInteger(), nullable=True))
    op.add_column("creator_messages", sa.Column("provider_queue_id", sa.String(length=255), nullable=True))
    op.add_column("creator_messages", sa.Column("delivery_status", sa.String(length=30), nullable=True))
    op.add_column("creator_messages", sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("creator_messages", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        "fk_creator_messages_thread_id",
        "creator_messages",
        "threads",
        ["thread_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_creator_messages_sender_account_id",
        "creator_messages",
        "sender_accounts",
        ["sender_account_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_creator_messages_thread_id", "creator_messages", ["thread_id"])
    op.create_index("ix_creator_messages_sender_account_id", "creator_messages", ["sender_account_id"])
    op.create_index(
        "ix_creator_messages_thread_created",
        "creator_messages",
        ["thread_id", "created_at", "id"],
    )
    op.create_check_constraint(
        "ck_creator_messages_delivery_status",
        "creator_messages",
        "delivery_status IS NULL OR delivery_status IN ('pending', 'queued', 'sent', 'failed', 'cancelled')",
    )

    op.create_table(
        "deal_activities",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("event_key", sa.String(length=255), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("deal_id", sa.BigInteger(), nullable=False),
        sa.Column("thread_id", sa.BigInteger(), nullable=True),
        sa.Column("channel_identity_id", sa.BigInteger(), nullable=True),
        sa.Column("message_id", sa.BigInteger(), nullable=True),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("from_stage", sa.SmallInteger(), nullable=True),
        sa.Column("to_stage", sa.SmallInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "event_type IN ('message', 'stage_changed', 'channel_blocked', 'channel_deleted', 'channel_replaced', 'communication_resumed')",
            name="ck_deal_activities_event_type",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["deal_id"], ["deals.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["thread_id"], ["threads.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["channel_identity_id"], ["channel_identities.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["message_id"], ["creator_messages.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_key"),
    )
    op.create_index("ix_deal_activities_user_id", "deal_activities", ["user_id"])
    op.create_index("ix_deal_activities_deal_id", "deal_activities", ["deal_id"])
    op.create_index("ix_deal_activities_deal_created", "deal_activities", ["deal_id", "created_at", "id"])
    op.create_index(
        "ix_deal_activities_channel_created",
        "deal_activities",
        ["channel_identity_id", "created_at", "id"],
    )

    op.create_table(
        "deal_tasks",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("deal_id", sa.BigInteger(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["deal_id"], ["deals.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_deal_tasks_user_id", "deal_tasks", ["user_id"])
    op.create_index("ix_deal_tasks_deal_completed", "deal_tasks", ["deal_id", "completed_at"])
    op.create_index(
        "uq_deal_tasks_open_title",
        "deal_tasks",
        ["deal_id", "title"],
        unique=True,
        postgresql_where=sa.text("completed_at IS NULL"),
    )


def downgrade() -> None:
    raise RuntimeError("Destructive downgrade is disabled")
