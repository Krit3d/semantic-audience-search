"""
Instagram platform parser using Scrape Creators API.

Implements Instagram-specific profile parsing and content ingestion into PostgreSQL.
Extracts author profile metadata (external links, contacts, location, language)
and stores it inside Content.raw_metadata under the "author_profile_metadata" key.

Features:
    - Profile parsing with account upsert to accounts table
    - Minimum subscriber threshold enforcement (3000 followers)
    - Virtual profile post creation for semantic search over biographies
    - Content fetching from timeline and video edges with deduplication
    - PostgreSQL ON CONFLICT DO UPDATE for high-throughput concurrency
    - Raw metadata preservation for OpenSPG processing
    - Extraction of external links, contact info from biography via shared utils
    - Video download URL extraction for GPU worker processing
    - Transcription support for video content
"""

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.dialects.postgresql import insert as pg_insert

from src.config.config import Settings
from src.db.models import Account, Content
from src.parser.creators.core.utils import parse_profile_contacts
from src.parser.creators.platforms.base import BasePlatformParser
from src.parser.creators.sc_client import ScrapeCreatorsClient

logger = logging.getLogger(__name__)

# Minimum subscriber threshold for Instagram accounts
MIN_SUBSCRIBERS: int = 3000


class InstagramPlatformParser(BasePlatformParser):
    """Instagram platform parser for profile and content ingestion.

    Inherits from BasePlatformParser and implements Instagram-specific
    profile parsing and content upsert logic using the Scrape Creators API.

    All author-level metadata (external links, contacts, location, language)
    is stored inside each Content.raw_metadata JSONB column under the key
    "author_profile_metadata" since Account has no raw_metadata column.

    After each successful profile parse, a virtual profile post is upserted
    into the content table to enable semantic search over creator biographies.

    Attributes:
        session_maker: SQLAlchemy async session maker for database operations.
        client: ScrapeCreatorsClient instance for API requests.
        settings: Application settings containing configuration values.
    """

    def __init__(
        self,
        session_maker: async_sessionmaker[AsyncSession],
        client: ScrapeCreatorsClient,
        settings: Settings,
    ) -> None:
        """Initialize Instagram parser with configuration.

        Args:
            session_maker: SQLAlchemy async session maker for database operations.
            client: ScrapeCreatorsClient instance for API requests.
            settings: Application settings containing configuration values.
        """
        super().__init__(session_maker, client, settings)

    async def parse_profile(self, handle: str) -> int | None:
        """Fetch Instagram profile, upsert account to database, return account ID.

        Parses the Instagram profile for the given handle, checks if the account
        meets the minimum subscriber threshold (3000), extracts author profile
        metadata (external links, contacts, location, language), upserts the
        account information to the accounts table, creates a virtual profile post
        for semantic search, and returns the database ID.

        Args:
            handle: Instagram username (without @ prefix).

        Returns:
            Database ID of the upserted account record, or None if the profile
            could not be parsed or doesn't meet the minimum subscriber threshold.
        """
        logger.info("Starting Instagram profile parse for handle: %s", handle)

        try:
            # Fetch profile data from Scrape Creators API
            try:
                response: dict[str, Any] = await self.client.get(
                    endpoint="/v1/instagram/profile",
                    params={"handle": handle},
                )
                logger.info(
                    "API response status for profile %s: success, credits consumed: %s",
                    handle,
                    response.get("credits", "N/A"),
                )
            except Exception as e:
                logger.error(
                    "API request failed for Instagram profile %s: %s",
                    handle,
                    e,
                    exc_info=True,
                )
                return None

            # Validate response structure
            data = response.get("data")
            if not data:
                logger.error("Missing 'data' in API response for Instagram handle %s", handle)
                return None

            user = data.get("user")
            if not user:
                logger.error("Missing 'user' in data for Instagram handle %s", handle)
                return None

            # Extract user ID and subscriber count
            user_id: str = str(user.get("id") or user.get("pk", ""))
            if not user_id:
                logger.error("Could not extract user ID for Instagram handle %s", handle)
                return None

            subscribers_count: int = self._extract_subscribers_count(user)

            # Check if account meets minimum threshold
            if subscribers_count < MIN_SUBSCRIBERS:
                logger.info(
                    "Instagram handle %s has %d subscribers, below minimum %d. Rejecting.",
                    handle,
                    subscribers_count,
                    MIN_SUBSCRIBERS,
                )
                await self._upsert_account(user, status="rejected")
                return None

            # Upsert account with 'parsed' status
            account_id: int = await self._upsert_account(user, status="parsed")
            logger.info(
                "Successfully parsed Instagram profile %s, account ID: %d, subscribers: %d",
                handle,
                account_id,
                subscribers_count,
            )

            # Upsert virtual profile post for semantic search over biography
            await self._upsert_virtual_profile_post(account_id, user)

            return account_id

        except Exception as e:
            logger.error(
                "Failed to parse Instagram profile %s: %s",
                handle,
                e,
                exc_info=True,
            )
            raise

    async def parse_content(
        self,
        account_id: int,
        platform_id: str,
        max_items: int = 50,
    ) -> None:
        """Fetch Instagram content and bulk upsert to content table.

        Retrieves content items from timeline and video edges for the given account
        using the Scrape Creators API, parses the data, and performs a bulk
        upsert into the content table using PostgreSQL ON CONFLICT DO UPDATE.

        The raw_metadata field contains:
            - "author_profile_metadata": Profile-level data (contacts, links, location, etc.)
            - "platform_metrics": Platform-specific engagement metrics
            - "video_download_url": Direct MP4 URL for GPU worker processing

        Args:
            account_id: Database ID of the parent account record.
            platform_id: Instagram username/handle used in API calls.
            max_items: Maximum number of content items to fetch (default: 50).
        """
        logger.info(
            "Starting Instagram content parse for account_id: %d, platform_id: %s, max_items: %d",
            account_id,
            platform_id,
            max_items,
        )

        try:
            # Fetch content data from Scrape Creators API
            try:
                response: dict[str, Any] = await self.client.get(
                    endpoint="/v1/instagram/posts",
                    params={"handle": platform_id, "limit": max_items},
                )
                logger.info(
                    "API response status for content, platform_id %s: success, credits consumed: %s",
                    platform_id,
                    response.get("credits", "N/A"),
                )
            except Exception as e:
                logger.error(
                    "API request failed for Instagram content, platform_id %s: %s",
                    platform_id,
                    e,
                    exc_info=True,
                )
                return

            # Validate response structure
            data = response.get("data")
            if not data:
                logger.error(
                    "Missing 'data' in API response for Instagram content, platform_id %s",
                    platform_id,
                )
                return

            user = data.get("user")
            if not user:
                logger.error(
                    "Missing 'user' in data for Instagram content, platform_id %s",
                    platform_id,
                )
                return

            # Extract edges from both timeline and video timeline
            all_edges: list[dict[str, Any]] = []

            # Extract from edge_owner_to_timeline_media
            timeline_data = user.get("edge_owner_to_timeline_media", {})
            if isinstance(timeline_data, dict):
                timeline_edges = timeline_data.get("edges", [])
                if isinstance(timeline_edges, list):
                    all_edges.extend(timeline_edges)

            # Extract from edge_felix_video_timeline
            video_data = user.get("edge_felix_video_timeline", {})
            if isinstance(video_data, dict):
                video_edges = video_data.get("edges", [])
                if isinstance(video_edges, list):
                    all_edges.extend(video_edges)

            # Deduplicate by post ID (using shortcode or id from node)
            seen_ids: set[str] = set()
            unique_edges: list[dict[str, Any]] = []
            for edge in all_edges:
                node = edge.get("node", {})
                if not isinstance(node, dict):
                    continue
                post_id: str = str(node.get("shortcode") or node.get("id", ""))
                if post_id and post_id not in seen_ids:
                    seen_ids.add(post_id)
                    unique_edges.append(edge)

            # Limit to max_items
            unique_edges = unique_edges[:max_items]

            if not unique_edges:
                logger.info("No Instagram content found for account_id: %d", account_id)
                return

            # Build author profile metadata once (reused for all content items)
            author_metadata = self._build_author_profile_metadata(user)

            # Process and upsert content items
            await self._upsert_content(unique_edges, account_id, author_metadata)
            logger.info(
                "Successfully upserted %d Instagram content items for account_id: %d",
                len(unique_edges),
                account_id,
            )

        except Exception as e:
            logger.error(
                "Failed to parse Instagram content for account_id %d: %s",
                account_id,
                e,
                exc_info=True,
            )
            raise

    async def _upsert_account(self, user: dict[str, Any], status: str = "parsed") -> int:
        """Upsert Instagram account record to database using PostgreSQL ON CONFLICT.

        Args:
            user: User object from Scrape Creators API response.
            status: Account status ('parsed', 'rejected', etc.).

        Returns:
            ID of the upserted Account record (auto-generated by PostgreSQL).
        """
        platform_id: str = str(user.get("id") or user.get("pk", ""))
        username: str | None = user.get("username") or user.get("handle")
        full_name: str | None = user.get("full_name") or user.get("name")
        biography: str | None = user.get("biography") or user.get("bio")
        subscribers_count: int = self._extract_subscribers_count(user)

        async with self.session_maker() as session:
            async with session.begin():
                stmt = pg_insert(Account).values(
                    platform="INSTAGRAM",
                    platform_id=platform_id,
                    username=username,
                    title=full_name or username or "Unknown",
                    description=biography,
                    subscribers_count=subscribers_count,
                    status=status,
                )
                stmt = stmt.on_conflict_do_update(
                    index_elements=["platform", "platform_id"],
                    set_=dict(
                        username=username,
                        title=full_name or username or "Unknown",
                        description=biography,
                        subscribers_count=subscribers_count,
                        status=status,
                        updated_at=datetime.now(timezone.utc),
                    ),
                ).returning(Account.id)

                result = await session.execute(stmt)
                account_id: int = result.scalar_one()
                logger.debug(
                    "Upserted Instagram account %s (ID: %d, status: %s)",
                    username,
                    account_id,
                    status,
                )
                return account_id

    async def _upsert_virtual_profile_post(
        self, account_id: int, user: dict[str, Any]
    ) -> None:
        """Upsert a virtual profile post into the content table for semantic search.

        Creates a synthetic content record containing the creator's biography and
        profile metadata so the embedding worker can index it into Qdrant for
        semantic search over creator biographies.

        The virtual post has:
            - platform_content_id = "profile_bio_{platform_id}"
            - content = compiled profile metadata string
            - is_embedded = False (picked up by embedding worker)
            - has_media = False

        Args:
            account_id: Database ID of the parent account record.
            user: User object from Scrape Creators API response.
        """
        platform_id: str = str(user.get("id") or user.get("pk", ""))
        username: str | None = user.get("username") or user.get("handle")
        full_name: str | None = user.get("full_name") or user.get("name")
        biography: str | None = user.get("biography") or user.get("bio")
        subscribers_count: int = self._extract_subscribers_count(user)

        virtual_content_id: str = f"profile_bio_{platform_id}"
        compiled_text: str = (
            f"[PROFILE METADATA]\n"
            f"Platform: Instagram\n"
            f"Username: @{username or 'unknown'}\n"
            f"Title: {full_name or 'Unknown'}\n"
            f"Subscribers: {subscribers_count}\n"
            f"Bio: {biography or 'N/A'}"
        )

        now = datetime.now(timezone.utc)

        async with self.session_maker() as session:
            async with session.begin():
                stmt = pg_insert(Content).values(
                    account_id=account_id,
                    platform_content_id=virtual_content_id,
                    content=compiled_text,
                    transcription=None,
                    published_at=now,
                    views=None,
                    reactions_count=None,
                    comments_count=None,
                    shares_count=None,
                    has_media=False,
                    is_embedded=False,
                    is_graph_extracted=False,
                    raw_metadata=None,
                    updated_at=now,
                )
                stmt = stmt.on_conflict_do_update(
                    constraint="uq_content_account_platform_id",
                    set_=dict(
                        content=stmt.excluded.content,
                        updated_at=stmt.excluded.updated_at,
                    ),
                )
                await session.execute(stmt)
                logger.debug(
                    "Upserted virtual profile post for Instagram account_id: %d (platform_content_id: %s)",
                    account_id,
                    virtual_content_id,
                )

    async def _upsert_content(
        self,
        edges: list[dict[str, Any]],
        account_id: int,
        author_metadata: dict[str, Any],
    ) -> None:
        """Bulk upsert Instagram content records to database.

        Args:
            edges: List of edge dictionaries containing node data from API responses.
            account_id: ID of the parent Account record.
            author_metadata: Author profile metadata to embed in each content record.
        """
        content_values: list[dict[str, Any]] = []

        for edge in edges:
            try:
                node: dict[str, Any] = edge.get("node", {})
                if not isinstance(node, dict):
                    continue

                # Extract platform_content_id from shortcode or id
                platform_content_id: str = str(
                    node.get("shortcode") or node.get("id", "")
                )
                if not platform_content_id:
                    logger.warning("Skipping content item with no ID")
                    continue

                # Extract content text
                content_text: str | None = self._extract_content_text(node)

                # Extract published timestamp
                published_at: datetime | None = self._extract_published_at(node)

                # Extract engagement metrics
                views: int | None = node.get("video_view_count") or node.get("view_count")
                reactions_count: int | None = self._extract_reactions_count(node)
                comments_count: int | None = self._extract_comments_count(node)
                shares_count: int | None = node.get("share_count")

                # Check if video post and extract video URL
                is_video: bool = node.get("is_video", False)
                has_media: bool = is_video

                # Extract high-quality direct MP4 URL for GPU worker
                video_download_url: str | None = None
                if is_video:
                    video_download_url = self._extract_video_download_url(node)

                # Extract transcription if available
                transcription: str | None = self._extract_transcription(node)

                # Build platform metrics
                platform_metrics: dict[str, Any] = {
                    "views": views,
                    "likes": reactions_count,
                    "comments": comments_count,
                    "shares": shares_count,
                    "is_video": is_video,
                }

                # Build raw_metadata with author_profile_metadata and platform_metrics
                raw_metadata: dict[str, Any] = {
                    "author_profile_metadata": author_metadata,
                    "platform_metrics": platform_metrics,
                }
                if video_download_url:
                    raw_metadata["video_download_url"] = video_download_url

                content_values.append({
                    "account_id": account_id,
                    "platform_content_id": platform_content_id,
                    "content": content_text,
                    "transcription": transcription,
                    "published_at": published_at or datetime.now(timezone.utc),
                    "views": views,
                    "comments_count": comments_count,
                    "shares_count": shares_count,
                    "reactions_count": reactions_count,
                    "has_media": has_media,
                    "raw_metadata": raw_metadata,
                    "is_embedded": False,
                    "is_graph_extracted": False,
                    "updated_at": datetime.now(timezone.utc),
                })

            except Exception as e:
                logger.error("Failed to parse Instagram content item: %s", e, exc_info=True)
                continue

        if not content_values:
            logger.warning("No valid content items to upsert for account_id: %d", account_id)
            return

        async with self.session_maker() as session:
            async with session.begin():
                stmt = pg_insert(Content).values(content_values)
                stmt = stmt.on_conflict_do_update(
                    constraint="uq_content_account_platform_id",
                    set_=dict(
                        content=stmt.excluded.content,
                        transcription=stmt.excluded.transcription,
                        views=stmt.excluded.views,
                        reactions_count=stmt.excluded.reactions_count,
                        shares_count=stmt.excluded.shares_count,
                        comments_count=stmt.excluded.comments_count,
                        has_media=stmt.excluded.has_media,
                        raw_metadata=stmt.excluded.raw_metadata,
                        updated_at=datetime.now(timezone.utc),
                    ),
                )
                await session.execute(stmt)
                logger.debug(
                    "Upserted %d Instagram content records for account ID %d",
                    len(content_values),
                    account_id,
                )

    def _build_author_profile_metadata(self, user: dict[str, Any]) -> dict[str, Any]:
        """Build author profile metadata dictionary from user data.

        Extracts external links, contact information, location, language,
        and other profile-level data. This metadata is stored inside each
        Content.raw_metadata under the "author_profile_metadata" key.

        Uses shared parse_profile_contacts from core.utils to extract
        emails, Telegram handles, and external links from the biography.

        Args:
            user: User object from Instagram API response.

        Returns:
            Dictionary containing author profile metadata.
        """
        biography: str | None = user.get("biography") or user.get("bio")
        username: str | None = user.get("username") or user.get("handle")
        full_name: str | None = user.get("full_name") or user.get("name")

        # Use shared utility to parse contacts from biography and external_url
        external_url: str | None = user.get("external_url")
        contacts_dict: dict[str, Any] = parse_profile_contacts(biography, external_url)
        # parse_profile_contacts returns: {emails, telegram_handles, external_links, raw_bio}

        # Build profile link
        profile_link: str | None = None
        if username:
            profile_link = f"https://instagram.com/{username}"

        # Build contacts list in the format expected by OpenSPG
        contacts: list[str] = []
        for email in contacts_dict.get("emails", []):
            contacts.append(f"email:{email}")
        for handle in contacts_dict.get("telegram_handles", []):
            contacts.append(f"telegram:@{handle}")
        # Add external links as contact entries
        external_links: list[str] = contacts_dict.get("external_links", [])

        # Extract location from business address JSON if available
        location: str | None = None
        business_address = user.get("business_address_json")
        if business_address and isinstance(business_address, dict):
            location = business_address.get("street_address") or business_address.get("city")
        elif user.get("location"):
            location = user.get("location")

        # Language is not directly available from Instagram API
        language: str | None = None

        # Geo-data (latitude/longitude) is not typically available from basic API
        geo_data: dict[str, float] | None = None

        author_metadata: dict[str, Any] = {
            "profile_link": profile_link,
            "bio_description": biography,
            "external_links": external_links if external_links else None,
            "contacts": contacts if contacts else None,
            "advertising_contacts": contacts if contacts else None,
            "language": language,
            "location": location,
            "geo_data": geo_data,
        }

        # Remove None values for cleaner JSON
        return {k: v for k, v in author_metadata.items() if v is not None}

    def _extract_video_download_url(self, node: dict[str, Any]) -> str | None:
        """Extract high-quality direct MP4 URL from video node.

        Tries multiple fields to find the best quality video URL for
        downstream GPU worker processing.

        Args:
            node: Content node dictionary from API response.

        Returns:
            Direct MP4 URL string, or None if not found.
        """
        # Try video_url field first (highest quality)
        video_url: str | None = node.get("video_url")
        if video_url and isinstance(video_url, str):
            return video_url

        # Try display_url as fallback (may be image, check)
        display_url: str | None = node.get("display_url")
        if display_url and isinstance(display_url, str) and "cdninstagram" in display_url:
            return display_url

        # Try video_resources for highest quality
        video_resources = node.get("video_resources")
        if isinstance(video_resources, list) and video_resources:
            # Sort by profile (higher is better quality) and get the best
            sorted_resources = sorted(
                video_resources,
                key=lambda r: r.get("profile", 0) if isinstance(r, dict) else 0,
                reverse=True,
            )
            best_resource = sorted_resources[0]
            if isinstance(best_resource, dict):
                return best_resource.get("src")

        return None

    def _extract_transcription(self, node: dict[str, Any]) -> str | None:
        """Extract transcription from content node if available.

        Scrape Creators API may provide transcriptions for video content.
        This method attempts to extract it from various possible fields.

        Args:
            node: Content node dictionary from API response.

        Returns:
            Transcription text, or None if not available.
        """
        transcription: str | None = (
            node.get("transcription")
            or node.get("transcript")
            or node.get("video_transcription")
        )
        if transcription and isinstance(transcription, str):
            return transcription.strip()
        return None

    def _extract_subscribers_count(self, user: dict[str, Any]) -> int:
        """Extract subscriber count from Instagram user data.

        Args:
            user: User object from Instagram API response.

        Returns:
            Subscriber count as integer, or 0 if not found.
        """
        # Try edge_followed_by.count first (GraphQL structure)
        edge_followed_by = user.get("edge_followed_by")
        if isinstance(edge_followed_by, dict):
            count = edge_followed_by.get("count")
            if count is not None:
                try:
                    return int(count)
                except (ValueError, TypeError):
                    pass

        # Try followers field
        followers = user.get("followers") or user.get("followers_count")
        if followers is not None:
            try:
                return int(followers)
            except (ValueError, TypeError):
                pass

        return 0

    def _extract_content_text(self, node: dict[str, Any]) -> str | None:
        """Extract text content from Instagram content node.

        Args:
            node: Content node dictionary from API response.

        Returns:
            Extracted text content, or None if not found.
        """
        # Try edge_media_to_caption.edges[0].node.text
        edge_media_to_caption = node.get("edge_media_to_caption")
        if isinstance(edge_media_to_caption, dict):
            edges = edge_media_to_caption.get("edges", [])
            if isinstance(edges, list) and edges:
                first_edge = edges[0]
                if isinstance(first_edge, dict):
                    text_node = first_edge.get("node", {})
                    if isinstance(text_node, dict) and text_node.get("text"):
                        return str(text_node["text"])
        return None

    def _extract_published_at(self, node: dict[str, Any]) -> datetime | None:
        """Extract and convert published timestamp to timezone-aware datetime.

        Args:
            node: Content node dictionary from API response.

        Returns:
            Timezone-aware datetime, or None if timestamp is invalid.
        """
        timestamp = (
            node.get("taken_at_timestamp")
            or node.get("timestamp")
            or node.get("created_at")
            or node.get("published_at")
        )

        if timestamp:
            try:
                if isinstance(timestamp, (int, float)):
                    return datetime.fromtimestamp(int(timestamp), tz=timezone.utc)
                elif isinstance(timestamp, str):
                    return datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            except (ValueError, TypeError, OSError) as e:
                logger.warning("Failed to parse timestamp %s: %s", timestamp, e)
        return None

    def _extract_reactions_count(self, node: dict[str, Any]) -> int | None:
        """Extract reactions (likes) count from content node.

        Args:
            node: Content node dictionary from API response.

        Returns:
            Reactions count as integer, or None if not found.
        """
        edge_media_preview_like = node.get("edge_media_preview_like")
        if isinstance(edge_media_preview_like, dict):
            count = edge_media_preview_like.get("count")
            if count is not None:
                try:
                    return int(count)
                except (ValueError, TypeError):
                    pass
        return node.get("like_count") or node.get("reactions_count")

    def _extract_comments_count(self, node: dict[str, Any]) -> int | None:
        """Extract comments count from content node.

        Args:
            node: Content node dictionary from API response.

        Returns:
            Comments count as integer, or None if not found.
        """
        edge_media_to_comment = node.get("edge_media_to_comment")
        if isinstance(edge_media_to_comment, dict):
            count = edge_media_to_comment.get("count")
            if count is not None:
                try:
                    return int(count)
                except (ValueError, TypeError):
                    pass
        return node.get("comment_count") or node.get("comments_count")
