import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_user, get_db
from src.api.schemas import (
    BrandCreateRequest,
    BrandItem,
    BrandKb,
    BrandUpdateRequest,
)
from src.db.database import Database
from src.db.models import Brand, Deal, User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/brands", tags=["CRM Brands"])

SHORTLIST_STAGE = 7


def _brand_item(brand: Brand, deals_count: int = 0, shortlist_count: int = 0) -> BrandItem:
    return BrandItem(
        id=brand.id,
        name=brand.name,
        category=brand.category,
        status=brand.status,
        hue=brand.hue,
        desc=brand.desc,
        deals_count=deals_count,
        shortlist_count=shortlist_count,
        kb=BrandKb.model_validate(brand.kb or {}),
        created_at=brand.created_at,
        updated_at=brand.updated_at,
    )


async def _count_map(session: AsyncSession, user_id: int, names: list[str]) -> tuple[dict[str, int], dict[str, int]]:
    if not names:
        return {}, {}
    deals_stmt = (
        select(Deal.brand_name, func.count(Deal.id))
        .where(Deal.user_id == user_id)
        .where(Deal.brand_name.in_(names))
        .where(Deal.stage > 0)
        .group_by(Deal.brand_name)
    )
    short_stmt = (
        select(Deal.brand_name, func.count(Deal.id))
        .where(Deal.user_id == user_id)
        .where(Deal.brand_name.in_(names))
        .where(Deal.stage == SHORTLIST_STAGE)
        .group_by(Deal.brand_name)
    )
    deals_map = {name: count for name, count in (await session.execute(deals_stmt)).all() if name}
    short_map = {name: count for name, count in (await session.execute(short_stmt)).all() if name}
    return deals_map, short_map


@router.get("", response_model=list[BrandItem])
async def list_brands(
    current_user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
) -> list[BrandItem]:
    async with db.async_session() as session:
        stmt = select(Brand).where(Brand.user_id == current_user.id).order_by(Brand.updated_at.desc())
        brands = list((await session.execute(stmt)).scalars().all())
        deals_map, short_map = await _count_map(session, current_user.id, [b.name for b in brands])
        return [
            _brand_item(b, deals_map.get(b.name, 0), short_map.get(b.name, 0))
            for b in brands
        ]


@router.post("", response_model=BrandItem)
async def create_brand(
    payload: BrandCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
) -> BrandItem:
    async with db.async_session() as session:
        brand = Brand(
            user_id=current_user.id,
            name=payload.name.strip(),
            category=payload.category,
            status=payload.status,
            hue=payload.hue,
            desc=payload.desc,
            kb=(payload.kb or BrandKb()).model_dump(by_alias=True),
        )
        session.add(brand)
        await session.commit()
        await session.refresh(brand)
        return _brand_item(brand)


@router.get("/{brand_id}", response_model=BrandItem)
async def get_brand(
    brand_id: int,
    current_user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
) -> BrandItem:
    async with db.async_session() as session:
        brand = await session.get(Brand, brand_id)
        if brand is None or brand.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="Бренд не найден")
        deals_map, short_map = await _count_map(session, current_user.id, [brand.name])
        return _brand_item(brand, deals_map.get(brand.name, 0), short_map.get(brand.name, 0))


@router.patch("/{brand_id}", response_model=BrandItem)
async def update_brand(
    brand_id: int,
    payload: BrandUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
) -> BrandItem:
    async with db.async_session() as session:
        brand = await session.get(Brand, brand_id)
        if brand is None or brand.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="Бренд не найден")
        if payload.name is not None:
            brand.name = payload.name.strip()
        if payload.category is not None:
            brand.category = payload.category
        if payload.status is not None:
            brand.status = payload.status
        if payload.hue is not None:
            brand.hue = payload.hue
        if payload.desc is not None:
            brand.desc = payload.desc
        if payload.kb is not None:
            brand.kb = payload.kb.model_dump(by_alias=True)
        await session.commit()
        await session.refresh(brand)
        deals_map, short_map = await _count_map(session, current_user.id, [brand.name])
        return _brand_item(brand, deals_map.get(brand.name, 0), short_map.get(brand.name, 0))


@router.delete("/{brand_id}")
async def delete_brand(
    brand_id: int,
    current_user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
) -> dict[str, int | str]:
    async with db.async_session() as session:
        brand = await session.get(Brand, brand_id)
        if brand is None or brand.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="Бренд не найден")
        await session.delete(brand)
        await session.commit()
        return {"status": "deleted", "brand_id": brand_id}
