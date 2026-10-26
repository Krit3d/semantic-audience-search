import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import String, delete, func, or_, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from src.api.dependencies import get_current_user, get_db, require_admin
from src.api.schemas import CancelSubscriptionRequest, PublicCheckoutRequest
from src.api.services.cloudpayments_signature import verify_signature
from src.db.database import Database
from src.db.models import PaymentEvent, SubscriptionPlan, User
from src.utils.security import verify_password

logger = logging.getLogger(__name__)
MAX_WEBHOOK_BODY = 1 * 1024 * 1024

router = APIRouter(prefix="/billing", tags=["Billing"])

WebhookEvent = Literal["pay", "fail", "recurrent", "cancel"]
SUCCESS_EVENTS = {"pay", "recurrent"}
CLOSING_EVENTS = {"fail", "cancel"}


async def _read_body(request: Request) -> bytes:
    try:
        declared_length = int(request.headers.get("content-length", "0") or 0)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid Content-Length")
    if declared_length < 0:
        raise HTTPException(status_code=400, detail="Invalid Content-Length")
    if declared_length > MAX_WEBHOOK_BODY:
        raise HTTPException(status_code=413, detail="Webhook body too large")
    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_WEBHOOK_BODY:
            raise HTTPException(status_code=413, detail="Webhook body too large")
        chunks.append(chunk)
    return b"".join(chunks)


def _ok() -> dict[str, int]:
    return {"code": 0}


def _first(payload: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = payload.get(key)
        if value is None or isinstance(value, (dict, list)):
            continue
        text = str(value).strip()
        if text:
            return text
    return None


def _extract_amount(payload: dict[str, Any]) -> Decimal | None:
    raw = _first(payload, "Amount", "amount")
    if raw is None:
        return None
    try:
        return Decimal(raw.replace(",", ".").replace(" ", ""))
    except (InvalidOperation, AttributeError):
        return None


def _extract_plan_name(payload: dict[str, Any]) -> str | None:
    data = payload.get("Data") or payload.get("data")
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except ValueError:
            return None
    if isinstance(data, dict):
        plan = data.get("plan") or data.get("planName")
        if plan is not None and str(plan).strip():
            return str(plan).strip()
    return None


def _extract_data_email(payload: dict[str, Any]) -> str | None:
    """Email, переданный нами в data при публичной покупке без регистрации."""
    data = payload.get("Data") or payload.get("data")
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except ValueError:
            return None
    if isinstance(data, dict):
        email = data.get("email")
        if email is not None and str(email).strip():
            return str(email).strip()
    return None


def _event_key_for_event(event: str, payload: dict[str, Any]) -> str:
    transaction_id = _first(payload, "TransactionId", "PaymentId")
    if transaction_id:
        return f"cp|{event}|{transaction_id}"
    subscription_id = _first(payload, "SubscriptionId")
    if subscription_id:
        return f"cp|{event}|{subscription_id}"
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode("utf-8")).hexdigest()
    return f"cp|{event}|{digest}"


async def _store_event(
    db: Database,
    *,
    event_key: str,
    user_id: int | None,
    event_type: str,
    amount: Decimal | None,
    currency: str | None,
    status: str | None,
    raw_payload: dict[str, Any],
) -> None:
    async with db.async_session() as session:
        session.add(
            PaymentEvent(
                event_key=event_key,
                user_id=user_id,
                event_type=event_type,
                amount=amount,
                currency=currency,
                status=status,
                raw_payload=raw_payload,
            )
        )
        await session.commit()


async def _find_user(session, payload: dict[str, Any]) -> User | None:
    account_id = _first(payload, "AccountId", "accountId")
    if account_id and account_id.isdigit():
        user = await session.get(User, int(account_id))
        if user is not None:
            return user
    subscription_id = _first(payload, "SubscriptionId")
    if subscription_id:
        stmt = select(User).where(User.gateway_subscription_id == subscription_id)
        user = (await session.execute(stmt)).scalar_one_or_none()
        if user is not None:
            return user
    email = _first(payload, "Email", "email")
    if email:
        stmt = select(User).where(func.lower(User.email) == email.lower())
        user = (await session.execute(stmt)).scalar_one_or_none()
        if user is not None:
            return user
        stmt = select(User).where(func.lower(User.billing_email) == email.lower())
        user = (await session.execute(stmt)).scalar_one_or_none()
        if user is not None:
            return user
    data_email = _extract_data_email(payload)
    if data_email and data_email.lower() != (email or "").lower():
        stmt = select(User).where(func.lower(User.email) == data_email.lower())
        user = (await session.execute(stmt)).scalar_one_or_none()
        if user is not None:
            return user
    phone = _first(payload, "Phone", "phone", "CardRecipientPhone")
    if phone:
        digits = "".join(ch for ch in phone if ch.isdigit())
        if digits:
            stmt = select(User).where(User.billing_phone.contains(digits[-10:]))
            user = (await session.execute(stmt)).scalar_one_or_none()
            if user is not None:
                return user
    return None


async def _find_plan(session, payload: dict[str, Any]) -> SubscriptionPlan | None:
    plan_name = _extract_plan_name(payload)
    if not plan_name:
        return None
    stmt = select(SubscriptionPlan).where(SubscriptionPlan.name == plan_name)
    return (await session.execute(stmt)).scalar_one_or_none()


@router.post("/cloudpayments/webhook/{event}")
async def cloudpayments_webhook(
    event: WebhookEvent,
    request: Request,
    db: Database = Depends(get_db),
) -> dict[str, int]:
    settings = request.app.state.settings

    raw_body = await _read_body(request)
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    signature = request.headers.get("Content-HMAC", "")
    secret = settings.cloudpayments_secret_key or ""
    if not verify_signature(raw_body, signature, secret):
        logger.warning("CloudPayments webhook: invalid signature, event=%s", event)
        try:
            await _store_event(
                db,
                event_key=_event_key_for_event(f"invalid_signature_{event}", payload),
                user_id=None,
                event_type="invalid_signature",
                amount=_extract_amount(payload),
                currency=_first(payload, "Currency"),
                status=event,
                raw_payload=payload,
            )
        except SQLAlchemyError:
            logger.exception("CloudPayments webhook: failed to store invalid_signature event")
        raise HTTPException(status_code=401, detail="Invalid signature")

    amount = _extract_amount(payload)
    currency = _first(payload, "Currency")
    logger.info("CloudPayments webhook: event=%s amount=%s", event, amount)

    try:
        async with db.async_session() as session:
            plan = await _find_plan(session, payload)
    except SQLAlchemyError:
        logger.exception("CloudPayments webhook: database error during plan lookup")
        raise HTTPException(status_code=500, detail="Database error")

    try:
        async with db.async_session() as session:
            user = await _find_user(session, payload)
    except SQLAlchemyError:
        logger.exception("CloudPayments webhook: database error during user lookup")
        raise HTTPException(status_code=500, detail="Database error")

    if user is None:
        email = _first(payload, "Email", "email") or _extract_data_email(payload)
        if not email:
            logger.warning("CloudPayments webhook: customer not found and no email, event=%s", event)
            await _store_event(
                db,
                event_key=_event_key_for_event(f"customer_not_found_{event}", payload),
                user_id=None,
                event_type="customer_not_found",
                amount=amount,
                currency=currency,
                status=event,
                raw_payload=payload,
            )
            return _ok()
        # Публичная покупка без регистрации: создаём аккаунт на email из платежа,
        # пароль пользователь задаёт позже через «Забыли пароль?».
        try:
            async with db.async_session() as session:
                user = User(email=email.strip(), password_hash="")
                session.add(user)
                await session.commit()
                user_id = user.id
            async with db.async_session() as session:
                user = await session.get(User, user_id)
            logger.info("CloudPayments webhook: account auto-created for %s (user %s)", email, user_id)
        except (IntegrityError, SQLAlchemyError):
            logger.exception("CloudPayments webhook: failed to auto-create user for payment")
            raise HTTPException(status_code=500, detail="Database error")
        if user is None:
            raise HTTPException(status_code=500, detail="Database error")

    if event in CLOSING_EVENTS:
        logger.info(
            "CloudPayments webhook: closing event %s for user %s, paid period preserved until %s",
            event, user.id, user.subscription_expires_at,
        )
        await _store_event(
            db,
            event_key=_event_key_for_event(event, payload),
            user_id=user.id,
            event_type=f"subscription_{event}" if event == "cancel" else "payment_failed",
            amount=amount,
            currency=currency,
            status=event,
            raw_payload=payload,
        )
        return _ok()

    if plan is None:
        logger.info("CloudPayments webhook: foreign plan, data=%r", payload.get("Data"))
        await _store_event(
            db,
            event_key=_event_key_for_event(f"foreign_plan_{event}", payload),
            user_id=user.id,
            event_type="foreign_plan",
            amount=amount,
            currency=currency,
            status=event,
            raw_payload=payload,
        )
        return _ok()

    min_amount = Decimal(settings.min_subscription_amount) / Decimal(100)
    if amount is None or amount < min_amount:
        logger.warning(
            "CloudPayments webhook: amount %s below minimum %s for user %s",
            amount, min_amount, user.id,
        )
        await _store_event(
            db,
            event_key=_event_key_for_event(f"rejected_low_{event}", payload),
            user_id=user.id,
            event_type="rejected_low_amount",
            amount=amount,
            currency=currency,
            status=event,
            raw_payload=payload,
        )
        return _ok()

    event_key = _event_key_for_event(event, payload)
    record = PaymentEvent(
        event_key=event_key,
        user_id=user.id,
        event_type="payment_success" if event == "pay" else "recurrent_success",
        amount=amount,
        currency=currency,
        status=event,
        raw_payload=payload,
    )
    try:
        async with db.async_session() as session:
            session.add(record)
            await session.commit()
    except IntegrityError:
        logger.info("CloudPayments webhook: duplicate event %s, skipping", event_key)
        return _ok()
    except SQLAlchemyError:
        logger.exception("CloudPayments webhook: database error during event insert")
        raise HTTPException(status_code=500, detail="Database error")

    now = datetime.now(timezone.utc)
    period_days = plan.period_days or settings.subscription_period_days
    candidate_expires = now + timedelta(days=period_days)
    current_expires = user.subscription_expires_at
    if current_expires is not None and current_expires.tzinfo is None:
        current_expires = current_expires.replace(tzinfo=timezone.utc)
    new_expires = max(current_expires, candidate_expires) if current_expires else candidate_expires

    subscription_id = _first(payload, "SubscriptionId")
    billing_email = _first(payload, "Email", "email")

    try:
        async with db.async_session() as session:
            db_user = await session.get(User, user.id)
            if db_user is None:
                raise SQLAlchemyError("User disappeared between lookup and update")
            db_user.subscription_status = "active"
            db_user.subscription_expires_at = new_expires
            db_user.plan_id = plan.id
            if subscription_id:
                db_user.gateway_subscription_id = subscription_id
            if billing_email:
                db_user.billing_email = billing_email
            await session.commit()
    except SQLAlchemyError:
        logger.exception("CloudPayments webhook: user update failed, releasing idempotency lock %s", event_key)
        try:
            async with db.async_session() as session:
                await session.execute(
                    delete(PaymentEvent).where(PaymentEvent.event_key == event_key)
                )
                await session.commit()
        except SQLAlchemyError:
            logger.exception("CloudPayments webhook: failed to release idempotency lock %s", event_key)
        raise HTTPException(status_code=500, detail="Database error")

    logger.info(
        "CloudPayments webhook: user %s activated until %s (plan=%s, event=%s)",
        user.id, new_expires.isoformat(), plan.name, event,
    )
    return _ok()


@router.get("/plans")
async def list_plans(
    db: Database = Depends(get_db),
) -> list[dict[str, Any]]:
    async with db.async_session() as session:
        stmt = select(SubscriptionPlan).order_by(SubscriptionPlan.price.asc().nulls_last())
        plans = (await session.execute(stmt)).scalars().all()
    return [
        {
            "id": plan.id,
            "name": plan.name,
            "price": str(plan.price) if plan.price is not None else None,
            "period_days": plan.period_days,
            "is_active": plan.is_active,
            "is_custom": plan.is_custom,
            "limits": plan.limits,
            "features": plan.features,
        }
        for plan in plans
    ]


@router.get("/subscription")
async def subscription_status(
    current_user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
) -> dict[str, Any]:
    """Прозрачный статус подписки: тариф, сроки, автопродление."""
    now = datetime.now(timezone.utc)
    expires = current_user.subscription_expires_at
    if expires is not None and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    is_active = (
        current_user.subscription_status == "active"
        and expires is not None
        and expires > now
    )

    plan_payload: dict[str, Any] | None = None
    started_at: datetime | None = None
    last_payment_at: datetime | None = None
    async with db.async_session() as session:
        if current_user.plan_id is not None:
            plan = await session.get(SubscriptionPlan, current_user.plan_id)
            if plan is not None:
                plan_payload = {
                    "id": plan.id,
                    "name": plan.name,
                    "price": str(plan.price) if plan.price is not None else None,
                    "period_days": plan.period_days,
                    "is_active": plan.is_active,
                    "is_custom": plan.is_custom,
                    "limits": plan.limits,
                    "features": plan.features,
                }
        stmt = select(
            func.min(PaymentEvent.received_at),
            func.max(PaymentEvent.received_at),
        ).where(
            PaymentEvent.user_id == current_user.id,
            PaymentEvent.event_type.in_(["payment_success", "recurrent_success"]),
        )
        started_at, last_payment_at = (await session.execute(stmt)).one()

    def _iso(value: datetime | None) -> str | None:
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()

    trial_used_at = current_user.trial_used_at
    if trial_used_at is not None and trial_used_at.tzinfo is None:
        trial_used_at = trial_used_at.replace(tzinfo=timezone.utc)

    return {
        "status": current_user.subscription_status,
        "is_active": bool(is_active),
        "plan": plan_payload,
        "registered_at": _iso(current_user.created_at),
        "started_at": _iso(started_at) or _iso(trial_used_at),
        "last_payment_at": _iso(last_payment_at),
        "expires_at": _iso(expires),
        "auto_renew": bool(current_user.gateway_subscription_id),
        "billing_email": current_user.billing_email,
        "trial_used": trial_used_at is not None,
        "trial_available": trial_used_at is None and current_user.subscription_status != "active",
    }


@router.post("/trial/activate")
async def activate_trial(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
) -> dict[str, Any]:
    """Активация бесплатного пробного периода (14 дней, без карты), один раз на аккаунт."""
    from src.utils.rate_limiter import check_rate_limit

    await check_rate_limit(request, max_requests=5, window_seconds=3600, key_extra=f"user:{current_user.id}")

    if current_user.subscription_status == "active" and current_user.subscription_expires_at:
        expires = current_user.subscription_expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires > datetime.now(timezone.utc):
            raise HTTPException(status_code=409, detail="У вас уже активна платная подписка")
    if current_user.trial_used_at is not None:
        raise HTTPException(status_code=409, detail="Пробный период уже использован")

    async with db.async_session() as session:
        trial_plan = (
            await session.execute(select(SubscriptionPlan).where(SubscriptionPlan.name == "trial"))
        ).scalar_one_or_none()
        period_days = (trial_plan.period_days if trial_plan else None) or 14

        db_user = await session.get(User, current_user.id)
        if db_user is None:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        now = datetime.now(timezone.utc)
        db_user.subscription_status = "trial"
        db_user.subscription_expires_at = now + timedelta(days=period_days)
        db_user.trial_used_at = now
        if trial_plan is not None:
            db_user.plan_id = trial_plan.id
        await session.commit()
        expires_iso = db_user.subscription_expires_at.isoformat()

    logger.info("Trial activated for user %s until %s", current_user.id, expires_iso)
    return {"ok": True, "expires_at": expires_iso, "period_days": period_days}


@router.get("/checkout-url")
async def checkout_url(
    plan: str = "basic",
    current_user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
) -> dict[str, str]:
    async with db.async_session() as session:
        stmt = select(SubscriptionPlan).where(SubscriptionPlan.name == plan)
        db_plan = (await session.execute(stmt)).scalar_one_or_none()
    if db_plan is None:
        raise HTTPException(status_code=404, detail="Тариф не найден")
    if not db_plan.is_active:
        raise HTTPException(status_code=409, detail="Тариф временно недоступен")
    if not db_plan.payment_url:
        raise HTTPException(status_code=503, detail="Форма оплаты не настроена")
    separator = "&" if "?" in db_plan.payment_url else "?"
    data_param = json.dumps({"plan": db_plan.name}, separators=(",", ":"))
    from urllib.parse import quote

    url = f"{db_plan.payment_url}{separator}accountId={current_user.id}&data={quote(data_param)}"
    logger.info("Checkout URL issued for user %s, plan %s", current_user.id, db_plan.name)
    return {"url": url}


@router.post("/public-checkout-url")
async def public_checkout_url(
    payload: PublicCheckoutRequest,
    request: Request,
    db: Database = Depends(get_db),
) -> dict[str, str]:
    """Покупка без регистрации: привязка платежа по email, аккаунт создаётся вебхуком."""
    from src.utils.rate_limiter import check_rate_limit

    await check_rate_limit(request, max_requests=10, window_seconds=3600)

    async with db.async_session() as session:
        stmt = select(SubscriptionPlan).where(SubscriptionPlan.name == payload.plan)
        db_plan = (await session.execute(stmt)).scalar_one_or_none()
    if db_plan is None:
        raise HTTPException(status_code=404, detail="Тариф не найден")
    if not db_plan.is_active:
        raise HTTPException(status_code=409, detail="Тариф временно недоступен")
    if db_plan.is_custom:
        raise HTTPException(status_code=409, detail="По этому тарифу нужно связаться с менеджером")
    if not db_plan.payment_url:
        raise HTTPException(status_code=503, detail="Форма оплаты не настроена")
    separator = "&" if "?" in db_plan.payment_url else "?"
    data_param = json.dumps({"plan": db_plan.name, "email": payload.email}, separators=(",", ":"))
    from urllib.parse import quote

    url = f"{db_plan.payment_url}{separator}email={quote(payload.email)}&data={quote(data_param)}"
    logger.info("Public checkout URL issued for plan %s", db_plan.name)
    return {"url": url}


@router.post("/cancel-subscription")
async def cancel_subscription(
    payload: CancelSubscriptionRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
) -> dict[str, Any]:
    """Отмена автопродления с подтверждением паролем. Доступ сохраняется до конца периода."""
    settings = request.app.state.settings

    if not current_user.password_hash:
        raise HTTPException(
            status_code=409,
            detail="У вашего аккаунта нет пароля (вход через VK ID / Yandex ID). Напишите на support@collabrama.ru — отключим автопродление вручную.",
        )
    if not verify_password(payload.password, current_user.password_hash):
        raise HTTPException(status_code=403, detail="Неверный пароль")
    if not current_user.gateway_subscription_id:
        raise HTTPException(status_code=409, detail="Автопродление уже отключено")
    if not settings.cloudpayments_public_id or not settings.cloudpayments_secret_key:
        raise HTTPException(status_code=503, detail="Отмена подписки временно недоступна. Напишите на support@collabrama.ru")

    import httpx

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                "https://api.cloudpayments.ru/subscriptions/cancel",
                auth=(settings.cloudpayments_public_id, settings.cloudpayments_secret_key),
                json={"Id": current_user.gateway_subscription_id},
            )
    except httpx.HTTPError:
        logger.exception("CloudPayments cancel: network error, user %s", current_user.id)
        raise HTTPException(status_code=502, detail="Платёжный шлюз недоступен. Попробуйте позже.")

    try:
        result = resp.json()
    except ValueError:
        result = {}

    if resp.status_code != 200 or not result.get("Success"):
        message = result.get("Message") if isinstance(result.get("Message"), str) else None
        logger.warning(
            "CloudPayments cancel failed: user=%s status=%s message=%s",
            current_user.id, resp.status_code, message,
        )
        raise HTTPException(
            status_code=502,
            detail=message or "Платёжный шлюз отклонил отмену. Попробуйте позже или напишите в поддержку.",
        )

    async with db.async_session() as session:
        db_user = await session.get(User, current_user.id)
        if db_user is not None:
            db_user.gateway_subscription_id = None
            await session.commit()

    logger.info("Subscription auto-renew cancelled for user %s", current_user.id)
    return {
        "ok": True,
        "expires_at": current_user.subscription_expires_at.isoformat() if current_user.subscription_expires_at else None,
    }


@router.get("/admin/payment-events")
async def admin_payment_events(
    email: str | None = None,
    phone: str | None = None,
    limit: int = 50,
    admin: User = Depends(require_admin),
    db: Database = Depends(get_db),
) -> list[dict[str, Any]]:
    limit = max(1, min(limit, 200))
    async with db.async_session() as session:
        stmt = (
            select(PaymentEvent, User.email)
            .outerjoin(User, PaymentEvent.user_id == User.id)
            .order_by(PaymentEvent.received_at.desc())
            .limit(limit)
        )
        if email:
            needle = email.strip().lower()
            stmt = stmt.where(
                or_(
                    func.lower(User.email).contains(needle),
                    func.lower(PaymentEvent.raw_payload.cast(String)).contains(needle),
                )
            )
        if phone:
            digits = "".join(ch for ch in phone if ch.isdigit())
            if digits:
                stmt = stmt.where(
                    or_(
                        User.billing_phone.contains(digits[-10:]),
                        PaymentEvent.raw_payload.cast(String).contains(digits[-10:]),
                    )
                )
        rows = (await session.execute(stmt)).all()
    return [
        {
            "id": event.id,
            "event_key": event.event_key,
            "user_id": event.user_id,
            "user_email": user_email,
            "event_type": event.event_type,
            "amount": str(event.amount) if event.amount is not None else None,
            "currency": event.currency,
            "status": event.status,
            "received_at": event.received_at.isoformat(),
            "raw_payload": event.raw_payload,
        }
        for event, user_email in rows
    ]
