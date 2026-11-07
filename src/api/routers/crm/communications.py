import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from src.api.dependencies import get_crm_client, get_current_user, get_db
from src.api.schemas import (
    AvailableChannelItem,
    CommunicationAccountAvailability,
    CommunicationChannelItem,
    CommunicationInitRequest,
)
from src.api.services.communication_domain import (
    CommunicationServiceError,
    ensure_active_thread,
    has_working_sender,
    sync_legacy_pool,
)
from src.api.services.contact_resolver import ContactResolver
from src.api.services.crm_client import TwentyCrmClient
from src.api.services.crm_helpers import message_snippet, resolve_account
from src.api.services.dialog_quota import ensure_dialog_can_be_created
from src.db.database import Database
from src.db.models import (
    Account,
    ChannelIdentity,
    CreatorMessage,
    Deal,
    SenderAccount,
    Thread,
    User,
    UserInstagramAccount,
    UserShortlist,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/communications", tags=["CRM Communications"])


@router.get("/account-availability", response_model=CommunicationAccountAvailability)
async def get_account_availability(
    current_user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
) -> CommunicationAccountAvailability:
    async with db.async_session() as session:
        await sync_legacy_pool(session, current_user.id)
        total = await session.scalar(
            select(func.count(SenderAccount.id)).where(
                SenderAccount.user_id == current_user.id,
                SenderAccount.platform == "instagram",
                SenderAccount.deleted_at.is_(None),
            ),
        )
        working = await session.scalar(
            select(func.count(SenderAccount.id)).where(
                SenderAccount.user_id == current_user.id,
                SenderAccount.platform == "instagram",
                SenderAccount.deleted_at.is_(None),
                SenderAccount.rotation_enabled.is_(True),
                SenderAccount.status == "ok",
            ),
        )
        return CommunicationAccountAvailability(
            total_accounts=total or 0,
            working_accounts=working or 0,
            has_working_account=bool(working),
        )


@router.post("/init", response_model=CommunicationChannelItem)
async def init_communication(
    payload: CommunicationInitRequest | None = Body(default=None),
    creator_id: str | None = None,
    channel_type: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
    crm_client: TwentyCrmClient = Depends(get_crm_client),
) -> CommunicationChannelItem:
    identifier = creator_id or (payload.creator_id if payload is not None else None)
    requested_channel = channel_type or (payload.channel_type if payload is not None else None)
    if not identifier:
        raise HTTPException(status_code=400, detail="creator_id обязателен")
    async with db.async_session() as session:
        account = await resolve_account(session, crm_client, identifier)
        if account is None:
            raise HTTPException(status_code=404, detail="Автор не найден")
        available_items = ContactResolver.get_available_channels(account.raw_metadata, account.username)
        available_channels = [
            AvailableChannelItem(channel_type=c.channel_type, channel_target=c.channel_target, role=c.role)
            for c in available_items
        ]
        if not available_channels:
            base_chan = account.platform.lower() if account.platform else "instagram"
            base_target = f"@{account.username.lstrip('@')}" if account.username else ""
            available_channels = [AvailableChannelItem(channel_type=base_chan, channel_target=base_target, role="direct")]
        deal_stmt = (
            select(Deal)
            .where(
                Deal.account_id == account.id,
                Deal.user_id == current_user.id,
                Deal.stage.in_([1, 2, 3, 4, 5, 6]),
            )
            .order_by(Deal.updated_at.desc())
            .limit(1)
        )
        deal_result = await session.execute(deal_stmt)
        deal = deal_result.scalar_one_or_none()
        if requested_channel:
            active_channel_type = requested_channel.lower()
            channel_target = ContactResolver.resolve_channel_target(account.raw_metadata, account.username, active_channel_type) or ""
        else:
            resolution = ContactResolver.resolve(account.raw_metadata, account.username)
            active_channel_type = resolution.channel_type.lower() if resolution.channel_type else ""
            if not active_channel_type or active_channel_type == "internal":
                active_channel_type = account.platform.lower() if account.platform else "instagram"
            channel_target = resolution.channel_target if resolution.channel_target else (f"@{account.username.lstrip('@')}" if account.username else "")
        if active_channel_type == "internal":
            active_channel_type = account.platform.lower() if account.platform else "instagram"
        await ensure_dialog_can_be_created(session, current_user.id, account.id, active_channel_type)
        channel = None
        thread = None
        sender_account = None
        if active_channel_type == "instagram":
            try:
                channel, thread, sender_account = await ensure_active_thread(
                    session,
                    user_id=current_user.id,
                    author_account=account,
                    deal=deal,
                    platform="instagram",
                )
            except CommunicationServiceError as error:
                raise HTTPException(
                    status_code=error.status_code,
                    detail={"code": error.code, "message": error.message},
                ) from None
            if deal is not None and sender_account.legacy_account_id is not None:
                deal.instagram_account_id = sender_account.legacy_account_id
        existing_stmt = (
            select(CreatorMessage.id)
            .where(
                CreatorMessage.user_id == current_user.id,
                CreatorMessage.account_id == account.id,
                func.lower(CreatorMessage.channel_type) == active_channel_type,
            )
            .limit(1)
        )
        existing_result = await session.execute(existing_stmt)
        existing_message = existing_result.scalar_one_or_none()
        if existing_message is None:
            system_message = CreatorMessage(
                user_id=current_user.id,
                account_id=account.id,
                deal_id=deal.id if deal else None,
                sender_type="system",
                text="Диалог начат",
                is_read=True,
                channel_type=active_channel_type,
                channel_target=channel_target,
            )
            session.add(system_message)
            if thread is not None and sender_account is not None:
                system_message.thread_id = thread.id
                system_message.sender_account_id = sender_account.id
                system_message.sender_instagram_account_id = sender_account.legacy_account_id
            await session.commit()
            await session.refresh(system_message)
            last_message = "Диалог начат"
            last_message_time = system_message.created_at
        else:
            last_stmt = (
                select(CreatorMessage)
                .where(
                    CreatorMessage.user_id == current_user.id,
                    CreatorMessage.account_id == account.id,
                    func.lower(CreatorMessage.channel_type) == active_channel_type,
                )
                .order_by(CreatorMessage.created_at.desc())
                .limit(1)
            )
            last_result = await session.execute(last_stmt)
            last_existing = last_result.scalar_one_or_none()
            last_message = message_snippet(last_existing)
            last_message_time = (
                last_existing.created_at
                if last_existing
                else (deal.updated_at if deal else account.created_at)
            )
        now = datetime.now(timezone.utc)
        await session.execute(
            pg_insert(UserShortlist)
            .values(
                user_id=current_user.id,
                account_id=account.id,
                status="Свободен",
                created_at=now,
                updated_at=now,
            )
            .on_conflict_do_nothing(index_elements=["user_id", "account_id"])
        )
        shortlist_stmt = (
            select(UserShortlist)
            .where(
                UserShortlist.user_id == current_user.id,
                UserShortlist.account_id == account.id,
            )
        )
        shortlist_result = await session.execute(shortlist_stmt)
        shortlist_entry = shortlist_result.scalar_one_or_none()
        is_archived = bool(shortlist_entry and shortlist_entry.status == "В архиве")
        sender = await session.get(UserInstagramAccount, deal.instagram_account_id) if deal and deal.instagram_account_id else None
        await session.commit()
        return CommunicationChannelItem(
            id=str(account.id),
            deal_id=deal.id if deal else None,
            author_id=str(account.id),
            author_name=account.title or "",
            author_handle=(
                f"@{account.username.lstrip('@')}"
                if account.username
                else (f"@{account.title}" if account.title else "")
            ),
            platform=account.platform or "",
            deal_title=deal.title if deal else None,
            stage=deal.stage if deal else None,
            last_message=last_message,
            last_message_time=last_message_time,
            unread_count=0,
            is_archived=is_archived,
            channel_type=active_channel_type,
            channel_target=channel_target,
            available_channels=available_channels,
            instagram_login=(
                sender_account.normalized_login
                if sender_account is not None
                else (sender.normalized_login if sender else None)
            ),
            instagram_status=sender_account.status if sender_account is not None else (sender.status if sender else None),
            instagram_deleted=(
                sender_account.deleted_at is not None
                if sender_account is not None
                else (sender.deleted_at is not None if sender else False)
            ),
            communication_state=deal.communication_state if deal else None,
            primary_thread_id=deal.primary_thread_id if deal else (thread.id if thread else None),
            channel_identity_id=channel.id if channel is not None else None,
            can_send=sender_account is not None or active_channel_type != "instagram",
        )


@router.get("", response_model=list[CommunicationChannelItem])
async def list_communications(
    current_user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
) -> list[CommunicationChannelItem]:
    async with db.async_session() as session:
        message_accounts_result = await session.execute(
            select(CreatorMessage.account_id).where(CreatorMessage.user_id == current_user.id).distinct()
        )
        deal_ids_stmt = select(Deal.account_id).where(Deal.user_id == current_user.id).distinct()
        deal_ids_result = await session.execute(deal_ids_stmt)
        account_ids = {row[0] for row in message_accounts_result.all()}
        account_ids.update(row[0] for row in deal_ids_result.all())
        if not account_ids:
            return []
        accounts_stmt = select(Account).where(Account.id.in_(account_ids))
        accounts_result = await session.execute(accounts_stmt)
        accounts = list(accounts_result.scalars().all())
        account_map = {account.id: account for account in accounts}

        deals_stmt = select(Deal).where(
            Deal.user_id == current_user.id,
            Deal.account_id.in_(account_ids),
        )
        deals_result = await session.execute(deals_stmt)
        deals = list(deals_result.scalars().all())
        sender_ids = {deal.instagram_account_id for deal in deals if deal.instagram_account_id is not None}
        sender_map: dict[int, UserInstagramAccount] = {}
        if sender_ids:
            sender_result = await session.execute(select(UserInstagramAccount).where(UserInstagramAccount.id.in_(sender_ids)))
            sender_map = {sender.id: sender for sender in sender_result.scalars().all()}
        can_send_instagram = await has_working_sender(session, current_user.id, "instagram")
        thread_ids = {deal.primary_thread_id for deal in deals if deal.primary_thread_id is not None}
        thread_map: dict[int, Thread] = {}
        channel_map: dict[int, ChannelIdentity] = {}
        if thread_ids:
            thread_rows = list((await session.execute(
                select(Thread).where(Thread.id.in_(thread_ids)),
            )).scalars().all())
            thread_map = {thread.id: thread for thread in thread_rows}
            channel_ids = {thread.channel_identity_id for thread in thread_rows}
            channel_rows = list((await session.execute(
                select(ChannelIdentity).where(ChannelIdentity.id.in_(channel_ids)),
            )).scalars().all())
            channel_map = {channel.id: channel for channel in channel_rows}

        unread_stmt = (
            select(CreatorMessage.account_id, func.count(CreatorMessage.id))
            .where(
                CreatorMessage.user_id == current_user.id,
                CreatorMessage.account_id.in_(account_ids),
                CreatorMessage.is_read.is_(False),
                CreatorMessage.sender_type == "creator",
            )
            .group_by(CreatorMessage.account_id)
        )
        unread_result = await session.execute(unread_stmt)
        unread_map = {account_id: count for account_id, count in unread_result.all()}
        last_stmt = (
            select(CreatorMessage)
            .where(
                CreatorMessage.user_id == current_user.id,
                CreatorMessage.account_id.in_(account_ids),
            )
            .order_by(CreatorMessage.created_at.desc())
        )
        last_result = await session.execute(last_stmt)
        last_map: dict[int, CreatorMessage] = {}
        for msg in last_result.scalars().all():
            last_map.setdefault(msg.account_id, msg)

        shortlist_stmt = (
            select(UserShortlist)
            .where(
                UserShortlist.user_id == current_user.id,
                UserShortlist.account_id.in_(account_ids),
            )
        )
        shortlist_result = await session.execute(shortlist_stmt)
        shortlist_rows = list(shortlist_result.scalars().all())
        shortlist_map = {row.account_id: row for row in shortlist_rows}

        channels: list[CommunicationChannelItem] = []
        for account_id in account_ids:
            account = account_map.get(account_id)
            account_deals = [d for d in deals if d.account_id == account_id]
            active_deals = [d for d in account_deals if d.stage in [1, 2, 3, 4, 5, 6]]
            if active_deals:
                best_deal = max(active_deals, key=lambda d: d.updated_at or d.created_at)
            elif account_deals:
                best_deal = max(account_deals, key=lambda d: d.updated_at or d.created_at)
            else:
                best_deal = None
            shortlist_item = shortlist_map.get(account_id)
            is_archived = bool(shortlist_item and shortlist_item.status == "В архиве")
            available_items = ContactResolver.get_available_channels(account.raw_metadata, account.username) if account is not None else []
            available_schemas = [
                AvailableChannelItem(channel_type=c.channel_type, channel_target=c.channel_target, role=c.role)
                for c in available_items
            ]
            if not available_schemas:
                username = account.username if account is not None else None
                available_schemas = [AvailableChannelItem(channel_type="instagram", channel_target=f"@{username.lstrip('@')}" if username else "", role="direct")]
            last_message = last_map.get(account_id)
            raw_channel_type = (last_message.channel_type or "").lower() if last_message is not None else ""
            fallback_type = account.platform.lower() if account is not None and account.platform else "instagram"
            channel_type = raw_channel_type if raw_channel_type and raw_channel_type != "internal" else fallback_type
            if last_message is None:
                channel_type = available_schemas[0].channel_type.lower()
                if not channel_type or channel_type == "internal":
                    channel_type = "instagram"
            target = ContactResolver.resolve_channel_target(account.raw_metadata, account.username, channel_type) if account is not None else None
            channel_target = (last_message.channel_target if last_message and last_message.channel_target and raw_channel_type != "internal" else target) or ""
            last_time = last_message.created_at if last_message else (best_deal.updated_at if best_deal else (account.created_at if account else datetime.now(timezone.utc)))
            sender = sender_map.get(best_deal.instagram_account_id) if best_deal and best_deal.instagram_account_id else None
            primary_thread = thread_map.get(best_deal.primary_thread_id) if best_deal and best_deal.primary_thread_id else None
            current_channel = channel_map.get(primary_thread.channel_identity_id) if primary_thread is not None else None
            channels.append(
                CommunicationChannelItem(
                    id=str(account_id),
                    deal_id=best_deal.id if best_deal else None,
                    author_id=str(account_id),
                    author_name=account.title if account is not None else "",
                    author_handle=(
                        f"@{account.username.lstrip('@')}"
                        if (account is not None and account.username)
                        else (f"@{account.title}" if (account is not None and account.title) else "")
                    ),
                    platform=account.platform if account is not None else "",
                    deal_title=best_deal.title if best_deal else None,
                    stage=best_deal.stage if best_deal else None,
                    last_message=message_snippet(last_message),
                    last_message_time=last_time,
                    unread_count=unread_map.get(account_id, 0),
                    is_archived=is_archived,
                    channel_type=channel_type,
                    channel_target=channel_target,
                    available_channels=available_schemas,
                    instagram_login=sender.normalized_login if sender else None,
                    instagram_status=sender.status if sender else None,
                    instagram_deleted=sender.deleted_at is not None if sender else False,
                    communication_state=best_deal.communication_state if best_deal else None,
                    primary_thread_id=best_deal.primary_thread_id if best_deal else None,
                    channel_identity_id=current_channel.id if current_channel is not None else None,
                    can_send=channel_type != "instagram" or can_send_instagram,
                )
            )
    channels.sort(key=lambda channel: channel.last_message_time, reverse=True)
    return channels
