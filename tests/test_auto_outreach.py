from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import FastAPI

from src.api.dependencies import get_current_user
from src.api.routers.crm.outreach import get_auto_outreach_service, router
from src.api.schemas import (
    AutoOutreachAccountItem,
    AutoOutreachPreviewResponse,
    AutoOutreachResultItem,
    AutoOutreachRunResponse,
)
from src.api.services.auto_outreach import (
    AutoOutreachService,
    AutoOutreachServiceError,
    OutreachCandidate,
    OutreachMessageGenerator,
    OutreachSnapshot,
)
from src.config.config import Settings
from src.db.models import Brand, SenderAccount, User

NOW = datetime(2026, 11, 14, 12, 0, tzinfo=timezone.utc)


def candidate(deal_id: int = 21) -> OutreachCandidate:
    return OutreachCandidate(
        deal_id=deal_id,
        account_id=31,
        deal_title="Интеграция",
        deal_type="Reels",
        author_username="author",
        author_title="Анна о стиле",
        author_description="Разбираю гардероб и показываю повседневные образы",
        author_category="Fashion",
        author_explanation="Эксперт по личному стилю",
    )


def brand() -> Brand:
    return Brand(
        id=5,
        user_id=11,
        name="Luma",
        category="Косметика",
        status="Активен",
        desc="Уходовая косметика для чувствительной кожи",
        kb={
            "short": "Мягкий ежедневный уход",
            "products": [{"name": "Крем Luma", "desc": "Увлажняющий крем"}],
            "usp": ["Минималистичный состав"],
            "forbidden": ["медицинские обещания"],
        },
        created_at=NOW,
        updated_at=NOW,
    )


def sender(sender_id: int = 7) -> SenderAccount:
    return SenderAccount(
        id=sender_id,
        user_id=11,
        platform="instagram",
        provider="bridgit",
        login="sender",
        normalized_login="sender",
        status="ok",
        rotation_enabled=True,
        created_at=NOW,
        updated_at=NOW,
    )


@pytest.mark.asyncio
async def test_deepseek_generator_uses_brand_and_author_context() -> None:
    completions = AsyncMock()
    completions.create.return_value = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content="Здравствуйте! Персональное предложение для вашего блога."))]
    )
    client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    settings = Settings.model_construct(
        deepseek_api_key="secret",
        deepseek_base_url="https://api.deepseek.com/v1",
        deepseek_llm_model="deepseek-v4-flash",
    )
    generator = OutreachMessageGenerator(settings, client=client)

    text = await generator.generate(brand(), candidate())

    assert text.startswith("Здравствуйте!")
    kwargs = completions.create.await_args.kwargs
    assert kwargs["model"] == "deepseek-v4-flash"
    assert kwargs["temperature"] == 0.9
    prompt = kwargs["messages"][1]["content"]
    assert "Luma" in prompt
    assert "Крем Luma" in prompt
    assert "@author" in prompt
    assert "повседневные образы" in prompt
    assert "медицинские обещания" in prompt


@pytest.mark.asyncio
async def test_generation_failure_does_not_queue_generic_fallback() -> None:
    generator = SimpleNamespace(generate=AsyncMock(side_effect=ValueError("LLM failed")))
    service = AutoOutreachService(AsyncMock(), Settings.model_construct(), generator=generator)
    snapshot = OutreachSnapshot(
        brand=brand(),
        candidates=[candidate()],
        senders=[sender()],
        total_deals=1,
        already_contacted_count=0,
        unsupported_count=0,
    )
    service._snapshot = AsyncMock(return_value=snapshot)
    service._queue_candidate = AsyncMock()

    result = await service.run(11, 5)

    assert result.failed_count == 1
    assert result.queued_count == 0
    service._queue_candidate.assert_not_awaited()


@pytest.mark.asyncio
async def test_outreach_requires_working_sender_before_generation() -> None:
    generator = SimpleNamespace(generate=AsyncMock())
    service = AutoOutreachService(AsyncMock(), Settings.model_construct(), generator=generator)
    service._snapshot = AsyncMock(return_value=OutreachSnapshot(
        brand=brand(),
        candidates=[candidate()],
        senders=[],
        total_deals=1,
        already_contacted_count=0,
        unsupported_count=0,
    ))

    with pytest.raises(AutoOutreachServiceError) as error:
        await service.run(11, 5)

    assert error.value.code == "instagram_account_required"
    generator.generate.assert_not_awaited()


class FakeOutreachService:
    def __init__(self) -> None:
        self.run_calls: list[tuple[int, int]] = []
        self.closed = False

    async def preview(self, user_id: int, brand_id: int) -> AutoOutreachPreviewResponse:
        return AutoOutreachPreviewResponse(
            brand_id=brand_id,
            brand_name="Luma",
            total_deals=1,
            eligible_count=1,
            already_contacted_count=0,
            unsupported_count=0,
            accounts=[AutoOutreachAccountItem(id=7, login="sender")],
        )

    async def run(self, user_id: int, brand_id: int) -> AutoOutreachRunResponse:
        self.run_calls.append((user_id, brand_id))
        return AutoOutreachRunResponse(
            queued_count=1,
            skipped_count=0,
            failed_count=0,
            results=[AutoOutreachResultItem(
                deal_id=21,
                account_id=31,
                author_handle="@author",
                status="queued",
                sender_login="sender",
            )],
        )

    async def close(self) -> None:
        self.closed = True


def make_app(service: FakeOutreachService) -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1/crm")

    async def user() -> User:
        return User(id=11, email="owner@example.invalid", password_hash="")

    app.dependency_overrides[get_current_user] = user
    app.dependency_overrides[get_auto_outreach_service] = lambda: service
    return app


@pytest.mark.asyncio
async def test_outreach_routes_preview_and_confirmed_run() -> None:
    service = FakeOutreachService()
    transport = httpx.ASGITransport(app=make_app(service))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        preview = await client.get("/api/v1/crm/outreach/preview?brand_id=5")
        run = await client.post("/api/v1/crm/outreach", json={"brand_id": 5, "confirmed": True})

    assert preview.status_code == 200
    assert preview.json()["accounts"][0]["login"] == "sender"
    assert run.status_code == 200
    assert run.json()["queued_count"] == 1
    assert service.run_calls == [(11, 5)]
    assert service.closed is True


@pytest.mark.asyncio
async def test_outreach_run_requires_explicit_confirmation() -> None:
    service = FakeOutreachService()
    transport = httpx.ASGITransport(app=make_app(service))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/v1/crm/outreach", json={"brand_id": 5, "confirmed": False})

    assert response.status_code == 422
    assert service.run_calls == []
