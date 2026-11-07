from fastapi import APIRouter, Depends, HTTPException, Request

from src.api.dependencies import get_current_user, get_db
from src.api.instagram_schemas import (
    InstagramAccountConfirmRequest,
    InstagramAccountCreateRequest,
    InstagramAccountDeleteResponse,
    SenderAccountResponse,
)
from src.api.services.instagram_accounts import InstagramAccountServiceError
from src.api.services.sender_accounts import SenderAccountService
from src.db.database import Database
from src.db.models import User

router = APIRouter(prefix="/brands/{brand_id}/accounts", tags=["CRM Brand Accounts"])


def get_sender_account_service(request: Request, db: Database = Depends(get_db)) -> SenderAccountService:
    return SenderAccountService(db, request.app.state.settings)


def raise_service_error(error: InstagramAccountServiceError) -> None:
    raise HTTPException(
        status_code=error.status_code,
        detail={"code": error.code, "message": error.message, "field": error.field},
    ) from None


@router.get("", response_model=list[SenderAccountResponse])
async def list_sender_accounts(
    brand_id: int,
    current_user: User = Depends(get_current_user),
    service: SenderAccountService = Depends(get_sender_account_service),
) -> list[SenderAccountResponse]:
    try:
        return await service.list_accounts(current_user.id, brand_id)
    except InstagramAccountServiceError as error:
        raise_service_error(error)


@router.post("", response_model=SenderAccountResponse, status_code=201)
async def add_sender_account(
    brand_id: int,
    payload: InstagramAccountCreateRequest,
    current_user: User = Depends(get_current_user),
    service: SenderAccountService = Depends(get_sender_account_service),
) -> SenderAccountResponse:
    try:
        return await service.add_account(
            current_user.id,
            brand_id,
            payload.login,
            payload.password,
            payload.country,
            payload.two_factor,
        )
    except InstagramAccountServiceError as error:
        raise_service_error(error)


@router.get("/{account_id}", response_model=SenderAccountResponse)
async def get_sender_account(
    brand_id: int,
    account_id: int,
    current_user: User = Depends(get_current_user),
    service: SenderAccountService = Depends(get_sender_account_service),
) -> SenderAccountResponse:
    try:
        return await service.get_account(current_user.id, brand_id, account_id)
    except InstagramAccountServiceError as error:
        raise_service_error(error)


@router.post("/{account_id}/confirm", response_model=SenderAccountResponse)
async def confirm_sender_account(
    brand_id: int,
    account_id: int,
    payload: InstagramAccountConfirmRequest,
    current_user: User = Depends(get_current_user),
    service: SenderAccountService = Depends(get_sender_account_service),
) -> SenderAccountResponse:
    try:
        return await service.confirm_account(
            current_user.id,
            brand_id,
            account_id,
            payload.password,
            payload.two_factor,
        )
    except InstagramAccountServiceError as error:
        raise_service_error(error)


@router.post("/{account_id}/resume", response_model=SenderAccountResponse)
async def resume_sender_account(
    brand_id: int,
    account_id: int,
    current_user: User = Depends(get_current_user),
    service: SenderAccountService = Depends(get_sender_account_service),
) -> SenderAccountResponse:
    try:
        return await service.resume_account(current_user.id, brand_id, account_id)
    except InstagramAccountServiceError as error:
        raise_service_error(error)


@router.delete("/{account_id}", response_model=InstagramAccountDeleteResponse)
async def delete_sender_account(
    brand_id: int,
    account_id: int,
    current_user: User = Depends(get_current_user),
    service: SenderAccountService = Depends(get_sender_account_service),
) -> InstagramAccountDeleteResponse:
    try:
        return await service.delete_account(current_user.id, brand_id, account_id)
    except InstagramAccountServiceError as error:
        raise_service_error(error)
