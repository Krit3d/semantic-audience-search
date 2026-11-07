import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.instagram_schemas import InstagramAccountDeleteResponse, SenderAccountResponse
from src.api.services.bridgit_client import BridgitAPIError, BridgitClient
from src.api.services.communication_domain import (
    handle_sender_unavailable,
    lock_user,
    sync_legacy_pool,
)
from src.api.services.instagram_accounts import InstagramAccountService, InstagramAccountServiceError
from src.api.services.instagram_password_cipher import InstagramPasswordCipher
from src.config.config import Settings
from src.db.database import Database
from src.db.models import Brand, SenderAccount, UserInstagramAccount

logger = logging.getLogger(__name__)

_ACTION_BY_STATUS = {
    "bad_password": "password",
    "rate_limit_error": "instagram_notification",
    "not_logged_in": "two_factor",
    "not_logged_in_bad": "two_factor",
    "email_code": "email_code",
}


class SenderAccountService:
    def __init__(self, db: Database, settings: Settings) -> None:
        self._db = db
        self._settings = settings

    def _client(self) -> BridgitClient:
        if not self._settings.bridgit_api_key:
            raise InstagramAccountServiceError(503, "bridgit_not_configured", "Интеграция Instagram временно недоступна")
        return BridgitClient(
            api_key=self._settings.bridgit_api_key,
            base_url=self._settings.bridgit_base_url,
            timeout=self._settings.bridgit_http_timeout_s,
            get_retries=self._settings.bridgit_get_retries,
        )

    def _cipher(self) -> InstagramPasswordCipher:
        if not self._settings.bridgit_encryption_key:
            raise InstagramAccountServiceError(503, "encryption_not_configured", "Шифрование Instagram не настроено")
        try:
            return InstagramPasswordCipher.from_base64(self._settings.bridgit_encryption_key)
        except ValueError:
            raise InstagramAccountServiceError(503, "encryption_not_configured", "Шифрование Instagram не настроено") from None

    @staticmethod
    def _normalize_login(login: str) -> str:
        return login.strip().lstrip("@").lower()

    @staticmethod
    def _response(account: SenderAccount) -> SenderAccountResponse:
        return SenderAccountResponse(
            id=account.id,
            login=account.login,
            brand_id=account.brand_id,
            country=account.country,
            status=account.status,
            last_error_code=account.last_error_code,
            billing=account.billing,
            promo=account.promo,
            remote_status=account.remote_status,
            action_required=_ACTION_BY_STATUS.get(account.status),
            stuck=account.status == "needcheck" and account.stuck_warning_sent_at is not None,
            created_at=account.created_at,
            updated_at=account.updated_at,
            platform=account.platform,
            provider=account.provider,
            rotation_enabled=account.rotation_enabled,
        )

    @staticmethod
    async def _owned_brand(session: AsyncSession, user_id: int, brand_id: int) -> Brand:
        brand = await session.get(Brand, brand_id)
        if brand is None or brand.user_id != user_id:
            raise InstagramAccountServiceError(404, "brand_not_found", "Бренд не найден", "brand_id")
        return brand

    @staticmethod
    async def _owned_account(
        session: AsyncSession,
        user_id: int,
        brand_id: int,
        account_id: int,
        for_update: bool = False,
    ) -> SenderAccount:
        stmt = select(SenderAccount).where(
            SenderAccount.id == account_id,
            SenderAccount.user_id == user_id,
            or_(SenderAccount.brand_id == brand_id, SenderAccount.brand_id.is_(None)),
            SenderAccount.deleted_at.is_(None),
        )
        if for_update:
            stmt = stmt.with_for_update()
        account = (await session.execute(stmt)).scalar_one_or_none()
        if account is None:
            raise InstagramAccountServiceError(404, "account_not_found", "Аккаунт не найден")
        return account

    async def list_accounts(self, user_id: int, brand_id: int) -> list[SenderAccountResponse]:
        async with self._db.async_session() as session:
            async with session.begin():
                await self._owned_brand(session, user_id, brand_id)
                await sync_legacy_pool(session, user_id)
                accounts = list((await session.execute(
                    select(SenderAccount)
                    .where(
                        SenderAccount.user_id == user_id,
                        or_(SenderAccount.brand_id == brand_id, SenderAccount.brand_id.is_(None)),
                        SenderAccount.deleted_at.is_(None),
                    )
                    .order_by(SenderAccount.created_at.asc(), SenderAccount.id.asc()),
                )).scalars().all())
                return [self._response(account) for account in accounts]

    async def get_account(self, user_id: int, brand_id: int, account_id: int) -> SenderAccountResponse:
        async with self._db.async_session() as session:
            await self._owned_brand(session, user_id, brand_id)
            account = await self._owned_account(session, user_id, brand_id, account_id)
            return self._response(account)

    async def add_account(
        self,
        user_id: int,
        brand_id: int,
        login: str,
        password: str,
        country: str | None,
        two_factor: str | None,
    ) -> SenderAccountResponse:
        normalized_login = self._normalize_login(login)
        ciphertext, nonce = self._cipher().encrypt(password)
        now = datetime.now(timezone.utc)
        try:
            async with self._db.async_session() as session:
                async with session.begin():
                    await self._owned_brand(session, user_id, brand_id)
                    await lock_user(session, user_id)
                    await sync_legacy_pool(session, user_id)
                    existing = await session.scalar(
                        select(SenderAccount).where(
                            SenderAccount.user_id == user_id,
                            SenderAccount.platform == "instagram",
                            SenderAccount.normalized_login == normalized_login,
                        ),
                    )
                    if existing is not None and existing.deleted_at is None:
                        raise InstagramAccountServiceError(409, "already1", "Этот профиль уже добавлен вами", "login")
                    other_user_account = await session.scalar(
                        select(SenderAccount.id).where(
                            SenderAccount.platform == "instagram",
                            SenderAccount.normalized_login == normalized_login,
                            SenderAccount.deleted_at.is_(None),
                            SenderAccount.user_id != user_id,
                        ),
                    )
                    legacy_other_user = await session.scalar(
                        select(UserInstagramAccount.id).where(
                            UserInstagramAccount.normalized_login == normalized_login,
                            UserInstagramAccount.deleted_at.is_(None),
                            UserInstagramAccount.user_id != user_id,
                        ),
                    )
                    if other_user_account is not None or legacy_other_user is not None:
                        raise InstagramAccountServiceError(
                            409,
                            "already2",
                            "Этот профиль уже закреплён за другим пользователем",
                            "login",
                        )
                    async with self._client() as client:
                        await client.add_account(normalized_login, password, two_factor, country)
                    account = existing or SenderAccount(
                        user_id=user_id,
                        platform="instagram",
                        provider="bridgit",
                        normalized_login=normalized_login,
                    )
                    account.brand_id = brand_id
                    account.login = login.strip()
                    account.normalized_login = normalized_login
                    account.country = country
                    account.password_ciphertext = ciphertext
                    account.password_nonce = nonce
                    account.status = "in_queue"
                    account.last_error_code = None
                    account.confirmation_started_at = now
                    account.last_polled_at = None
                    account.next_poll_at = now + timedelta(seconds=self._settings.bridgit_account_poll_interval_s)
                    account.deleted_at = None
                    account.stuck_warning_sent_at = None
                    account.lease_owner = None
                    account.lease_expires_at = None
                    account.rotation_enabled = True
                    session.add(account)
                    await session.flush()
                    await session.refresh(account)
                    response = self._response(account)
            logger.info("Sender account queued user_id=%s brand_id=%s account_id=%s", user_id, brand_id, response.id)
            return response
        except BridgitAPIError as error:
            raise InstagramAccountService._translate_bridgit_error(error) from None
        except IntegrityError:
            raise InstagramAccountServiceError(
                409,
                "already2",
                "Этот профиль уже закреплён за другим пользователем",
                "login",
            ) from None

    async def confirm_account(
        self,
        user_id: int,
        brand_id: int,
        account_id: int,
        password: str | None,
        two_factor: str | None,
    ) -> SenderAccountResponse:
        return await self._update_account(user_id, brand_id, account_id, password, two_factor)

    async def resume_account(self, user_id: int, brand_id: int, account_id: int) -> SenderAccountResponse:
        return await self._update_account(user_id, brand_id, account_id, None, None)

    async def _update_account(
        self,
        user_id: int,
        brand_id: int,
        account_id: int,
        password: str | None,
        two_factor: str | None,
    ) -> SenderAccountResponse:
        try:
            async with self._db.async_session() as session:
                async with session.begin():
                    await self._owned_brand(session, user_id, brand_id)
                    account = await self._owned_account(session, user_id, brand_id, account_id, for_update=True)
                    actual_password = password
                    if actual_password is None:
                        if account.password_ciphertext is None or account.password_nonce is None:
                            raise InstagramAccountServiceError(400, "password_required", "Введите новый пароль", "password")
                        actual_password = self._cipher().decrypt(account.password_ciphertext, account.password_nonce)
                    async with self._client() as client:
                        await client.update_account(account.normalized_login, actual_password, two_factor)
                    if password is not None:
                        account.password_ciphertext, account.password_nonce = self._cipher().encrypt(password)
                    now = datetime.now(timezone.utc)
                    account.status = "in_queue"
                    account.last_error_code = None
                    account.confirmation_started_at = now
                    account.next_poll_at = now + timedelta(seconds=self._settings.bridgit_account_poll_interval_s)
                    account.stuck_warning_sent_at = None
                    account.lease_owner = None
                    account.lease_expires_at = None
                    await session.flush()
                    await session.refresh(account)
                    response = self._response(account)
            logger.info("Sender account update queued user_id=%s account_id=%s", user_id, account_id)
            return response
        except BridgitAPIError as error:
            raise InstagramAccountService._translate_bridgit_error(error) from None
        except ValueError:
            raise InstagramAccountServiceError(
                400,
                "password_required",
                "Сохранённый пароль недоступен; введите новый пароль",
                "password",
            ) from None

    async def delete_account(
        self,
        user_id: int,
        brand_id: int,
        account_id: int,
    ) -> InstagramAccountDeleteResponse:
        try:
            async with self._db.async_session() as session:
                async with session.begin():
                    await self._owned_brand(session, user_id, brand_id)
                    account = await self._owned_account(session, user_id, brand_id, account_id, for_update=True)
                    active_count = await session.scalar(
                        select(func.count(SenderAccount.id)).where(
                            SenderAccount.user_id == user_id,
                            SenderAccount.deleted_at.is_(None),
                        ),
                    )
                    async with self._client() as client:
                        await client.remove_account(account.normalized_login)
                    account.status = "deleted"
                    account.deleted_at = datetime.now(timezone.utc)
                    account.password_ciphertext = None
                    account.password_nonce = None
                    account.next_poll_at = None
                    account.lease_owner = None
                    account.lease_expires_at = None
                    await handle_sender_unavailable(session, account, "deleted")
                    return InstagramAccountDeleteResponse(
                        status="deleted",
                        id=account.id,
                        login=account.login,
                        was_last_account=active_count == 1,
                    )
        except BridgitAPIError as error:
            raise InstagramAccountService._translate_bridgit_error(error) from None
