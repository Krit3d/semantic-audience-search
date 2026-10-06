from urllib.parse import urlsplit


def is_allowed_destination(url: str, allowed_hosts: object) -> bool:
    """Allow only HTTP(S) URLs whose normalized hostname is explicitly configured."""
    if not isinstance(allowed_hosts, (list, tuple, set)):
        return False
    try:
        parsed = urlsplit(url)
        hostname = parsed.hostname
        # Accessing port also validates malformed port values.
        _ = parsed.port
    except ValueError:
        return False
    if parsed.scheme not in {"http", "https"} or not hostname or parsed.username or parsed.password:
        return False
    hostname = hostname.rstrip(".").lower()
    configured = {
        item.strip().rstrip(".").lower()
        for item in allowed_hosts
        if isinstance(item, str) and item.strip()
    }
    return hostname in configured
