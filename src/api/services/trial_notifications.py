"""Email reminders for an active trial that is about to expire."""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_, select

from src.api.services.mailer import MailerNotConfigured, send_trial_expiration_reminder
from src.db.database import Database
from src.db.models import User

logger = logging.getLogger(__name__)
REMINDER_INTERVAL_SECONDS = 60 * 60


async def send_due_trial_reminders(db: Database, settings, now: datetime | None = None) -> int:
    """Send at most one 3-day and one 1-day reminder for each trial."""
    now = now or datetime.now(timezone.utc)
    three_days_later = now + timedelta(days=3)

    async with db.async_session() as session:
        stmt = select(User).where(
            User.subscription_status == "trial",
            User.subscription_expires_at.is_not(None),
            User.subscription_expires_at > now,
            User.subscription_expires_at <= three_days_later,
            or_(
                User.trial_reminder_3d_sent_at.is_(None),
                User.trial_reminder_1d_sent_at.is_(None),
            ),
        )
        users = list((await session.execute(stmt)).scalars().all())

    sent = 0
    for user in users:
        expires_at = user.subscription_expires_at
        if expires_at is None:
            continue
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        remaining = expires_at - now
        is_last_day = remaining <= timedelta(days=1)
        marker = "trial_reminder_1d_sent_at" if is_last_day else "trial_reminder_3d_sent_at"
        if getattr(user, marker) is not None:
            continue

        days = max(1, int((remaining.total_seconds() + 86399) // 86400))
        try:
            await send_trial_expiration_reminder(
                settings,
                to=user.email,
                days=days,
                pricing_url=f"{settings.crm_frontend_url.rstrip('/')}/#/pricing",
            )
        except MailerNotConfigured:
            logger.warning("Trial reminders are disabled because SMTP is not configured")
            break
        except Exception:
            logger.exception("Failed to send trial reminder to user %s", user.id)
            continue

        async with db.async_session() as session:
            db_user = await session.get(User, user.id)
            if db_user is None:
                continue
            setattr(db_user, marker, now)
            if is_last_day:
                db_user.trial_reminder_3d_sent_at = db_user.trial_reminder_3d_sent_at or now
            await session.commit()
        sent += 1
    return sent


async def run_trial_reminder_loop(db: Database, settings) -> None:
    while True:
        try:
            sent = await send_due_trial_reminders(db, settings)
            if sent:
                logger.info("Sent %s trial expiration reminders", sent)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Trial reminder run failed")
        await asyncio.sleep(REMINDER_INTERVAL_SECONDS)
