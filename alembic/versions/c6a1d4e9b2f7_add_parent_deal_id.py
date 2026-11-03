from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c6a1d4e9b2f7"
down_revision: str | None = "b4f7a2c9d1e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("deals", sa.Column("parent_deal_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_deals_parent_deal_id",
        "deals",
        "deals",
        ["parent_deal_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_deals_parent_deal_id", "deals", ["parent_deal_id"])


def downgrade() -> None:
    op.drop_index("ix_deals_parent_deal_id", table_name="deals")
    op.drop_constraint("fk_deals_parent_deal_id", "deals", type_="foreignkey")
    op.drop_column("deals", "parent_deal_id")
