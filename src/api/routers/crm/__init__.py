from fastapi import APIRouter, Depends

from src.api.dependencies import require_subscription
from src.api.routers.crm import (
    analytics,
    auth,
    brands,
    communications,
    creators,
    deals,
    erid,
    media,
    oauth,
    webhooks,
)

_subscription = [Depends(require_subscription)]

router = APIRouter(prefix="/crm")
router.include_router(auth.router)
router.include_router(oauth.router)
router.include_router(webhooks.router)
router.include_router(media.router, dependencies=_subscription)
router.include_router(creators.router, dependencies=_subscription)
router.include_router(deals.router, dependencies=_subscription)
router.include_router(communications.router, dependencies=_subscription)
router.include_router(brands.router, dependencies=_subscription)
router.include_router(erid.router, dependencies=_subscription)
router.include_router(analytics.router, dependencies=_subscription)
