"""CloudPayments billing webhook integration tests. Require a real PostgreSQL database.

Run with: TEST_DATABASE_URL=postgresql+asyncpg://user:pass@host:port/db pytest tests/test_billing_webhook.py

Creates a synthetic user, plan and payment events with unique markers, then deletes
only the rows it created. Does not touch any pre-existing data.
"""

import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import delete, func, select

from src.api.main import app
from src.api.services.cloudpayments_signature import sign_body
from src.config.config import load_settings
from src.db.database import Database
from src.db.models import PaymentEvent, SubscriptionPlan, User
from src.utils.security import hash_password

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "").strip()
WEBHOOK_SECRET = "integration-test-secret-0123456789"

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="TEST_DATABASE_URL is not set; webhook integration tests require a real PostgreSQL database",
)


@pytest.fixture
def db() -> Database:
    return Database(TEST_DATABASE_URL)


@pytest.fixture
def api_client(db: Database):
    settings = load_settings()
    app.state.db = db
    app.state.settings = settings.model_copy(
        update={"cloudpayments_secret_key": WEBHOOK_SECRET, "min_subscription_amount": 100000}
    )
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://billing.test")


def _payload(user_id: int, email: str, plan_name: str, tag: str, *, amount: float = 7900, transaction: str | None = None) -> dict:
    return {
        "TransactionId": transaction or f"tx-{tag}",
        "Amount": amount,
        "Currency": "RUB",
        "Email": email,
        "AccountId": str(user_id),
        "SubscriptionId": f"sub-{tag}",
        "Data": json.dumps({"plan": plan_name}),
    }


async def _post(client: httpx.AsyncClient, event: str, payload: dict) -> httpx.Response:
    body = json.dumps(payload).encode()
    return await client.post(
        f"/api/v1/billing/cloudpayments/webhook/{event}",
        content=body,
        headers={"Content-Type": "application/json", "Content-HMAC": sign_body(body, WEBHOOK_SECRET)},
    )


@pytest_asyncio.fixture
async def scenario(db: Database):
    tag = uuid.uuid4().hex[:12]
    async with db.async_session() as session:
        user = User(
            email=f"billing-{tag}@example.invalid",
            name=f"Billing {tag}",
            password_hash=hash_password(uuid.uuid4().hex),
        )
        session.add(user)
        plan = SubscriptionPlan(
            name=f"test-plan-{tag}",
            price=Decimal("7900"),
            period_days=31,
            is_active=True,
        )
        session.add(plan)
        await session.commit()
        await session.refresh(user)
        await session.refresh(plan)
    yield {"user_id": user.id, "plan_id": plan.id, "plan_name": plan.name, "email": user.email, "tag": tag}
    async with db.async_session() as session:
        await session.execute(delete(PaymentEvent).where(PaymentEvent.user_id == user.id))
        await session.execute(delete(User).where(User.id == user.id))
        await session.execute(delete(SubscriptionPlan).where(SubscriptionPlan.id == plan.id))
        await session.commit()


async def _get_user(db: Database, user_id: int) -> User:
    async with db.async_session() as session:
        user = await session.get(User, user_id)
        assert user is not None
        return user


async def _events(db: Database, user_id: int) -> list[PaymentEvent]:
    async with db.async_session() as session:
        stmt = select(PaymentEvent).where(PaymentEvent.user_id == user_id)
        return list((await session.execute(stmt)).scalars().all())


@pytest.mark.asyncio
async def test_pay_extends_subscription(api_client, db: Database, scenario):
    payload = _payload(scenario["user_id"], scenario["email"], scenario["plan_name"], scenario["tag"])
    response = await _post(api_client, "pay", payload)
    assert response.status_code == 200
    assert response.json() == {"code": 0}
    user = await _get_user(db, scenario["user_id"])
    assert user.subscription_status == "active"
    expires = user.subscription_expires_at
    assert expires is not None
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    assert expires > datetime.now(timezone.utc) + timedelta(days=30)
    assert user.gateway_subscription_id == f"sub-{scenario['tag']}"
    assert user.plan_id == scenario["plan_id"]
    events = await _events(db, scenario["user_id"])
    assert [e.event_type for e in events] == ["payment_success"]


@pytest.mark.asyncio
async def test_recurrent_extends_subscription(api_client, db: Database, scenario):
    payload = _payload(scenario["user_id"], scenario["email"], scenario["plan_name"], scenario["tag"], transaction=f"tx-rec-{scenario['tag']}")
    response = await _post(api_client, "recurrent", payload)
    assert response.status_code == 200
    user = await _get_user(db, scenario["user_id"])
    assert user.subscription_status == "active"
    events = await _events(db, scenario["user_id"])
    assert [e.event_type for e in events] == ["recurrent_success"]


@pytest.mark.asyncio
async def test_duplicate_webhook_extends_exactly_once(api_client, db: Database, scenario):
    payload = _payload(scenario["user_id"], scenario["email"], scenario["plan_name"], scenario["tag"])
    assert (await _post(api_client, "pay", payload)).status_code == 200
    after_first = await _get_user(db, scenario["user_id"])
    assert (await _post(api_client, "pay", payload)).status_code == 200
    after_second = await _get_user(db, scenario["user_id"])
    assert after_first.subscription_expires_at == after_second.subscription_expires_at
    assert len(await _events(db, scenario["user_id"])) == 1


@pytest.mark.asyncio
async def test_low_amount_rejected(api_client, db: Database, scenario):
    payload = _payload(scenario["user_id"], scenario["email"], scenario["plan_name"], scenario["tag"], amount=1)
    response = await _post(api_client, "pay", payload)
    assert response.status_code == 200
    user = await _get_user(db, scenario["user_id"])
    assert user.subscription_status == "trial"
    assert user.subscription_expires_at is None
    events = await _events(db, scenario["user_id"])
    assert [e.event_type for e in events] == ["rejected_low_amount"]


@pytest.mark.asyncio
async def test_cancel_preserves_paid_period(api_client, db: Database, scenario):
    pay_payload = _payload(scenario["user_id"], scenario["email"], scenario["plan_name"], scenario["tag"])
    cancel_payload = _payload(scenario["user_id"], scenario["email"], scenario["plan_name"], scenario["tag"], transaction=f"tx-cancel-{scenario['tag']}")
    assert (await _post(api_client, "pay", pay_payload)).status_code == 200
    before = await _get_user(db, scenario["user_id"])
    assert (await _post(api_client, "cancel", cancel_payload)).status_code == 200
    after = await _get_user(db, scenario["user_id"])
    assert after.subscription_status == "active"
    assert after.subscription_expires_at == before.subscription_expires_at
    events = await _events(db, scenario["user_id"])
    assert "subscription_cancel" in [e.event_type for e in events]


@pytest.mark.asyncio
async def test_invalid_signature_returns_401_and_logs(api_client, db: Database, scenario):
    payload = _payload(scenario["user_id"], scenario["email"], scenario["plan_name"], scenario["tag"])
    response = await api_client.post(
        "/api/v1/billing/cloudpayments/webhook/pay",
        content=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Content-HMAC": "deadbeef"},
    )
    assert response.status_code == 401
    async with db.async_session() as session:
        stmt = select(func.count()).select_from(PaymentEvent).where(PaymentEvent.event_type == "invalid_signature")
        count = (await session.execute(stmt)).scalar_one()
    assert count >= 1
    user = await _get_user(db, scenario["user_id"])
    assert user.subscription_status == "trial"


@pytest.mark.asyncio
async def test_activation_never_lowers_expires(api_client, db: Database, scenario):
    far_future = datetime.now(timezone.utc) + timedelta(days=365)
    async with db.async_session() as session:
        user = await session.get(User, scenario["user_id"])
        user.subscription_status = "active"
        user.subscription_expires_at = far_future
        await session.commit()
    payload = _payload(scenario["user_id"], scenario["email"], scenario["plan_name"], scenario["tag"], transaction=f"tx-future-{scenario['tag']}")
    response = await _post(api_client, "pay", payload)
    assert response.status_code == 200
    user = await _get_user(db, scenario["user_id"])
    expires = user.subscription_expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    assert expires == far_future
