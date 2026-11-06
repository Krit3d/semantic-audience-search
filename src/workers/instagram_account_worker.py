import asyncio
import logging
import signal
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import or_, select

from src.api.services.bridgit_client import BridgitAPIError, BridgitClient
from src.api.services.instagram_dialogs import restore_instagram_dialogs
from src.config.config import Settings, load_settings
from src.db.database import Database
from src.db.models import UserInstagramAccount

logger = logging.getLogger(__name__)

_ACTION_STATUSES = {
    "ok",
    "bad_password",
    "rate_limit_error",
    "not_logged_in",
    "not_logged_in_bad",
    "email_code",
}
_KNOWN_STATUSES = _ACTION_STATUSES | {"needcheck"}


class InstagramAccountWorker:
    def __init__(
        self,
        db: Database,
        settings: Settings,
        client: BridgitClient | None = None,
        batch_size: int = 20,
    ) -> None:
        self._db = db
        self._settings = settings
        self._batch_size = batch_size
        self._stop_event = asyncio.Event()
        self._client = client or BridgitClient(
            api_key=settings.bridgit_api_key or "",
            base_url=settings.bridgit_base_url,
            timeout=settings.bridgit_http_timeout_s,
            get_retries=settings.bridgit_get_retries,
        )

    async def start(self) -> None:
        if not self._settings.bridgit_api_key:
            logger.error("Instagram account worker is disabled: Bridgit is not configured")
            return
        tasks = [
            asyncio.create_task(self._poll_loop()),
            asyncio.create_task(self._sync_loop()),
        ]
        try:
            await self._stop_event.wait()
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            await self._client.aclose()

    async def stop(self) -> None:
        self._stop_event.set()

    async def _poll_loop(self) -> None:
        while not self._stop_event.is_set():
            started = asyncio.get_running_loop().time()
            try:
                processed = await self.poll_due_accounts()
                logger.info("Instagram poll completed processed=%s", processed)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Instagram poll iteration failed")
            elapsed = asyncio.get_running_loop().time() - started
            delay = max(1.0, self._settings.bridgit_account_poll_interval_s - elapsed)
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=delay)
            except asyncio.TimeoutError:
                pass

    async def _sync_loop(self) -> None:
        while not self._stop_event.is_set():
            started = asyncio.get_running_loop().time()
            try:
                synced = await self.sync_accounts()
                logger.info("Instagram daily sync completed synced=%s", synced)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Instagram daily sync failed")
            elapsed = asyncio.get_running_loop().time() - started
            delay = max(60.0, self._settings.bridgit_account_sync_interval_s - elapsed)
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=delay)
            except asyncio.TimeoutError:
                pass

    async def poll_due_accounts(self, now: datetime | None = None) -> int:
        current_time = now or datetime.now(timezone.utc)
        claims = await self._claim_due_accounts(current_time)
        processed = 0
        for account_id, lease_owner in claims:
            await self._poll_claimed_account(account_id, lease_owner)
            processed += 1
        return processed

    async def _claim_due_accounts(self, now: datetime) -> list[tuple[int, str]]:
        async with self._db.async_session() as session:
            async with session.begin():
                stmt = (
                    select(UserInstagramAccount)
                    .where(UserInstagramAccount.deleted_at.is_(None))
                    .where(UserInstagramAccount.status.in_(["in_queue", "needcheck"]))
                    .where(UserInstagramAccount.next_poll_at.is_not(None))
                    .where(UserInstagramAccount.next_poll_at <= now)
                    .where(or_(
                        UserInstagramAccount.lease_expires_at.is_(None),
                        UserInstagramAccount.lease_expires_at <= now,
                    ))
                    .order_by(UserInstagramAccount.next_poll_at.asc())
                    .limit(self._batch_size)
                    .with_for_update(skip_locked=True)
                )
                accounts = list((await session.execute(stmt)).scalars().all())
                claims: list[tuple[int, str]] = []
                for account in accounts:
                    lease_owner = uuid.uuid4().hex
                    account.lease_owner = lease_owner
                    account.lease_expires_at = now + timedelta(seconds=self._settings.bridgit_account_worker_lease_s)
                    claims.append((account.id, lease_owner))
                return claims

    async def _poll_claimed_account(self, account_id: int, lease_owner: str) -> None:
        async with self._db.async_session() as session:
            account = await session.get(UserInstagramAccount, account_id)
            if account is None or account.lease_owner != lease_owner or account.deleted_at is not None:
                return
            login = account.normalized_login
        try:
            data = await self._client.get_account_status(login)
            result = data.get("result")
            if not isinstance(result, str) or result not in _KNOWN_STATUSES:
                raise BridgitAPIError("Unknown Instagram account status")
        except BridgitAPIError as error:
            await self._handle_poll_error(account_id, lease_owner, error)
            return
        now = datetime.now(timezone.utc)
        async with self._db.async_session() as session:
            async with session.begin():
                account = await session.get(UserInstagramAccount, account_id, with_for_update=True)
                if account is None or account.lease_owner != lease_owner or account.deleted_at is not None:
                    return
                self.apply_status(account, result, now, self._settings)
                if result == "ok":
                    await restore_instagram_dialogs(session, account)
        logger.info("Instagram status updated account_id=%s result=%s", account_id, result)

    @staticmethod
    def apply_status(
        account: UserInstagramAccount,
        result: str,
        now: datetime,
        settings: Settings,
    ) -> None:
        if result not in _KNOWN_STATUSES:
            raise ValueError("Unknown Instagram account status")
        account.last_polled_at = now
        account.remote_status = result
        account.lease_owner = None
        account.lease_expires_at = None
        account.last_error_code = None if result in {"ok", "needcheck"} else result
        if result == "needcheck":
            account.status = "needcheck"
            account.next_poll_at = now + timedelta(seconds=settings.bridgit_account_poll_interval_s)
            started = account.confirmation_started_at
            if started is not None and started.tzinfo is None:
                started = started.replace(tzinfo=timezone.utc)
            if (
                started is not None
                and now - started > timedelta(seconds=settings.bridgit_account_stuck_after_s)
                and account.stuck_warning_sent_at is None
            ):
                account.stuck_warning_sent_at = now
                logger.warning("Instagram confirmation is stuck account_id=%s", account.id)
            return
        account.status = result
        account.next_poll_at = None
        if result == "ok":
            account.stuck_warning_sent_at = None

    async def _handle_poll_error(self, account_id: int, lease_owner: str, error: BridgitAPIError) -> None:
        now = datetime.now(timezone.utc)
        async with self._db.async_session() as session:
            async with session.begin():
                account = await session.get(UserInstagramAccount, account_id, with_for_update=True)
                if account is None or account.lease_owner != lease_owner or account.deleted_at is not None:
                    return
                account.last_polled_at = now
                account.last_error_code = "timeout" if error.status_code == 504 else "poll_failed"
                account.next_poll_at = now + timedelta(seconds=self._settings.bridgit_account_poll_interval_s)
                account.lease_owner = None
                account.lease_expires_at = None
        logger.warning("Instagram poll failed account_id=%s status=%s", account_id, error.status_code)

    async def sync_accounts(self) -> int:
        data = await self._client.get_accounts()
        remote_accounts = data.get("accounts")
        if not isinstance(remote_accounts, list):
            raise BridgitAPIError("Invalid account synchronization payload")
        remote_by_login: dict[str, dict[str, Any]] = {}
        for item in remote_accounts:
            if not isinstance(item, dict) or not isinstance(item.get("login"), str):
                continue
            normalized = item["login"].strip().lstrip("@").lower()
            if normalized:
                remote_by_login[normalized] = item
        now = datetime.now(timezone.utc)
        synced = 0
        async with self._db.async_session() as session:
            async with session.begin():
                stmt = select(UserInstagramAccount).where(UserInstagramAccount.deleted_at.is_(None))
                local_accounts = list((await session.execute(stmt)).scalars().all())
                candidates: dict[str, list[UserInstagramAccount]] = {}
                for account in local_accounts:
                    if account.normalized_login in remote_by_login:
                        candidates.setdefault(account.normalized_login, []).append(account)
                for normalized, matches in candidates.items():
                    if len(matches) != 1:
                        logger.warning("Instagram sync skipped ambiguous login")
                        continue
                    account = matches[0]
                    remote = remote_by_login[normalized]
                    self.apply_sync(account, remote, now)
                    synced += 1
        return synced

    @staticmethod
    def apply_sync(account: UserInstagramAccount, remote: dict[str, Any], now: datetime) -> None:
        billing = remote.get("billing")
        promo = remote.get("promo")
        remote_status = remote.get("status")
        account.billing = billing if isinstance(billing, str) else None
        account.promo = promo if isinstance(promo, str) else None
        account.remote_status = remote_status if isinstance(remote_status, str) else None
        account.last_synced_at = now
        protected = {"bad_password", "not_logged_in", "not_logged_in_bad", "email_code", "rate_limit_error"}
        if account.status in protected or account.status not in {"in_queue", "needcheck", "ok", "error"}:
            return
        if isinstance(remote_status, str) and remote_status in _KNOWN_STATUSES:
            account.status = remote_status
            account.last_error_code = None if remote_status in {"ok", "needcheck"} else remote_status
            account.next_poll_at = None if remote_status in _ACTION_STATUSES else account.next_poll_at


async def main() -> None:
    settings = load_settings()
    db = Database(settings.db_url)
    await db.init_db()
    worker = InstagramAccountWorker(db, settings)
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, lambda: asyncio.create_task(worker.stop()))
        except (NotImplementedError, RuntimeError):
            pass
    try:
        await worker.start()
    finally:
        await db.close()


if __name__ == "__main__":
    asyncio.run(main())
