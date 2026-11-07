import logging
from datetime import datetime, timezone

from sqlalchemy import func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models import (
    Account,
    ChannelIdentity,
    CreatorMessage,
    Deal,
    DealActivity,
    DealTask,
    SenderAccount,
    Thread,
    User,
    UserInstagramAccount,
)

logger = logging.getLogger(__name__)

OPEN_DEAL_STAGES = (1, 2, 3, 4, 5, 6)
RECONTACT_TASK_TITLE = "Связаться с автором через новый канал"


class CommunicationServiceError(RuntimeError):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def normalize_platform(platform: str) -> str:
    normalized = platform.strip().lower()
    if not normalized:
        raise CommunicationServiceError(400, "platform_required", "Не указана платформа канала")
    return normalized


def channel_status_for_sender(sender: SenderAccount) -> str:
    if sender.deleted_at is not None or sender.status == "deleted":
        return "deleted"
    if sender.status == "ok":
        return "active"
    if sender.status in {"in_queue", "needcheck"}:
        return "pending_verification"
    return "blocked"


async def lock_user(session: AsyncSession, user_id: int) -> None:
    await session.execute(select(User.id).where(User.id == user_id).with_for_update())


async def ensure_sender_account(
    session: AsyncSession,
    legacy: UserInstagramAccount,
) -> SenderAccount:
    sender = await session.scalar(
        select(SenderAccount).where(SenderAccount.legacy_account_id == legacy.id),
    )
    now = utcnow()
    if sender is None:
        conflicting = await session.scalar(
            select(SenderAccount).where(
                SenderAccount.platform == "instagram",
                SenderAccount.normalized_login == legacy.normalized_login,
                SenderAccount.deleted_at.is_(None),
                SenderAccount.user_id != legacy.user_id,
            ),
        )
        if conflicting is not None:
            raise CommunicationServiceError(
                409,
                "account_already_assigned",
                "Этот аккаунт уже закреплён за другим пользователем",
            )
        sender = SenderAccount(
            user_id=legacy.user_id,
            brand_id=legacy.brand_id,
            legacy_account_id=legacy.id,
            platform="instagram",
            provider="bridgit",
            login=legacy.login,
            normalized_login=legacy.normalized_login,
            created_at=legacy.created_at,
        )
        session.add(sender)
    sender.brand_id = legacy.brand_id
    sender.login = legacy.login
    sender.normalized_login = legacy.normalized_login
    sender.country = legacy.country
    sender.password_ciphertext = legacy.password_ciphertext
    sender.password_nonce = legacy.password_nonce
    sender.status = legacy.status
    sender.last_error_code = legacy.last_error_code
    sender.billing = legacy.billing
    sender.promo = legacy.promo
    sender.remote_status = legacy.remote_status
    sender.confirmation_started_at = legacy.confirmation_started_at
    sender.last_polled_at = legacy.last_polled_at
    sender.next_poll_at = legacy.next_poll_at
    sender.last_synced_at = legacy.last_synced_at
    sender.deleted_at = legacy.deleted_at
    sender.stuck_warning_sent_at = legacy.stuck_warning_sent_at
    sender.lease_owner = legacy.lease_owner
    sender.lease_expires_at = legacy.lease_expires_at
    sender.updated_at = now
    await session.flush()
    return sender


async def sync_legacy_pool(session: AsyncSession, user_id: int) -> None:
    legacy_accounts = list((await session.execute(
        select(UserInstagramAccount).where(UserInstagramAccount.user_id == user_id),
    )).scalars().all())
    for legacy in legacy_accounts:
        try:
            await ensure_sender_account(session, legacy)
        except CommunicationServiceError as error:
            logger.warning(
                "Legacy sender synchronization skipped user_id=%s legacy_account_id=%s code=%s",
                user_id,
                legacy.id,
                error.code,
            )


async def select_available_sender(
    session: AsyncSession,
    user_id: int,
    platform: str = "instagram",
    exclude_ids: frozenset[int] = frozenset(),
    assign: bool = True,
) -> SenderAccount | None:
    await sync_legacy_pool(session, user_id)
    normalized = normalize_platform(platform)
    conditions = [
        SenderAccount.user_id == user_id,
        SenderAccount.platform == normalized,
        SenderAccount.deleted_at.is_(None),
        SenderAccount.rotation_enabled.is_(True),
        SenderAccount.status == "ok",
    ]
    if exclude_ids:
        conditions.append(SenderAccount.id.notin_(exclude_ids))
    stmt = (
        select(SenderAccount)
        .where(*conditions)
        .order_by(SenderAccount.last_assigned_at.asc().nulls_first(), SenderAccount.id.asc())
        .limit(1)
    )
    if assign:
        stmt = stmt.with_for_update(skip_locked=True)
    sender = (await session.execute(stmt)).scalar_one_or_none()
    if sender is not None and assign:
        sender.last_assigned_at = utcnow()
        sender.updated_at = utcnow()
        await session.flush()
    return sender


async def has_working_sender(session: AsyncSession, user_id: int, platform: str = "instagram") -> bool:
    sender = await select_available_sender(session, user_id, platform, assign=False)
    return sender is not None


async def get_latest_deal(
    session: AsyncSession,
    user_id: int,
    author_account_id: int,
) -> Deal | None:
    return await session.scalar(
        select(Deal)
        .where(
            Deal.user_id == user_id,
            Deal.account_id == author_account_id,
            Deal.stage.in_(OPEN_DEAL_STAGES),
        )
        .order_by(Deal.updated_at.desc(), Deal.id.desc())
        .limit(1),
    )


async def get_current_channel(
    session: AsyncSession,
    user_id: int,
    author_account_id: int,
    platform: str,
) -> ChannelIdentity | None:
    return await session.scalar(
        select(ChannelIdentity)
        .where(
            ChannelIdentity.user_id == user_id,
            ChannelIdentity.author_account_id == author_account_id,
            ChannelIdentity.platform == normalize_platform(platform),
            ChannelIdentity.deleted_at.is_(None),
            ChannelIdentity.status != "replaced",
        )
        .order_by(ChannelIdentity.updated_at.desc(), ChannelIdentity.id.desc())
        .limit(1),
    )


async def get_working_channel(
    session: AsyncSession,
    user_id: int,
    author_account_id: int,
    platform: str,
) -> ChannelIdentity | None:
    return await session.scalar(
        select(ChannelIdentity)
        .join(SenderAccount, SenderAccount.id == ChannelIdentity.sender_account_id)
        .where(
            ChannelIdentity.user_id == user_id,
            ChannelIdentity.author_account_id == author_account_id,
            ChannelIdentity.platform == normalize_platform(platform),
            ChannelIdentity.status == "active",
            ChannelIdentity.deleted_at.is_(None),
            SenderAccount.deleted_at.is_(None),
            SenderAccount.status == "ok",
        )
        .order_by(ChannelIdentity.updated_at.desc(), ChannelIdentity.id.desc())
        .limit(1),
    )


async def get_or_create_thread(
    session: AsyncSession,
    channel: ChannelIdentity,
    deal: Deal | None,
) -> Thread:
    thread = await session.scalar(select(Thread).where(Thread.channel_identity_id == channel.id))
    if thread is None:
        thread = Thread(
            user_id=channel.user_id,
            channel_identity_id=channel.id,
            author_account_id=channel.author_account_id,
            deal_id=deal.id if deal is not None else None,
            is_read_only=channel.status != "active",
        )
        session.add(thread)
        await session.flush()
    elif deal is not None and thread.deal_id is None:
        thread.deal_id = deal.id
        thread.updated_at = utcnow()
        await session.flush()
    return thread


async def ensure_open_task(session: AsyncSession, deal: Deal) -> None:
    await session.execute(
        pg_insert(DealTask)
        .values(user_id=deal.user_id, deal_id=deal.id, title=RECONTACT_TASK_TITLE)
        .on_conflict_do_nothing(
            index_elements=["deal_id", "title"],
            index_where=DealTask.completed_at.is_(None),
        ),
    )


async def add_activity(
    session: AsyncSession,
    *,
    event_key: str,
    deal: Deal,
    event_type: str,
    thread: Thread | None = None,
    channel: ChannelIdentity | None = None,
    message: CreatorMessage | None = None,
    message_id: int | None = None,
    description: str | None = None,
    from_stage: int | None = None,
    to_stage: int | None = None,
    created_at: datetime | None = None,
) -> None:
    await session.execute(
        pg_insert(DealActivity)
        .values(
            event_key=event_key,
            user_id=deal.user_id,
            deal_id=deal.id,
            thread_id=thread.id if thread is not None else None,
            channel_identity_id=channel.id if channel is not None else None,
            message_id=message.id if message is not None else message_id,
            event_type=event_type,
            description=description,
            from_stage=from_stage,
            to_stage=to_stage,
            created_at=created_at or utcnow(),
        )
        .on_conflict_do_nothing(index_elements=["event_key"]),
    )


async def update_deal_thread(
    session: AsyncSession,
    deal: Deal,
    thread: Thread,
    channel: ChannelIdentity,
    state: str | None = None,
) -> None:
    last_contact = await session.scalar(
        select(func.max(CreatorMessage.created_at)).where(CreatorMessage.thread_id == thread.id),
    )
    deal.primary_thread_id = thread.id
    deal.last_contact_at = last_contact
    if state is not None:
        deal.communication_state = state
    elif channel.status == "active":
        deal.communication_state = "active"
    elif channel.status in {"blocked", "deleted"}:
        deal.communication_state = "interrupted"
    else:
        deal.communication_state = "no_channel"
    deal.updated_at = utcnow()
    if deal.communication_state in {"interrupted", "recontact_required"}:
        await ensure_open_task(session, deal)
    await session.flush()


async def create_channel(
    session: AsyncSession,
    *,
    user_id: int,
    author_account_id: int,
    sender: SenderAccount,
    deal: Deal | None,
) -> tuple[ChannelIdentity, Thread]:
    status = channel_status_for_sender(sender)
    channel = await session.scalar(
        select(ChannelIdentity).where(
            ChannelIdentity.user_id == user_id,
            ChannelIdentity.sender_account_id == sender.id,
            ChannelIdentity.author_account_id == author_account_id,
            ChannelIdentity.platform == sender.platform,
            ChannelIdentity.deleted_at.is_(None),
            ChannelIdentity.status != "replaced",
        ),
    )
    if channel is None:
        channel = ChannelIdentity(
            user_id=user_id,
            sender_account_id=sender.id,
            author_account_id=author_account_id,
            platform=sender.platform,
            status=status,
        )
        session.add(channel)
        await session.flush()
    else:
        channel.status = status
        channel.updated_at = utcnow()
        await session.flush()
    thread = await get_or_create_thread(session, channel, deal)
    thread.is_read_only = status != "active"
    if deal is not None:
        await update_deal_thread(session, deal, thread, channel)
    return channel, thread


async def replace_channel(
    session: AsyncSession,
    *,
    old_channel: ChannelIdentity,
    new_sender: SenderAccount,
    deal: Deal | None,
) -> tuple[ChannelIdentity, Thread]:
    new_channel, new_thread = await create_channel(
        session,
        user_id=old_channel.user_id,
        author_account_id=old_channel.author_account_id,
        sender=new_sender,
        deal=deal,
    )
    old_thread = await session.scalar(select(Thread).where(Thread.channel_identity_id == old_channel.id))
    old_channel.status = "replaced"
    old_channel.replaced_by_id = new_channel.id
    old_channel.updated_at = utcnow()
    if old_thread is not None:
        old_thread.is_read_only = True
        old_thread.updated_at = utcnow()
    deals = list((await session.execute(
        select(Deal).where(
            Deal.user_id == old_channel.user_id,
            Deal.account_id == old_channel.author_account_id,
            Deal.stage.in_(OPEN_DEAL_STAGES),
        ),
    )).scalars().all())
    for item in deals:
        await update_deal_thread(session, item, new_thread, new_channel, "recontact_required")
        if old_thread is not None:
            item.last_contact_at = await session.scalar(
                select(func.max(CreatorMessage.created_at)).where(
                    CreatorMessage.thread_id.in_([old_thread.id, new_thread.id]),
                ),
            )
        await add_activity(
            session,
            event_key=f"channel_replaced:{old_channel.id}:{new_channel.id}:{item.id}",
            deal=item,
            event_type="channel_replaced",
            thread=new_thread,
            channel=new_channel,
            description=f"Канал заменён на @{new_sender.normalized_login}. Этап сделки сохранён.",
            from_stage=item.stage,
            to_stage=item.stage,
        )
    await session.flush()
    return new_channel, new_thread


async def ensure_active_thread(
    session: AsyncSession,
    *,
    user_id: int,
    author_account: Account,
    deal: Deal | None,
    platform: str = "instagram",
) -> tuple[ChannelIdentity, Thread, SenderAccount]:
    normalized = normalize_platform(platform)
    await lock_user(session, user_id)
    working = await get_working_channel(session, user_id, author_account.id, normalized)
    if working is not None:
        thread = await get_or_create_thread(session, working, deal)
        sender = await session.get(SenderAccount, working.sender_account_id)
        if sender is None:
            raise CommunicationServiceError(409, "instagram_account_required", "Для общения требуется рабочий Instagram-аккаунт")
        if deal is not None:
            await update_deal_thread(session, deal, thread, working)
        return working, thread, sender
    current = await get_current_channel(session, user_id, author_account.id, normalized)
    excluded = frozenset({current.sender_account_id}) if current is not None else frozenset()
    sender = await select_available_sender(session, user_id, normalized, excluded)
    if sender is None:
        if deal is not None:
            deal.communication_state = "interrupted" if current is not None else "no_channel"
            deal.updated_at = utcnow()
            if current is not None:
                await ensure_open_task(session, deal)
            await session.flush()
        raise CommunicationServiceError(
            409,
            "instagram_account_required",
            "Для общения требуется рабочий Instagram-аккаунт",
        )
    if current is not None:
        return (*await replace_channel(session, old_channel=current, new_sender=sender, deal=deal), sender)
    channel, thread = await create_channel(
        session,
        user_id=user_id,
        author_account_id=author_account.id,
        sender=sender,
        deal=deal,
    )
    return channel, thread, sender


async def ensure_legacy_thread(
    session: AsyncSession,
    *,
    user_id: int,
    author_account_id: int,
    deal: Deal | None,
) -> Thread | None:
    target_deal = deal or await get_latest_deal(session, user_id, author_account_id)
    legacy_id = target_deal.instagram_account_id if target_deal is not None else None
    if legacy_id is None:
        legacy_id = await session.scalar(
            select(CreatorMessage.sender_instagram_account_id)
            .where(
                CreatorMessage.user_id == user_id,
                CreatorMessage.account_id == author_account_id,
                CreatorMessage.sender_instagram_account_id.is_not(None),
            )
            .order_by(CreatorMessage.created_at.desc(), CreatorMessage.id.desc())
            .limit(1),
        )
    if legacy_id is None:
        return None
    legacy = await session.get(UserInstagramAccount, legacy_id)
    if legacy is None or legacy.user_id != user_id:
        return None
    await lock_user(session, user_id)
    sender = await ensure_sender_account(session, legacy)
    channel = await get_current_channel(session, user_id, author_account_id, "instagram")
    if channel is None or channel.sender_account_id != sender.id:
        channel = await session.scalar(
            select(ChannelIdentity).where(
                ChannelIdentity.user_id == user_id,
                ChannelIdentity.sender_account_id == sender.id,
                ChannelIdentity.author_account_id == author_account_id,
                ChannelIdentity.platform == "instagram",
                ChannelIdentity.deleted_at.is_(None),
                ChannelIdentity.status != "replaced",
            ),
        )
    if channel is None:
        channel, thread = await create_channel(
            session,
            user_id=user_id,
            author_account_id=author_account_id,
            sender=sender,
            deal=target_deal,
        )
    else:
        thread = await get_or_create_thread(session, channel, target_deal)
    conditions = [
        CreatorMessage.user_id == user_id,
        CreatorMessage.account_id == author_account_id,
        CreatorMessage.sender_instagram_account_id == legacy.id,
        CreatorMessage.thread_id.is_(None),
    ]
    if target_deal is not None:
        conditions.append(or_(
            CreatorMessage.deal_id == target_deal.id,
            CreatorMessage.deal_id.is_(None),
        ))
    message_rows = (await session.execute(
        select(CreatorMessage.id, CreatorMessage.created_at).where(*conditions),
    )).all()
    if message_rows:
        message_ids = [row.id for row in message_rows]
        await session.execute(
            update(CreatorMessage)
            .where(CreatorMessage.id.in_(message_ids))
            .values(thread_id=thread.id, sender_account_id=sender.id),
        )
        await session.flush()
        for row in message_rows:
            if target_deal is not None:
                await add_activity(
                    session,
                    event_key=f"message:{row.id}",
                    deal=target_deal,
                    event_type="message",
                    thread=thread,
                    channel=channel,
                    message_id=row.id,
                    description=None,
                    created_at=row.created_at,
                )
    if target_deal is not None:
        await update_deal_thread(session, target_deal, thread, channel)
    return thread


async def record_outgoing_message(
    session: AsyncSession,
    *,
    message: CreatorMessage,
    channel: ChannelIdentity,
    thread: Thread,
    sender: SenderAccount,
    deal: Deal | None,
) -> None:
    message.thread_id = thread.id
    message.sender_account_id = sender.id
    message.delivery_status = "pending"
    await session.flush()
    if deal is None:
        return
    resumed = deal.communication_state in {"interrupted", "recontact_required"}
    deal.primary_thread_id = thread.id
    deal.last_contact_at = message.created_at
    deal.communication_state = "resumed" if resumed else "active"
    deal.updated_at = utcnow()
    await session.execute(
        update(DealTask)
        .where(DealTask.deal_id == deal.id, DealTask.completed_at.is_(None))
        .values(completed_at=utcnow()),
    )
    await add_activity(
        session,
        event_key=f"message:{message.id}",
        deal=deal,
        event_type="message",
        thread=thread,
        channel=channel,
        message=message,
        created_at=message.created_at,
    )
    if resumed:
        await add_activity(
            session,
            event_key=f"communication_resumed:{deal.id}:{message.id}",
            deal=deal,
            event_type="communication_resumed",
            thread=thread,
            channel=channel,
            message=message,
            description=f"Коммуникация возобновлена через @{sender.normalized_login}. Этап сделки сохранён.",
            from_stage=deal.stage,
            to_stage=deal.stage,
            created_at=message.created_at,
        )
    await session.flush()


async def record_stage_change(
    session: AsyncSession,
    deal: Deal,
    from_stage: int,
    to_stage: int,
) -> None:
    if from_stage == to_stage:
        return
    await add_activity(
        session,
        event_key=f"stage_changed:{deal.id}:{from_stage}:{to_stage}:{utcnow().timestamp()}",
        deal=deal,
        event_type="stage_changed",
        from_stage=from_stage,
        to_stage=to_stage,
        description=f"Этап сделки изменён: {from_stage} → {to_stage}",
    )


async def handle_sender_unavailable(
    session: AsyncSession,
    sender: SenderAccount,
    reason: str,
) -> None:
    if reason not in {"blocked", "deleted"}:
        raise ValueError("Unsupported channel loss reason")
    channels = list((await session.execute(
        select(ChannelIdentity).where(
            ChannelIdentity.sender_account_id == sender.id,
            ChannelIdentity.deleted_at.is_(None),
            ChannelIdentity.status != "replaced",
        ),
    )).scalars().all())
    for old_channel in channels:
        replacement = await select_available_sender(
            session,
            sender.user_id,
            old_channel.platform,
            frozenset({sender.id}),
        )
        old_thread = await session.scalar(select(Thread).where(Thread.channel_identity_id == old_channel.id))
        deals = list((await session.execute(
            select(Deal).where(
                Deal.user_id == old_channel.user_id,
                Deal.account_id == old_channel.author_account_id,
                Deal.stage.in_(OPEN_DEAL_STAGES),
            ),
        )).scalars().all())
        if replacement is not None:
            await replace_channel(
                session,
                old_channel=old_channel,
                new_sender=replacement,
                deal=deals[0] if deals else None,
            )
            continue
        old_channel.status = reason
        old_channel.deleted_at = utcnow() if reason == "deleted" else None
        old_channel.updated_at = utcnow()
        if old_thread is not None:
            old_thread.is_read_only = True
            old_thread.updated_at = utcnow()
        for deal in deals:
            deal.communication_state = "interrupted"
            deal.updated_at = utcnow()
            await ensure_open_task(session, deal)
            await add_activity(
                session,
                event_key=f"channel_{reason}:{old_channel.id}:{deal.id}",
                deal=deal,
                event_type=f"channel_{reason}",
                thread=old_thread,
                channel=old_channel,
                description=(
                    f"Instagram @{sender.normalized_login} недоступен. "
                    f"История сохранена. Сделка остаётся на этапе {deal.stage}."
                ),
                from_stage=deal.stage,
                to_stage=deal.stage,
            )
    await session.flush()


async def handle_sender_restored(session: AsyncSession, sender: SenderAccount) -> None:
    channels = list((await session.execute(
        select(ChannelIdentity).where(
            ChannelIdentity.sender_account_id == sender.id,
            ChannelIdentity.status.in_(["blocked", "pending_verification"]),
            ChannelIdentity.deleted_at.is_(None),
        ),
    )).scalars().all())
    for channel in channels:
        channel.status = "active"
        channel.updated_at = utcnow()
        thread = await session.scalar(select(Thread).where(Thread.channel_identity_id == channel.id))
        if thread is not None:
            thread.is_read_only = False
            thread.updated_at = utcnow()
        await session.execute(
            update(Deal)
            .where(
                Deal.user_id == channel.user_id,
                Deal.account_id == channel.author_account_id,
                Deal.stage.in_(OPEN_DEAL_STAGES),
                Deal.communication_state.in_(["interrupted", "no_channel"]),
            )
            .values(communication_state="active", updated_at=utcnow()),
        )
        deal_ids = (await session.execute(
            select(Deal.id).where(
                Deal.user_id == channel.user_id,
                Deal.account_id == channel.author_account_id,
                Deal.stage.in_(OPEN_DEAL_STAGES),
            ),
        )).scalars().all()
        if deal_ids:
            await session.execute(
                update(DealTask)
                .where(DealTask.deal_id.in_(deal_ids), DealTask.completed_at.is_(None))
                .values(completed_at=utcnow()),
            )
    await session.flush()
