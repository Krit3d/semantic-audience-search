from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models import SubscriptionPlan, User
from sqlalchemy import select


async def ensure_usage_limit(
    session: AsyncSession,
    *,
    user_id: int,
    limit_key: str,
    used: int,
    resource_label: str,
) -> None:
    plan = await session.scalar(
        select(SubscriptionPlan)
        .join(User, User.plan_id == SubscriptionPlan.id)
        .where(User.id == user_id)
    )
    raw_limit = plan.limits.get(limit_key) if plan is not None else None
    if isinstance(raw_limit, bool) or not isinstance(raw_limit, int) or raw_limit < 0:
        return
    if used >= raw_limit:
        raise HTTPException(
            status_code=403,
            detail=f"Достигнут лимит тарифа: {resource_label} — не более {raw_limit}",
        )
