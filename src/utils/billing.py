from datetime import datetime


def has_access(status: str, expires_at: datetime | None, now: datetime) -> bool:
    if status == "free":
        return True
    if status in ("trial", "active", "past_due"):
        return expires_at is not None and expires_at > now
    return False
