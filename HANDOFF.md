# HANDOFF — пайплайн обработки авторов (Instagram): batching, эмбеддинг, граф

Дата среза: 2026-10-09. Рабочая директория: `D:\main\Saves\Things\prog\materials\python\telethon-scraper-task`.
Документ — полная передача контекста в новый чат. Прикрепи его к первому сообщению вместе со старым файлом «КОНТЕКСТ СИСТЕМЫ».

---

## 1. Исходная задача (архив постановки)

Гибридный семантический поиск ЦА + CRM. Парсер Creators (немецкий сервер) собирает Instagram-авторов в PostgreSQL (по ~12 постов, часть — reels). Статусы: после парсинга `parsed`, скриптом чанками переводятся в `verified`; только `verified` доступны воркерам. Воркеры: эмбеддинговый (PG → Qdrant), графовый (→ Neo4j), обогащение. У постов флаги: `is_embedded`, `graph_status` (0/1/2/3), `is_enriched`. Уже обработано ~113k авторов; новые чанки должны пополнять данные, не затрагивая старые.

## 2. Что сделано (этапы 0–5 завершены)

### Этап 0. Разведка (факты)
- Таблицы: `accounts` (авторы), `content` (посты). Статусы и state machine: `src/parser/creators/core/status.py`.
- Скрипт parsed→verified: `scripts/validate_scraped_data.py` (INSTAGRAM, курсор по id, пачки по 2000, FOR UPDATE SKIP LOCKED, валидация: username, подписчики, метаданные, контент, кириллица).
- Воркеры выбирают работу по post-флагам + `Account.status='verified'`:
  - эмбеддинг: `Content.is_embedded=false` (`src/workers/embedding_worker.py`);
  - граф: `Content.graph_status=0`, claim `0→1` SKIP LOCKED (`src/graph/builder/reader.py`);
  - enrichment: `Account.status='verified' AND EXISTS(content.is_enriched=false)` (`src/workers/enrichment_worker.py`).
- Декомпозирован только Qdrant-сервис (`src/embeddings/`: client/generator/posts_repo/entities_repo/categories_repo/visual_service), НЕ воркер. Первоначальная формулировка контекста про «воркер декомпозирован в директорию» — путаница, подтверждено владельцем.
- Neo4j: только параметризованный MERGE (`src/graph/client.py`). Qdrant: upsert с `id == post_id`, коллекции `social_posts` (text 1024 Cosine + video_clip 512 + text_sparse IDF, int8-квантизация 0.99), `social_entities`, `iab_categories`.
- Живая коллекция `social_posts` сверена с кодом по collection_info от владельца: конфигурация и payload-индексы (account_id, is_author_blog, engagement_rate, platform, subscribers_count) совпадают 1-в-1. У старых точек текст с префиксом `[PROFILE METADATA]` — историческая неоднородность, известна.

### Этап 1–2. Различимость чанков — реализован ВАРИАНТ A
- Миграция `alembic/versions/a6f7c8d9e0b1_add_processing_batch_to_accounts.py` (head после `f8a2b3c4d5e6`): `accounts.processing_batch Integer NULL` (без server_default, без UPDATE — легаси 113k остались NULL) + частичный индекс `idx_accounts_processing_batch (status, processing_batch) WHERE processing_batch IS NOT NULL`. Применена на проде.
- `src/db/models.py`, `src/config/config.py` (`processing_batch_id: int | None`, env `PROCESSING_BATCH_ID`).
- `scripts/validate_scraped_data.py`: `--batch-id` (опц.), по умолчанию `COALESCE(MAX(processing_batch),0)+1`; fail-fast если id занят; штампуется в том же UPDATE, что и статус; dry-run не штампует.
- Все три воркера фильтруют по чанку, когда `processing_batch_id` задан; без него — легаси-режим (все verified).
- `scripts/backfill_processing_batch.py` (новый): батчевый бэкфилл (5000/коммит, advisory lock, dry-run, идемпотентен, не трогает `updated_at`).

### Бэкфилл выполнен (прод, 2026-10-08)
Критерий: verified INSTAGRAM, `processing_batch IS NULL`, есть посты, НЕТ постов с `is_embedded=true`.
Результат (проверено владельцем): `processing_batch=1` → **51 968** авторов; `NULL` (легаси) → **113 542**. Кросс-чек по `updated_at`: пик 51 746 за 2026-10-06 (дельта 222 — часть чанка уже тронута воркерами, норма).
Авторов без постов — 0.

### Этап 3. Консистентность эмбеддинга + режимы запуска
- Регрессий декомпозиции нет. `is_author_blog` пишется в payload при записи. Фильтр `is_author_blog` применяется на уровне Qdrant (`src/api/services/search/retriever.py`), SQL-фильтр в hydrator — страховка.
- В `embedding_worker` добавлен CLI: `--dry-run` (keyset-пагинация, страницы 2000, прогресс каждые ~10k), `--snapshot`, `--once`, `--verify`, `--batch-id N`. Воркер ведёт статистику прогона (embedded/skipped/ids).

### Этап 4. Статистика чанка 1 (прогнано владельцем, цифры фактические)
- accounts: 51 968; description (bio) 99.25% (avg 100, p95 148, max 150); subscribers 100% (p50 15 601, p95 ~195 650, 5 000–999 501); raw_metadata 100% (12 ключей у всех).
- enrichment-поля почти пусты: is_author_blog/category_id/category_path/explanation/static_avg_er/gender ≈ 0.43%, country 0.34%, city 0.23% (enrichment по чанку ещё не работал). Кардинальности: country 12, city 58, gender 5, category_id 100.
- content: 620 459 постов (51 324 автора ровно с 12). content 92.46% (avg 290, p95 1 134); transcription 21.9% (avg 484, p95 1 387); views 69.28%; comments 87.29%; **shares 0% всегда**; reactions 99.91%; has_media 74%. post_type: reel 399 584 (video_url 99.44%), post 188 379, video 32 496; hashtags 19–27%; accessibility_caption 0.01–0.5%.

### Этап 5. Утверждённый состав эмбеддинга — реализован
- Текст вектора: **bio (account.description, очищенное) → content + transcription (дедуп) → hashtags**. `accessibility_caption` УДАЛЁН (мёртвое поле).
- Payload: 12 полей = 11 прежних + **`published_at`** (unix ts int; `retriever.py` уже читал его из payload — раньше всегда был NULL).
- Решения владельца: `is_business`/`is_verified` — НЕ использовать (недостоверны); `post_type` в payload НЕ добавлять (недостоверен: «video» у INSTAGRAM выглядит как мусор/карусели; в графе поле остаётся как есть, используется только для внутреннего is_video); `shares_count` оставлен в payload ради совместимости.
- Верификация `--verify` обновлена под 12 ключей. Тесты поиска: 26 passed.
- Снапшот: `--snapshot` теперь снимает **ВСЕ коллекции** (`social_posts`, `social_entities`, `iab_categories`) через Snapshots API, печатает серверные пути `/qdrant/snapshots/<collection>/<name>`.

## 3. Dry-run по чанку 1 (факт, 2026-10-09)
Authors 51 968; candidates 620 459; to upsert 616 355; skipped 4 104 (0.66%). Время ~10 мин. Batch 2 в базе пока нет (parsed ещё не валидированы).

## 4. Топология деплоя (критично)
- Воркеры (embedding/graph/enrichment) — сервисы **API-стека**: `docker-compose.api.yml`, проект `telethon-api`, каталог `/opt/telethon-api` на API-сервере. Деплой: `scripts/deploy_api.sh` (rsync без исключений src/workers, src/embeddings, src/graph). Код попадает в контейнер ТОЛЬКО через `COPY . .` при сборке образа — после изменений нужен `build` сервиса.
- `scripts/deploy_scraper.sh` (немецкий сервер, `/opt/telethon-scraper`) **исключает `src/graph/`** — графовый код туда не едет (сейчас безвредно: граф-воркер живёт в api-стеке).
- Типовая ошибка: `unknown flag: --batch-id` — это docker compose CLI, а не Python. Правильные формы:
```bash
cd /opt/telethon-api
# пересборка после изменений кода
docker compose -p telethon-api -f docker-compose.api.yml build embedding_worker
# dry-run
docker compose -p telethon-api -f docker-compose.api.yml run --rm --no-deps embedding_worker \
  python -m src.workers.embedding_worker --dry-run --batch-id 1
# боевой прогон: снапшоты ВСЕХ коллекций + one-shot + верификация
docker compose -p telethon-api -f docker-compose.api.yml run --rm --no-deps embedding_worker \
  python -m src.workers.embedding_worker --once --snapshot --verify --batch-id 1
# enrichment по чанку
docker compose -p telethon-api -f docker-compose.api.yml run --rm --no-deps \
  -e PROCESSING_BATCH_ID=1 enrichment_worker python -m src.workers.enrichment_worker
```
- Проверка свежести кода в образе: `... run --rm --no-deps embedding_worker grep -n "batch-id" src/workers/embedding_worker.py`.

## 5. Гарантия неперезаписи (п. 3 пожеланий владельца)
- Эмбеддинг-воркер берёт в работу ТОЛЬКО `Content.is_embedded=false` → уже заэмбедденные посты (в т.ч. все 1 287 202 точки легаси) никогда не переотправляются на API — деньги не тратятся.
- Upsert с `id == post_id`: повторный прогон того же чанка перезаписывает ровно те же точки теми же данными (идемпотентность, дубликатов нет).
- Посты с текстом < 15 симв. помечаются `is_embedded=true` БЕЗ upsert (4 104 шт. в чанке 1) — на них API не вызывается.
- `--dry-run` ничего не пишет.

## 6. Enrichment worker — техдолг (со слов владельца, зафиксировано)
- Воркер «опционализирован» настройками конфига: последняя задача — гендер и локации; остальные шаги отключаемы.
- `static_avg_er` считался ОТДЕЛЬНЫМ скриптом `scripts/recalculate_static_avg_er.py` (формула от просмотров; просмотры есть только у reels → обычные посты не участвуют).
- `explanation` генерировался DeepSeek V4 Pro через API; сейчас переход на v4.1 flash — параметры/качество могли измениться, надо перепроверить.
- `is_author_blog` и категории: сначала ИИ, потом категории уточнены скриптом через BGE-M3 векторное сходство с коллекцией `iab_categories`.
- Перед прогоном enrichment по чанку 1 нужно проверить: какие шаги включены конфигом, какая модель задана, не сломается ли explanation на новой модели.

## 7. Утверждённый план дальнейших действий (п. 2 и 4 пожеланий)
1. **Снапшоты ВСЕХ коллекций перед любыми прогонами** — реализовано в `--snapshot` (все 3 коллекции). Отдельно можно вручную: Qdrant Snapshots API для `social_posts`, `social_entities`, `iab_categories`.
2. **Сначала enrichment по чанку 1** (заполнит is_author_blog, гендер, локации, категории, explanation, static_avg_er), предварительно проверив конфиг шагов и модель (см. §6).
3. **Затем параллельно embedding + graph** по чанку 1 (оба фильтруют `PROCESSING_BATCH_ID=1`).
4. Перед боевым прогоном эмбеддинга — остановить демон-сервис `embedding_worker` (легаси-режим без batch) и после — решить, поднимать ли его с `PROCESSING_BATCH_ID` в `.env`.
5. После прогона: `--verify` (счётчики до/после + 5 точек, 12 payload-ключей, dense=1024, sparse, is_author_blog не NULL).
6. Новые parsed-авторы: `python -m scripts.validate_scraped_data` — автоматом штампует `processing_batch=2`. Дальше тот же конвейер: enrichment → snapshot → embedding+graph.

## 8. Изменённые/новые файлы (все в git-рабочей копии, нужен коммит)
- `alembic/versions/a6f7c8d9e0b1_add_processing_batch_to_accounts.py` (новый; применена на проде)
- `src/db/models.py` — колонка + индекс
- `src/config/config.py` — `processing_batch_id`
- `scripts/validate_scraped_data.py` — `--batch-id`, штамповка
- `scripts/backfill_processing_batch.py` (новый)
- `src/workers/embedding_worker.py` — фильтр чанка, CLI (dry-run/snapshot-all/once/verify/batch-id), bio в эмбеддинг, published_at в payload, удалён accessibility_caption, статистика
- `src/graph/builder/reader.py`, `src/graph/builder/orchestrator.py` — фильтр чанка
- `src/workers/enrichment_worker.py` — фильтр чанка

## 9. Незыблемые правила (наследуются)
1. Без комментариев и docstrings; type hints обязательны, объединения только `A | B` (Python 3.12).
2. Production-ready: валидация, ошибки, логирование (выбрано/обработано/пропущено), идемпотентность, без заглушек.
3. Qdrant: только upsert точек id==post_id. Запрещены delete/recreate коллекций, изменение размерности/конфигурации.
4. Neo4j: только MERGE по стабильным ключам, параметризованные запросы. Запрещены DELETE/DETACH DELETE/DROP.
5. PostgreSQL: только миграции Alembic; UPDATE существующих строк — только с явным WHERE по чанку, батчами.
6. Продовые PG/Qdrant/Neo4j недоступны напрямую: read-only SQL/команды выдаются готовыми, владелец исполняет и присылает вывод. Статистику не выдумывать — только из присланных результатов.

## 10. Открытые вопросы / следующие темы
- Проверка и ремонт enrichment_worker (конфиг шагов, модель DeepSeek v4.1 flash, ER-скрипт) перед прогоном по чанку 1.
- `src/graph/bootstrap.py::sync_verified_actors` синкает Actor'ов только при пустом графе — инкрементальные чанки не подхватывает (Actor-узлы создаются writer'ом через MERGE; если нужен полный синк — добавить фильтр по чанку).
- `deploy_scraper.sh` исключает `src/graph/` — потенциальный рассинхрон, если что-то на scraper-сервере импортирует src.graph.
- `posts_repo.search_posts` (legacy, вне поискового контура) не поддерживает фильтр is_author_blog.
- При желании: re-embed легаси 113k с новым составом текста (bio) — НЕ планировалось, старые точки остаются как есть.
