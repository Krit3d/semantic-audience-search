from unittest.mock import AsyncMock, MagicMock

import pytest

from src.api.schemas import AuthorSearchResultItem, SearchResponse
from src.api.services.author_privacy import apply_instagram_username_visibility
from src.db.models import User


def response() -> SearchResponse:
    return SearchResponse(items=[
        AuthorSearchResultItem(account_id=1, platform="instagram", username="replied", title="Ответивший", url="https://instagram.com/replied", final_score=0.9),
        AuthorSearchResultItem(account_id=2, platform="instagram", username="hidden", title="Скрытый", url="https://instagram.com/hidden", final_score=0.8),
        AuthorSearchResultItem(account_id=3, platform="telegram", username="telegram", title="Telegram", url="https://t.me/telegram", final_score=0.7),
    ])


def db_with_replies(replies: list[int]) -> MagicMock:
    result = MagicMock()
    result.scalars.return_value.all.return_value = replies
    session = AsyncMock()
    session.execute.return_value = result
    context = AsyncMock()
    context.__aenter__.return_value = session
    db = MagicMock()
    db.async_session.return_value = context
    return db


@pytest.mark.asyncio
async def test_instagram_username_is_visible_only_after_author_reply() -> None:
    result = await apply_instagram_username_visibility(
        response(),
        current_user=User(id=11, email="user@example.invalid"),
        db=db_with_replies([1]),
    )

    assert result.items[0].username == "replied"
    assert result.items[0].url == "https://instagram.com/replied"
    assert result.items[1].username is None
    assert result.items[1].url is None
    assert result.items[2].username == "telegram"
    assert result.items[2].url == "https://t.me/telegram"


@pytest.mark.asyncio
async def test_anonymous_search_hides_instagram_username_without_db_query() -> None:
    db = db_with_replies([1, 2])

    result = await apply_instagram_username_visibility(response(), current_user=None, db=db)

    assert result.items[0].username is None
    assert result.items[0].url is None
    assert result.items[1].username is None
    assert result.items[1].url is None
    db.async_session.assert_not_called()


@pytest.mark.asyncio
async def test_outgoing_message_does_not_unlock_instagram_username() -> None:
    result = await apply_instagram_username_visibility(
        response(),
        current_user=User(id=11, email="user@example.invalid"),
        db=db_with_replies([]),
    )

    assert result.items[0].username is None
    assert result.items[0].url is None
