from datetime import datetime, timezone

import httpx
import pytest
from fastapi import FastAPI
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from src.api.dependencies import get_current_user
from src.api.instagram_schemas import InstagramAccountResponse
from src.api.routers.crm.instagram_accounts import get_instagram_account_service, router
from src.api.services.bridgit_client import BridgitAPIError
from src.api.services.instagram_accounts import InstagramAccountService, InstagramAccountServiceError
from src.db.models import User


class FakeInstagramService:
    def __init__(self) -> None:
        self.calls: list[tuple] = []

    def response(self, account_id: int = 7) -> InstagramAccountResponse:
        now = datetime.now(timezone.utc)
        return InstagramAccountResponse(
            id=account_id,
            login="creator",
            brand_id=3,
            country="de",
            status="in_queue",
            last_error_code=None,
            billing=None,
            promo=None,
            remote_status=None,
            action_required=None,
            stuck=False,
            created_at=now,
            updated_at=now,
        )

    async def list_accounts(self, user_id: int):
        return [self.response()]

    async def get_account(self, user_id: int, account_id: int):
        if user_id != 11:
            raise InstagramAccountServiceError(404, "account_not_found", "Instagram-аккаунт не найден")
        return self.response(account_id)

    async def add_account(self, *args):
        self.calls.append(args)
        return self.response()

    async def confirm_account(self, *args):
        self.calls.append(args)
        return self.response()

    async def resume_account(self, *args):
        self.calls.append(args)
        return self.response()

    async def delete_account(self, user_id: int, account_id: int):
        return {"status": "deleted", "id": account_id, "login": "creator", "was_last_account": True}


def make_app(service: FakeInstagramService) -> FastAPI:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1/crm")

    async def user() -> User:
        return User(id=11, email="owner@example.invalid", password_hash="")

    app.dependency_overrides[get_current_user] = user
    app.dependency_overrides[get_instagram_account_service] = lambda: service

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request, exc):
        return JSONResponse(status_code=400, content={"detail": {"code": "validation_error", "message": "invalid", "field": str(exc.errors()[0]["loc"][-1])}})

    return app


@pytest.mark.asyncio
async def test_add_account_passes_valid_payload_to_service() -> None:
    service = FakeInstagramService()
    transport = httpx.ASGITransport(app=make_app(service))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/crm/instagram-accounts",
            json={"login": " creator ", "password": "private", "country": "DE", "two_factor": "123456", "brand_id": 3},
        )
    assert response.status_code == 201
    assert response.json()["status"] == "in_queue"
    assert service.calls[0] == (11, "creator", "private", "de", "123456", 3)
    assert "password" not in response.text
    assert "private" not in response.text


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("payload", "field"),
    [
        ({"login": "creator", "password": "private", "country": "ru"}, "country"),
        ({"login": "creator", "password": "private", "country": "r1"}, "country"),
        ({"login": "creator", "password": "private", "country": "de", "unknown": True}, "unknown"),
        ({"login": "creator", "password": 42}, "password"),
        ({"login": "   ", "password": "private"}, "login"),
    ],
)
async def test_invalid_add_payload_returns_400(payload: dict, field: str) -> None:
    transport = httpx.ASGITransport(app=make_app(FakeInstagramService()))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/v1/crm/instagram-accounts", json=payload)
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "validation_error"
    assert response.json()["detail"]["field"] == field


@pytest.mark.asyncio
async def test_foreign_account_returns_404() -> None:
    app = make_app(FakeInstagramService())

    async def stranger() -> User:
        return User(id=12, email="stranger@example.invalid", password_hash="")

    app.dependency_overrides[get_current_user] = stranger
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/crm/instagram-accounts/7")
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "account_not_found"


@pytest.mark.asyncio
async def test_confirm_requires_password_or_code() -> None:
    transport = httpx.ASGITransport(app=make_app(FakeInstagramService()))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/v1/crm/instagram-accounts/7/confirm", json={})
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_confirm_resume_and_delete_routes() -> None:
    service = FakeInstagramService()
    transport = httpx.ASGITransport(app=make_app(service))
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        confirm = await client.post("/api/v1/crm/instagram-accounts/7/confirm", json={"two_factor": "123456"})
        resume = await client.post("/api/v1/crm/instagram-accounts/7/resume")
        delete = await client.delete("/api/v1/crm/instagram-accounts/7")
    assert confirm.status_code == 200
    assert resume.status_code == 200
    assert delete.status_code == 200
    assert delete.json()["was_last_account"] is True


@pytest.mark.parametrize(
    ("error", "status", "code", "message"),
    [
        (BridgitAPIError("hidden", result="already1"), 409, "already1", "Этот профиль уже добавлен вами"),
        (BridgitAPIError("hidden", result="already2"), 409, "already2", "Этот профиль уже используется другой командой"),
        (BridgitAPIError("hidden", field="country"), 400, "missed_params", "Не заполнен параметр: country"),
        (BridgitAPIError("hidden", status_code=504), 504, "bridgit_timeout", "Bridgit не ответил вовремя"),
        (BridgitAPIError("secret"), 502, "bridgit_error", "Не удалось выполнить запрос к Bridgit"),
    ],
)
def test_bridgit_errors_have_safe_api_mapping(error: BridgitAPIError, status: int, code: str, message: str) -> None:
    translated = InstagramAccountService._translate_bridgit_error(error)
    assert translated.status_code == status
    assert translated.code == code
    assert translated.message == message
    assert "secret" not in translated.message
    assert "hidden" not in translated.message
