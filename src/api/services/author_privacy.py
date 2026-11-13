from sqlalchemy import select

from src.api.schemas import SearchResponse
from src.db.database import Database
from src.db.models import CreatorMessage, User


async def apply_instagram_username_visibility(
    response: SearchResponse,
    *,
    current_user: User | None,
    db: Database,
) -> SearchResponse:
    instagram_ids = {
        item.account_id
        for item in response.items
        if getattr(item, "platform", "").lower() == "instagram"
    }
    if not instagram_ids:
        return response
    replied_ids: set[int] = set()
    if current_user is not None:
        async with db.async_session() as session:
            replied_ids = set((await session.execute(
                select(CreatorMessage.account_id)
                .where(
                    CreatorMessage.user_id == current_user.id,
                    CreatorMessage.account_id.in_(instagram_ids),
                    CreatorMessage.sender_type == "creator",
                )
                .distinct()
            )).scalars().all())
    for item in response.items:
        if getattr(item, "platform", "").lower() == "instagram" and item.account_id not in replied_ids:
            item.username = None
            item.url = None
    return response
