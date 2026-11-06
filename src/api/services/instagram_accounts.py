import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from src.api.instagram_schemas import (
    InstagramAccountDeleteResponse,
    InstagramAccountResponse,
)
from src.api.services.bridgit_client import BridgitAPIError, BridgitClient
from src.api.services.instagram_dialogs import archive_instagram_dialogs
from src.api.services.instagram_password_cipher import InstagramPasswordCipher
from src.config.config import Settings
from src.db.database import Database
from src.db.models import Brand, User, UserInstagramAccount

logger = logging.getLogger(__name__)

_ACTION_BY_STATUS = {
    "bad_password": "password",
    "rate_limit_error": "instagram_notification",
    "not_logged_in": "two_factor",
    "not_logged_in_bad": "two_factor",
    "email_code": "email_code",
}


class InstagramAccountServiceError(RuntimeError):
    def __init__(self, status_code: int, code: str, message: str, field: str | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.field = field


class InstagramAccountService:
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
    def _response(account: UserInstagramAccount) -> InstagramAccountResponse:
        return InstagramAccountResponse(
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
        )

    @staticmethod
    def _translate_bridgit_error(error: BridgitAPIError) -> InstagramAccountServiceError:
        if error.result == "already1":
            return InstagramAccountServiceError(409, "already1", "Этот профиль уже добавлен вами", "login")
        if error.result == "already2":
            return InstagramAccountServiceError(409, "already2", "Этот профиль уже используется другой командой", "login")
        if error.field is not None:
            return InstagramAccountServiceError(400, "missed_params", f"Не заполнен параметр: {error.field}", error.field)
        if error.status_code == 504:
            return InstagramAccountServiceError(504, "bridgit_timeout", "Bridgit не ответил вовремя")
        return InstagramAccountServiceError(502, "bridgit_error", "Не удалось выполнить запрос к Bridgit")

    async def list_accounts(self, user_id: int) -> list[InstagramAccountResponse]:
        async with self._db.async_session() as session:
            stmt = (
                select(UserInstagramAccount)
                .where(UserInstagramAccount.user_id == user_id)
                .where(UserInstagramAccount.deleted_at.is_(None))
                .order_by(UserInstagramAccount.created_at.asc())
            )
            accounts = list((await session.execute(stmt)).scalars().all())
            return [self._response(account) for account in accounts]

    async def get_account(self, user_id: int, account_id: int) -> InstagramAccountResponse:
        async with self._db.async_session() as session:
            account = await self._owned_account(session, user_id, account_id)
            return self._response(account)

    async def add_account(
        self,
        user_id: int,
        login: str,
        password: str,
        country: str | None,
        two_factor: str | None,
        brand_id: int | None,
    ) -> InstagramAccountResponse:
        normalized_login = self._normalize_login(login)
        ciphertext, nonce = self._cipher().encrypt(password)
        now = datetime.now(timezone.utc)
        try:
            async with self._db.async_session() as session:
                async with session.begin():
                    await session.execute(select(User.id).where(User.id == user_id).with_for_update())
                    existing = await self._account_by_login(session, user_id, normalized_login)
                    if existing is not None and existing.deleted_at is None:
                        raise InstagramAccountServiceError(409, "already1", "Этот профиль уже добавлен вами", "login")
                    if brand_id is not None:
                        brand = await session.get(Brand, brand_id)
                        if brand is None or brand.user_id != user_id:
                            raise InstagramAccountServiceError(404, "brand_not_found", "Бренд не найден", "brand_id")
                        brand_account = await self._active_brand_account(session, brand_id)
                        if brand_account is not None and brand_account.id != (existing.id if existing else None):
                            raise InstagramAccountServiceError(409, "brand_account_exists", "Для бренда уже подключён Instagram-аккаунт", "brand_id")
                    async with self._client() as client:
                        await client.add_account(normalized_login, password, two_factor, country)
                    account = existing or UserInstagramAccount(user_id=user_id, normalized_login=normalized_login)
                    account.login = login.strip()
                    account.normalized_login = normalized_login
                    account.brand_id = brand_id
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
                    session.add(account)
                    await session.flush()
                    await session.refresh(account)
                    response = self._response(account)
            logger.info("Instagram account queued user_id=%s account_id=%s", user_id, response.id)
            return response
        except BridgitAPIError as error:
            raise self._translate_bridgit_error(error) from None
        except IntegrityError:
            raise InstagramAccountServiceError(409, "already1", "Этот профиль уже добавлен вами", "login") from None

    async def confirm_account(
        self,
        user_id: int,
        account_id: int,
        password: str | None,
        two_factor: str | None,
    ) -> InstagramAccountResponse:
        return await self._update_account(user_id, account_id, password, two_factor)

    async def resume_account(self, user_id: int, account_id: int) -> InstagramAccountResponse:
        return await self._update_account(user_id, account_id, None, None)

    async def _update_account(
        self,
        user_id: int,
        account_id: int,
        password: str | None,
        two_factor: str | None,
    ) -> InstagramAccountResponse:
        try:
            async with self._db.async_session() as session:
                async with session.begin():
                    account = await self._owned_account(session, user_id, account_id, for_update=True)
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
            logger.info("Instagram account update queued user_id=%s account_id=%s", user_id, account_id)
            return response
        except BridgitAPIError as error:
            raise self._translate_bridgit_error(error) from None
        except ValueError:
            raise InstagramAccountServiceError(400, "password_required", "Сохранённый пароль недоступен; введите новый пароль", "password") from None

    async def delete_account(self, user_id: int, account_id: int) -> InstagramAccountDeleteResponse:
        try:
            async with self._db.async_session() as session:
                async with session.begin():
                    account = await self._owned_account(session, user_id, account_id, for_update=True)
                    active_count = await session.scalar(
                        select(func.count(UserInstagramAccount.id))
                        .where(UserInstagramAccount.user_id == user_id)
                        .where(UserInstagramAccount.deleted_at.is_(None))
                    )
                    async with self._client() as client:
                        await client.remove_account(account.normalized_login)
                    now = datetime.now(timezone.utc)
                    await archive_instagram_dialogs(session, account, account.normalized_login)
                    account.status = "deleted"
                    account.deleted_at = now
                    account.password_ciphertext = None
                    account.password_nonce = None
                    account.next_poll_at = None
                    account.lease_owner = None
                    account.lease_expires_at = None
                    return InstagramAccountDeleteResponse(
                        status="deleted",
                        id=account.id,
                        login=account.login,
                        was_last_account=active_count == 1,
                    )
        except BridgitAPIError as error:
            raise self._translate_bridgit_error(error) from None

    @staticmethod
    async def _account_by_login(session, user_id: int, normalized_login: str) -> UserInstagramAccount | None:
        stmt = select(UserInstagramAccount).where(
            UserInstagramAccount.user_id == user_id,
            UserInstagramAccount.normalized_login == normalized_login,
        )
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def _active_brand_account(session, brand_id: int) -> UserInstagramAccount | None:
        stmt = select(UserInstagramAccount).where(
            UserInstagramAccount.brand_id == brand_id,
            UserInstagramAccount.deleted_at.is_(None),
        )
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def _owned_account(session, user_id: int, account_id: int, for_update: bool = False) -> UserInstagramAccount:
        stmt = select(UserInstagramAccount).where(
            UserInstagramAccount.id == account_id,
            UserInstagramAccount.user_id == user_id,
            UserInstagramAccount.deleted_at.is_(None),
        )
        if for_update:
            stmt = stmt.with_for_update()
        account = (await session.execute(stmt)).scalar_one_or_none()
        if account is None:
            raise InstagramAccountServiceError(404, "account_not_found", "Instagram-аккаунт не найден")
        return account
