from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models import CreatorMessage, SubscriptionPlan, User


async def ensure_dialog_can_be_created(
    session: AsyncSession,
    user_id: int,
    account_id: int,
    channel_type: str,
    now: datetime | None = None,
) -> None:
    await session.execute(select(User.id).where(User.id == user_id).with_for_update())
    normalized_channel = channel_type.lower()
    existing_stmt = (
        select(CreatorMessage.id)
        .where(
            CreatorMessage.user_id == user_id,
            CreatorMessage.account_id == account_id,
            func.lower(CreatorMessage.channel_type) == normalized_channel,
        )
        .limit(1)
    )
    existing = await session.scalar(existing_stmt)
    if existing is not None:
        return
    plan = await session.scalar(
        select(SubscriptionPlan)
        .join(User, User.plan_id == SubscriptionPlan.id)
        .where(User.id == user_id)
    )
    raw_limit = plan.limits.get("dialogs_monthly_limit") if plan is not None else None
    if isinstance(raw_limit, bool) or not isinstance(raw_limit, int) or raw_limit < 0:
        return
    moment = now or datetime.now(timezone.utc)
    month_start = moment.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    first_message_times = (
        select(CreatorMessage.account_id, func.lower(CreatorMessage.channel_type))
        .where(CreatorMessage.user_id == user_id)
        .group_by(CreatorMessage.account_id, func.lower(CreatorMessage.channel_type))
        .having(func.min(CreatorMessage.created_at) >= month_start)
        .subquery()
    )
    used = await session.scalar(select(func.count()).select_from(first_message_times))
    if (used or 0) >= raw_limit:
        raise HTTPException(
            status_code=403,
            detail=f"Достигнут месячный лимит диалогов: {raw_limit}",
        )
