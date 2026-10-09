from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys

from sqlalchemy import bindparam, text

from src.db.database import Database
from src.utils.logger import setup_logging

logger = logging.getLogger(__name__)

_CHUNK_SIZE: int = 5000
_LOCK_NAME: str = "processing_batch_backfill"

_COUNT_SQL = text("""
    SELECT count(*)
    FROM accounts a
    WHERE a.platform = 'INSTAGRAM'
      AND a.status = 'verified'
      AND a.processing_batch IS NULL
      AND EXISTS (SELECT 1 FROM content c WHERE c.account_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM content c WHERE c.account_id = a.id AND c.is_embedded)
""")

_SELECT_CHUNK_SQL = text("""
    SELECT a.id
    FROM accounts a
    WHERE a.platform = 'INSTAGRAM'
      AND a.status = 'verified'
      AND a.processing_batch IS NULL
      AND EXISTS (SELECT 1 FROM content c WHERE c.account_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM content c WHERE c.account_id = a.id AND c.is_embedded)
    ORDER BY a.id
    LIMIT :limit
""")

_UPDATE_SQL = text("""
    UPDATE accounts
    SET processing_batch = :batch_id
    WHERE id IN :ids
      AND processing_batch IS NULL
""").bindparams(bindparam("ids", expanding=True))


async def run() -> None:
    setup_logging(os.getenv("LOG_LEVEL", "INFO"))

    parser = argparse.ArgumentParser(
        description="Backfill processing_batch for already-verified but not yet worker-processed Instagram accounts.",
    )
    parser.add_argument("--batch-id", type=int, required=True, help="processing_batch value to stamp (positive integer).")
    parser.add_argument("--dry-run", action="store_true", help="Only count matching accounts; no writes.")
    args = parser.parse_args()

    if args.batch_id <= 0:
        logger.critical("--batch-id must be a positive integer.")
        sys.exit(1)

    db_url = os.getenv("DB_URL")
    if not db_url:
        logger.critical("DB_URL environment variable is not set.")
        sys.exit(1)

    db = Database(db_url)

    try:
        async with db.async_session() as session:
            total = (await session.execute(_COUNT_SQL)).scalar_one()

        logger.info(
            "Accounts matching backfill criteria (verified, no processing_batch, fully unembedded): %d",
            total,
        )

        if args.dry_run:
            logger.info("DRY-RUN: no changes written.")
            return

        if total == 0:
            logger.info("Nothing to backfill.")
            return

        async with db.async_session() as session:
            lock_acquired = (
                await session.execute(
                    text("SELECT pg_try_advisory_lock(hashtext(:name)::bigint)"),
                    {"name": _LOCK_NAME},
                )
            ).scalar()
            if not lock_acquired:
                logger.critical("Another backfill is already running (advisory lock %s busy).", _LOCK_NAME)
                sys.exit(1)

            try:
                conflict = (
                    await session.execute(
                        text(
                            "SELECT count(*) FROM accounts "
                            "WHERE processing_batch = :batch_id "
                            "AND platform = 'INSTAGRAM' AND status = 'verified'"
                        ),
                        {"batch_id": args.batch_id},
                    )
                ).scalar_one()
                if conflict > 0:
                    logger.warning(
                        "processing_batch=%d already contains %d verified Instagram accounts; resuming partial backfill",
                        args.batch_id,
                        conflict,
                    )
                await session.commit()

                stamped = conflict
                target = total + conflict
                while True:
                    ids = list(
                        (
                            await session.execute(_SELECT_CHUNK_SQL, {"limit": _CHUNK_SIZE})
                        ).scalars().all()
                    )
                    if not ids:
                        await session.commit()
                        break
                    await session.execute(_UPDATE_SQL, {"batch_id": args.batch_id, "ids": ids})
                    await session.commit()
                    stamped += len(ids)
                    logger.info(
                        "Backfill progress: %d/%d accounts stamped with processing_batch=%d",
                        stamped,
                        target,
                        args.batch_id,
                    )

                logger.info(
                    "Backfill complete: %d accounts stamped with processing_batch=%d",
                    stamped,
                    args.batch_id,
                )
            except BaseException:
                try:
                    await session.rollback()
                except Exception:
                    logger.warning("Rollback after failure also failed", exc_info=True)
                raise
            finally:
                try:
                    await session.execute(
                        text("SELECT pg_advisory_unlock(hashtext(:name)::bigint)"),
                        {"name": _LOCK_NAME},
                    )
                    await session.commit()
                except Exception:
                    logger.warning("Failed to release advisory lock cleanly", exc_info=True)
    finally:
        await db.close()


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
