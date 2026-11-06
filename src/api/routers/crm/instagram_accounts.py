from fastapi import APIRouter, Depends, HTTPException, Request

from src.api.dependencies import get_current_user, get_db
from src.api.instagram_schemas import (
    InstagramAccountConfirmRequest,
    InstagramAccountCreateRequest,
    InstagramAccountDeleteResponse,
    InstagramAccountResponse,
)
from src.api.services.instagram_accounts import InstagramAccountService, InstagramAccountServiceError
from src.db.database import Database
from src.db.models import User

router = APIRouter(prefix="/instagram-accounts", tags=["CRM Instagram Accounts"])


def get_instagram_account_service(request: Request, db: Database = Depends(get_db)) -> InstagramAccountService:
    return InstagramAccountService(db, request.app.state.settings)


def raise_service_error(error: InstagramAccountServiceError) -> None:
    raise HTTPException(
        status_code=error.status_code,
        detail={"code": error.code, "message": error.message, "field": error.field},
    ) from None


@router.get("", response_model=list[InstagramAccountResponse])
async def list_instagram_accounts(
    current_user: User = Depends(get_current_user),
    service: InstagramAccountService = Depends(get_instagram_account_service),
) -> list[InstagramAccountResponse]:
    return await service.list_accounts(current_user.id)


@router.post("", response_model=InstagramAccountResponse, status_code=201)
async def add_instagram_account(
    payload: InstagramAccountCreateRequest,
    current_user: User = Depends(get_current_user),
    service: InstagramAccountService = Depends(get_instagram_account_service),
) -> InstagramAccountResponse:
    try:
        return await service.add_account(
            current_user.id,
            payload.login,
            payload.password,
            payload.country,
            payload.two_factor,
            payload.brand_id,
        )
    except InstagramAccountServiceError as error:
        raise_service_error(error)


@router.get("/{account_id}", response_model=InstagramAccountResponse)
async def get_instagram_account(
    account_id: int,
    current_user: User = Depends(get_current_user),
    service: InstagramAccountService = Depends(get_instagram_account_service),
) -> InstagramAccountResponse:
    try:
        return await service.get_account(current_user.id, account_id)
    except InstagramAccountServiceError as error:
        raise_service_error(error)


@router.post("/{account_id}/confirm", response_model=InstagramAccountResponse)
async def confirm_instagram_account(
    account_id: int,
    payload: InstagramAccountConfirmRequest,
    current_user: User = Depends(get_current_user),
    service: InstagramAccountService = Depends(get_instagram_account_service),
) -> InstagramAccountResponse:
    try:
        return await service.confirm_account(current_user.id, account_id, payload.password, payload.two_factor)
    except InstagramAccountServiceError as error:
        raise_service_error(error)


@router.post("/{account_id}/resume", response_model=InstagramAccountResponse)
async def resume_instagram_account(
    account_id: int,
    current_user: User = Depends(get_current_user),
    service: InstagramAccountService = Depends(get_instagram_account_service),
) -> InstagramAccountResponse:
    try:
        return await service.resume_account(current_user.id, account_id)
    except InstagramAccountServiceError as error:
        raise_service_error(error)


@router.delete("/{account_id}", response_model=InstagramAccountDeleteResponse)
async def delete_instagram_account(
    account_id: int,
    current_user: User = Depends(get_current_user),
    service: InstagramAccountService = Depends(get_instagram_account_service),
) -> InstagramAccountDeleteResponse:
    try:
        return await service.delete_account(current_user.id, account_id)
    except InstagramAccountServiceError as error:
        raise_service_error(error)
