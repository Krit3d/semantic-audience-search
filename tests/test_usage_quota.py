from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from src.api.services.usage_quota import ensure_usage_limit
from src.db.models import SubscriptionPlan


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("plan_name", "limit_key", "used", "expected_limit"),
    [
        ("basic", "brand_limit", 2, 2),
        ("basic", "instagram_account_limit", 3, 3),
        ("pro", "brand_limit", 5, 5),
        ("pro", "instagram_account_limit", 10, 10),
    ],
)
async def test_tariff_limit_rejects_next_item(
    plan_name: str,
    limit_key: str,
    used: int,
    expected_limit: int,
) -> None:
    session = AsyncMock()
    session.scalar.return_value = SubscriptionPlan(
        name=plan_name,
        limits={"brand_limit": 2 if plan_name == "basic" else 5, "instagram_account_limit": 3 if plan_name == "basic" else 10},
    )

    with pytest.raises(HTTPException) as error:
        await ensure_usage_limit(
            session,
            user_id=1,
            limit_key=limit_key,
            used=used,
            resource_label="лимит",
        )

    assert error.value.status_code == 403
    assert str(expected_limit) in error.value.detail


@pytest.mark.asyncio
async def test_usage_below_limit_is_allowed() -> None:
    session = AsyncMock()
    session.scalar.return_value = SubscriptionPlan(name="basic", limits={"brand_limit": 2})

    await ensure_usage_limit(session, user_id=1, limit_key="brand_limit", used=1, resource_label="бренды")


@pytest.mark.asyncio
async def test_missing_limit_is_unrestricted() -> None:
    session = AsyncMock()
    session.scalar.return_value = SubscriptionPlan(name="enterprise", limits={})

    await ensure_usage_limit(session, user_id=1, limit_key="brand_limit", used=100, resource_label="бренды")
