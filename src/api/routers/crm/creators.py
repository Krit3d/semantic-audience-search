import asyncio
import logging
from datetime import datetime, timezone
from urllib.parse import unquote

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy import and_, delete, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from src.api.dependencies import get_crm_client, get_current_user, get_db
from src.api.schemas import (
    CreatorImportCommitRequest,
    CreatorImportPreview,
    CreatorImportPreviewItem,
    CreatorImportResult,
    CreatorMessageItem,
    CreatorProfileDetail,
    CreatorSendMessageRequest,
    CrmManualCreatorRequest,
    CrmShortlistRequest,
    CrmShortlistResponse,
    CrmUpdateStatusRequest,
    ShortlistItem,
)
from src.api.services.contact_resolver import ContactResolver
from src.api.services.crm_client import TwentyCrmClient
from src.api.services.crm_helpers import (
    STATUS_CRM_TO_UI,
    author_summary,
    STATUS_UI_TO_CRM,
    build_creator_payload,
    deduplicate_accounts,
    message_item,
    normalize_platform,
    post_item,
    profile_url,
    resolve_account,
    resolve_target_for_channel,
)
from src.db.database import Database
from src.db.models import Account, Content, Deal, CreatorMessage, User, UserShortlist
from src.parser.creators.core.contacts import (
    is_valid_email,
    is_valid_telegram_handle,
    normalize_phone,
    normalize_telegram_handle,
)
from src.parser.creators.sc_client import ScrapeCreatorsClient

logger = logging.getLogger(__name__)

router = APIRouter(tags=["CRM Creators"])


@router.post("/shortlist", response_model=CrmShortlistResponse)
async def export_to_shortlist(
    payload: CrmShortlistRequest,
    request: Request,
    db: Database = Depends(get_db),
    crm_client: TwentyCrmClient = Depends(get_crm_client),
    current_user: User = Depends(get_current_user),
) -> CrmShortlistResponse:
    target_email = current_user.email
    if len(payload.account_ids) > 100:
        raise HTTPException(status_code=400, detail="Превышен максимальный лимит: не более 100 идентификаторов за один запрос")
    raw_ids: list[str] = []
    for aid in payload.account_ids:
        if not aid:
            continue
        val = unquote(str(aid).strip())
        for part in val.split(","):
            cleaned = part.strip().lstrip("@")
            if cleaned and cleaned.lower() not in {"undefined", "null"}:
                raw_ids.append(cleaned)
    raw_ids = list(dict.fromkeys(raw_ids))
    if len(raw_ids) > 100:
        raise HTTPException(status_code=400, detail="Превышен максимальный лимит: не более 100 идентификаторов за один запрос")
    if not raw_ids:
        return CrmShortlistResponse(
            added_count=0,
            redirect_url=f"{request.app.state.settings.crm_frontend_url.rstrip('/')}/#/authors?import_ids={','.join(raw_ids)}",
        )

    numeric_ids: list[int] = []
    string_ids: list[str] = []
    clean_usernames: list[str] = []
    for raw in raw_ids:
        clean_u = raw.lstrip("@").strip().lower()
        if clean_u:
            clean_usernames.append(clean_u)
        try:
            numeric_ids.append(int(raw))
        except ValueError:
            pass
        string_ids.append(raw)

    logger.info(
        "Shortlist search: raw_ids=%s, clean_usernames=%s, numeric_ids=%s",
        raw_ids,
        clean_usernames,
        numeric_ids,
    )

    conditions = []
    if clean_usernames:
        conditions.append(func.lower(Account.username).in_(clean_usernames))
        conditions.append(func.lower(Account.username).in_([f"@{u}" for u in clean_usernames]))
    if numeric_ids:
        conditions.append(Account.id.in_(numeric_ids))
    if string_ids:
        conditions.append(Account.platform_id.in_(string_ids))

    validity = or_(Account.status == "verified", Account.subscribers_count > 0)
    async with db.async_session() as session:
        stmt = select(Account).where(and_(or_(*conditions), validity))
        result = await session.execute(stmt)
        accounts = list(result.scalars().all())

        accounts = deduplicate_accounts(accounts)

        logger.info("CRM export: found %d Account records in Postgres for raw_ids=%s", len(accounts), raw_ids)

        if accounts:
            now = datetime.now(timezone.utc)
            rows = [
                {
                    "user_id": current_user.id,
                    "account_id": account.id,
                    "status": "Свободен",
                    "source": "search",
                    "created_at": now,
                    "updated_at": now,
                }
                for account in accounts
            ]
            await session.execute(
                pg_insert(UserShortlist)
                .values(rows)
                .on_conflict_do_nothing(index_elements=["user_id", "account_id"])
            )
            await session.commit()

    if not accounts:
        logger.warning("No accounts found in DB for ids: %s", raw_ids)
        raise HTTPException(status_code=404, detail="Указанные авторы не найдены в базе")

    tasks = [crm_client.upsert_creator(build_creator_payload(account, target_email)) for account in accounts]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    for account, res in zip(accounts, results):
        if isinstance(res, Exception):
            logger.error("Error upserting %s: %s", account.id, repr(res))

    return CrmShortlistResponse(
        added_count=len(accounts),
        redirect_url=f"{request.app.state.settings.crm_frontend_url.rstrip('/')}/#/authors?import_ids={','.join(raw_ids)}",
    )


def _build_contacts_metadata(payload: CrmManualCreatorRequest) -> dict[str, list[str]]:
    contacts: dict[str, list[str]] = {}
    if payload.telegram_commercial:
        handle = normalize_telegram_handle(payload.telegram_commercial)
        if is_valid_telegram_handle(handle):
            contacts["advertising_telegrams"] = [handle]
    if payload.telegram_personal:
        handle = normalize_telegram_handle(payload.telegram_personal)
        if is_valid_telegram_handle(handle):
            contacts["telegram_personal"] = [handle]
    if payload.email:
        email = payload.email.strip().lower()
        if is_valid_email(email):
            contacts["emails"] = [email]
    if payload.phone:
        phone = normalize_phone(payload.phone)
        if phone:
            contacts["phones"] = [phone]
    return contacts


@router.post("/creators/manual")
async def add_creator_manual(
    payload: CrmManualCreatorRequest,
    request: Request,
    db: Database = Depends(get_db),
    crm_client: TwentyCrmClient = Depends(get_crm_client),
    current_user: User = Depends(get_current_user),
) -> dict[str, object]:
    platform = payload.platform.upper().strip()
    clean_username = payload.username.lstrip("@").strip().lower()
    if not clean_username:
        raise HTTPException(status_code=400, detail="Username не может быть пустым")

    if platform not in ("INSTAGRAM", "TELEGRAM"):
        raise HTTPException(status_code=400, detail="Поддерживаются только INSTAGRAM и TELEGRAM")

    platform_id: str = clean_username
    title: str = clean_username
    scraped_title: str | None = None
    subscribers_count: int | None = payload.subscribers_count

    if platform == "INSTAGRAM":
        try:
            async with ScrapeCreatorsClient(request.app.state.settings) as client:
                response = await client.get(
                    endpoint="/v1/instagram/profile",
                    params={"handle": clean_username},
                )
            data = response.get("data") or response
            user = data.get("user") or data if isinstance(data, dict) else {}
            raw_pid = user.get("id") or user.get("pk") or user.get("media_id")
            if raw_pid is not None:
                platform_id = str(raw_pid).strip()
            scraped_title = user.get("full_name") or user.get("title") or user.get("name")
            scraped_subs = user.get("edge_followed_by")
            if isinstance(scraped_subs, dict):
                scraped_subs = scraped_subs.get("count")
            if scraped_subs is None:
                scraped_subs = user.get("followers") or user.get("followers_count") or user.get("follower_count")
            if scraped_subs is not None:
                try:
                    subscribers_count = int(scraped_subs)
                except (ValueError, TypeError):
                    pass
        except Exception:
            logger.warning(
                "Scrape Creators profile fetch failed for %s, using username as platform id",
                clean_username,
                exc_info=True,
            )

    if payload.title:
        title = payload.title
    elif scraped_title:
        title = str(scraped_title)
    else:
        title = clean_username

    contacts = _build_contacts_metadata(payload)
    raw_metadata: dict[str, object] = {"contacts": contacts}

    now = datetime.now(timezone.utc)
    async with db.async_session() as session:
        existing_stmt = select(Account).where(
            or_(
                and_(Account.platform == platform, func.lower(Account.platform_id) == platform_id.lower()),
                and_(Account.platform == platform, func.lower(Account.username) == clean_username),
            )
        )
        existing_result = await session.execute(existing_stmt)
        account = existing_result.scalars().first()

        if account is None:
            account = Account(
                platform=platform,
                platform_id=platform_id,
                username=clean_username,
                title=title,
                subscribers_count=subscribers_count,
                status="manual",
                raw_metadata=raw_metadata,
            )
            session.add(account)
            await session.flush()
        else:
            existing_meta = account.raw_metadata if isinstance(account.raw_metadata, dict) else {}
            existing_contacts = existing_meta.get("contacts")
            if not isinstance(existing_contacts, dict):
                existing_contacts = {}
            merged_contacts: dict[str, list[str]] = {}
            for key in ("advertising_telegrams", "telegram_personal", "emails", "phones"):
                merged = list(existing_contacts.get(key, []))
                for item in contacts.get(key, []):
                    if item not in merged:
                        merged.append(item)
                if merged:
                    merged_contacts[key] = merged
            existing_meta["contacts"] = merged_contacts
            account.raw_metadata = existing_meta
            if account.status != "verified":
                account.status = "manual"
            if title:
                account.title = title
            if subscribers_count is not None:
                account.subscribers_count = subscribers_count

        await session.execute(
            pg_insert(UserShortlist)
            .values(
                user_id=current_user.id,
                account_id=account.id,
                status="Свободен",
                source="manual",
                created_at=now,
                updated_at=now,
            )
            .on_conflict_do_update(
                index_elements=["user_id", "account_id"],
                set_={
                    "source": "manual",
                    "updated_at": now,
                },
            )
        )
        await session.commit()
        await session.refresh(account)

    try:
        await crm_client.upsert_creator(build_creator_payload(account, current_user.email))
    except Exception:
        logger.warning("Failed to upsert manually added creator in Twenty CRM", exc_info=True)

    return {
        "id": str(account.id),
        "accountid": str(account.id),
        "accountId": str(account.id),
        "handle": f"@{account.username.lstrip('@')}" if account.username else "",
        "username": account.username,
        "name": account.title or account.username or "",
        "platform": normalize_platform(account.platform),
        "followers": int(account.subscribers_count or 0),
        "subscribers_count": int(account.subscribers_count or 0),
        "status": "Свободен",
        "source": "manual",
        "account_status": account.status,
        "title": account.title or account.username or "",
    }


@router.get("/creators")
async def crm_creators(
    limit: int = 100,
    offset: int = 0,
    status: str | None = None,
    db: Database = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, object]:
    async with db.async_session() as session:
        stmt = (
            select(UserShortlist, Account)
            .join(Account, UserShortlist.account_id == Account.id)
            .where(UserShortlist.user_id == current_user.id)
        )
        if status:
            stmt = stmt.where(UserShortlist.status == STATUS_CRM_TO_UI.get(status, status))
        stmt = stmt.order_by(UserShortlist.created_at.desc()).limit(limit).offset(offset)
        result = await session.execute(stmt)
        rows = result.all()
        if not rows:
            return {"data": [], "total": 0}

        account_ids = [row[1].id for row in rows]

        active_stmt = (
            select(Deal.account_id, func.count(Deal.id))
            .where(
                Deal.user_id == current_user.id,
                Deal.account_id.in_(account_ids),
                Deal.stage.between(1, 6),
            )
            .group_by(Deal.account_id)
        )
        active_result = await session.execute(active_stmt)
        active_map = {account_id: count for account_id, count in active_result.all()}

        total_stmt = (
            select(Deal.account_id, func.count(Deal.id))
            .where(Deal.user_id == current_user.id, Deal.account_id.in_(account_ids))
            .group_by(Deal.account_id)
        )
        total_result = await session.execute(total_stmt)
        total_map = {account_id: count for account_id, count in total_result.all()}

        total_count_stmt = select(func.count(UserShortlist.user_id)).where(UserShortlist.user_id == current_user.id)
        if status:
            total_count_stmt = total_count_stmt.where(UserShortlist.status == STATUS_CRM_TO_UI.get(status, status))
        total_count_result = await session.execute(total_count_stmt)
        total_count = total_count_result.scalar() or 0

        creators = []
        for shortlist, account in rows:
            followers = int(account.subscribers_count or 0)
            er = round(float(account.static_avg_er or 0.0), 2)
            if er > 0:
                avg_reach = int(followers * (er / 100))
                calc_cpm = int((followers * (er / 100) / 1000) * 200)
            else:
                avg_reach = int(followers * 0.1)
                calc_cpm = 0
            cpm = shortlist.custom_cpm if shortlist.custom_cpm is not None else calc_cpm
            active_count = active_map.get(account.id, 0)
            if shortlist.status == "В архиве":
                creator_status = "В архиве"
            elif active_count > 0:
                creator_status = "В сделке"
            else:
                creator_status = shortlist.status
            deals_count = total_map.get(account.id, 0)
            creators.append(
                {
                    "id": str(account.id),
                    "accountid": str(account.id),
                    "accountId": str(account.id),
                    "name": account.title or account.username or "",
                    "source": shortlist.source,
                    "account_status": account.status,
                    "title": account.title or account.username or "",
                    "platform": normalize_platform(account.platform),
                    "handle": f"@{account.username.lstrip('@')}" if account.username else "",
                    "followers": followers,
                    "er": er,
                    "avgreach": avg_reach,
                    "cpm": cpm,
                    "niche": account.category_path or "Общее",
                    "status": creator_status,
                    "dealscount": deals_count,
                    "dealsCount": deals_count,
                    "notes": shortlist.notes,
                    "useremail": current_user.email,
                }
            )
        return {"data": creators, "total": total_count}


@router.patch("/creators/{creator_id}")
async def crm_update_creator_status(
    creator_id: str,
    payload: CrmUpdateStatusRequest,
    current_user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
    crm_client: TwentyCrmClient = Depends(get_crm_client),
) -> dict[str, object]:
    mapped_status = STATUS_CRM_TO_UI.get(payload.status, payload.status)
    async with db.async_session() as session:
        account = await resolve_account(session, crm_client, creator_id, current_user.email)
        if account is None:
            raise HTTPException(status_code=404, detail="Автор не найден")
        now = datetime.now(timezone.utc)
        await session.execute(
            pg_insert(UserShortlist)
            .values(
                user_id=current_user.id,
                account_id=account.id,
                status=mapped_status,
                created_at=now,
                updated_at=now,
            )
            .on_conflict_do_update(
                index_elements=["user_id", "account_id"],
                set_={
                    "status": mapped_status,
                    "updated_at": now,
                },
            )
        )
        if payload.status.strip().lower() in {"archived", "в архиве"} and payload.archive_active_deals:
            await session.execute(
                update(Deal)
                .where(
                    Deal.user_id == current_user.id,
                    Deal.account_id == account.id,
                    Deal.stage >= 1,
                    Deal.stage <= 6,
                )
                .values(stage=0, updated_at=datetime.now(timezone.utc))
            )
        await session.commit()
    try:
        await crm_client.update_creator_status(
            creator_id, STATUS_UI_TO_CRM.get(payload.status, payload.status), current_user.email
        )
    except Exception:
        logger.warning("Failed to update creator status in Twenty CRM", exc_info=True)
    return {
        "status": "ok",
        "creator_id": creator_id,
        "new_status": mapped_status,
    }


@router.delete("/creators/{creator_id}")
async def crm_delete_creator(
    creator_id: str,
    current_user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
    crm_client: TwentyCrmClient = Depends(get_crm_client),
) -> dict[str, str]:
    async with db.async_session() as session:
        account = await resolve_account(session, crm_client, creator_id, current_user.email)
        if account is None:
            raise HTTPException(status_code=404, detail="Автор не найден")
        ownership_proven = False
        for model in (UserShortlist, Deal, CreatorMessage):
            result = await session.execute(
                select(model.user_id).where(
                    model.user_id == current_user.id,
                    model.account_id == account.id,
                ).limit(1)
            )
            if result.scalar_one_or_none() is not None:
                ownership_proven = True
                break
        if not ownership_proven:
            raise HTTPException(status_code=404, detail="Автор не найден")
        await session.execute(
            delete(UserShortlist).where(
                UserShortlist.user_id == current_user.id,
                UserShortlist.account_id == account.id,
            )
        )
        await session.commit()
    try:
        await crm_client.delete_creator(creator_id, current_user.email)
    except Exception:
        logger.warning("Failed to delete creator in Twenty CRM", exc_info=True)
    return {"status": "deleted", "creator_id": creator_id}


@router.get("/creators/{creator_id}", response_model=CreatorProfileDetail)
async def get_creator_detail(
    creator_id: str,
    current_user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
    crm_client: TwentyCrmClient = Depends(get_crm_client),
) -> CreatorProfileDetail:
    async with db.async_session() as session:
        account = await resolve_account(session, crm_client, creator_id)
        if account is None:
            raise HTTPException(status_code=404, detail="Автор не найден")

        content_stmt = (
            select(Content)
            .where(Content.account_id == account.id)
            .order_by(Content.published_at.desc())
            .limit(20)
        )
        content_result = await session.execute(content_stmt)
        posts = list(content_result.scalars().all())

        active_deals_stmt = (
            select(func.count(Deal.id))
            .where(
                Deal.account_id == account.id,
                Deal.user_id == current_user.id,
                Deal.stage >= 1,
                Deal.stage <= 6,
            )
        )
        active_deals_result = await session.execute(active_deals_stmt)
        active_deals_count = active_deals_result.scalar() or 0

        total_deals_stmt = (
            select(func.count(Deal.id))
            .where(Deal.account_id == account.id, Deal.user_id == current_user.id)
        )
        total_deals_result = await session.execute(total_deals_stmt)
        total_deals_count = total_deals_result.scalar() or 0

        shortlist_stmt = (
            select(UserShortlist)
            .where(
                UserShortlist.user_id == current_user.id,
                UserShortlist.account_id == account.id,
            )
        )
        shortlist_result = await session.execute(shortlist_stmt)
        shortlist = shortlist_result.scalar_one_or_none()

    followers = int(account.subscribers_count or 0)
    er = round(float(account.static_avg_er or 0.0), 2)
    if er > 0:
        avg_reach = int(followers * (er / 100))
        calc_cpm = int((followers * (er / 100) / 1000) * 200)
    else:
        avg_reach = int(followers * 0.1)
        calc_cpm = 0
    cpm = shortlist.custom_cpm if (shortlist is not None and shortlist.custom_cpm is not None) else calc_cpm

    platform = normalize_platform(account.platform)
    if shortlist is not None:
        if shortlist.status == "В архиве":
            status = "В архиве"
        elif active_deals_count > 0:
            status = "В сделке"
        else:
            status = shortlist.status
    else:
        normalized_status = (account.status or "").strip().lower()
        if normalized_status in {"archived", "в архиве"}:
            status = "В архиве"
        elif active_deals_count > 0:
            status = "В сделке"
        else:
            status = "Свободен"
    return CreatorProfileDetail(
        id=str(account.id),
        platform=platform,
        username=account.username,
        title=account.title,
        account_status=account.status,
        description=account.description,
        subscribers_count=followers,
        static_avg_er=er,
        category_path=account.category_path,
        country=account.country,
        city=account.city,
        gender=account.gender,
        status=status,
        profile_url=profile_url(platform, account.username),
        cpm=cpm,
        avg_reach=avg_reach,
        deals_count=total_deals_count,
        posts=[post_item(post, platform) for post in posts],
    )


@router.get("/creators/{creator_id}/messages", response_model=list[CreatorMessageItem])
async def get_creator_messages(
    creator_id: str,
    channel_type: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
    crm_client: TwentyCrmClient = Depends(get_crm_client),
) -> list[CreatorMessageItem]:
    async with db.async_session() as session:
        account = await resolve_account(session, crm_client, creator_id)
        if account is None:
            raise HTTPException(status_code=404, detail="Автор не найден")
        update_stmt = (
            update(CreatorMessage)
            .where(
                CreatorMessage.account_id == account.id,
                CreatorMessage.user_id == current_user.id,
                CreatorMessage.sender_type != "user",
                CreatorMessage.is_read.is_(False),
            )
            .values(is_read=True)
        )
        if channel_type:
            update_stmt = update_stmt.where(CreatorMessage.channel_type == channel_type.lower())
        await session.execute(update_stmt)
        await session.commit()
        msg_stmt = (
            select(CreatorMessage)
            .where(
                CreatorMessage.account_id == account.id,
                CreatorMessage.user_id == current_user.id,
            )
            .order_by(CreatorMessage.created_at.asc())
        )
        if channel_type:
            msg_stmt = msg_stmt.where(func.lower(CreatorMessage.channel_type) == channel_type.lower())
        msg_result = await session.execute(msg_stmt)
        messages = list(msg_result.scalars().all())
        return [message_item(message) for message in messages]


@router.post("/creators/{creator_id}/messages", response_model=CreatorMessageItem)
async def send_creator_message(
    creator_id: str,
    payload: CreatorSendMessageRequest,
    current_user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
    crm_client: TwentyCrmClient = Depends(get_crm_client),
) -> CreatorMessageItem:
    if not (payload.text and payload.text.strip()) and not payload.media_url:
        raise HTTPException(status_code=400, detail="Сообщение не может быть пустым")
    async with db.async_session() as session:
        account = await resolve_account(session, crm_client, creator_id)
        if account is None:
            raise HTTPException(status_code=404, detail="Автор не найден")
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
        if payload.preferred_channel:
            target_channel = payload.preferred_channel.lower()
            target_handle = ContactResolver.resolve_channel_target(account.raw_metadata, account.username, target_channel)
            if not target_handle:
                target_handle = resolve_target_for_channel(account, target_channel) or ""
        else:
            resolution = ContactResolver.resolve(account.raw_metadata, account.username)
            target_channel = resolution.channel_type if resolution.channel_type else (account.platform.lower() if account.platform else "instagram")
            target_handle = resolution.channel_target if resolution.channel_target else (f"@{account.username.lstrip('@')}" if account.username else "")
        message = CreatorMessage(
            user_id=current_user.id,
            account_id=account.id,
            deal_id=deal.id if deal else None,
            sender_type="user",
            text=payload.text.strip() if payload.text else None,
            channel_type=target_channel,
            channel_target=target_handle,
            external_message_id=None,
            media_url=payload.media_url,
            media_name=payload.media_name,
            media_type=payload.media_type,
        )
        session.add(message)
        await session.commit()
        await session.refresh(message)
        return message_item(message)


@router.get("/shortlist", response_model=list[ShortlistItem])
async def list_shortlist(
    current_user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
) -> list[ShortlistItem]:
    async with db.async_session() as session:
        stmt = (
            select(UserShortlist)
            .where(UserShortlist.user_id == current_user.id)
            .order_by(UserShortlist.created_at.desc())
        )
        entries = list((await session.execute(stmt)).scalars().all())
        return [
            ShortlistItem(
                account_id=str(entry.account_id),
                added_at=entry.created_at,
                author=author_summary(entry.account),
            )
            for entry in entries
        ]


@router.delete("/shortlist/{account_id}")
async def remove_from_shortlist(
    account_id: str,
    current_user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
) -> dict[str, str]:
    async with db.async_session() as session:
        try:
            numeric_id = int(account_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Некорректный идентификатор автора")
        stmt = delete(UserShortlist).where(
            and_(
                UserShortlist.user_id == current_user.id,
                UserShortlist.account_id == numeric_id,
            )
        )
        result = await session.execute(stmt)
        await session.commit()
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Автор не найден в шорт-листе")
        return {"status": "deleted", "account_id": account_id}


PLATFORM_ALIASES: dict[str, str] = {
    "instagram": "INSTAGRAM", "insta": "INSTAGRAM", "ig": "INSTAGRAM",
    "telegram": "TELEGRAM", "tg": "TELEGRAM",
    "youtube": "YOUTUBE", "yt": "YOUTUBE",
    "tiktok": "TIKTOK", "tt": "TIKTOK",
    "vk": "VK", "vkontakte": "VK", "вконтакте": "VK",
}


def _parse_import_rows(filename: str, content: bytes) -> list[tuple[int, str, str]]:
    name = filename.lower()
    rows: list[tuple[int, str, str]] = []
    if name.endswith(".xlsx"):
        try:
            import openpyxl
        except ImportError:
            raise HTTPException(status_code=400, detail="Формат .xlsx временно не поддерживается, используйте .csv")
        import io as _io
        try:
            wb = openpyxl.load_workbook(_io.BytesIO(content), read_only=True, data_only=True)
        except Exception:
            raise HTTPException(status_code=400, detail="Не удалось прочитать файл .xlsx")
        sheet = wb.active
        if sheet is None:
            return []
        for idx, row in enumerate(sheet.iter_rows(values_only=True), start=1):
            cells = [str(c).strip() if c is not None else "" for c in row]
            joined = [c for c in cells if c]
            if not joined:
                continue
            rows.append((idx, joined[0], joined[1] if len(joined) > 1 else ""))
        wb.close()
        return rows
    import csv
    import io as _io
    text = content.decode("utf-8-sig", errors="replace")
    sample = text[:2048]
    delimiter = ";" if sample.count(";") > sample.count(",") else ","
    reader = csv.reader(_io.StringIO(text), delimiter=delimiter)
    for idx, row in enumerate(reader, start=1):
        cells = [c.strip() for c in row if c and c.strip()]
        if not cells:
            continue
        rows.append((idx, cells[0], cells[1] if len(cells) > 1 else ""))
    return rows


def _extract_username(raw: str) -> str | None:
    value = raw.strip()
    if not value:
        return None
    value = value.split("?")[0].rstrip("/")
    for prefix in ("https://", "http://", "www."):
        if value.lower().startswith(prefix):
            value = value[len(prefix):]
    if "/" in value:
        parts = [p for p in value.split("/") if p]
        if not parts:
            return None
        value = parts[-1]
    value = value.lstrip("@").strip()
    if not value or " " in value or len(value) > 100:
        return None
    lowered = value.lower()
    if lowered in {"username", "ник", "никнейм", "handle", "login", "ссылка", "link", "url", "профиль", "автор"}:
        return None
    return value


def _extract_platform(raw: str, username_raw: str) -> str | None:
    source = f"{raw} {username_raw}".lower()
    if source.strip() == "":
        return None
    for alias, platform in PLATFORM_ALIASES.items():
        if alias in source.split() or f"{alias} " in source or source.strip() == alias:
            return platform
    if "t.me" in source or "telegram" in source:
        return "TELEGRAM"
    if "instagram.com" in source:
        return "INSTAGRAM"
    if "youtube.com" in source or "youtu.be" in source:
        return "YOUTUBE"
    if "tiktok.com" in source:
        return "TIKTOK"
    if "vk.com" in source:
        return "VK"
    return None


@router.post("/creators/import/preview", response_model=CreatorImportPreview)
async def preview_creators_import(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
) -> CreatorImportPreview:
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Файл слишком большой: максимум 5 МБ")
    rows = _parse_import_rows(file.filename or "import.csv", content)
    if len(rows) > 500:
        raise HTTPException(status_code=400, detail="Слишком много строк: максимум 500")
    parsed: list[tuple[int, str, str | None]] = []
    seen: set[str] = set()
    items: list[CreatorImportPreviewItem] = []
    for row_no, username_raw, platform_raw in rows:
        username = _extract_username(username_raw)
        if username is None:
            items.append(CreatorImportPreviewItem(row=row_no, username=None, platform=None, status="skip", reason="нет ссылки"))
            continue
        key = username.lower()
        if key in seen:
            items.append(CreatorImportPreviewItem(row=row_no, username=username, platform=None, status="skip", reason="дубликат"))
            continue
        seen.add(key)
        parsed.append((row_no, username, _extract_platform(platform_raw, username_raw)))
    async with db.async_session() as session:
        usernames = [u for _, u, _ in parsed]
        existing: dict[str, Account] = {}
        if usernames:
            lowered = [u.lower() for u in usernames]
            stmt = select(Account).where(
                or_(
                    func.lower(Account.username).in_(lowered),
                    func.lower(Account.username).in_([f"@{u}" for u in lowered]),
                )
            )
            accounts = list((await session.execute(stmt)).scalars().all())
            for account in accounts:
                raw = (account.username or "").lstrip("@").lower()
                if raw:
                    existing[raw] = account
        short_stmt = select(UserShortlist.account_id).where(UserShortlist.user_id == current_user.id)
        shortlisted = {row[0] for row in (await session.execute(short_stmt)).all()}
        for row_no, username, platform in parsed:
            account = existing.get(username.lower())
            if account is not None and account.id in shortlisted:
                items.append(CreatorImportPreviewItem(row=row_no, username=username, platform=platform, status="exists", reason="уже в базе"))
            elif account is not None:
                items.append(CreatorImportPreviewItem(row=row_no, username=username, platform=platform or account.platform, status="new", reason=None))
            else:
                items.append(CreatorImportPreviewItem(row=row_no, username=username, platform=platform, status="skip", reason="не найден в базе Collabrama"))
    items.sort(key=lambda item: item.row)
    return CreatorImportPreview(
        items=items,
        total=len(items),
        new_count=sum(1 for i in items if i.status == "new"),
        exists_count=sum(1 for i in items if i.status == "exists"),
        skip_count=sum(1 for i in items if i.status == "skip"),
    )


@router.post("/creators/import/commit", response_model=CreatorImportResult)
async def commit_creators_import(
    payload: CreatorImportCommitRequest,
    current_user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
    crm_client: TwentyCrmClient = Depends(get_crm_client),
) -> CreatorImportResult:
    usernames = list(dict.fromkeys(i.username.strip().lstrip("@").lower() for i in payload.items if i.username.strip()))
    if not usernames:
        return CreatorImportResult(added_count=0, skipped_count=0)
    async with db.async_session() as session:
        stmt = select(Account).where(
            or_(
                func.lower(Account.username).in_(usernames),
                func.lower(Account.username).in_([f"@{u}" for u in usernames]),
            )
        )
        accounts = deduplicate_accounts(list((await session.execute(stmt)).scalars().all()))
        skipped = len(usernames) - len(accounts)
        if accounts:
            now = datetime.now(timezone.utc)
            rows = [
                {
                    "user_id": current_user.id,
                    "account_id": account.id,
                    "status": "Свободен",
                    "source": "manual",
                    "created_at": now,
                    "updated_at": now,
                }
                for account in accounts
            ]
            await session.execute(
                pg_insert(UserShortlist)
                .values(rows)
                .on_conflict_do_nothing(index_elements=["user_id", "account_id"])
            )
            await session.commit()
    tasks = [crm_client.upsert_creator(build_creator_payload(account, current_user.email)) for account in accounts]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    for account, res in zip(accounts, results):
        if isinstance(res, Exception):
            logger.error("Import upsert error for %s: %s", account.id, repr(res))
    return CreatorImportResult(added_count=len(accounts), skipped_count=max(skipped, 0))
