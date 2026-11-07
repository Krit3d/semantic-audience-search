import os
import uuid
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.services.communication_domain import ensure_legacy_thread, replace_channel
from src.db.database import Database
from src.db.models import (
    Account,
    ChannelIdentity,
    CreatorMessage,
    Deal,
    DealActivity,
    SenderAccount,
    Thread,
    User,
    UserInstagramAccount,
)

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "").strip()
NOW = datetime(2026, 11, 6, 12, 0, tzinfo=timezone.utc)

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="TEST_DATABASE_URL is not set; communication domain tests require PostgreSQL",
)


@pytest_asyncio.fixture
async def db() -> Database:
    return Database(TEST_DATABASE_URL)


def ids() -> tuple[str, str]:
    marker = uuid.uuid4().hex[:12]
    return marker, f"shared-{marker}"


async def create_users_and_author(session: AsyncSession) -> tuple[User, User, Account]:
    marker, _ = ids()
    first = User(email=f"first-{marker}@example.invalid", password_hash="test")
    second = User(email=f"second-{marker}@example.invalid", password_hash="test")
    author = Account(
        id=9_000_000_000_000 + int(uuid.uuid4().int % 1_000_000),
        platform="INSTAGRAM",
        platform_id=f"author-{marker}",
        username=f"author_{marker}",
        title="Communication Test Author",
    )
    session.add_all([first, second, author])
    await session.flush()
    return first, second, author


def sender(user: User, login: str, brand_id: int | None = None) -> SenderAccount:
    return SenderAccount(
        user_id=user.id,
        brand_id=brand_id,
        platform="instagram",
        provider="bridgit",
        login=login,
        normalized_login=login,
        status="ok",
        rotation_enabled=True,
        created_at=NOW,
        updated_at=NOW,
    )


@pytest.mark.asyncio
async def test_database_rejects_shared_active_login(db: Database) -> None:
    async with db.async_session() as session:
        first, second, _ = await create_users_and_author(session)
        _, login = ids()
        session.add_all([sender(first, login), sender(second, login)])
        with pytest.raises(IntegrityError):
            await session.flush()
        await session.rollback()


@pytest.mark.asyncio
async def test_legacy_thread_attachment_is_idempotent(db: Database) -> None:
    async with db.async_session() as session:
        owner, _, author = await create_users_and_author(session)
        marker, login = ids()
        legacy = UserInstagramAccount(
            user_id=owner.id,
            login=login,
            normalized_login=login,
            status="ok",
            created_at=NOW,
            updated_at=NOW,
        )
        session.add(legacy)
        await session.flush()
        deal = Deal(
            user_id=owner.id,
            account_id=author.id,
            title=f"Deal-{marker}",
            stage=4,
            budget=0,
            type="Stories",
            instagram_account_id=legacy.id,
            created_at=NOW,
            updated_at=NOW,
        )
        session.add(deal)
        await session.flush()
        messages = [
            CreatorMessage(
                user_id=owner.id,
                account_id=author.id,
                deal_id=deal.id,
                sender_type="user",
                sender_instagram_account_id=legacy.id,
                channel_type="instagram",
                text=f"message-{index}",
                created_at=NOW,
            )
            for index in range(2)
        ]
        session.add_all(messages)
        await session.flush()
        first = await ensure_legacy_thread(
            session,
            user_id=owner.id,
            author_account_id=author.id,
            deal=deal,
        )
        second = await ensure_legacy_thread(
            session,
            user_id=owner.id,
            author_account_id=author.id,
            deal=deal,
        )
        assert first is not None
        assert second is not None
        assert first.id == second.id
        assert await session.scalar(select(func.count(Thread.id)).where(Thread.user_id == owner.id)) == 1
        assert await session.scalar(select(func.count(CreatorMessage.id)).where(CreatorMessage.thread_id == first.id)) == 2
        assert await session.scalar(select(func.count(DealActivity.id)).where(DealActivity.user_id == owner.id)) == 2
        assert deal.stage == 4
        await session.rollback()


@pytest.mark.asyncio
async def test_channel_replacement_preserves_stage_and_old_history(db: Database) -> None:
    async with db.async_session() as session:
        owner, _, author = await create_users_and_author(session)
        first_sender = sender(owner, f"first-{uuid.uuid4().hex[:12]}")
        second_sender = sender(owner, f"second-{uuid.uuid4().hex[:12]}")
        session.add_all([first_sender, second_sender])
        await session.flush()
        deal = Deal(
            user_id=owner.id,
            account_id=author.id,
            title="Replacement test",
            stage=4,
            budget=0,
            type="Stories",
            created_at=NOW,
            updated_at=NOW,
        )
        session.add(deal)
        await session.flush()
        old_channel = ChannelIdentity(
            user_id=owner.id,
            sender_account_id=first_sender.id,
            author_account_id=author.id,
            platform="instagram",
            status="active",
            created_at=NOW,
            updated_at=NOW,
        )
        session.add(old_channel)
        await session.flush()
        old_thread = Thread(
            user_id=owner.id,
            channel_identity_id=old_channel.id,
            author_account_id=author.id,
            deal_id=deal.id,
            created_at=NOW,
            updated_at=NOW,
        )
        session.add(old_thread)
        await session.flush()
        new_channel, new_thread = await replace_channel(
            session,
            old_channel=old_channel,
            new_sender=second_sender,
            deal=deal,
        )
        assert old_channel.status == "replaced"
        assert old_channel.replaced_by_id == new_channel.id
        assert old_thread.is_read_only is True
        assert new_channel.status == "active"
        assert deal.primary_thread_id == new_thread.id
        assert deal.communication_state == "recontact_required"
        assert deal.stage == 4
        await session.rollback()
