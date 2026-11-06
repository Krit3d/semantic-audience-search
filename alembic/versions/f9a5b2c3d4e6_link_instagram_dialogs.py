from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f9a5b2c3d4e6"
down_revision: str | None = "e8f4a1b2c3d5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("deals", sa.Column("instagram_account_id", sa.BigInteger(), nullable=True))
    op.add_column("deals", sa.Column("instagram_deletion_archived_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("deals", sa.Column("stage_before_instagram_deletion", sa.SmallInteger(), nullable=True))
    op.create_foreign_key("fk_deals_instagram_account_id", "deals", "user_instagram_accounts", ["instagram_account_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_deals_instagram_account_id", "deals", ["instagram_account_id"])
    op.add_column("creator_messages", sa.Column("sender_instagram_account_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key("fk_creator_messages_sender_instagram_account_id", "creator_messages", "user_instagram_accounts", ["sender_instagram_account_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_creator_messages_sender_instagram_account_id", "creator_messages", ["sender_instagram_account_id"])
    op.add_column("user_shortlists", sa.Column("instagram_deletion_account_id", sa.BigInteger(), nullable=True))
    op.add_column("user_shortlists", sa.Column("status_before_instagram_deletion", sa.String(length=30), nullable=True))


def downgrade() -> None:
    op.drop_column("user_shortlists", "status_before_instagram_deletion")
    op.drop_column("user_shortlists", "instagram_deletion_account_id")
    op.drop_index("ix_creator_messages_sender_instagram_account_id", table_name="creator_messages")
    op.drop_constraint("fk_creator_messages_sender_instagram_account_id", "creator_messages", type_="foreignkey")
    op.drop_column("creator_messages", "sender_instagram_account_id")
    op.drop_index("ix_deals_instagram_account_id", table_name="deals")
    op.drop_constraint("fk_deals_instagram_account_id", "deals", type_="foreignkey")
    op.drop_column("deals", "stage_before_instagram_deletion")
    op.drop_column("deals", "instagram_deletion_archived_at")
    op.drop_column("deals", "instagram_account_id")
