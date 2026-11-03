import os
import uuid
from collections.abc import AsyncIterator

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import delete, select

from src.api.main import app
from src.config.config import load_settings
from src.db.database import Database
from src.db.models import Account, CreatorMessage, Deal, User, UserShortlist
from src.utils.security import create_access_token, hash_password

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "").strip()

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="TEST_DATABASE_URL is not set; deal lifecycle tests require a real PostgreSQL database",
)


@pytest.fixture
def db() -> Database:
    return Database(TEST_DATABASE_URL)


@pytest.fixture
def api_client(db: Database) -> httpx.AsyncClient:
    app.state.db = db
    app.state.settings = load_settings()
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://deals.test")


@pytest_asyncio.fixture
async def scenario(db: Database) -> AsyncIterator[dict[str, int]]:
    marker = uuid.uuid4().hex[:12]
    async with db.async_session() as session:
        user = User(
            email=f"deal-lifecycle-{marker}@example.invalid",
            name=f"Deal Lifecycle {marker}",
            password_hash=hash_password(uuid.uuid4().hex),
        )
        account = Account(
            platform="TELEGRAM",
            platform_id=f"deal-lifecycle-{marker}",
            username=f"deal_lifecycle_{marker}",
            title=f"Deal Lifecycle Account {marker}",
        )
        session.add(user)
        session.add(account)
        await session.flush()
        session.add(UserShortlist(user_id=user.id, account_id=account.id, status="Свободен", source="search"))
        await session.commit()
        await session.refresh(user)
        await session.refresh(account)
        ids = {"user_id": user.id, "account_id": account.id}
    yield ids
    async with db.async_session() as session:
        await session.execute(delete(User).where(User.id == ids["user_id"]))
        await session.execute(delete(Account).where(Account.id == ids["account_id"]))
        await session.commit()


def _auth(user_id: int, email: str) -> dict[str, str]:
    token = create_access_token({"sub": email, "user_id": user_id}, app.state.settings.secret_key)
    return {"Authorization": f"Bearer {token}"}


async def _create_deal(client: httpx.AsyncClient, headers: dict[str, str], account_id: int, title: str, message: str) -> dict:
    response = await client.post(
        "/api/v1/crm/deals",
        headers=headers,
        json={
            "account_id": str(account_id),
            "title": title,
            "budget": 0,
            "type": "Пост",
            "initial_message": message,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.asyncio
async def test_multiple_deals_for_one_author_have_independent_stages(
    db: Database,
    api_client: httpx.AsyncClient,
    scenario: dict[str, int],
) -> None:
    email = f"deal-lifecycle-{scenario['user_id']}@example.invalid"
    async with db.async_session() as session:
        user = await session.get(User, scenario["user_id"])
        assert user is not None
        email = user.email
    headers = _auth(scenario["user_id"], email)
    async with api_client as client:
        first = await _create_deal(client, headers, scenario["account_id"], "Первая сделка", "Первое сообщение")
        second = await _create_deal(client, headers, scenario["account_id"], "Вторая сделка", "Второе сообщение")
        assert first["id"] != second["id"]
        assert first["account_id"] == second["account_id"] == str(scenario["account_id"])
        response = await client.patch(
            f"/api/v1/crm/deals/{first['id']}",
            headers=headers,
            json={"stage": 3},
        )
        assert response.status_code == 200, response.text
        assert response.json()["stage"] == 3
        response = await client.get(f"/api/v1/crm/deals/{second['id']}", headers=headers)
        assert response.status_code == 200, response.text
        assert response.json()["stage"] == 1
        first_messages = await client.get(f"/api/v1/crm/deals/{first['id']}/messages", headers=headers)
        second_messages = await client.get(f"/api/v1/crm/deals/{second['id']}/messages", headers=headers)
        assert [item["text"] for item in first_messages.json()] == ["Первое сообщение"]
        assert [item["text"] for item in second_messages.json()] == ["Второе сообщение"]


@pytest.mark.asyncio
async def test_delete_one_deal_preserves_author_shortlist_other_deal_and_messages(
    db: Database,
    api_client: httpx.AsyncClient,
    scenario: dict[str, int],
) -> None:
    async with db.async_session() as session:
        user = await session.get(User, scenario["user_id"])
        assert user is not None
        email = user.email
    headers = _auth(scenario["user_id"], email)
    async with api_client as client:
        first = await _create_deal(client, headers, scenario["account_id"], "Удаляемая сделка", "Сохранённое сообщение")
        second = await _create_deal(client, headers, scenario["account_id"], "Остающаяся сделка", "Связанное сообщение")
        response = await client.delete(f"/api/v1/crm/deals/{first['id']}", headers=headers)
        assert response.status_code == 200, response.text
        assert response.json() == {"status": "deleted", "deal_id": first["id"]}
        response = await client.get(f"/api/v1/crm/deals/{first['id']}", headers=headers)
        assert response.status_code == 404
        response = await client.get(f"/api/v1/crm/deals/{second['id']}", headers=headers)
        assert response.status_code == 200, response.text
    async with db.async_session() as session:
        account = await session.get(Account, scenario["account_id"])
        assert account is not None
        shortlist = await session.get(UserShortlist, (scenario["user_id"], scenario["account_id"]))
        assert shortlist is not None
        deals = list((await session.execute(select(Deal).where(Deal.user_id == scenario["user_id"]))).scalars().all())
        assert [deal.id for deal in deals] == [second["id"]]
        detached = await session.get(CreatorMessage, first["last_message"]["id"])
        assert detached is not None
        assert detached.deal_id is None
        linked = await session.get(CreatorMessage, second["last_message"]["id"])
        assert linked is not None
        assert linked.deal_id == second["id"]


@pytest.mark.asyncio
async def test_repeated_shortlist_export_does_not_duplicate_author(
    db: Database,
    api_client: httpx.AsyncClient,
    scenario: dict[str, int],
) -> None:
    async with db.async_session() as session:
        user = await session.get(User, scenario["user_id"])
        assert user is not None
        email = user.email
    headers = _auth(scenario["user_id"], email)
    async with api_client as client:
        for _ in range(2):
            response = await client.post(
                "/api/v1/crm/shortlist",
                headers=headers,
                json={"account_ids": [str(scenario["account_id"])]},
            )
            assert response.status_code == 200, response.text
        response = await client.get("/api/v1/crm/shortlist", headers=headers)
        assert response.status_code == 200, response.text
        matches = [item for item in response.json() if item["account_id"] == str(scenario["account_id"])]
        assert len(matches) == 1


@pytest.mark.asyncio
async def test_repeat_deal_builds_linked_history_with_fresh_terms(
    db: Database,
    api_client: httpx.AsyncClient,
    scenario: dict[str, int],
) -> None:
    async with db.async_session() as session:
        user = await session.get(User, scenario["user_id"])
        assert user is not None
        email = user.email
    headers = _auth(scenario["user_id"], email)
    async with api_client as client:
        source = await _create_deal(client, headers, scenario["account_id"], "Исходная сделка", "Первое сообщение")
        response = await client.patch(
            f"/api/v1/crm/deals/{source['id']}",
            headers=headers,
            json={"brand_name": "Тестовый бренд", "budget": 5000, "terms": "Исходные условия"},
        )
        assert response.status_code == 200, response.text
        response = await client.post(f"/api/v1/crm/deals/{source['id']}/repeat", headers=headers)
        assert response.status_code == 409
        response = await client.patch(f"/api/v1/crm/deals/{source['id']}", headers=headers, json={"stage": 6})
        assert response.status_code == 200, response.text
        response = await client.post(f"/api/v1/crm/deals/{source['id']}/repeat", headers=headers)
        assert response.status_code == 200, response.text
        repeated = response.json()
        assert repeated["parent_deal_id"] == source["id"]
        assert repeated["account_id"] == str(scenario["account_id"])
        assert repeated["brand_name"] == "Тестовый бренд"
        assert repeated["stage"] == 3
        assert repeated["budget"] == 0
        assert repeated["terms"] is None
        assert repeated["pub_date"] is None
        response = await client.patch(f"/api/v1/crm/deals/{repeated['id']}", headers=headers, json={"stage": 6})
        assert response.status_code == 200, response.text
        response = await client.post(f"/api/v1/crm/deals/{repeated['id']}/repeat", headers=headers)
        assert response.status_code == 200, response.text
        following = response.json()
        assert following["parent_deal_id"] == repeated["id"]
        response = await client.get("/api/v1/crm/deals", headers=headers)
        assert response.status_code == 200, response.text
        history = {item["id"]: item["parent_deal_id"] for item in response.json()}
        assert history[repeated["id"]] == source["id"]
        assert history[following["id"]] == repeated["id"]


@pytest.mark.asyncio
async def test_delete_last_deal_restores_author_to_shortlist(
    db: Database,
    api_client: httpx.AsyncClient,
    scenario: dict[str, int],
) -> None:
    async with db.async_session() as session:
        user = await session.get(User, scenario["user_id"])
        assert user is not None
        email = user.email
    headers = _auth(scenario["user_id"], email)
    async with api_client as client:
        deal = await _create_deal(client, headers, scenario["account_id"], "Единственная сделка", "Сообщение")
        response = await client.delete(f"/api/v1/crm/shortlist/{scenario['account_id']}", headers=headers)
        assert response.status_code == 200, response.text
        response = await client.delete(f"/api/v1/crm/deals/{deal['id']}", headers=headers)
        assert response.status_code == 200, response.text
        response = await client.get("/api/v1/crm/shortlist", headers=headers)
        assert response.status_code == 200, response.text
        matches = [item for item in response.json() if item["account_id"] == str(scenario["account_id"])]
        assert len(matches) == 1
    async with db.async_session() as session:
        assert await session.get(Account, scenario["account_id"]) is not None
        assert await session.get(CreatorMessage, deal["last_message"]["id"]) is not None
