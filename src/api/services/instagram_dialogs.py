from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models import Brand, CreatorMessage, Deal, UserInstagramAccount, UserShortlist


async def resolve_instagram_sender(
    session: AsyncSession,
    user_id: int,
    brand_name: str | None,
) -> UserInstagramAccount | None:
    stmt = select(UserInstagramAccount).where(
        UserInstagramAccount.user_id == user_id,
        UserInstagramAccount.deleted_at.is_(None),
    )
    if brand_name:
        stmt = stmt.join(Brand, Brand.id == UserInstagramAccount.brand_id).where(
            Brand.user_id == user_id,
            Brand.name == brand_name,
        )
    else:
        stmt = stmt.where(UserInstagramAccount.brand_id.is_(None))
    return (await session.execute(stmt.order_by(UserInstagramAccount.created_at.desc()).limit(1))).scalar_one_or_none()


async def archive_instagram_dialogs(session: AsyncSession, account: UserInstagramAccount, login: str) -> None:
    now = datetime.now(timezone.utc)
    deals = list((await session.execute(
        select(Deal).where(
            Deal.user_id == account.user_id,
            Deal.instagram_account_id == account.id,
            Deal.instagram_deletion_archived_at.is_(None),
        )
    )).scalars().all())
    account_ids: set[int] = set()
    note = f"Instagram-аккаунт @{login}, использовавшийся в сделке, был удалён."
    for deal in deals:
        account_ids.add(deal.account_id)
        if deal.stage != 0:
            deal.stage_before_instagram_deletion = deal.stage
            deal.stage = 0
        deal.instagram_deletion_archived_at = now
        if deal.terms and note not in deal.terms:
            deal.terms = f"{deal.terms}\n\n{note}"
        elif not deal.terms:
            deal.terms = note
        deal.updated_at = now
    message_account_ids = {
        row[0]
        for row in (await session.execute(
            select(CreatorMessage.account_id)
            .where(
                CreatorMessage.user_id == account.user_id,
                CreatorMessage.sender_instagram_account_id == account.id,
            )
            .distinct()
        )).all()
    }
    account_ids.update(message_account_ids)
    if not account_ids:
        return
    shortlists = list((await session.execute(
        select(UserShortlist).where(
            UserShortlist.user_id == account.user_id,
            UserShortlist.account_id.in_(account_ids),
            UserShortlist.instagram_deletion_account_id.is_(None),
        )
    )).scalars().all())
    for item in shortlists:
        if item.status != "В архиве":
            item.status_before_instagram_deletion = item.status
            item.status = "В архиве"
        item.instagram_deletion_account_id = account.id
        item.updated_at = now


async def restore_instagram_dialogs(session: AsyncSession, account: UserInstagramAccount) -> None:
    deals = list((await session.execute(
        select(Deal).where(
            Deal.user_id == account.user_id,
            Deal.instagram_account_id == account.id,
            Deal.instagram_deletion_archived_at.is_not(None),
        )
    )).scalars().all())
    for deal in deals:
        if deal.stage == 0 and deal.stage_before_instagram_deletion is not None:
            deal.stage = deal.stage_before_instagram_deletion
        deal.instagram_deletion_archived_at = None
        deal.stage_before_instagram_deletion = None
        deal.updated_at = datetime.now(timezone.utc)
    shortlists = list((await session.execute(
        select(UserShortlist).where(
            UserShortlist.user_id == account.user_id,
            UserShortlist.instagram_deletion_account_id == account.id,
        )
    )).scalars().all())
    for item in shortlists:
        if item.status == "В архиве":
            item.status = item.status_before_instagram_deletion or "Свободен"
        item.instagram_deletion_account_id = None
        item.status_before_instagram_deletion = None
        item.updated_at = datetime.now(timezone.utc)


def message_sender_id(message: CreatorMessage) -> int | None:
    return message.sender_instagram_account_id


def is_instagram_deletion_locked(item: UserShortlist | None) -> bool:
    return item is not None and item.instagram_deletion_account_id is not None
