import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import delete as sa_delete, func, select, update as sa_update
from sqlalchemy.exc import IntegrityError

from src.api.dependencies import get_db, get_optional_user, require_admin
from src.api.schemas import (
    SUPPORT_TICKET_CATEGORIES,
    SUPPORT_TICKET_STATUSES,
    SupportTicketBulkRequest,
    SupportTicketBulkResponse,
    SupportTicketCreateRequest,
    SupportTicketDetail,
    SupportTicketItem,
    SupportTicketListResponse,
    SupportTicketStatusUpdateRequest,
)
from src.db.database import Database
from src.db.models import Ticket, User
from src.utils.rate_limiter import check_rate_limit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/support", tags=["Support"])


def build_ticket_item(ticket: Ticket) -> SupportTicketItem:
    return SupportTicketItem(
        id=ticket.id,
        ticket_number=ticket.ticket_number,
        user_id=ticket.user_id,
        email=ticket.email,
        category=ticket.category,
        subject=ticket.subject,
        status=ticket.status,
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
    )


@router.post("/tickets", response_model=SupportTicketItem, status_code=201)
async def create_support_ticket(
    payload: SupportTicketCreateRequest,
    request: Request,
    db: Database = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> SupportTicketItem:
    if current_user is None:
        await check_rate_limit(request, max_requests=5, window_seconds=3600)
        if payload.email is None:
            raise HTTPException(status_code=422, detail="Укажите email для связи")
        email = payload.email
        user_id = None
    else:
        await check_rate_limit(request, max_requests=20, window_seconds=3600, key_extra=f"user:{current_user.id}")
        email = current_user.email
        user_id = current_user.id
    async with db.async_session() as session:
        ticket = Ticket(
            ticket_number="T-0000",
            user_id=user_id,
            email=email,
            category=payload.category,
            subject=payload.subject,
            description=payload.description,
            page_url=payload.page_url,
            user_agent=payload.user_agent,
            status="new",
        )
        session.add(ticket)
        try:
            await session.flush()
            ticket.ticket_number = f"T-{ticket.id:04d}"
            await session.commit()
        except IntegrityError as exc:
            await session.rollback()
            logger.exception("Failed to create support ticket")
            raise HTTPException(status_code=500, detail="Не удалось создать обращение") from exc
        await session.refresh(ticket)
        return build_ticket_item(ticket)


@router.get("/tickets", response_model=SupportTicketListResponse)
async def list_support_tickets(
    db: Database = Depends(get_db),
    _admin: User = Depends(require_admin),
    status: str | None = Query(default=None),
    category: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> SupportTicketListResponse:
    stmt = select(Ticket)
    count_stmt = select(func.count(Ticket.id))
    if status is not None:
        normalized_status = status.strip().lower()
        if normalized_status not in SUPPORT_TICKET_STATUSES:
            raise HTTPException(status_code=422, detail="Недопустимый статус тикета")
        stmt = stmt.where(Ticket.status == normalized_status)
        count_stmt = count_stmt.where(Ticket.status == normalized_status)
    if category is not None:
        normalized_category = category.strip().lower()
        if normalized_category not in SUPPORT_TICKET_CATEGORIES:
            raise HTTPException(status_code=422, detail="Недопустимая категория обращения")
        stmt = stmt.where(Ticket.category == normalized_category)
        count_stmt = count_stmt.where(Ticket.category == normalized_category)
    stmt = stmt.order_by(Ticket.created_at.desc(), Ticket.id.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    async with db.async_session() as session:
        total = (await session.execute(count_stmt)).scalar_one()
        tickets = (await session.execute(stmt)).scalars().all()
    return SupportTicketListResponse(
        items=[build_ticket_item(ticket) for ticket in tickets],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/tickets/{ticket_id}", response_model=SupportTicketDetail)
async def get_support_ticket(
    ticket_id: int,
    db: Database = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> SupportTicketDetail:
    async with db.async_session() as session:
        ticket = (await session.execute(select(Ticket).where(Ticket.id == ticket_id))).scalar_one_or_none()
    if ticket is None:
        raise HTTPException(status_code=404, detail="Тикет не найден")
    return SupportTicketDetail(
        **build_ticket_item(ticket).model_dump(),
        description=ticket.description,
        page_url=ticket.page_url,
        user_agent=ticket.user_agent,
    )


@router.patch("/tickets/{ticket_id}", response_model=SupportTicketItem)
async def update_support_ticket_status(
    ticket_id: int,
    payload: SupportTicketStatusUpdateRequest,
    db: Database = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> SupportTicketItem:
    async with db.async_session() as session:
        ticket = (await session.execute(select(Ticket).where(Ticket.id == ticket_id))).scalar_one_or_none()
        if ticket is None:
            raise HTTPException(status_code=404, detail="Тикет не найден")
        ticket.status = payload.status
        await session.commit()
        await session.refresh(ticket)
        return build_ticket_item(ticket)


@router.delete("/tickets/{ticket_id}", status_code=204)
async def delete_support_ticket(
    ticket_id: int,
    db: Database = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> None:
    async with db.async_session() as session:
        ticket = (await session.execute(select(Ticket).where(Ticket.id == ticket_id))).scalar_one_or_none()
        if ticket is None:
            raise HTTPException(status_code=404, detail="Тикет не найден")
        await session.delete(ticket)
        await session.commit()


@router.post("/tickets/bulk", response_model=SupportTicketBulkResponse)
async def bulk_update_support_tickets(
    payload: SupportTicketBulkRequest,
    db: Database = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> SupportTicketBulkResponse:
    unique_ids = list(dict.fromkeys(payload.ticket_ids))
    async with db.async_session() as session:
        if payload.action == "delete":
            result = await session.execute(sa_delete(Ticket).where(Ticket.id.in_(unique_ids)))
        else:
            result = await session.execute(
                sa_update(Ticket).where(Ticket.id.in_(unique_ids)).values(status=payload.status)
            )
        await session.commit()
        affected = getattr(result, "rowcount", 0) or 0
        return SupportTicketBulkResponse(affected=affected)
