from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest

from src.api.services.instagram_dialogs import archive_instagram_dialogs, is_instagram_deletion_locked, restore_instagram_dialogs
from src.db.models import Deal, UserInstagramAccount, UserShortlist


class Result:
    def __init__(self, items):
        self.items = items

    def scalars(self):
        return self

    def all(self):
        return self.items


def account() -> UserInstagramAccount:
    return UserInstagramAccount(id=7, user_id=11, login="creator", normalized_login="creator", status="ok")


def deal(stage: int = 3) -> Deal:
    return Deal(
        id=21,
        user_id=11,
        account_id=31,
        title="Campaign",
        stage=stage,
        budget=0,
        type="Stories",
        instagram_account_id=7,
        terms="Initial terms",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


@pytest.mark.asyncio
async def test_delete_archives_only_linked_active_deal_and_preserves_history() -> None:
    item = account()
    linked = deal()
    shortlist = UserShortlist(user_id=11, account_id=31, status="Свободен", source="search")
    session = AsyncMock()
    session.execute.side_effect = [Result([linked]), Result([]), Result([shortlist])]
    await archive_instagram_dialogs(session, item, "creator")
    assert linked.stage == 0
    assert linked.stage_before_instagram_deletion == 3
    assert linked.instagram_deletion_archived_at is not None
    assert "Instagram-аккаунт @creator" in linked.terms
    assert shortlist.status == "В архиве"
    assert shortlist.status_before_instagram_deletion == "Свободен"
    assert shortlist.instagram_deletion_account_id == 7


@pytest.mark.asyncio
async def test_restore_returns_only_deletion_archived_state_and_is_idempotent() -> None:
    item = account()
    linked = deal(0)
    linked.stage_before_instagram_deletion = 4
    linked.instagram_deletion_archived_at = datetime.now(timezone.utc)
    shortlist = UserShortlist(
        user_id=11,
        account_id=31,
        status="В архиве",
        status_before_instagram_deletion="Свободен",
        instagram_deletion_account_id=7,
        source="search",
    )
    session = AsyncMock()
    session.execute.side_effect = [Result([linked]), Result([shortlist]), Result([]), Result([])]
    await restore_instagram_dialogs(session, item)
    assert linked.stage == 4
    assert linked.instagram_deletion_archived_at is None
    assert linked.stage_before_instagram_deletion is None
    assert shortlist.status == "Свободен"
    assert shortlist.instagram_deletion_account_id is None
    await restore_instagram_dialogs(session, item)
    assert linked.stage == 4


@pytest.mark.asyncio
async def test_manual_archive_is_not_changed_by_restore() -> None:
    item = account()
    manually_archived = deal(0)
    shortlist = UserShortlist(user_id=11, account_id=31, status="В архиве", source="search")
    session = AsyncMock()
    session.execute.side_effect = [Result([manually_archived]), Result([]), Result([shortlist])]
    await archive_instagram_dialogs(session, item, "creator")
    assert manually_archived.stage_before_instagram_deletion is None
    session.execute.side_effect = [Result([]), Result([])]
    await restore_instagram_dialogs(session, item)
    assert manually_archived.stage == 0
    assert shortlist.status == "В архиве"


@pytest.mark.asyncio
async def test_account_without_linked_deals_does_not_archive_authors() -> None:
    session = AsyncMock()
    session.execute.side_effect = [Result([]), Result([])]
    await archive_instagram_dialogs(session, account(), "creator")
    assert session.execute.await_count == 2


@pytest.mark.asyncio
async def test_message_only_dialog_is_archived_and_locked() -> None:
    shortlist = UserShortlist(user_id=11, account_id=41, status="Свободен", source="search")
    session = AsyncMock()
    session.execute.side_effect = [Result([]), Result([(41,)]), Result([shortlist])]
    await archive_instagram_dialogs(session, account(), "creator")
    assert shortlist.status == "В архиве"
    assert is_instagram_deletion_locked(shortlist)
    shortlist.instagram_deletion_account_id = None
    assert not is_instagram_deletion_locked(shortlist)
