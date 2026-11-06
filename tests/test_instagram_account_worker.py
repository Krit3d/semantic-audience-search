from datetime import datetime, timedelta, timezone

import pytest

from src.config.config import Settings
from src.db.models import UserInstagramAccount
from src.workers.instagram_account_worker import InstagramAccountWorker


NOW = datetime(2026, 11, 4, 12, 0, tzinfo=timezone.utc)


def settings() -> Settings:
    return Settings.model_construct(
        bridgit_account_poll_interval_s=60,
        bridgit_account_stuck_after_s=1200,
        bridgit_account_worker_lease_s=120,
    )


def account(status: str = "in_queue") -> UserInstagramAccount:
    return UserInstagramAccount(
        id=7,
        user_id=11,
        login="creator",
        normalized_login="creator",
        status=status,
        confirmation_started_at=NOW - timedelta(minutes=5),
        next_poll_at=NOW,
        lease_owner="worker-one",
        lease_expires_at=NOW + timedelta(minutes=2),
    )


@pytest.mark.parametrize("result", ["ok", "bad_password", "rate_limit_error", "not_logged_in", "not_logged_in_bad", "email_code"])
def test_terminal_and_action_statuses_stop_polling(result: str) -> None:
    item = account()
    InstagramAccountWorker.apply_status(item, result, NOW, settings())
    assert item.status == result
    assert item.next_poll_at is None
    assert item.last_polled_at == NOW
    assert item.lease_owner is None
    assert item.lease_expires_at is None
    assert item.last_error_code == (None if result == "ok" else result)


def test_needcheck_schedules_exactly_sixty_seconds() -> None:
    item = account()
    InstagramAccountWorker.apply_status(item, "needcheck", NOW, settings())
    assert item.status == "needcheck"
    assert item.next_poll_at == NOW + timedelta(seconds=60)
    assert item.last_error_code is None


def test_stuck_warning_is_emitted_once_per_confirmation() -> None:
    item = account("needcheck")
    item.confirmation_started_at = NOW - timedelta(minutes=21)
    InstagramAccountWorker.apply_status(item, "needcheck", NOW, settings())
    first_warning = item.stuck_warning_sent_at
    assert first_warning == NOW
    InstagramAccountWorker.apply_status(item, "needcheck", NOW + timedelta(minutes=1), settings())
    assert item.stuck_warning_sent_at == first_warning


def test_stuck_warning_is_not_emitted_before_twenty_minutes() -> None:
    item = account("needcheck")
    item.confirmation_started_at = NOW - timedelta(minutes=20)
    InstagramAccountWorker.apply_status(item, "needcheck", NOW, settings())
    assert item.stuck_warning_sent_at is None


def test_unknown_status_is_rejected_without_state_change() -> None:
    item = account()
    with pytest.raises(ValueError):
        InstagramAccountWorker.apply_status(item, "unexpected", NOW, settings())
    assert item.status == "in_queue"
    assert item.next_poll_at == NOW


def test_sync_updates_safe_fields_and_bad_password() -> None:
    item = account("ok")
    InstagramAccountWorker.apply_sync(
        item,
        {"billing": "active", "promo": "none", "status": "bad_password"},
        NOW,
    )
    assert item.billing == "active"
    assert item.promo == "none"
    assert item.remote_status == "bad_password"
    assert item.last_synced_at == NOW
    assert item.status == "bad_password"
    assert item.next_poll_at is None


@pytest.mark.parametrize("status", ["not_logged_in", "not_logged_in_bad", "email_code", "bad_password", "rate_limit_error"])
def test_sync_does_not_overwrite_user_action(status: str) -> None:
    item = account(status)
    InstagramAccountWorker.apply_sync(item, {"billing": "active", "promo": "none", "status": "needcheck"}, NOW)
    assert item.status == status
    assert item.billing == "active"
    assert item.last_synced_at == NOW


def test_sync_does_not_delete_account_missing_from_remote_response() -> None:
    item = account("ok")
    assert item.deleted_at is None
    assert item.status == "ok"


def test_sync_ignores_non_string_optional_metadata() -> None:
    item = account("ok")
    InstagramAccountWorker.apply_sync(item, {"billing": {"unexpected": True}, "promo": 42, "status": []}, NOW)
    assert item.billing is None
    assert item.promo is None
    assert item.remote_status is None
    assert item.status == "ok"
