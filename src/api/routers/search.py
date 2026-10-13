import json

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, or_, select

from src.api.dependencies import get_current_user, get_db, get_search_service
from src.api.schemas import BrandAnalysisRequest, BrandAnalysisResponse, SearchPlanRequest, SearchPlanResponse, SearchRequest, SearchResponse, SimilarSearchRequest
from src.api.services.search import SearchService
from src.db.database import Database
from src.db.models import Account, User
from src.utils.countries import get_all_countries
from src.utils.languages import get_all_languages
from src.utils.rate_limiter import rate_limit
from src.utils.security import decode_access_token

router = APIRouter(tags=["Search"])


async def authorize_contact_results(request: Request, db: Database) -> None:
    auth = request.headers.get("Authorization", "")
    token = auth[7:].strip() if auth.startswith("Bearer ") else ""
    payload = decode_access_token(token, request.app.state.settings.secret_key) if token else None
    if payload is None:
        raise HTTPException(status_code=401, detail="Authentication required to include contacts")
    user_id = payload.get("user_id")
    email = payload.get("sub") or payload.get("email")
    async with db.async_session() as session:
        stmt = select(User).where(User.id == user_id) if isinstance(user_id, int) else select(User).where(func.lower(User.email) == str(email).lower())
        user = (await session.execute(stmt)).scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=403, detail="Active account required to include contacts")


@router.get("/languages")
async def list_languages() -> Response:
    data = get_all_languages()
    return Response(
        content=json.dumps({"languages": data.get("languages", []), "aliases": data.get("aliases", {})}, ensure_ascii=False),
        media_type="application/json",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/countries")
async def list_countries() -> Response:
    data = get_all_countries()
    return Response(
        content=json.dumps({"countries": data.get("countries", []), "aliases": data.get("aliases", {})}, ensure_ascii=False),
        media_type="application/json",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.post("/", response_model=SearchResponse, response_model_exclude_none=True)
async def search_content(
    payload: SearchRequest,
    request: Request,
    db: Database = Depends(get_db),
    service: SearchService = Depends(get_search_service),
    _rate_limit: None = Depends(rate_limit(max_requests=20, window_seconds=60)),
) -> SearchResponse:
    if payload.include_contacts:
        await authorize_contact_results(request, db)
    return await service.execute_search(payload)


@router.post("/plan", response_model=SearchPlanResponse, response_model_exclude_none=True)
async def plan_search(
    payload: SearchPlanRequest,
    service: SearchService = Depends(get_search_service),
    _rate_limit: None = Depends(rate_limit(max_requests=20, window_seconds=60)),
) -> SearchPlanResponse:
    return await service.plan_campaign(payload)


@router.post("/analyze-brand", response_model=BrandAnalysisResponse, response_model_exclude_none=True)
async def analyze_brand(
    payload: BrandAnalysisRequest,
    service: SearchService = Depends(get_search_service),
    _rate_limit: None = Depends(rate_limit(max_requests=20, window_seconds=60)),
) -> BrandAnalysisResponse:
    return await service.analyze_brand(payload)

@router.post("/similar", response_model=SearchResponse, response_model_exclude_none=True)
async def search_similar(
    payload: SimilarSearchRequest,
    db: Database = Depends(get_db),
    service: SearchService = Depends(get_search_service),
    current_user: User = Depends(get_current_user),
    _rate_limit: None = Depends(rate_limit(max_requests=20, window_seconds=60)),
) -> SearchResponse:
    raw_ids: list[str] = []
    for aid in payload.account_ids:
        cleaned = str(aid).strip().lstrip("@")
        if cleaned and cleaned.lower() not in {"undefined", "null"}:
            raw_ids.append(cleaned)
    raw_ids = list(dict.fromkeys(raw_ids))[:50]
    if not raw_ids:
        raise HTTPException(status_code=400, detail="Не переданы авторы для поиска похожих")
    numeric_ids: list[int] = [int(x) for x in raw_ids if x.isdigit()]
    lowered = [x.lower() for x in raw_ids]
    async with db.async_session() as session:
        conditions = []
        if numeric_ids:
            conditions.append(Account.id.in_(numeric_ids))
        if lowered:
            conditions.append(func.lower(Account.username).in_(lowered))
            conditions.append(func.lower(Account.username).in_([f"@{u}" for u in lowered]))
        stmt = select(Account).where(or_(*conditions)) if conditions else None
        seeds = list((await session.execute(stmt)).scalars().all()) if stmt is not None else []
    if not seeds:
        raise HTTPException(status_code=404, detail="Авторы не найдены в базе")
    seed_ids = {a.id for a in seeds}
    query_parts: list[str] = []
    for acc in seeds[:5]:
        if acc.category_path:
            query_parts.append(acc.category_path.replace("/", " "))
        if acc.title:
            query_parts.append(acc.title)
    seed_names = {
        (f"@{a.username}" if a.username and not a.username.startswith("@") else a.username or a.title or "")
        for a in seeds
    }
    query = " ".join(query_parts).strip()
    if not query:
        raise HTTPException(status_code=400, detail="Недостаточно данных об авторах для подбора похожих")
    request_payload = SearchRequest(query=query[:2000], limit=min(payload.limit + len(seed_ids) + 5, 100), author_type="all")
    response = await service.execute_search(request_payload)
    filtered = []
    for item in response.items:
        if item.account_id in seed_ids:
            continue
        item.match_type = "affinity"
        if not item.affinity_reason and seed_names:
            item.affinity_reason = "похож на " + ", ".join(sorted(n for n in seed_names if n)[:3])
        filtered.append(item)
        if len(filtered) >= payload.limit:
            break
    response.items = filtered
    response.total = len(filtered)
    return response
