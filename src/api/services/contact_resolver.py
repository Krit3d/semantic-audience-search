from dataclasses import dataclass
from typing import Any

from src.parser.creators.core.contacts import (
    is_valid_email,
    is_valid_telegram_handle,
    normalize_phone,
    normalize_telegram_handle,
)


@dataclass(slots=True, frozen=True)
class ContactResolutionResult:
    channel_type: str
    channel_target: str
    is_available: bool = True
    role: str = "direct"


class ContactResolver:
    @staticmethod
    def _contacts(raw_metadata: dict[str, Any] | None) -> dict[str, Any]:
        if not isinstance(raw_metadata, dict):
            return {}
        contacts = raw_metadata.get("contacts")
        return contacts if isinstance(contacts, dict) else raw_metadata

    @staticmethod
    def _blacklist(contacts: dict[str, Any]) -> set[str]:
        channels = contacts.get("telegram_channels", [])
        if not isinstance(channels, list):
            return set()
        return {normalize_telegram_handle(item) for item in channels if isinstance(item, str) and item.strip()}

    @staticmethod
    def _telegram_candidate(handle: Any, blacklist: set[str]) -> str | None:
        if not isinstance(handle, str):
            return None
        normalized = normalize_telegram_handle(handle)
        if not is_valid_telegram_handle(normalized) or normalized in blacklist:
            return None
        if normalized.lower().endswith("bot") or "joinchat" in normalized.lower():
            return None
        return normalized

    @staticmethod
    def _clean_username(value: Any) -> str:
        if not isinstance(value, str):
            return ""
        return value.strip().removeprefix("@").strip()

    @staticmethod
    def _resolve_telegram(contacts: dict[str, Any], blacklist: set[str]) -> ContactResolutionResult | None:
        groups = (
            (contacts.get("advertising_telegrams") or contacts.get("telegram_advertisement"), "commercial"),
            (contacts.get("telegram_personal"), "personal"),
            (contacts.get("telegram_handles"), "general"),
        )
        for candidates, role in groups:
            if not isinstance(candidates, (list, tuple)):
                continue
            for candidate in candidates:
                handle = ContactResolver._telegram_candidate(candidate, blacklist)
                if handle is not None:
                    return ContactResolutionResult("telegram", f"@{handle}", True, role)
        return None

    @staticmethod
    def _resolve_email(contacts: dict[str, Any]) -> ContactResolutionResult | None:
        for candidates, role in ((contacts.get("advertising_emails"), "commercial"), (contacts.get("emails"), "general")):
            if not isinstance(candidates, (list, tuple)):
                continue
            for candidate in candidates:
                if isinstance(candidate, str) and is_valid_email(candidate):
                    return ContactResolutionResult("email", candidate.strip().lower(), True, role)
        return None

    @staticmethod
    def _resolve_whatsapp(contacts: dict[str, Any]) -> ContactResolutionResult | None:
        candidates = contacts.get("phones")
        if not isinstance(candidates, (list, tuple)):
            return None
        for candidate in candidates:
            if isinstance(candidate, str):
                phone = normalize_phone(candidate)
                if phone is not None:
                    return ContactResolutionResult("whatsapp", phone, True, "personal")
        return None

    @staticmethod
    def _resolve_instagram(username: str | None, raw_metadata: dict[str, Any] | None) -> ContactResolutionResult | None:
        raw_username = username if username is not None else raw_metadata.get("username") if isinstance(raw_metadata, dict) else None
        clean_username = ContactResolver._clean_username(raw_username)
        return ContactResolutionResult("instagram", f"@{clean_username}", True, "direct") if clean_username else None

    @staticmethod
    def get_available_channels(raw_metadata: dict[str, Any] | None, username: str | None = None) -> list[ContactResolutionResult]:
        contacts = ContactResolver._contacts(raw_metadata)
        blacklist = ContactResolver._blacklist(contacts)
        results = (
            ContactResolver._resolve_telegram(contacts, blacklist),
            ContactResolver._resolve_email(contacts),
            ContactResolver._resolve_whatsapp(contacts),
            ContactResolver._resolve_instagram(username, raw_metadata),
        )
        return [result for result in results if result is not None]

    @staticmethod
    def resolve(raw_metadata: dict[str, Any] | None, username: str | None = None) -> ContactResolutionResult:
        available = ContactResolver.get_available_channels(raw_metadata, username)
        priorities = (
            ("telegram", "commercial"),
            ("email", "commercial"),
            ("telegram", "personal"),
            ("email", "general"),
            ("whatsapp", "personal"),
            ("telegram", "general"),
            ("instagram", "direct"),
        )
        for channel_type, role in priorities:
            for result in available:
                if result.channel_type == channel_type and result.role == role:
                    return result
        return ContactResolutionResult("", "", False, "")

    @staticmethod
    def resolve_channel_target(raw_metadata: dict[str, Any] | None, username: str | None, channel_type: str) -> str | None:
        normalized_type = channel_type.casefold()
        return next(
            (result.channel_target for result in ContactResolver.get_available_channels(raw_metadata, username) if result.channel_type.casefold() == normalized_type),
            None,
        )
