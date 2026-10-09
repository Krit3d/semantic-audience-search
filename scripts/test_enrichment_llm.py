from __future__ import annotations

import argparse
import asyncio
import logging
import time
from typing import Any

from sqlalchemy import select

from src.config.config import load_settings
from src.db.database import Database
from src.db.models import Account, Content
from src.workers.enrichment_worker import EnrichmentWorker

logger = logging.getLogger(__name__)


async def _pick_account(
    db: Database,
    account_id: int | None,
    batch_id: int | None,
) -> Account | None:
    async with db.async_session() as session:
        stmt = select(Account).where(Account.status == "verified")
        if account_id is not None:
            stmt = stmt.where(Account.id == account_id)
        if batch_id is not None:
            stmt = stmt.where(Account.processing_batch == batch_id)
        stmt = stmt.order_by(Account.id.asc()).limit(1)
        result = await session.execute(stmt)
        return result.scalar_one_or_none()


async def _load_posts(db: Database, account_id: int) -> list[Content]:
    async with db.async_session() as session:
        stmt = (
            select(Content)
            .where(Content.account_id == account_id)
            .order_by(Content.published_at.desc())
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())


def _build_context(account: Account, posts: list[Content]) -> str:
    parts: list[str] = []
    if account.title:
        parts.append(f"Title: {account.title}")
    if account.description:
        parts.append(f"Description: {account.description}")
    for i, post in enumerate(posts):
        post_parts: list[str] = []
        if post.content:
            post_parts.append(post.content)
        if post.transcription:
            post_parts.append(post.transcription)
        if post_parts:
            parts.append(f"Post {i + 1}: {' '.join(post_parts)}")
    return "\n\n".join(parts)


async def main() -> None:
    parser = argparse.ArgumentParser(description="Test enrichment LLM calls on a single account (read-only).")
    parser.add_argument("--account-id", type=int, default=None)
    parser.add_argument("--batch-id", type=int, default=None)
    parser.add_argument("--skip-categories", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    settings = load_settings().model_copy(update={
        "enrichment_enable_demographics": True,
        "enrichment_enable_explanation": True,
        "enrichment_enable_categories": not args.skip_categories,
        "enrichment_enable_er": True,
    })

    batch_id = args.batch_id if args.batch_id is not None else settings.processing_batch_id

    db = Database(settings.db_url)
    await db.init_db()

    worker: EnrichmentWorker | None = None
    try:
        account = await _pick_account(db, args.account_id, batch_id)
        if account is None:
            logger.error(
                "No verified account found (account_id=%s, batch_id=%s)",
                args.account_id, batch_id,
            )
            return

        posts = await _load_posts(db, account.id)
        context = _build_context(account, posts)

        print("=" * 80)
        print(f"Account #{account.id} | username={account.username} | batch={account.processing_batch}")
        print(f"Posts loaded: {len(posts)} | context length: {len(context)} chars")
        print(f"Model: {settings.deepseek_llm_model} | base_url: {settings.deepseek_base_url}")
        print("=" * 80)

        worker = EnrichmentWorker(settings=settings)

        t0 = time.monotonic()
        llm_result = await worker._generate_enrichment(context)
        enrich_elapsed = time.monotonic() - t0

        print(f"\n--- _generate_enrichment ({enrich_elapsed:.2f}s) ---")
        if llm_result is None:
            print("FAILED: returned None")
        else:
            print(f"is_author_blog: {llm_result.is_author_blog}")
            print(f"gender: {llm_result.gender}")
            print(f"country: {llm_result.country}")
            print(f"city: {llm_result.city}")
            explanation = llm_result.explanation or ""
            word_count = len(explanation.split())
            print(f"explanation ({len(explanation)} chars, {word_count} words):")
            print(explanation)

        if settings.enrichment_enable_categories:
            t1 = time.monotonic()
            category_id, category_path, category_extension = await worker._identify_category(context)
            cat_elapsed = time.monotonic() - t1

            print(f"\n--- _identify_category ({cat_elapsed:.2f}s) ---")
            if category_id is None:
                print("FAILED: returned None")
            else:
                print(f"category_id: {category_id}")
                print(f"category_path: {category_path}")
                print(f"category_extension: {category_extension}")

        er_value = worker._calculate_static_avg_er([
            {
                "reactions_count": p.reactions_count,
                "comments_count": p.comments_count,
                "shares_count": p.shares_count,
                "views_count": p.views,
            }
            for p in posts
        ])
        print(f"\n--- static_avg_er ---")
        print(f"static_avg_er: {er_value:.4f}")
        print("\nNothing was written to the database.")
    finally:
        if worker is not None and worker._llm_client is not None:
            await worker._llm_client.close()
        await db.close()


if __name__ == "__main__":
    asyncio.run(main())
