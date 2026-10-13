import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.api.dependencies import get_current_user, get_db
from src.api.schemas import (
    EridCheckCreateRequest,
    EridCheckItem,
    EridCreateRequest,
    EridRecordItem,
    EridUpdateRequest,
)
from src.db.database import Database
from src.db.models import Brand, Deal, EridCheck, EridRecord, User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/erid", tags=["CRM ERID"])


def _record_item(record: EridRecord) -> EridRecordItem:
    deal = record.deal
    brand = record.brand
    author_handle = None
    if deal is not None and deal.account is not None:
        raw = deal.account.username
        author_handle = (raw if raw.startswith("@") else f"@{raw}") if raw else None
    return EridRecordItem(
        id=record.id,
        code=record.code,
        deal_id=record.deal_id,
        deal_title=deal.title if deal is not None else None,
        author_handle=author_handle,
        brand_id=record.brand_id,
        brand_name=brand.name if brand is not None else None,
        status=record.status,
        pub_link=record.pub_link,
        verdict=record.verdict,
        created_at=record.created_at,
        checks=[
            EridCheckItem(id=c.id, checked_at=c.checked_at, result=c.result, checked_by=c.checked_by)
            for c in record.checks
        ],
    )


async def _get_owned_record(session: AsyncSession, record_id: int, user_id: int) -> EridRecord:
    stmt = (
        select(EridRecord)
        .options(selectinload(EridRecord.checks))
        .where(EridRecord.id == record_id)
    )
    record = (await session.execute(stmt)).scalar_one_or_none()
    if record is None or record.user_id != user_id:
        raise HTTPException(status_code=404, detail="Запись маркировки не найдена")
    return record


@router.get("", response_model=list[EridRecordItem])
async def list_erid_records(
    brand_id: int | None = None,
    status: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
) -> list[EridRecordItem]:
    async with db.async_session() as session:
        stmt = (
            select(EridRecord)
            .options(selectinload(EridRecord.checks))
            .where(EridRecord.user_id == current_user.id)
        )
        if brand_id is not None:
            stmt = stmt.where(EridRecord.brand_id == brand_id)
        if status:
            stmt = stmt.where(EridRecord.status == status)
        stmt = stmt.order_by(EridRecord.created_at.desc())
        records = list((await session.execute(stmt)).scalars().all())
        return [_record_item(r) for r in records]


@router.post("", response_model=EridRecordItem)
async def create_erid_record(
    payload: EridCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
) -> EridRecordItem:
    async with db.async_session() as session:
        if payload.deal_id is not None:
            deal = await session.get(Deal, payload.deal_id)
            if deal is None or deal.user_id != current_user.id:
                raise HTTPException(status_code=404, detail="Сделка не найдена")
        if payload.brand_id is not None:
            brand = await session.get(Brand, payload.brand_id)
            if brand is None or brand.user_id != current_user.id:
                raise HTTPException(status_code=404, detail="Бренд не найден")
        record = EridRecord(
            user_id=current_user.id,
            deal_id=payload.deal_id,
            brand_id=payload.brand_id,
            code=payload.code,
        )
        session.add(record)
        await session.flush()
        checked_by = current_user.name or current_user.email
        session.add(EridCheck(
            erid_id=record.id,
            result="Запрос маркировки создан",
            checked_by=checked_by,
        ))
        await session.commit()
        created = await _get_owned_record(session, record.id, current_user.id)
        return _record_item(created)


@router.patch("/{record_id}", response_model=EridRecordItem)
async def update_erid_record(
    record_id: int,
    payload: EridUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
) -> EridRecordItem:
    async with db.async_session() as session:
        record = await _get_owned_record(session, record_id, current_user.id)
        checked_by = current_user.name or current_user.email
        if payload.status is not None and payload.status != record.status:
            record.status = payload.status
            session.add(EridCheck(erid_id=record.id, result=f"Статус изменён на «{payload.status}»", checked_by=checked_by))
        if payload.pub_link is not None and payload.pub_link != record.pub_link:
            record.pub_link = payload.pub_link or None
            if payload.pub_link:
                session.add(EridCheck(erid_id=record.id, result="Добавлена ссылка на публикацию", checked_by=checked_by))
        if payload.code is not None and payload.code != record.code:
            record.code = payload.code or None
            if payload.code:
                session.add(EridCheck(erid_id=record.id, result="Маркер ERID выдан", checked_by=checked_by))
        if payload.verdict is not None and payload.verdict != record.verdict:
            record.verdict = payload.verdict
            verdict_text = "Размещение корректно" if payload.verdict == "ok" else "Размещение с нарушением"
            session.add(EridCheck(erid_id=record.id, result=verdict_text, checked_by=checked_by))
        await session.commit()
        updated = await _get_owned_record(session, record_id, current_user.id)
        return _record_item(updated)


@router.post("/{record_id}/checks", response_model=EridRecordItem)
async def add_erid_check(
    record_id: int,
    payload: EridCheckCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
) -> EridRecordItem:
    async with db.async_session() as session:
        record = await _get_owned_record(session, record_id, current_user.id)
        checked_by = current_user.name or current_user.email
        session.add(EridCheck(erid_id=record.id, result=payload.result.strip(), checked_by=checked_by))
        await session.commit()
        updated = await _get_owned_record(session, record_id, current_user.id)
        return _record_item(updated)
