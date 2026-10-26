"""OAuth-вход через VK ID и Yandex ID (authorization code flow, PKCE для VK ID)."""

import base64
import hashlib
import logging
import secrets
import time
from typing import Any, Literal
from urllib.parse import quote, urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select

from src.api.dependencies import get_db
from src.db.database import Database
from src.db.models import User
from src.utils.security import (
    AUTH_COOKIE_MAX_AGE,
    AUTH_COOKIE_NAME,
    create_access_token,
    decode_access_token,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth/oauth", tags=["CRM OAuth"])

Provider = Literal["vk", "yandex"]

OAUTH_STATE_COOKIE = "cf_oauth_state"
OAUTH_STATE_TTL_SECONDS = 15 * 60
HTTP_TIMEOUT = 15.0

YANDEX_AUTHORIZE_URL = "https://oauth.yandex.ru/authorize"
YANDEX_TOKEN_URL = "https://oauth.yandex.ru/token"
YANDEX_USERINFO_URL = "https://login.yandex.ru/info"

VK_AUTHORIZE_URL = "https://id.vk.com/authorize"
VK_TOKEN_URL = "https://id.vk.com/oauth2/auth"
VK_USERINFO_URL = "https://id.vk.com/oauth2/user_info"


def _callback_uri(settings, provider: str) -> str:
    base = settings.api_public_url.rstrip("/")
    return f"{base}/api/v1/crm/auth/oauth/{provider}/callback"


def _login_error_redirect(settings, code: str) -> RedirectResponse:
    target = f"{settings.crm_frontend_url.rstrip('/')}/#/login?oauth_error={quote(code)}"
    return RedirectResponse(url=target, status_code=302)


def _success_redirect(settings, *, token: str, user_id: int, email: str) -> RedirectResponse:
    query = urlencode({"session_token": token, "user_id": str(user_id), "user_email": email})
    target = f"{settings.crm_frontend_url.rstrip('/')}/?{query}"
    response = RedirectResponse(url=target, status_code=302)
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value="1",
        max_age=AUTH_COOKIE_MAX_AGE,
        path="/",
        samesite="lax",
        secure=bool(settings.auth_cookie_domain),
        domain=settings.auth_cookie_domain or None,
    )
    response.delete_cookie(OAUTH_STATE_COOKIE, path="/")
    return response


def _pack_state(settings, provider: str, nonce: str, code_verifier: str | None) -> str:
    return create_access_token(
        {"purpose": "oauth_state", "provider": provider, "nonce": nonce, "verifier": code_verifier or ""},
        settings.secret_key,
        expires_delta_hours=1,  # фактический TTL проверяем по ts ниже
    )


def _unpack_state(settings, provider: str, cookie_value: str | None) -> tuple[str, str | None]:
    if not cookie_value:
        raise HTTPException(status_code=400, detail="OAuth state cookie missing")
    payload = decode_access_token(cookie_value, settings.secret_key)
    if (
        payload is None
        or payload.get("purpose") != "oauth_state"
        or payload.get("provider") != provider
        or not isinstance(payload.get("nonce"), str)
    ):
        raise HTTPException(status_code=400, detail="Invalid OAuth state cookie")
    iat = payload.get("iat")
    if not isinstance(iat, (int, float)) or time.time() - iat > OAUTH_STATE_TTL_SECONDS:
        raise HTTPException(status_code=400, detail="OAuth state expired")
    verifier = payload.get("verifier")
    return payload["nonce"], verifier if isinstance(verifier, str) and verifier else None


def _pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


@router.get("/providers")
async def oauth_providers(request: Request) -> dict[str, bool]:
    """Публичный список настроенных OAuth-провайдеров для экрана входа."""
    settings = request.app.state.settings
    return {
        "vk": bool(settings.vk_oauth_client_id),
        "yandex": bool(settings.yandex_oauth_client_id),
    }


@router.get("/{provider}/start")
async def oauth_start(provider: Provider, request: Request) -> RedirectResponse:
    settings = request.app.state.settings
    nonce = secrets.token_urlsafe(24)
    callback_uri = _callback_uri(settings, provider)

    if provider == "vk":
        if not settings.vk_oauth_client_id:
            raise HTTPException(status_code=503, detail="Вход через VK ID не настроен")
        verifier = secrets.token_urlsafe(64)
        params = {
            "response_type": "code",
            "client_id": settings.vk_oauth_client_id,
            "redirect_uri": callback_uri,
            "state": nonce,
            "scope": "email vkid.personal_info",
            "code_challenge": _pkce_challenge(verifier),
            "code_challenge_method": "S256",
        }
        authorize_url = f"{VK_AUTHORIZE_URL}?{urlencode(params)}"
    else:
        if not settings.yandex_oauth_client_id:
            raise HTTPException(status_code=503, detail="Вход через Yandex ID не настроен")
        verifier = None
        params = {
            "response_type": "code",
            "client_id": settings.yandex_oauth_client_id,
            "redirect_uri": callback_uri,
            "state": nonce,
        }
        authorize_url = f"{YANDEX_AUTHORIZE_URL}?{urlencode(params)}"

    response = RedirectResponse(url=authorize_url, status_code=302)
    response.set_cookie(
        key=OAUTH_STATE_COOKIE,
        value=_pack_state(settings, provider, nonce, verifier),
        max_age=OAUTH_STATE_TTL_SECONDS,
        path="/",
        httponly=True,
        samesite="lax",
        secure=True,
        domain=settings.auth_cookie_domain or None,
    )
    logger.info("OAuth start: provider=%s", provider)
    return response


async def _exchange_yandex(settings, code: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        token_resp = await client.post(
            YANDEX_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": settings.yandex_oauth_client_id,
                "client_secret": settings.yandex_oauth_client_secret,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if token_resp.status_code != 200:
            logger.warning("Yandex token exchange failed: %s %s", token_resp.status_code, token_resp.text[:300])
            raise HTTPException(status_code=502, detail="Yandex token exchange failed")
        access_token = token_resp.json().get("access_token")
        if not access_token:
            raise HTTPException(status_code=502, detail="Yandex token missing")
        info_resp = await client.get(
            YANDEX_USERINFO_URL,
            params={"format": "json"},
            headers={"Authorization": f"OAuth {access_token}"},
        )
        if info_resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Yandex userinfo failed")
        info = info_resp.json()
    email = info.get("default_email") or (info.get("emails") or [None])[0]
    name = info.get("display_name") or info.get("real_name") or (
        f"{info.get('first_name', '')} {info.get('last_name', '')}".strip() or info.get("login")
    )
    return {"email": email, "name": name}


async def _exchange_vk(settings, code: str, device_id: str | None, verifier: str, state: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        token_resp = await client.post(
            VK_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": settings.vk_oauth_client_id,
                "client_secret": settings.vk_oauth_client_secret,
                "redirect_uri": _callback_uri(settings, "vk"),
                "code_verifier": verifier,
                "device_id": device_id or "",
                "state": state,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if token_resp.status_code != 200:
            logger.warning("VK token exchange failed: %s %s", token_resp.status_code, token_resp.text[:300])
            raise HTTPException(status_code=502, detail="VK token exchange failed")
        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        if not access_token:
            raise HTTPException(status_code=502, detail="VK token missing")
        info_resp = await client.post(
            VK_USERINFO_URL,
            data={"access_token": access_token, "client_id": settings.vk_oauth_client_id},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if info_resp.status_code != 200:
            raise HTTPException(status_code=502, detail="VK userinfo failed")
        user = info_resp.json().get("user") or {}
    name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or None
    return {"email": user.get("email"), "name": name}


@router.get("/{provider}/callback")
async def oauth_callback(
    provider: Provider,
    request: Request,
    db: Database = Depends(get_db),
) -> RedirectResponse:
    settings = request.app.state.settings
    params = request.query_params

    if params.get("error"):
        logger.info("OAuth callback with error: provider=%s error=%s", provider, params.get("error"))
        return _login_error_redirect(settings, "provider_denied")

    code = params.get("code")
    state = params.get("state")
    if not code or not state:
        return _login_error_redirect(settings, "missing_code")

    try:
        expected_nonce, verifier = _unpack_state(settings, provider, request.cookies.get(OAUTH_STATE_COOKIE))
    except HTTPException:
        return _login_error_redirect(settings, "state_expired")
    if not secrets.compare_digest(expected_nonce, state):
        return _login_error_redirect(settings, "state_mismatch")

    try:
        if provider == "vk":
            if not verifier:
                return _login_error_redirect(settings, "state_expired")
            identity = await _exchange_vk(settings, code, params.get("device_id"), verifier, state)
        else:
            identity = await _exchange_yandex(settings, code)
    except HTTPException:
        return _login_error_redirect(settings, "exchange_failed")
    except httpx.HTTPError:
        logger.exception("OAuth HTTP error: provider=%s", provider)
        return _login_error_redirect(settings, "exchange_failed")

    email = identity.get("email")
    if not email or not isinstance(email, str):
        logger.warning("OAuth provider %s did not return email", provider)
        return _login_error_redirect(settings, "email_required")
    email = email.strip()
    name = identity.get("name") if isinstance(identity.get("name"), str) else None

    async with db.async_session() as session:
        stmt = select(User).where(func.lower(User.email) == email.lower())
        user = (await session.execute(stmt)).scalar_one_or_none()
        if user is None:
            user = User(email=email, name=name, password_hash="")
            session.add(user)
        else:
            if not user.is_active:
                return _login_error_redirect(settings, "account_disabled")
            if not user.name and name:
                user.name = name
        await session.commit()
        user_id = user.id
        user_email = user.email

    access_token = create_access_token(
        {"sub": user_email, "user_id": user_id},
        settings.secret_key,
    )
    logger.info("OAuth login ok: provider=%s user_id=%s", provider, user_id)
    return _success_redirect(settings, token=access_token, user_id=user_id, email=user_email)
