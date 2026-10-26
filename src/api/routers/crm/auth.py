import logging
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, select

from src.api.dependencies import get_current_user, get_crm_client, get_db
from src.api.schemas import (
    CrmForgotPasswordRequest,
    CrmLoginRequest,
    CrmLoginResponse,
    CrmRegisterRequest,
    CrmResetPasswordRequest,
    CrmUserResponse,
)
from src.api.services.crm_client import TwentyCrmClient
from src.api.services.mailer import MailerNotConfigured, send_password_reset
from src.db.database import Database
from src.db.models import User
from src.utils.rate_limiter import rate_limit
from src.utils.security import (
    AUTH_COOKIE_MAX_AGE,
    AUTH_COOKIE_NAME,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["CRM Auth"])


def _set_auth_cookie(response: Response, settings) -> None:
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value="1",
        max_age=AUTH_COOKIE_MAX_AGE,
        path="/",
        samesite="lax",
        secure=bool(settings.auth_cookie_domain),
        domain=settings.auth_cookie_domain or None,
    )


@router.post("/login", response_model=CrmLoginResponse)
async def crm_login(
    payload: CrmLoginRequest,
    request: Request,
    response: Response,
    db: Database = Depends(get_db),
    crm_client: TwentyCrmClient = Depends(get_crm_client),
    _rate_limit: None = Depends(rate_limit(max_requests=5, window_seconds=60)),
) -> CrmLoginResponse:
    email = payload.email.strip()
    async with db.async_session() as session:
        stmt = select(User).where(func.lower(User.email) == email.lower())
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()

    if user is not None and bool(user.password_hash):
        if not user.is_active:
            raise HTTPException(status_code=403, detail="Учетная запись деактивирована")
        if not verify_password(payload.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Неверный email или пароль")
        access_token = create_access_token(
            {"sub": user.email, "user_id": user.id},
            request.app.state.settings.secret_key,
        )
        _set_auth_cookie(response, request.app.state.settings)
        return CrmLoginResponse(
            token=access_token,
            user={"id": user.id, "email": user.email, "name": user.name or user.email.split("@")[0], "is_admin": user.is_admin},
        )

    try:
        data = await crm_client.authenticate(payload.email, payload.password)
    except ValueError:
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    except Exception as exc:
        logger.exception("Twenty login failed")
        raise HTTPException(status_code=502, detail="Ошибка внешнего сервиса авторизации") from exc
    token = data.get("token")
    user_data = data.get("user")
    if not isinstance(token, str) or not token or not isinstance(user_data, dict):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    user_email = user_data.get("email")
    if not isinstance(user_email, str) or not user_email:
        user_email = email
    user_name = user_data.get("name")
    if not isinstance(user_name, str) or not user_name:
        user_name = user_email.split("@")[0]
    async with db.async_session() as session:
        stmt = select(User).where(func.lower(User.email) == user_email.lower())
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()
        if user is None:
            user = User(email=user_email, name=user_name, password_hash="")
            session.add(user)
        else:
            if user.email != user_email:
                user.email = user_email
            if not user.name and user_name:
                user.name = user_name
        await session.commit()
        user_id = user.id
        user_email = user.email
        user_name = user.name or user_email.split("@")[0]
        user_is_admin = user.is_admin
    access_token = create_access_token(
        {"sub": user_email, "user_id": user_id},
        request.app.state.settings.secret_key,
    )
    _set_auth_cookie(response, request.app.state.settings)
    return CrmLoginResponse(
        token=access_token,
        user={"id": user_id, "email": user_email, "name": user_name, "is_admin": user_is_admin},
    )


@router.post("/register", response_model=CrmLoginResponse)
async def crm_register(
    payload: CrmRegisterRequest,
    request: Request,
    response: Response,
    db: Database = Depends(get_db),
    _rate_limit: None = Depends(rate_limit(max_requests=5, window_seconds=60)),
) -> CrmLoginResponse:
    email = payload.email.strip()
    async with db.async_session() as session:
        stmt = select(User).where(func.lower(User.email) == email.lower())
        result = await session.execute(stmt)
        existing = result.scalar_one_or_none()
        if existing is not None:
            raise HTTPException(status_code=400, detail="Регистрация с указанными данными невозможна")

        user = User(
            email=email,
            name=payload.name,
            password_hash=hash_password(payload.password),
        )
        session.add(user)
        await session.commit()
        user_id = user.id
        user_email = user.email
        user_name = user.name or user_email.split("@")[0]
        user_is_admin = user.is_admin

    access_token = create_access_token(
        {"sub": user_email, "user_id": user_id},
        request.app.state.settings.secret_key,
    )
    _set_auth_cookie(response, request.app.state.settings)
    return CrmLoginResponse(
        token=access_token,
        user={"id": user_id, "email": user_email, "name": user_name, "is_admin": user_is_admin},
    )

@router.get("/me", response_model=CrmUserResponse)
async def crm_me(current_user: User = Depends(get_current_user)) -> CrmUserResponse:
    return CrmUserResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name or current_user.email.split("@")[0],
        is_admin=current_user.is_admin,
    )


RESET_TOKEN_TTL_HOURS = 1


def _reset_fingerprint(password_hash: str) -> str:
    import hashlib

    return hashlib.sha256(password_hash.encode("utf-8")).hexdigest()[:16]


@router.post("/forgot-password")
async def crm_forgot_password(
    payload: CrmForgotPasswordRequest,
    request: Request,
    db: Database = Depends(get_db),
    _rate_limit: None = Depends(rate_limit(max_requests=3, window_seconds=60)),
) -> dict[str, bool]:
    """Отправляет ссылку для сброса пароля. Не раскрывает, существует ли аккаунт."""
    settings = request.app.state.settings
    email = payload.email.strip()

    async with db.async_session() as session:
        stmt = select(User).where(func.lower(User.email) == email.lower())
        user = (await session.execute(stmt)).scalar_one_or_none()

    # Аккаунты без пароля (созданные через OAuth или авто-созданные оплатой) —
    # восстановление для них это первичная установка пароля, разрешаем.
    if user is None:
        return {"ok": True}

    token = create_access_token(
        {"purpose": "pwd_reset", "user_id": user.id, "fp": _reset_fingerprint(user.password_hash)},
        settings.secret_key,
        expires_delta_hours=RESET_TOKEN_TTL_HOURS,
    )
    reset_url = f"{settings.crm_frontend_url.rstrip('/')}/#/reset?token={quote(token)}"

    try:
        await send_password_reset(settings, to=user.email, reset_url=reset_url)
    except MailerNotConfigured:
        logger.error("Password reset requested but SMTP is not configured")
        raise HTTPException(status_code=503, detail="Отправка писем временно недоступна. Напишите в поддержку.")
    except Exception:
        logger.exception("Failed to send password reset email to user %s", user.id)
        raise HTTPException(status_code=502, detail="Не удалось отправить письмо. Попробуйте позже.")

    logger.info("Password reset email sent to user %s", user.id)
    return {"ok": True}


@router.post("/reset-password")
async def crm_reset_password(
    payload: CrmResetPasswordRequest,
    request: Request,
    db: Database = Depends(get_db),
    _rate_limit: None = Depends(rate_limit(max_requests=5, window_seconds=60)),
) -> dict[str, bool]:
    settings = request.app.state.settings
    data = decode_access_token(payload.token, settings.secret_key)
    if data is None or data.get("purpose") != "pwd_reset" or not isinstance(data.get("user_id"), int):
        raise HTTPException(status_code=400, detail="Ссылка недействительна или истекла. Запросите восстановление ещё раз.")

    async with db.async_session() as session:
        user = await session.get(User, data["user_id"])
        if user is None or not user.is_active:
            raise HTTPException(status_code=400, detail="Ссылка недействительна или истекла. Запросите восстановление ещё раз.")
        # Отпечаток пароля делает токен одноразовым: после смены пароля старая ссылка не работает.
        if data.get("fp") != _reset_fingerprint(user.password_hash):
            raise HTTPException(status_code=400, detail="Ссылка уже использована. Запросите восстановление ещё раз.")
        user.password_hash = hash_password(payload.password)
        await session.commit()

    logger.info("Password reset completed for user %s", user.id)
    return {"ok": True}
