import argparse
import asyncio
import json
import logging
import os
import re
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from pydantic import ValidationError
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.database import Database
from src.db.models import Account, Content
from src.parser.creators.core.contacts.constants import PLATFORM_PROFILE_LINKS
from src.parser.creators.core.schemas import AccountMetadata
from src.parser.creators.core.text import is_russian_text
from src.parser.creators.platforms.instagram.validators import (
    MAX_SUBSCRIBERS,
    MIN_SUBSCRIBERS,
)
from src.utils.logger import setup_logging

logger = logging.getLogger(__name__)

PLATFORM: str = "INSTAGRAM"
STATUS_SOURCE: str = "parsed"
STATUS_VERIFIED: str = "verified"
STATUS_REJECTED: str = "rejected"

DEFAULT_BATCH_SIZE: int = 2000
DEFAULT_REPORT_PATH: str = "scripts/invalid_accounts_report.json"

INSTAGRAM_USERNAME_RE: re.Pattern[str] = re.compile(r"^[A-Za-z0-9._]{1,30}$")
CYRILLIC_SQL_RE: str = "[а-яА-ЯёЁ]"
VALID_POST_TYPES: frozenset[str] = frozenset({"post", "reel", "video"})
REEL_POST_TYPES: frozenset[str] = frozenset({"reel", "video"})
MAX_CORRUPT_CONTENT_FRACTION: float = 0.5
FUTURE_PUBLISHED_TOLERANCE: timedelta = timedelta(days=1)

REASON_MISSING_COLUMNS: str = "missing_columns"
REASON_INVALID_USERNAME: str = "invalid_username_format"
REASON_SUBSCRIBERS_RANGE: str = "subscribers_out_of_range"
REASON_METADATA_INVALID: str = "metadata_validation_failed"
REASON_PAYLOAD_MISSING: str = "raw_profile_payload_missing"
REASON_USERNAME_MISMATCH: str = "username_mismatch"
REASON_PROFILE_URL_MISMATCH: str = "profile_url_mismatch"
REASON_NO_CONTENT: str = "no_content"
REASON_CONTENT_INTEGRITY: str = "content_integrity_failed"
REASON_NO_CYRILLIC: str = "no_cyrillic"

AUDIT_KEYS: tuple[str, ...] = (
    "website",
    "link_in_bio",
    "emails",
    "phones",
    "telegram_any",
    "advertising_contacts",
    "external_platforms",
    "external_links",
    "metrics_history",
    "ig_badge_verified",
    "is_business",
)

AUDIT_LABELS: dict[str, str] = {
    "website": "Website",
    "link_in_bio": "Link-in-bio service",
    "emails": "Emails (contacts)",
    "phones": "Phones (contacts)",
    "telegram_any": "Telegram contacts (any)",
    "advertising_contacts": "Advertising contacts (email/tg)",
    "external_platforms": "External platforms",
    "external_links": "External links",
    "metrics_history": "Metrics history entries",
    "ig_badge_verified": "Instagram verified badge",
    "is_business": "Business account",
}


@dataclass(slots=True)
class AccountRow:
    id: int
    username: str | None
    title: str | None
    description: str | None
    subscribers_count: int | None
    platform_id: str | None
    raw_metadata: dict[str, Any] | None


@dataclass(slots=True)
class ContentStats:
    total: int = 0
    corrupt: int = 0
    reels: int = 0
    reels_without_media: int = 0
    cyrillic_content: bool = False


@dataclass(slots=True)
class Rejection:
    account_id: int
    username: str
    reason: str
    detail: str


@dataclass(slots=True)
class BatchOutcome:
    verified_ids: list[int] = field(default_factory=list)
    metadata_patches: dict[int, dict[str, Any]] = field(default_factory=dict)
    rejections: list[Rejection] = field(default_factory=list)
    audit_counts: dict[str, int] = field(default_factory=lambda: {key: 0 for key in AUDIT_KEYS})
    content_total: int = 0
    content_reels: int = 0
    content_reels_without_media: int = 0
    content_corrupt: int = 0
    accounts_with_cyrillic_content: int = 0


def _has_text(value: str | None) -> bool:
    return bool(value and value.strip())


def _validate_columns(row: AccountRow) -> str | None:
    if not _has_text(row.username):
        return "username is null or empty"
    if not _has_text(row.title):
        return "title is null or empty"
    if not _has_text(row.platform_id):
        return "platform_id is null or empty"
    return None


def _validate_username_format(username: str) -> str | None:
    if not INSTAGRAM_USERNAME_RE.match(username.strip()):
        return f"username {username!r} violates Instagram handle rules ([A-Za-z0-9._]{{1,30}})"
    return None


def _validate_subscribers_range(count: int | None) -> str | None:
    if count is None:
        return "subscribers_count is null"
    if not (MIN_SUBSCRIBERS <= count <= MAX_SUBSCRIBERS):
        return (
            f"subscribers_count {count} outside parser range "
            f"[{MIN_SUBSCRIBERS}, {MAX_SUBSCRIBERS}]"
        )
    return None


def _validate_metadata(
    raw_metadata: dict[str, Any] | None,
) -> tuple[AccountMetadata | None, dict[str, Any] | None, str | None]:
    if not isinstance(raw_metadata, dict) or not raw_metadata:
        return None, None, "raw_metadata is null or empty"

    candidate: dict[str, Any] = raw_metadata
    patched: dict[str, Any] | None = None
    if "extracted_at" not in raw_metadata:
        patched = dict(raw_metadata)
        patched["extracted_at"] = datetime.now(timezone.utc).isoformat()
        candidate = patched

    try:
        model = AccountMetadata.model_validate(dict(candidate))
    except ValidationError as exc:
        return None, None, f"pydantic_validation_failed: {exc.error_count()} errors: {exc.errors()[:3]}"
    except Exception as exc:
        return None, None, f"metadata_validation_error: {exc!r}"

    try:
        datetime.fromisoformat(model.extracted_at.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None, None, f"extracted_at is not a valid ISO timestamp: {model.extracted_at!r}"

    return model, patched, None


def _validate_raw_profile_payload(
    model: AccountMetadata,
    row: AccountRow,
) -> tuple[str, str] | None:
    payload = model.raw_profile_payload
    if not isinstance(payload, dict) or not payload:
        return REASON_PAYLOAD_MISSING, "raw_profile_payload is missing or empty"

    payload_username = payload.get("username")
    if isinstance(payload_username, str) and payload_username.strip():
        if row.username and payload_username.strip().lower() != row.username.strip().lower():
            return REASON_USERNAME_MISMATCH, (
                f"payload username {payload_username!r} does not match "
                f"account username {row.username!r}"
            )
        return None

    if payload.get("id") is None:
        return REASON_PAYLOAD_MISSING, "raw_profile_payload has neither 'username' nor 'id'"

    return None


def _validate_profile_url(model: AccountMetadata, row: AccountRow) -> str | None:
    if not row.username:
        return None
    template = PLATFORM_PROFILE_LINKS[PLATFORM]
    expected = template.format(username=row.username.strip().lower())
    actual = (model.profile_url or "").strip().lower()
    if actual != expected.lower():
        return f"profile_url {model.profile_url!r} does not match expected {expected!r}"
    return None


def _collect_audit_flags(model: AccountMetadata) -> dict[str, bool]:
    contacts = model.contacts
    telegram_any = bool(
        contacts.telegram_handles
        or contacts.telegram_channels
        or contacts.telegram_personal
        or contacts.advertising_telegrams
    )
    return {
        "website": _has_text(model.website),
        "link_in_bio": _has_text(model.link_in_bio),
        "emails": bool(contacts.emails),
        "phones": bool(contacts.phones),
        "telegram_any": telegram_any,
        "advertising_contacts": bool(contacts.advertising_emails or contacts.advertising_telegrams),
        "external_platforms": bool(model.external_platforms),
        "external_links": bool(model.external_links),
        "metrics_history": bool(model.metrics_history),
        "ig_badge_verified": model.is_verified,
        "is_business": model.is_business,
    }


def _classify_account(
    row: AccountRow,
    stats: ContentStats | None,
) -> tuple[bool, str, str, AccountMetadata | None, dict[str, Any] | None]:
    column_error = _validate_columns(row)
    if column_error:
        return False, REASON_MISSING_COLUMNS, column_error, None, None

    username_error = _validate_username_format(row.username or "")
    if username_error:
        return False, REASON_INVALID_USERNAME, username_error, None, None

    subscribers_error = _validate_subscribers_range(row.subscribers_count)
    if subscribers_error:
        return False, REASON_SUBSCRIBERS_RANGE, subscribers_error, None, None

    model, patched_metadata, metadata_error = _validate_metadata(row.raw_metadata)
    if metadata_error or model is None:
        return False, REASON_METADATA_INVALID, metadata_error or "unknown metadata failure", None, None

    payload_result = _validate_raw_profile_payload(model, row)
    if payload_result:
        payload_reason, payload_detail = payload_result
        return False, payload_reason, payload_detail, None, None

    profile_url_error = _validate_profile_url(model, row)
    if profile_url_error:
        return False, REASON_PROFILE_URL_MISMATCH, profile_url_error, None, None

    if stats is None or stats.total == 0:
        return False, REASON_NO_CONTENT, "account has no content rows; workers join verified accounts with content", None, None

    if stats.corrupt > 0 and stats.corrupt / stats.total > MAX_CORRUPT_CONTENT_FRACTION:
        return (
            False,
            REASON_CONTENT_INTEGRITY,
            f"{stats.corrupt}/{stats.total} content rows are corrupt "
            f"(empty platform_content_id, future published_at, or unknown post_type)",
            None,
            None,
        )

    has_cyrillic_profile = is_russian_text(row.title) or is_russian_text(row.description)
    if not has_cyrillic_profile and not stats.cyrillic_content:
        return (
            False,
            REASON_NO_CYRILLIC,
            "no Cyrillic in title, description, content, or transcriptions "
            "(parser stage1/stage2 gate would not pass)",
            None,
            None,
        )

    return True, "", "", model, patched_metadata


async def _count_pending_accounts(session: AsyncSession) -> int:
    stmt = select(func.count(Account.id)).where(
        Account.platform == PLATFORM,
        Account.status == STATUS_SOURCE,
    )
    result = await session.execute(stmt)
    return result.scalar_one()


async def _fetch_account_batch(
    session: AsyncSession,
    cursor: int,
    batch_size: int,
    lock_rows: bool,
) -> list[AccountRow]:
    stmt = (
        select(
            Account.id,
            Account.username,
            Account.title,
            Account.description,
            Account.subscribers_count,
            Account.platform_id,
            Account.raw_metadata,
        )
        .where(
            Account.platform == PLATFORM,
            Account.status == STATUS_SOURCE,
            Account.id > cursor,
        )
        .order_by(Account.id)
        .limit(batch_size)
    )
    if lock_rows:
        stmt = stmt.with_for_update(skip_locked=True)
    result = await session.execute(stmt)
    rows: list[AccountRow] = []
    for record in result.all():
        raw_metadata = record.raw_metadata if isinstance(record.raw_metadata, dict) else None
        rows.append(
            AccountRow(
                id=record.id,
                username=record.username,
                title=record.title,
                description=record.description,
                subscribers_count=record.subscribers_count,
                platform_id=record.platform_id,
                raw_metadata=raw_metadata,
            )
        )
    return rows


async def _fetch_content_stats(
    session: AsyncSession,
    account_ids: list[int],
) -> dict[int, ContentStats]:
    if not account_ids:
        return {}

    post_type_col = Content.raw_metadata["post_type"].astext
    video_url_col = Content.raw_metadata["video_url"].astext

    now_utc = datetime.now(timezone.utc)
    future_threshold = now_utc + FUTURE_PUBLISHED_TOLERANCE

    corrupt_cond = or_(
        func.coalesce(func.length(func.trim(Content.platform_content_id)), 0) == 0,
        Content.published_at > future_threshold,
        ~func.coalesce(post_type_col, "").in_(sorted(VALID_POST_TYPES)),
    )
    reel_cond = post_type_col.in_(sorted(REEL_POST_TYPES))
    reel_without_media_cond = and_(
        reel_cond,
        func.coalesce(func.nullif(func.trim(video_url_col), ""), "") == "",
        or_(
            Content.transcription.is_(None),
            func.trim(Content.transcription) == "",
        ),
    )
    cyrillic_cond = or_(
        Content.content.op("~")(CYRILLIC_SQL_RE),
        Content.transcription.op("~")(CYRILLIC_SQL_RE),
    )

    stmt = (
        select(
            Content.account_id.label("account_id"),
            func.count().label("total"),
            func.coalesce(func.count().filter(corrupt_cond), 0).label("corrupt"),
            func.coalesce(func.count().filter(reel_cond), 0).label("reels"),
            func.coalesce(func.count().filter(reel_without_media_cond), 0).label("reels_without_media"),
            func.coalesce(func.bool_or(cyrillic_cond), False).label("cyrillic_content"),
        )
        .where(Content.account_id.in_(account_ids))
        .group_by(Content.account_id)
    )

    result = await session.execute(stmt)
    stats_map: dict[int, ContentStats] = {}
    for record in result.all():
        stats_map[record.account_id] = ContentStats(
            total=record.total,
            corrupt=record.corrupt,
            reels=record.reels,
            reels_without_media=record.reels_without_media,
            cyrillic_content=bool(record.cyrillic_content),
        )
    return stats_map


async def _apply_batch_decisions(
    session: AsyncSession,
    outcome: BatchOutcome,
) -> None:
    now_utc = datetime.now(timezone.utc)

    rejected_ids = [rejection.account_id for rejection in outcome.rejections]
    if rejected_ids:
        await session.execute(
            update(Account)
            .where(Account.id.in_(rejected_ids))
            .values(status=STATUS_REJECTED, updated_at=now_utc)
        )

    plain_verified_ids = [
        account_id
        for account_id in outcome.verified_ids
        if account_id not in outcome.metadata_patches
    ]
    if plain_verified_ids:
        await session.execute(
            update(Account)
            .where(Account.id.in_(plain_verified_ids))
            .values(status=STATUS_VERIFIED, updated_at=now_utc)
        )

    for account_id, patched_metadata in outcome.metadata_patches.items():
        await session.execute(
            update(Account)
            .where(Account.id == account_id)
            .values(
                status=STATUS_VERIFIED,
                raw_metadata=patched_metadata,
                updated_at=now_utc,
            )
        )

    await session.commit()


def _evaluate_batch(
    rows: list[AccountRow],
    stats_map: dict[int, ContentStats],
) -> BatchOutcome:
    outcome = BatchOutcome()

    for row in rows:
        stats = stats_map.get(row.id)
        is_valid, reason, detail, model, patched_metadata = _classify_account(row, stats)

        if not is_valid:
            outcome.rejections.append(
                Rejection(
                    account_id=row.id,
                    username=row.username or "",
                    reason=reason,
                    detail=detail,
                )
            )
            continue

        outcome.verified_ids.append(row.id)
        if patched_metadata is not None:
            outcome.metadata_patches[row.id] = patched_metadata

        if model is not None:
            audit = _collect_audit_flags(model)
            for key, flag in audit.items():
                if flag:
                    outcome.audit_counts[key] += 1

        if stats is not None:
            outcome.content_total += stats.total
            outcome.content_reels += stats.reels
            outcome.content_reels_without_media += stats.reels_without_media
            outcome.content_corrupt += stats.corrupt
            if stats.cyrillic_content:
                outcome.accounts_with_cyrillic_content += 1

    return outcome


async def _process_batch(
    session: AsyncSession,
    cursor: int,
    batch_size: int,
    dry_run: bool,
) -> tuple[int, BatchOutcome]:
    rows = await _fetch_account_batch(session, cursor, batch_size, lock_rows=not dry_run)
    if not rows:
        return cursor, BatchOutcome()

    new_cursor = rows[-1].id
    account_ids = [row.id for row in rows]
    stats_map = await _fetch_content_stats(session, account_ids)

    outcome = _evaluate_batch(rows, stats_map)

    if not dry_run:
        await _apply_batch_decisions(session, outcome)

    return new_cursor, outcome


def _print_statistics(
    total_verified: int,
    combined_audit: dict[str, int],
    content_total: int,
    content_reels: int,
    content_reels_without_media: int,
    content_corrupt: int,
    accounts_with_cyrillic_content: int,
) -> None:
    logger.info("=" * 70)
    logger.info("AUDIT STATISTICS (verified accounts: %d)", total_verified)
    logger.info("=" * 70)

    if total_verified == 0:
        logger.info("No verified accounts to report.")
        return

    for key in AUDIT_KEYS:
        count = combined_audit[key]
        pct = (count / total_verified) * 100
        logger.info("  %-40s %d (%.2f%%)", AUDIT_LABELS[key] + ":", count, pct)

    logger.info("-" * 70)
    logger.info("  Content rows total: %d", content_total)
    if content_total > 0:
        logger.info(
            "  Avg content rows per verified account: %.1f",
            content_total / total_verified,
        )
        reels_pct = (content_reels / content_total) * 100
        logger.info("  Reels/videos: %d (%.2f%%)", content_reels, reels_pct)
        if content_reels > 0:
            broken_reels_pct = (content_reels_without_media / content_reels) * 100
            logger.info(
                "  Reels without video_url and without transcription: %d (%.2f%% of reels)",
                content_reels_without_media,
                broken_reels_pct,
            )
        corrupt_pct = (content_corrupt / content_total) * 100
        logger.info("  Corrupt content rows: %d (%.2f%%)", content_corrupt, corrupt_pct)
    logger.info(
        "  Verified accounts with Cyrillic in content: %d (%.2f%%)",
        accounts_with_cyrillic_content,
        (accounts_with_cyrillic_content / total_verified) * 100,
    )
    logger.info("=" * 70)


def _build_invalid_report(
    rejections: list[Rejection],
    total_processed: int,
    total_verified: int,
    dry_run: bool,
) -> dict[str, Any]:
    counts: dict[str, int] = {}
    accounts_by_reason: dict[str, list[dict[str, str | int]]] = {}
    for rejection in rejections:
        counts[rejection.reason] = counts.get(rejection.reason, 0) + 1
        accounts_by_reason.setdefault(rejection.reason, []).append(
            {
                "id": rejection.account_id,
                "username": rejection.username,
                "reason": rejection.reason,
                "detail": rejection.detail,
            }
        )

    reasons_payload: dict[str, dict[str, Any]] = {
        reason: {"count": counts[reason], "accounts": accounts_by_reason[reason]}
        for reason in sorted(counts, key=lambda reason: counts[reason], reverse=True)
    }

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": dry_run,
        "platform": PLATFORM,
        "source_status": STATUS_SOURCE,
        "total_processed": total_processed,
        "total_verified": total_verified,
        "total_errors": len(rejections),
        "reasons": reasons_payload,
    }


def _save_invalid_report(report: dict[str, Any], report_path: str) -> None:
    report_dir = os.path.dirname(report_path)
    if report_dir:
        os.makedirs(report_dir, exist_ok=True)
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    logger.info("Invalid accounts report saved to %s", report_path)


async def run() -> None:
    setup_logging(os.getenv("LOG_LEVEL", "INFO"))

    parser = argparse.ArgumentParser(
        description="Validate scraped Instagram accounts and promote them from 'parsed' to 'verified'.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        help="Run all checks without persisting any status or metadata changes.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f"Accounts per batch (default: {DEFAULT_BATCH_SIZE}).",
    )
    parser.add_argument(
        "--max-accounts",
        type=int,
        default=None,
        help="Stop after processing this many accounts (useful for sampling).",
    )
    parser.add_argument(
        "--report-path",
        type=str,
        default=DEFAULT_REPORT_PATH,
        help=f"Where to write the invalid accounts report (default: {DEFAULT_REPORT_PATH}).",
    )
    args = parser.parse_args()

    if args.batch_size <= 0:
        logger.critical("--batch-size must be a positive integer.")
        sys.exit(1)
    if args.max_accounts is not None and args.max_accounts <= 0:
        logger.critical("--max-accounts must be a positive integer.")
        sys.exit(1)

    if args.dry_run:
        logger.info("DRY-RUN mode enabled. No data will be persisted.")

    db_url = os.getenv("DB_URL")
    if not db_url:
        logger.critical("DB_URL environment variable is not set.")
        sys.exit(1)

    logger.info(
        "Starting validation of %s accounts with status '%s'...",
        PLATFORM,
        STATUS_SOURCE,
    )

    db = Database(db_url)

    total_verified: int = 0
    total_invalid: int = 0
    all_rejections: list[Rejection] = []
    combined_audit: dict[str, int] = {key: 0 for key in AUDIT_KEYS}
    combined_content_total: int = 0
    combined_content_reels: int = 0
    combined_reels_without_media: int = 0
    combined_content_corrupt: int = 0
    combined_cyrillic_accounts: int = 0
    metadata_patches_total: int = 0

    start_time: float = time.monotonic()

    async with db.async_session() as session:
        total_accounts: int = await _count_pending_accounts(session)
    if args.max_accounts is not None:
        total_accounts = min(total_accounts, args.max_accounts)
    logger.info("Found %d accounts to process.", total_accounts)

    processed: int = 0
    cursor: int = 0
    while True:
        remaining = (
            args.max_accounts - processed
            if args.max_accounts is not None
            else args.batch_size
        )
        if remaining <= 0:
            break
        batch_size = min(args.batch_size, remaining)

        async with db.async_session() as session:
            cursor, outcome = await _process_batch(
                session=session,
                cursor=cursor,
                batch_size=batch_size,
                dry_run=args.dry_run,
            )

        batch_count = len(outcome.verified_ids) + len(outcome.rejections)
        if batch_count == 0:
            break

        processed += batch_count
        total_verified += len(outcome.verified_ids)
        total_invalid += len(outcome.rejections)
        metadata_patches_total += len(outcome.metadata_patches)
        all_rejections.extend(outcome.rejections)

        for key in combined_audit:
            combined_audit[key] += outcome.audit_counts[key]
        combined_content_total += outcome.content_total
        combined_content_reels += outcome.content_reels
        combined_reels_without_media += outcome.content_reels_without_media
        combined_content_corrupt += outcome.content_corrupt
        combined_cyrillic_accounts += outcome.accounts_with_cyrillic_content

        elapsed: float = time.monotonic() - start_time
        rate: float = processed / elapsed if elapsed > 0 else 0.0
        logger.info(
            "Progress: %d/%d processed | verified=%d rejected=%d | %.1f accounts/s",
            processed,
            total_accounts,
            total_verified,
            total_invalid,
            rate,
        )

    elapsed_total: float = time.monotonic() - start_time
    logger.info("Processing complete in %.2f seconds.", elapsed_total)
    logger.info(
        "Total verified: %d | Total rejected: %d | Metadata patches applied: %d",
        total_verified,
        total_invalid,
        metadata_patches_total,
    )

    _print_statistics(
        total_verified,
        combined_audit,
        combined_content_total,
        combined_content_reels,
        combined_reels_without_media,
        combined_content_corrupt,
        combined_cyrillic_accounts,
    )

    if all_rejections:
        report = _build_invalid_report(
            rejections=all_rejections,
            total_processed=processed,
            total_verified=total_verified,
            dry_run=args.dry_run,
        )
        _save_invalid_report(report, args.report_path)
        reasons_obj = report["reasons"]
        logger.info(
            "Invalid accounts report: %d total errors across %d reason categories.",
            report["total_errors"],
            len(reasons_obj),
        )
    else:
        logger.info("No invalid accounts found. Skipping report generation.")

    await db.close()


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
