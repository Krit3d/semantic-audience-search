from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest

from src.api.services import communication_domain
from src.api.services.communication_domain import (
    CommunicationServiceError,
    channel_status_for_sender,
    ensure_sender_account,
    handle_sender_unavailable,
    record_outgoing_message,
    select_available_sender,
)
from src.db.models import (
    ChannelIdentity,
    CreatorMessage,
    Deal,
    SenderAccount,
    Thread,
    UserInstagramAccount,
)

NOW = datetime(2026, 11, 6, 12, 0, tzinfo=timezone.utc)


class Result:
    def __init__(self, items: list[object]) -> None:
        self.items = items

    def scalars(self) -> "Result":
        return self

    def all(self) -> list[object]:
        return self.items

    def scalar_one_or_none(self) -> object | None:
        return self.items[0] if self.items else None


def sender(account_id: int = 7, user_id: int = 11, status: str = "ok") -> SenderAccount:
    return SenderAccount(
        id=account_id,
        user_id=user_id,
        platform="instagram",
        provider="bridgit",
        login="sender",
        normalized_login="sender",
        status=status,
        rotation_enabled=True,
        created_at=NOW,
        updated_at=NOW,
    )


def deal() -> Deal:
    return Deal(
        id=21,
        user_id=11,
        account_id=31,
        title="Campaign",
        stage=4,
        budget=0,
        type="Stories",
        communication_state="recontact_required",
        created_at=NOW,
        updated_at=NOW,
    )


def channel(sender_account_id: int = 7) -> ChannelIdentity:
    return ChannelIdentity(
        id=41,
        user_id=11,
        sender_account_id=sender_account_id,
        author_account_id=31,
        platform="instagram",
        status="active",
        created_at=NOW,
        updated_at=NOW,
    )


def thread(channel_identity_id: int = 41) -> Thread:
    return Thread(
        id=51,
        user_id=11,
        channel_identity_id=channel_identity_id,
        author_account_id=31,
        deal_id=21,
        is_read_only=False,
        created_at=NOW,
        updated_at=NOW,
    )


@pytest.mark.parametrize(
    ("status", "deleted_at", "expected"),
    [
        ("ok", None, "active"),
        ("needcheck", None, "pending_verification"),
        ("bad_password", None, "blocked"),
        ("deleted", NOW, "deleted"),
    ],
)
def test_channel_status_uses_sender_availability(status: str, deleted_at: datetime | None, expected: str) -> None:
    item = sender(status=status)
    item.deleted_at = deleted_at
    assert channel_status_for_sender(item) == expected


@pytest.mark.asyncio
async def test_pool_selection_is_scoped_to_one_user(monkeypatch: pytest.MonkeyPatch) -> None:
    item = sender()
    session = AsyncMock()
    session.execute.return_value = Result([item])
    monkeypatch.setattr(communication_domain, "sync_legacy_pool", AsyncMock())
    selected = await select_available_sender(session, 11)
    assert selected is item
    statement = session.execute.await_args.args[0]
    assert "sender_accounts.user_id" in str(statement)
    assert item.last_assigned_at is not None


@pytest.mark.asyncio
async def test_legacy_login_cannot_belong_to_another_user() -> None:
    legacy = UserInstagramAccount(
        id=5,
        user_id=11,
        login="shared",
        normalized_login="shared",
        status="ok",
        created_at=NOW,
        updated_at=NOW,
    )
    session = AsyncMock()
    session.scalar.side_effect = [None, sender(user_id=22)]
    with pytest.raises(CommunicationServiceError) as error:
        await ensure_sender_account(session, legacy)
    assert error.value.code == "account_already_assigned"


@pytest.mark.asyncio
async def test_first_outgoing_message_resumes_without_changing_stage(monkeypatch: pytest.MonkeyPatch) -> None:
    session = AsyncMock()
    monkeypatch.setattr(communication_domain, "add_activity", AsyncMock())
    item = deal()
    message = CreatorMessage(
        id=61,
        user_id=11,
        account_id=31,
        deal_id=21,
        sender_type="user",
        text="Hello",
        created_at=NOW,
    )
    current_channel = channel()
    current_thread = thread()
    current_sender = sender()
    await record_outgoing_message(
        session,
        message=message,
        channel=current_channel,
        thread=current_thread,
        sender=current_sender,
        deal=item,
    )
    assert item.stage == 4
    assert item.communication_state == "resumed"
    assert item.primary_thread_id == current_thread.id
    assert item.last_contact_at == NOW
    assert message.thread_id == current_thread.id
    assert message.sender_account_id == current_sender.id
    assert message.delivery_status == "pending"


@pytest.mark.asyncio
async def test_unavailable_sender_preserves_stage_and_history(monkeypatch: pytest.MonkeyPatch) -> None:
    current_channel = channel()
    current_thread = thread()
    item = deal()
    current_sender = sender(status="bad_password")
    session = AsyncMock()
    session.scalar.return_value = current_thread
    session.execute.side_effect = [
        Result([current_channel]),
        Result([item]),
        Result([]),
    ]
    monkeypatch.setattr(communication_domain, "select_available_sender", AsyncMock(return_value=None))
    monkeypatch.setattr(communication_domain, "add_activity", AsyncMock())
    await handle_sender_unavailable(session, current_sender, "blocked")
    assert item.stage == 4
    assert item.communication_state == "interrupted"
    assert current_channel.status == "blocked"
    assert current_thread.is_read_only is True


@pytest.mark.asyncio
async def test_legacy_thread_without_sender_does_not_lock_user(monkeypatch: pytest.MonkeyPatch) -> None:
    session = AsyncMock()
    session.scalar.return_value = None
    lock_user = AsyncMock()
    monkeypatch.setattr(communication_domain, "lock_user", lock_user)
    monkeypatch.setattr(communication_domain, "get_latest_deal", AsyncMock(return_value=None))

    result = await communication_domain.ensure_legacy_thread(
        session,
        user_id=11,
        author_account_id=31,
        deal=None,
    )

    assert result is None
    lock_user.assert_not_awaited()


def test_global_active_login_index_is_platform_scoped() -> None:
    index = next(
        item for item in SenderAccount.__table__.indexes
        if item.name == "uq_sender_accounts_active_platform_login"
    )
    assert index.unique is True
    assert [column.name for column in index.columns] == ["platform", "normalized_login"]
    assert "user_id" not in index.columns
