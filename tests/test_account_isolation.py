"""Two-account data isolation test. Requires a real PostgreSQL database.

Run with: TEST_DATABASE_URL=postgresql+asyncpg://user:pass@host:port/db pytest tests/test_account_isolation.py

Creates two synthetic users and additive rows owned by one of them, then verifies
that the second account cannot read or mutate them (403/404/empty) while the owner
gets 200. Does not delete any pre-existing data.
"""

import os
import uuid
from datetime import datetime, timezone

import httpx
import pytest
from sqlalchemy import select

from src.api.main import app
from src.config.config import load_settings
from src.db.database import Database
from src.db.models import Account, Brand, CreatorMessage, Deal, EridRecord, User, UserShortlist
from src.utils.security import create_access_token, hash_password

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "").strip()

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="TEST_DATABASE_URL is not set; isolation test requires a real PostgreSQL database",
)


@pytest.fixture
def db() -> Database:
    return Database(TEST_DATABASE_URL)


@pytest.fixture
def api_client(db: Database):
    settings = load_settings()
    app.state.db = db
    app.state.settings = settings
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://isolation.test")


async def _create_user(db: Database, tag: str) -> User:
    async with db.async_session() as session:
        user = User(
            email=f"isolation-{tag}-{uuid.uuid4().hex[:12]}@example.invalid",
            name=f"Isolation {tag}",
            password_hash=hash_password(uuid.uuid4().hex),
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user


async def _create_account(db: Database) -> Account:
    async with db.async_session() as session:
        marker = uuid.uuid4().hex[:12]
        account = Account(
            platform="TELEGRAM",
            platform_id=f"isolation-{marker}",
            username=f"isolation_{marker}",
            title=f"Isolation Account {marker}",
        )
        session.add(account)
        await session.commit()
        await session.refresh(account)
        return account


async def _create_owner_data(db: Database, owner: User, account: Account) -> dict[str, int]:
    now = datetime.now(timezone.utc)
    async with db.async_session() as session:
        brand = Brand(user_id=owner.id, name=f"IsolationBrand-{owner.id}", category="test", status="Активен", hue=250, desc="", kb={})
        session.add(brand)
        await session.flush()
        deal = Deal(user_id=owner.id, account_id=account.id, title=f"IsolationDeal-{owner.id}", stage=1, budget=1000, type="fixed")
        session.add(deal)
        await session.flush()
        shortlist = UserShortlist(user_id=owner.id, account_id=account.id, status="new", source="search")
        session.add(shortlist)
        message = CreatorMessage(user_id=owner.id, account_id=account.id, deal_id=deal.id, sender_type="user", text="isolation probe", is_read=True, created_at=now)
        session.add(message)
        erid = EridRecord(user_id=owner.id, deal_id=deal.id, brand_id=brand.id, status="Активен")
        session.add(erid)
        await session.commit()
        await session.refresh(brand)
        await session.refresh(deal)
        await session.refresh(erid)
        return {"brand_id": brand.id, "deal_id": deal.id, "erid_id": erid.id, "account_id": account.id}


def _auth(user: User, secret: str) -> dict[str, str]:
    token = create_access_token({"sub": user.email, "user_id": user.id}, secret)
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_two_accounts_isolation(db: Database, api_client: httpx.AsyncClient) -> None:
    settings = app.state.settings
    owner = await _create_user(db, "owner")
    stranger = await _create_user(db, "stranger")
    account = await _create_account(db)
    ids = await _create_owner_data(db, owner, account)
    owner_headers = _auth(owner, settings.secret_key)
    stranger_headers = _auth(stranger, settings.secret_key)

    async with api_client as client:
        owner_checks = [
            ("GET", "/api/v1/crm/deals"),
            ("GET", f"/api/v1/crm/deals/{ids['deal_id']}"),
            ("GET", f"/api/v1/crm/deals/{ids['deal_id']}/messages"),
            ("GET", "/api/v1/crm/shortlist"),
            ("GET", "/api/v1/crm/communications"),
            ("GET", f"/api/v1/crm/creators/{ids['account_id']}/messages"),
            ("GET", "/api/v1/crm/brands"),
            ("GET", f"/api/v1/crm/brands/{ids['brand_id']}"),
            ("GET", "/api/v1/crm/erid"),
        ]
        for method, url in owner_checks:
            resp = await client.request(method, url, headers=owner_headers)
            assert resp.status_code == 200, f"owner {method} {url} -> {resp.status_code}: {resp.text[:200]}"

        resp = await client.get("/api/v1/crm/deals", headers=owner_headers)
        assert any(d["id"] == ids["deal_id"] for d in resp.json()), "owner sees own deal"
        resp = await client.get("/api/v1/crm/shortlist", headers=owner_headers)
        assert any(str(i.get("account_id")) == str(ids["account_id"]) for i in resp.json()), "owner sees own shortlist entry"
        resp = await client.get("/api/v1/crm/brands", headers=owner_headers)
        assert any(b["id"] == ids["brand_id"] for b in resp.json()), "owner sees own brand"

        stranger_object_checks = [
            ("GET", f"/api/v1/crm/deals/{ids['deal_id']}"),
            ("PATCH", f"/api/v1/crm/deals/{ids['deal_id']}"),
            ("DELETE", f"/api/v1/crm/deals/{ids['deal_id']}"),
            ("GET", f"/api/v1/crm/deals/{ids['deal_id']}/messages"),
            ("POST", f"/api/v1/crm/deals/{ids['deal_id']}/messages"),
            ("GET", f"/api/v1/crm/brands/{ids['brand_id']}"),
            ("PATCH", f"/api/v1/crm/brands/{ids['brand_id']}"),
            ("DELETE", f"/api/v1/crm/brands/{ids['brand_id']}"),
            ("PATCH", f"/api/v1/crm/erid/{ids['erid_id']}"),
            ("POST", f"/api/v1/crm/erid/{ids['erid_id']}/checks"),
            ("DELETE", f"/api/v1/crm/shortlist/{ids['account_id']}"),
            ("DELETE", f"/api/v1/crm/creators/{ids['account_id']}"),
        ]
        for method, url in stranger_object_checks:
            payload = {}
            if method == "PATCH" and "/deals/" in url:
                payload = {"title": "hostile takeover attempt"}
            elif method == "PATCH" and "/brands/" in url:
                payload = {"name": "hostile rename"}
            elif method == "PATCH" and "/erid/" in url:
                payload = {"status": "Архивирован"}
            elif method == "POST" and url.endswith("/checks"):
                payload = {"result": "hostile check"}
            elif method == "POST" and url.endswith("/messages"):
                payload = {"text": "hostile message"}
            resp = await client.request(method, url, headers=stranger_headers, json=payload or None)
            assert resp.status_code in (403, 404), f"stranger {method} {url} -> {resp.status_code}: {resp.text[:200]}"

        stranger_list_checks = [
            ("/api/v1/crm/deals", ids["deal_id"], "id"),
            ("/api/v1/crm/brands", ids["brand_id"], "id"),
            ("/api/v1/crm/erid", ids["erid_id"], "id"),
        ]
        for url, forbidden_id, id_field in stranger_list_checks:
            resp = await client.get(url, headers=stranger_headers)
            assert resp.status_code == 200, f"stranger GET {url} -> {resp.status_code}"
            body = resp.json()
            items = body if isinstance(body, list) else body.get("items", [])
            assert all(int(item[id_field]) != forbidden_id for item in items), f"stranger sees owner data in {url}"

        resp = await client.get("/api/v1/crm/shortlist", headers=stranger_headers)
        assert resp.status_code == 200
        assert all(str(i.get("account_id")) != str(ids["account_id"]) for i in resp.json()), "stranger sees owner shortlist"

        resp = await client.get("/api/v1/crm/communications", headers=stranger_headers)
        assert resp.status_code == 200
        assert all(str(c.get("account_id")) != str(ids["account_id"]) for c in resp.json()), "stranger sees owner communications"

        resp = await client.get(f"/api/v1/crm/creators/{ids['account_id']}/messages", headers=stranger_headers)
        assert resp.status_code == 200
        assert resp.json() == [], "stranger sees owner messages"

        resp = await client.get("/api/v1/crm/deals", headers=owner_headers)
        deal = next(d for d in resp.json() if d["id"] == ids["deal_id"])
        assert deal["title"] != "hostile takeover attempt", "owner deal mutated by stranger"
        resp = await client.get(f"/api/v1/crm/deals/{ids['deal_id']}/messages", headers=owner_headers)
        assert all(m.get("text") != "hostile message" for m in resp.json()), "stranger message injected into owner deal"

        resp = await client.get("/api/v1/crm/deals")
        assert resp.status_code == 401, "unauthenticated access to deals"
        resp = await client.get("/api/v1/crm/shortlist")
        assert resp.status_code == 401, "unauthenticated access to shortlist"
        resp = await client.get("/api/v1/crm/communications")
        assert resp.status_code == 401, "unauthenticated access to communications"
