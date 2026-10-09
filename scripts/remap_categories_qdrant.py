from __future__ import annotations

import asyncio
import csv
import hashlib
import json
import logging
import re
from pathlib import Path

import httpx
from qdrant_client import AsyncQdrantClient
from qdrant_client.http import models as qdrant_models
from sqlalchemy import bindparam, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from src.config.config import load_settings
from src.db.models import Account, Content

logger = logging.getLogger(__name__)

TAXONOMY_COLLECTION: str = "iab_taxonomy_ru_v31"
CACHE_FILE: Path = Path(__file__).parent.parent / "config" / "taxonomy_ru_cache.json"
EMBEDDING_DIM: int = 1024
EMBEDDING_METRIC: qdrant_models.Distance = qdrant_models.Distance.COSINE
EMBEDDING_BATCH: int = 32
DB_CHUNK_SIZE: int = 200
PROGRESS_INTERVAL: int = 1000
MAX_RETRIES: int = 6
BASE_DELAY: float = 1.0
MAX_DELAY: float = 10.0
CONFIDENCE_THRESHOLD: float = 0.48
DEEPSEEK_BATCH: int = 20


def _parse_taxonomy(path: Path) -> list[dict[str, str | None]]:
    rows: list[dict[str, str | None]] = []
    with open(path, encoding="utf-8", newline="") as f:
        reader = csv.reader(f, delimiter="\t")
        all_rows = list(reader)
    data_rows = all_rows[2:]
    for row in data_rows:
        if not row or not row[0].strip():
            continue
        unique_id: str = row[0].strip()
        name: str = row[2].strip() if len(row) > 2 else ""
        tier1: str = row[3].strip() if len(row) > 3 else ""
        tier2: str = row[4].strip() if len(row) > 4 else ""
        tier3: str = row[5].strip() if len(row) > 5 else ""
        tier4: str = row[6].strip() if len(row) > 6 else ""
        extension_raw: str | None = row[7].strip() if len(row) > 7 and row[7].strip() else None
        tiers = [t for t in (tier1, tier2, tier3, tier4) if t]
        category_path: str = " > ".join(tiers)
        text_for_embedding: str = f"{category_path}: {name}" if category_path else name
        rows.append({
            "unique_id": unique_id,
            "name": name,
            "category_path": category_path,
            "extension": extension_raw,
            "text_for_embedding": text_for_embedding,
        })
    return rows


def _point_id(unique_id: str) -> int:
    return int(hashlib.md5(unique_id.encode()).hexdigest(), 16) % (2**63)


def _extract_json_from_response(content: str) -> list[dict[str, object]]:
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        cleaned = cleaned.strip()
    parsed = json.loads(cleaned)
    if isinstance(parsed, dict):
        for v in parsed.values():
            if isinstance(v, list):
                return v
        return []
    if isinstance(parsed, list):
        return parsed
    return []


async def _call_deepseek(
    settings,
    http_client: httpx.AsyncClient,
    messages: list[dict[str, str]],
) -> str:
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = await http_client.post(
                f"{settings.deepseek_base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.deepseek_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.deepseek_llm_model,
                    "messages": messages,
                    "temperature": 0.0,
                },
                timeout=httpx.Timeout(300.0, connect=10.0, read=300.0, write=60.0),
            )
            response.raise_for_status()
            payload = response.json()
            choices = payload.get("choices", [])
            if not choices:
                raise RuntimeError("DeepSeek returned empty choices")
            return choices[0]["message"]["content"]
        except (httpx.HTTPStatusError, httpx.RequestError, RuntimeError, json.JSONDecodeError) as e:
            if attempt == MAX_RETRIES:
                logger.error("DeepSeek API failed after %d attempts: %s", MAX_RETRIES, e)
                raise RuntimeError(f"DeepSeek API failed: {e}") from e
            sleep_duration = min(BASE_DELAY * (2 ** (attempt - 1)), MAX_DELAY)
            logger.warning(
                "DeepSeek API attempt %d/%d failed, retrying in %.2fs: %s",
                attempt, MAX_RETRIES, sleep_duration, e,
            )
            await asyncio.sleep(sleep_duration)
    raise RuntimeError("DeepSeek API failed: max retries exhausted")


async def _generate_russian_taxonomy(
    settings,
    http_client: httpx.AsyncClient,
    force_reload: bool = False,
) -> list[dict[str, str | None]]:
    if not force_reload and CACHE_FILE.exists():
        logger.info("Loading Russian taxonomy from cache: %s", CACHE_FILE)
        with open(CACHE_FILE, encoding="utf-8") as f:
            return json.load(f)

    logger.info("Generating Russian taxonomy via DeepSeek API")
    categories = _parse_taxonomy(settings.taxonomy_path)
    logger.info("Parsed %d taxonomy categories from %s", len(categories), settings.taxonomy_path)

    translation_map: dict[str, dict[str, str]] = {}

    for i in range(0, len(categories), DEEPSEEK_BATCH):
        batch = categories[i : i + DEEPSEEK_BATCH]
        batch_json = json.dumps(
            [
                {
                    "unique_id": c["unique_id"],
                    "name": c["name"],
                    "category_path": c["category_path"],
                }
                for c in batch
            ],
            ensure_ascii=False,
            indent=2,
        )

        system_prompt = (
            "Ты — ведущий эксперт по таксономии контента IAB 3.1 и классификации блогеров. "
            "Твоя задача — перевести категории IAB на русский язык и создать исчерпывающее семантическое описание "
            "для векторного поиска. Твой ответ должен содержать СТРОГО чистый JSON-массив объектов без вводных слов и флагов разметки."
        )

        user_prompt = (
            "Для каждой категории IAB 3.1 предостави точное русское описание:\n"
            "1. category_path_ru: Точный перевод цепочки категорий на русский язык (через ' > ').\n"
            "2. name_ru: Точный перевод наименования категории на русский язык.\n"
            "3. description_ru: СТРОГО 5-8 самых точных и узкоспециализированных ключевых слов/терминов "
            "на русском и английском языках (без обобщающих слов, только характерные термины и синонимы).\n\n"
            "Верни JSON-массив объектов с полями: unique_id, category_path_ru, name_ru, description_ru.\n\n"
            f"Категории:\n{batch_json}"
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        content = await _call_deepseek(settings, http_client, messages)
        translated = _extract_json_from_response(content)

        for item in translated:
            uid = str(item.get("unique_id", ""))
            translation_map[uid] = {
                "category_path_ru": str(item.get("category_path_ru", "")),
                "name_ru": str(item.get("name_ru", "")),
                "description_ru": str(item.get("description_ru", "")),
            }

        logger.info(
            "Translated batch %d/%d (%d categories)",
            i // DEEPSEEK_BATCH + 1,
            (len(categories) + DEEPSEEK_BATCH - 1) // DEEPSEEK_BATCH,
            len(batch),
        )

    ru_taxonomy: list[dict[str, str | None]] = []
    for cat in categories:
        uid = cat["unique_id"] or ""
        translated = translation_map.get(uid)
        if translated:
            category_path_ru = translated["category_path_ru"]
            name_ru = translated["name_ru"]
            description_ru = translated["description_ru"]
            text_for_embedding = (
                f"Категория: {category_path_ru} ({cat['category_path']}) | {name_ru} ({cat['name']}). "
                f"Термины: {description_ru}"
            )
        else:
            category_path_ru = cat["category_path"] or ""
            name_ru = cat["name"] or ""
            description_ru = ""
            text_for_embedding = cat["text_for_embedding"] or ""

        ru_taxonomy.append({
            "unique_id": uid,
            "name": cat["name"],
            "category_path": cat["category_path"],
            "extension": cat["extension"],
            "category_path_ru": category_path_ru,
            "name_ru": name_ru,
            "description_ru": description_ru,
            "text_for_embedding": text_for_embedding,
        })

    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = CACHE_FILE.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(ru_taxonomy, f, ensure_ascii=False, indent=2)
    tmp.replace(CACHE_FILE)
    logger.info("Saved Russian taxonomy cache to %s (%d categories)", CACHE_FILE, len(ru_taxonomy))

    return ru_taxonomy


async def _ensure_taxonomy_collection(client: AsyncQdrantClient, force_reload: bool = False) -> bool:
    collections = await client.get_collections()
    existing = {c.name for c in collections.collections}
    if TAXONOMY_COLLECTION in existing:
        info = await client.get_collection(TAXONOMY_COLLECTION)
        if not force_reload and info.points_count is not None and info.points_count > 0:
            logger.info("Taxonomy collection %s already exists with %d points. Skipping taxonomy load.", TAXONOMY_COLLECTION, info.points_count)
            return False
        await client.delete_collection(collection_name=TAXONOMY_COLLECTION)
        logger.info("Deleted existing collection %s", TAXONOMY_COLLECTION)
    await client.create_collection(
        collection_name=TAXONOMY_COLLECTION,
        vectors_config=qdrant_models.VectorParams(
            size=EMBEDDING_DIM,
            distance=EMBEDDING_METRIC,
        ),
    )
    logger.info("Created collection %s", TAXONOMY_COLLECTION)
    return True


async def _get_embeddings_batch(
    http_client: httpx.AsyncClient,
    base_url: str,
    api_key: str,
    model: str,
    texts: list[str],
) -> list[list[float]]:
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = await http_client.post(
                f"{base_url}/embeddings",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={"model": model, "input": texts},
            )
            response.raise_for_status()
            payload = response.json()
            data = payload.get("data", [])
            data.sort(key=lambda x: x.get("index", 0))
            return [item["embedding"] for item in data]
        except (httpx.HTTPStatusError, httpx.RequestError) as e:
            if attempt == MAX_RETRIES:
                logger.error("Embedding API failed after %d attempts: %s", MAX_RETRIES, e)
                raise RuntimeError(f"Embedding API failed: {e}") from e
            sleep_duration = min(BASE_DELAY * (2 ** (attempt - 1)), MAX_DELAY)
            logger.warning(
                "Embedding API attempt %d/%d failed, retrying in %.2fs: %s",
                attempt, MAX_RETRIES, sleep_duration, e,
            )
            await asyncio.sleep(sleep_duration)
    raise RuntimeError("Embedding API failed: max retries exhausted")


async def _load_taxonomy_to_qdrant(
    settings,
    qdrant_client: AsyncQdrantClient,
    http_client: httpx.AsyncClient,
    force_reload: bool = False,
) -> None:
    if not await _ensure_taxonomy_collection(qdrant_client, force_reload=force_reload):
        return

    categories = await _generate_russian_taxonomy(settings, http_client, force_reload=force_reload)
    logger.info("Loaded %d Russian taxonomy categories", len(categories))

    for i in range(0, len(categories), EMBEDDING_BATCH):
        batch = categories[i : i + EMBEDDING_BATCH]
        texts: list[str] = [(c["text_for_embedding"] or "").strip() or (c["name_ru"] or "") or "категория" for c in batch]
        embeddings = await _get_embeddings_batch(
            http_client,
            settings.cloud_ru_base_url,
            settings.cloud_ru_api_key,
            settings.cloud_ru_embedding_model,
            texts,
        )
        points = [
            qdrant_models.PointStruct(
                id=_point_id(c["unique_id"] or ""),
                vector=emb,
                payload={
                    "unique_id": c["unique_id"],
                    "category_path": c["category_path"],
                    "category_path_ru": c["category_path_ru"],
                    "extension": c["extension"],
                },
            )
            for c, emb in zip(batch, embeddings)
        ]
        await qdrant_client.upsert(
            collection_name=TAXONOMY_COLLECTION,
            points=points,
        )
        if (i + len(batch)) % PROGRESS_INTERVAL == 0 or (i + len(batch)) >= len(categories):
            logger.info("Loaded %d / %d taxonomy categories into Qdrant", i + len(batch), len(categories))

    logger.info("Taxonomy loading complete: %d categories", len(categories))


async def _fetch_last_posts(
    db_session: AsyncSession,
    account_ids: list[int],
) -> dict[int, list[str]]:
    ranked = (
        select(
            Content.account_id,
            Content.content,
            Content.transcription,
            func.row_number()
            .over(partition_by=Content.account_id, order_by=Content.published_at.desc())
            .label("rn"),
        )
        .where(Content.account_id.in_(account_ids))
        .subquery()
    )

    result = await db_session.execute(
        select(ranked.c.account_id, ranked.c.content, ranked.c.transcription)
        .where(ranked.c.rn <= 12)
    )

    url_pattern: re.Pattern[str] = re.compile(r"https?://\S+|t\.me/\S+")

    posts_by_account: dict[int, list[str]] = {}
    for row in result:
        posts_by_account.setdefault(row.account_id, [])

        merged: str = ""
        if row.content and row.transcription:
            merged = f"{row.content} {row.transcription}"
        elif row.content:
            merged = row.content
        elif row.transcription:
            merged = row.transcription
        else:
            continue

        cleaned: str = url_pattern.sub("", merged).strip()

        if len(cleaned) < 15:
            continue

        posts_by_account[row.account_id].append(cleaned)

    return posts_by_account


def _build_author_context(
    title: str | None,
    description: str | None,
    explanation: str | None,
    posts: list[str],
) -> str:
    parts: list[str] = []
    if title:
        parts.append(f"[БРЕНД/АВТОР]: {title.strip()}")
    if description:
        parts.append(f"[ОПИСАНИЕ ПРОФИЛЯ]: {description.strip()}")
    if explanation:
        parts.append(f"[ЭКСПЕРТИЗА И СУТЬ]: {explanation.strip()}")
    if posts:
        clean_posts = [f"- {p}" for p in posts if p.strip()]
        if clean_posts:
            parts.append("[КЛЮЧЕВОЙ КОНТЕНТ ПОСТОВ]:\n" + "\n".join(clean_posts))
    return "\n\n".join(parts)[:10000]


async def _remap_accounts(
    settings,
    qdrant_client: AsyncQdrantClient,
    http_client: httpx.AsyncClient,
    db_session: AsyncSession,
    dry_run: bool = False,
    limit: int | None = None,
    account_id: int | None = None,
    account_ids: list[int] | None = None,
) -> None:
    total_processed = 0
    last_id = 0

    while True:
        query = (
            select(Account.id, Account.title, Account.description, Account.explanation, Account.category_id)
            .where(Account.status == "verified")
            .where(Account.explanation.isnot(None))
            .where(Account.explanation != "")
            .order_by(Account.id.asc())
            .limit(DB_CHUNK_SIZE)
        )
        if account_ids is not None:
            query = query.where(Account.id.in_(account_ids))
        elif account_id is not None:
            query = query.where(Account.id == account_id)
        else:
            if last_id is not None:
                query = query.where(Account.id > last_id)
        result = await db_session.execute(query)
        rows = result.all()
        if not rows:
            break

        account_ids_batch: list[int] = [row.id for row in rows]
        posts_by_account = await _fetch_last_posts(db_session, account_ids_batch)

        for j in range(0, len(rows), EMBEDDING_BATCH):
            batch = rows[j : j + EMBEDDING_BATCH]
            titles_by_id: dict[int, str] = {row.id: row.title or "" for row in batch}
            old_categories_by_id: dict[int, str | None] = {row.id: row.category_id for row in batch}
            contexts: list[str] = []
            batch_account_ids: list[int] = []

            for row in batch:
                posts = posts_by_account.get(row.id, [])
                context = _build_author_context(
                    title=row.title,
                    description=row.description,
                    explanation=row.explanation,
                    posts=posts,
                )
                if not context.strip():
                    continue
                contexts.append(context)
                batch_account_ids.append(row.id)

            if not contexts:
                continue

            embeddings = await _get_embeddings_batch(
                http_client,
                settings.cloud_ru_base_url,
                settings.cloud_ru_api_key,
                settings.cloud_ru_embedding_model,
                contexts,
            )

            query_requests = [
                qdrant_models.QueryRequest(
                    query=emb,
                    limit=1,
                    with_payload=True,
                )
                for emb in embeddings
            ]
            search_results = await qdrant_client.query_batch_points(
                collection_name=TAXONOMY_COLLECTION,
                requests=query_requests,
            )

            updates: list[dict] = []
            for acc_id, search_result in zip(batch_account_ids, search_results):
                points = search_result.points
                old_cat = old_categories_by_id.get(acc_id)
                title = titles_by_id.get(acc_id, "")

                if points and points[0].payload:
                    payload = points[0].payload
                    score: float = float(points[0].score or 0.0)

                    if score >= CONFIDENCE_THRESHOLD and payload.get("unique_id"):
                        final_category_id = payload.get("unique_id")
                        final_category_path = payload.get("category_path")
                        final_extension = payload.get("extension")
                        action_label = "REMAPPED"
                    else:
                        final_category_id = old_cat
                        final_category_path = None
                        final_extension = None
                        action_label = "KEPT_OLD (LOW_SCORE)"
                else:
                    final_category_id = old_cat
                    final_category_path = None
                    final_extension = None
                    action_label = "KEPT_OLD (NO_MATCH)"

                logger.info(
                    "[%s][%s] Account #%d ('%s'): score=%.3f | Old: '%s' -> New: '%s' ('%s')",
                    "DRY-RUN" if dry_run else "EXEC",
                    action_label,
                    acc_id,
                    title,
                    score if points and points[0].payload else 0.0,
                    old_cat,
                    final_category_id,
                    final_category_path,
                )

                if final_category_id != old_cat:
                    updates.append({
                        "b_id": acc_id,
                        "category_id": final_category_id,
                        "category_path": final_category_path,
                        "category_extension": final_extension,
                    })

            if updates and not dry_run:
                try:
                    conn = await db_session.connection()
                    stmt = (
                        update(Account.__table__)
                        .where(Account.__table__.c.id == bindparam("b_id"))
                        .values(
                            category_id=bindparam("category_id"),
                            category_path=bindparam("category_path"),
                            category_extension=bindparam("category_extension"),
                        )
                    )
                    await conn.execute(stmt, updates)
                    await db_session.commit()
                except Exception as exc:
                    await db_session.rollback()
                    logger.error("Failed to commit account updates batch: %s", exc)
                    raise
                finally:
                    db_session.expunge_all()

            total_processed += len(batch)
            if limit is not None and total_processed >= limit:
                break
            if total_processed % PROGRESS_INTERVAL == 0:
                logger.info("Processed %d accounts", total_processed)

        if account_ids is not None or account_id is not None or (limit is not None and total_processed >= limit):
            break
        last_id = rows[-1].id

    logger.info("Re-mapping complete. Total accounts processed: %d", total_processed)


async def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Remap account categories using Qdrant taxonomy.")
    parser.add_argument("--force-reload", action="store_true", help="Force reload taxonomy collection even if it already exists.")
    parser.add_argument("--dry-run", action="store_true", help="Run without committing updates to PostgreSQL")
    parser.add_argument("--limit", type=int, default=None, help="Limit total accounts to process")
    parser.add_argument("--account-id", type=int, default=None, help="Process single account by ID")
    parser.add_argument("--account-ids", type=str, default=None, help="Comma-separated list of account IDs")
    args = parser.parse_args()

    settings = load_settings()

    http_client = httpx.AsyncClient(
        limits=httpx.Limits(max_connections=100, max_keepalive_connections=50),
        timeout=httpx.Timeout(120.0, connect=10.0, read=120.0, write=30.0),
    )

    if settings.qdrant_grpc_url is not None:
        qdrant_client = AsyncQdrantClient(
            url=settings.qdrant_grpc_url,
            prefer_grpc=True,
            api_key=settings.qdrant_api_key,
            timeout=settings.qdrant_timeout,
        )
    else:
        qdrant_client = AsyncQdrantClient(
            url=settings.qdrant_url,
            prefer_grpc=False,
            api_key=settings.qdrant_api_key,
            timeout=settings.qdrant_timeout,
        )

    engine = create_async_engine(settings.db_url, pool_size=10, max_overflow=5)

    try:
        await _load_taxonomy_to_qdrant(settings, qdrant_client, http_client, force_reload=args.force_reload)

        parsed_account_ids: list[int] | None = None
        if args.account_ids is not None:
            parsed_account_ids = [int(x.strip()) for x in args.account_ids.split(",") if x.strip()]

        async with AsyncSession(engine) as session:
            await _remap_accounts(
                settings,
                qdrant_client,
                http_client,
                session,
                dry_run=args.dry_run,
                limit=args.limit,
                account_id=args.account_id,
                account_ids=parsed_account_ids,
            )
    finally:
        await http_client.aclose()
        await qdrant_client.close()
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())