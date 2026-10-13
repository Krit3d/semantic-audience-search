from fastapi import APIRouter

from src.api.routers.crm import (
    analytics,
    auth,
    brands,
    communications,
    creators,
    deals,
    erid,
    media,
    webhooks,
)

router = APIRouter(prefix="/crm")
router.include_router(auth.router)
router.include_router(media.router)
router.include_router(webhooks.router)
router.include_router(creators.router)
router.include_router(deals.router)
router.include_router(communications.router)
router.include_router(brands.router)
router.include_router(erid.router)
router.include_router(analytics.router)