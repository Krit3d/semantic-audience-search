import base64
import hashlib
import hmac
import json
import secrets
import time
import math
from typing import Any

LEGACY_PBKDF2_ITERATIONS = 100_000
PBKDF2_ITERATIONS = 600_000
SALT_BYTES = 16
HASH_ALGORITHM = "sha256"
JWT_ALGORITHM = "HS256"
AUTH_COOKIE_NAME = "cf_auth"
AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30


def hash_password(password: str) -> str:
    salt = secrets.token_hex(SALT_BYTES)
    digest = hashlib.pbkdf2_hmac(
        HASH_ALGORITHM,
        password.encode("utf-8"),
        salt.encode("utf-8"),
        PBKDF2_ITERATIONS,
    )
    return f"{salt}${PBKDF2_ITERATIONS}${digest.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    parts = password_hash.split("$")
    match parts:
        case [salt, stored_digest]:
            iterations = LEGACY_PBKDF2_ITERATIONS
        case [salt, iter_str, stored_digest]:
            try:
                iterations = int(iter_str)
            except ValueError:
                return False
        case _:
            return False
    digest = hashlib.pbkdf2_hmac(
        HASH_ALGORITHM,
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    )
    return hmac.compare_digest(digest.hex(), stored_digest)


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def create_access_token(data: dict[str, Any], secret_key: str, expires_delta_hours: int = 168) -> str:
    now = int(time.time())
    header = {"alg": JWT_ALGORITHM, "typ": "JWT"}
    payload = dict(data)
    payload["iat"] = now
    payload["exp"] = now + expires_delta_hours * 3600
    header_b64 = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
    signature = hmac.new(secret_key.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{header_b64}.{payload_b64}.{_b64url_encode(signature)}"


def decode_access_token(token: str, secret_key: str) -> dict[str, Any] | None:
    try:
        header_b64, payload_b64, signature_b64 = token.split(".")
        signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
        expected = hmac.new(secret_key.encode("utf-8"), signing_input, hashlib.sha256).digest()
        actual = _b64url_decode(signature_b64)
        if not hmac.compare_digest(actual, expected):
            return None
        payload = json.loads(_b64url_decode(payload_b64))
        if not isinstance(payload, dict):
            return None
        exp = payload.get("exp")
        issued_at = payload.get("iat")
        if (
            isinstance(exp, bool)
            or not isinstance(exp, (int, float))
            or not math.isfinite(exp)
            or isinstance(issued_at, bool)
            or not isinstance(issued_at, (int, float))
            or not math.isfinite(issued_at)
            or exp < time.time()
            or payload.get("user_id") is None
            or payload.get("user_id") == ""
        ):
            return None
        return payload
    except (ValueError, TypeError, json.JSONDecodeError):
        return None
