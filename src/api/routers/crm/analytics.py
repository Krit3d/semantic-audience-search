import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from src.api.dependencies import get_current_user, get_db
from src.api.schemas import (
    AnalyticsFunnelStep,
    AnalyticsNetwork,
    AnalyticsRevenuePoint,
    AnalyticsSummary,
    AnalyticsTopAuthor,
    AnalyticsTotals,
    PublicationItem,
)
from src.db.database import Database
from src.db.models import Account, Deal, Publication, User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["CRM Analytics"])

FUNNEL_STAGES: list[tuple[int, str]] = [
    (1, "Первичный контакт"),
    (2, "Переговоры"),
    (3, "Согласование ТЗ"),
    (4, "Подписание договора"),
    (6, "Контент создан"),
]

PERIOD_DAYS: dict[str, int] = {"30d": 30, "6m": 183, "1y": 365}

MONTH_LABELS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"]


def _publication_item(pub: Publication) -> PublicationItem:
    account = pub.account
    brand = pub.brand
    raw = account.username if account is not None else None
    handle = (raw if raw.startswith("@") else f"@{raw}") if raw else None
    return PublicationItem(
        id=pub.id,
        deal_id=pub.deal_id,
        author_id=str(pub.account_id),
        author_handle=handle,
        brand_id=pub.brand_id,
        brand_name=brand.name if brand is not None else None,
        platform=pub.platform,
        type=pub.type,
        text=pub.text,
        published_at=pub.published_at,
        url=pub.url,
        views=pub.views,
        clicks=pub.clicks,
        revenue=pub.revenue,
        cost=pub.cost,
        erid=pub.erid,
        sync_status=pub.sync_status,
    )


@router.get("/publications", response_model=list[PublicationItem])
async def list_publications(
    brand_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
) -> list[PublicationItem]:
    async with db.async_session() as session:
        stmt = select(Publication).where(Publication.user_id == current_user.id)
        if brand_id is not None:
            stmt = stmt.where(Publication.brand_id == brand_id)
        stmt = stmt.order_by(Publication.published_at.desc())
        pubs = list((await session.execute(stmt)).scalars().all())
        return [_publication_item(p) for p in pubs]


@router.get("/analytics/summary", response_model=AnalyticsSummary)
async def analytics_summary(
    period: str = "6m",
    brand_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Database = Depends(get_db),
) -> AnalyticsSummary:
    days = PERIOD_DAYS.get(period, 183)
    since = datetime.now(timezone.utc) - timedelta(days=days)
    async with db.async_session() as session:
        funnel: list[AnalyticsFunnelStep] = []
        for stage_id, label in FUNNEL_STAGES:
            stmt = (
                select(func.count(Deal.id))
                .where(Deal.user_id == current_user.id)
                .where(Deal.stage == stage_id)
            )
            count = (await session.execute(stmt)).scalar_one()
            funnel.append(AnalyticsFunnelStep(stage=stage_id, label=label, count=count))

        deals_stmt = (
            select(func.count(Deal.id))
            .where(Deal.user_id == current_user.id)
            .where(Deal.stage > 0)
        )
        deals_total = (await session.execute(deals_stmt)).scalar_one()

        pub_stmt = select(Publication).where(Publication.user_id == current_user.id)
        if brand_id is not None:
            pub_stmt = pub_stmt.where(Publication.brand_id == brand_id)
        pub_stmt = pub_stmt.where(Publication.published_at >= since)
        pubs = list((await session.execute(pub_stmt)).scalars().all())

        by_month: dict[tuple[int, int], int] = {}
        for pub in pubs:
            key = (pub.published_at.year, pub.published_at.month)
            by_month[key] = by_month.get(key, 0) + pub.revenue
        revenue_points: list[AnalyticsRevenuePoint] = []
        now = datetime.now(timezone.utc)
        months_back = 5 if days <= 183 else 11
        for offset in range(months_back, -1, -1):
            month_index = (now.year * 12 + now.month - 1) - offset
            year, month_zero = divmod(month_index, 12)
            month = month_zero + 1
            value = by_month.get((year, month), 0)
            revenue_points.append(AnalyticsRevenuePoint(
                period=MONTH_LABELS[month_zero],
                revenue=round(value / 1_000_000, 2),
            ))

        by_author: dict[int, int] = {}
        for pub in pubs:
            by_author[pub.account_id] = by_author.get(pub.account_id, 0) + pub.revenue
        top_ids = sorted(by_author, key=lambda aid: by_author[aid], reverse=True)[:5]
        handles: dict[int, str] = {}
        if top_ids:
            acc_stmt = select(Account.id, Account.username, Account.title).where(Account.id.in_(top_ids))
            for acc_id, username, title in (await session.execute(acc_stmt)).all():
                raw = username or title or str(acc_id)
                handles[acc_id] = raw if raw.startswith("@") else f"@{raw}"
        top_authors = [
            AnalyticsTopAuthor(author_id=str(aid), handle=handles.get(aid, str(aid)), revenue=by_author[aid])
            for aid in top_ids
        ]

        by_platform: dict[str, int] = {}
        total_views = 0
        for pub in pubs:
            by_platform[pub.platform] = by_platform.get(pub.platform, 0) + pub.views
            total_views += pub.views
        networks = [
            AnalyticsNetwork(platform=platform, share=round(views / total_views * 100) if total_views else 0)
            for platform, views in sorted(by_platform.items(), key=lambda kv: kv[1], reverse=True)
        ]

        revenue_total = sum(p.revenue for p in pubs)
        cost_total = sum(p.cost for p in pubs)
        return AnalyticsSummary(
            period=period,
            funnel=funnel,
            revenue=revenue_points,
            top_authors=top_authors,
            networks=networks,
            totals=AnalyticsTotals(
                revenue=revenue_total,
                deals=deals_total,
                publications=len(pubs),
                avg_roas=round(revenue_total / cost_total, 2) if cost_total else None,
            ),
        )
