from fastapi import APIRouter, Depends, HTTPException, Request

from src.api.dependencies import get_current_user, get_db
from src.api.schemas import (
    AutoOutreachPreviewResponse,
    AutoOutreachRequest,
    AutoOutreachRunResponse,
)
from src.api.services.auto_outreach import AutoOutreachService, AutoOutreachServiceError
from src.db.database import Database
from src.db.models import User

router = APIRouter(prefix="/outreach", tags=["CRM Automatic Outreach"])


def get_auto_outreach_service(
    request: Request,
    db: Database = Depends(get_db),
) -> AutoOutreachService:
    return AutoOutreachService(db, request.app.state.settings)


def raise_service_error(error: AutoOutreachServiceError) -> None:
    raise HTTPException(
        status_code=error.status_code,
        detail={"code": error.code, "message": error.message},
    ) from None


@router.get("/preview", response_model=AutoOutreachPreviewResponse)
async def preview_auto_outreach(
    brand_id: int,
    current_user: User = Depends(get_current_user),
    service: AutoOutreachService = Depends(get_auto_outreach_service),
) -> AutoOutreachPreviewResponse:
    try:
        return await service.preview(current_user.id, brand_id)
    except AutoOutreachServiceError as error:
        raise_service_error(error)
    finally:
        await service.close()


@router.post("", response_model=AutoOutreachRunResponse)
async def run_auto_outreach(
    payload: AutoOutreachRequest,
    current_user: User = Depends(get_current_user),
    service: AutoOutreachService = Depends(get_auto_outreach_service),
) -> AutoOutreachRunResponse:
    try:
        return await service.run(current_user.id, payload.brand_id)
    except AutoOutreachServiceError as error:
        raise_service_error(error)
    finally:
        await service.close()
