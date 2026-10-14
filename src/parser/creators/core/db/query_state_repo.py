import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models import DiscoveryQuery

logger = logging.getLogger(__name__)

DISCOVERY_SOURCE_PROFILES_SEARCH = "profiles_search"
DISCOVERY_SOURCE_REELS_SEARCH = "reels_search"


def is_query_eligible(
    state: DiscoveryQuery | None,
    cooldown_days: int,
    now: datetime,
) -> bool:
    if state is None:
        return True
    if not state.exhausted:
        return True
    if state.exhausted_at is None:
        return False
    return now - state.exhausted_at >= timedelta(days=cooldown_days)


async def load_query_states(
    session: AsyncSession,
    platform: str,
    source: str,
    queries: list[str],
) -> dict[str, DiscoveryQuery]:
    if not queries:
        return {}
    stmt = select(DiscoveryQuery).where(
        DiscoveryQuery.platform == platform,
        DiscoveryQuery.source == source,
        DiscoveryQuery.query_text.in_(queries),
    )
    result = await session.execute(stmt)
    return {row.query_text: row for row in result.scalars().all()}


async def record_query_run(
    session: AsyncSession,
    platform: str,
    source: str,
    query: str,
    category: str | None,
    found_new: bool,
    miss_threshold: int,
) -> DiscoveryQuery:
    now = datetime.now(timezone.utc)

    stmt = select(DiscoveryQuery).where(
        DiscoveryQuery.platform == platform,
        DiscoveryQuery.source == source,
        DiscoveryQuery.query_text == query,
    )
    result = await session.execute(stmt)
    state = result.scalar_one_or_none()

    if state is None:
        state = DiscoveryQuery(
            platform=platform,
            source=source,
            query_text=query,
            category=category,
        )
        state.consecutive_misses = 0
        state.exhausted = False
        session.add(state)

    state.last_run_at = now
    state.category = category or state.category
    if found_new:
        state.consecutive_misses = 0
        state.exhausted = False
        state.exhausted_at = None
    else:
        state.consecutive_misses += 1
        if state.consecutive_misses >= miss_threshold:
            if not state.exhausted:
                logger.info(
                    "Discovery query exhausted: platform=%s source=%s query='%s' "
                    "after %d consecutive misses",
                    platform,
                    source,
                    query,
                    state.consecutive_misses,
                )
            state.exhausted = True
            state.exhausted_at = now
    state.updated_at = now

    await session.flush()
    return state


async def reset_exhausted_queries(
    session: AsyncSession,
    platform: str,
) -> int:
    stmt = select(DiscoveryQuery).where(
        DiscoveryQuery.platform == platform,
        DiscoveryQuery.exhausted.is_(True),
    )
    result = await session.execute(stmt)
    states = list(result.scalars().all())
    now = datetime.now(timezone.utc)
    for state in states:
        state.exhausted = False
        state.exhausted_at = None
        state.consecutive_misses = 0
        state.updated_at = now
    if states:
        await session.flush()
        logger.info(
            "Reset %d exhausted discovery queries for platform=%s",
            len(states),
            platform,
        )
    return len(states)
