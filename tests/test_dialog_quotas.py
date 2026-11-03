import asyncio
import os
import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timedelta, timezone

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import delete, func, select

from src.api.main import app
from src.config.config import load_settings
from src.db.database import Database
from src.db.models import Account, CreatorMessage, SubscriptionPlan, User
from src.utils.security import create_access_token, hash_password

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "").strip()

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="TEST_DATABASE_URL is not set; dialog quota tests require a real PostgreSQL database",
)


@pytest.fixture
def db() -> Database:
    return Database(TEST_DATABASE_URL)


@pytest.fixture
def api_client(db: Database) -> httpx.AsyncClient:
    app.state.db = db
    app.state.settings = load_settings()
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://quotas.test")


@pytest_asyncio.fixture
async def scenario(db: Database) -> AsyncIterator[dict[str, int | str]]:
    marker = uuid.uuid4().hex[:12]
    async with db.async_session() as session:
        plan = SubscriptionPlan(
            name=f"quota-{marker}",
            period_days=31,
            limits={"dialogs_monthly_limit": 2},
            features={},
        )
        session.add(plan)
        await session.flush()
        user = User(
            email=f"quota-{marker}@example.invalid",
            name=f"Quota {marker}",
            password_hash=hash_password(uuid.uuid4().hex),
            plan_id=plan.id,
        )
        session.add(user)
        await session.flush()
        accounts = [
            Account(
                platform="TELEGRAM",
                platform_id=f"quota-{marker}-{index}",
                username=f"quota_{marker}_{index}",
                title=f"Quota Account {marker} {index}",
            )
            for index in range(3)
        ]
        session.add_all(accounts)
        await session.commit()
        ids: dict[str, int | str] = {
            "user_id": user.id,
            "plan_id": plan.id,
            "email": user.email,
        }
        ids.update({f"account_{index}": account.id for index, account in enumerate(accounts)})
    yield ids
    async with db.async_session() as session:
        await session.execute(delete(User).where(User.id == ids["user_id"]))
        await session.execute(delete(Account).where(Account.id.in_([ids[f"account_{index}"] for index in range(3)])))
        await session.execute(delete(SubscriptionPlan).where(SubscriptionPlan.id == ids["plan_id"]))
        await session.commit()


def _auth(scenario: dict[str, int | str]) -> dict[str, str]:
    token = create_access_token(
        {"sub": scenario["email"], "user_id": scenario["user_id"]},
        app.state.settings.secret_key,
    )
    return {"Authorization": f"Bearer {token}"}


async def _init_dialog(client: httpx.AsyncClient, headers: dict[str, str], account_id: int | str) -> httpx.Response:
    return await client.post(
        f"/api/v1/crm/communications/init?creator_id={account_id}&channel_type=telegram",
        headers=headers,
    )


async def _message_count(db: Database, user_id: int | str) -> int:
    async with db.async_session() as session:
        return await session.scalar(select(func.count(CreatorMessage.id)).where(CreatorMessage.user_id == user_id)) or 0


@pytest.mark.asyncio
async def test_exact_limit_is_allowed_and_next_dialog_is_rejected(
    db: Database,
    api_client: httpx.AsyncClient,
    scenario: dict[str, int | str],
) -> None:
    headers = _auth(scenario)
    async with api_client as client:
        for index in range(2):
            response = await _init_dialog(client, headers, scenario[f"account_{index}"])
            assert response.status_code == 200, response.text
        response = await _init_dialog(client, headers, scenario["account_2"])
        assert response.status_code == 403
        assert "2" in response.json()["detail"]
    assert await _message_count(db, scenario["user_id"]) == 2


@pytest.mark.asyncio
async def test_existing_dialog_and_its_messages_do_not_consume_more_quota(
    db: Database,
    api_client: httpx.AsyncClient,
    scenario: dict[str, int | str],
) -> None:
    headers = _auth(scenario)
    async with api_client as client:
        for index in range(2):
            response = await _init_dialog(client, headers, scenario[f"account_{index}"])
            assert response.status_code == 200, response.text
        for _ in range(2):
            response = await _init_dialog(client, headers, scenario["account_0"])
            assert response.status_code == 200, response.text
        response = await client.post(
            f"/api/v1/crm/creators/{scenario['account_0']}/messages",
            headers=headers,
            json={"text": "Существующий диалог", "preferred_channel": "telegram"},
        )
        assert response.status_code == 200, response.text
    assert await _message_count(db, scenario["user_id"]) == 3


@pytest.mark.asyncio
async def test_previous_month_dialog_does_not_consume_current_month_quota(
    db: Database,
    api_client: httpx.AsyncClient,
    scenario: dict[str, int | str],
) -> None:
    now = datetime.now(timezone.utc)
    previous_month = (now.replace(day=1) - timedelta(days=1)).replace(day=1)
    async with db.async_session() as session:
        session.add(
            CreatorMessage(
                user_id=scenario["user_id"],
                account_id=scenario["account_0"],
                sender_type="system",
                text="Диалог начат",
                channel_type="telegram",
                created_at=previous_month,
            )
        )
        await session.commit()
    headers = _auth(scenario)
    async with api_client as client:
        for index in range(2):
            response = await _init_dialog(client, headers, scenario[f"account_{index}"])
            assert response.status_code == 200, response.text


@pytest.mark.asyncio
async def test_concurrent_creation_cannot_exceed_limit(
    db: Database,
    api_client: httpx.AsyncClient,
    scenario: dict[str, int | str],
) -> None:
    async with db.async_session() as session:
        plan = await session.get(SubscriptionPlan, scenario["plan_id"])
        assert plan is not None
        plan.limits = {"dialogs_monthly_limit": 1}
        await session.commit()
    headers = _auth(scenario)
    async with api_client as client:
        responses = await asyncio.gather(
            _init_dialog(client, headers, scenario["account_0"]),
            _init_dialog(client, headers, scenario["account_1"]),
        )
        assert sorted(response.status_code for response in responses) == [200, 403]
    assert await _message_count(db, scenario["user_id"]) == 1


@pytest.mark.asyncio
async def test_custom_plan_without_numeric_limit_is_unrestricted(
    db: Database,
    api_client: httpx.AsyncClient,
    scenario: dict[str, int | str],
) -> None:
    async with db.async_session() as session:
        plan = await session.get(SubscriptionPlan, scenario["plan_id"])
        assert plan is not None
        plan.limits = {}
        await session.commit()
    headers = _auth(scenario)
    async with api_client as client:
        for index in range(3):
            response = await _init_dialog(client, headers, scenario[f"account_{index}"])
            assert response.status_code == 200, response.text
    assert await _message_count(db, scenario["user_id"]) == 3
