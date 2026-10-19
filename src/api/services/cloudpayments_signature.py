import base64
import hashlib
import hmac


def sign_body(raw_body: bytes, secret: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return base64.b64encode(digest).decode("ascii")


def verify_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    if not signature or not secret:
        return False
    expected = sign_body(raw_body, secret)
    return hmac.compare_digest(expected, signature.strip())
