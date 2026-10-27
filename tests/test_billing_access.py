from datetime import datetime, timedelta, timezone

import pytest

from src.api.services.mailer import send_trial_expiration_reminder
from src.utils.billing import has_access


NOW = datetime.now(timezone.utc)


def test_trial_has_access_only_before_expiration():
    assert has_access("trial", NOW + timedelta(seconds=1), NOW)
    assert not has_access("trial", NOW, NOW)
    assert not has_access("trial", NOW - timedelta(days=1), NOW)
    assert not has_access("trial", None, NOW)


def test_paid_and_past_due_access_follow_expiration():
    for status in ("active", "past_due"):
        assert has_access(status, NOW + timedelta(days=1), NOW)
        assert not has_access(status, NOW - timedelta(seconds=1), NOW)


def test_free_access_does_not_expire():
    assert has_access("free", None, NOW)


@pytest.mark.asyncio
@pytest.mark.parametrize("days", [3, 2, 1])
async def test_trial_reminder_explains_expiration_without_auto_charge(monkeypatch, days):
    captured = {}

    async def fake_send_email(settings, **kwargs):
        captured.update(kwargs)

    monkeypatch.setattr("src.api.services.mailer.send_email", fake_send_email)
    await send_trial_expiration_reminder(
        object(),
        to="user@example.test",
        days=days,
        pricing_url="https://crm.collabrama.ru/#/pricing",
    )

    assert captured["to"] == "user@example.test"
    assert "Collabrama CRM" in captured["subject"]
    assert "Автоматического списания" in captured["text"]
    assert "https://crm.collabrama.ru/#/pricing" in captured["text"]
