import base64
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

from src.api.services.cloudpayments_signature import sign_body, verify_signature
from src.utils.billing import has_access

SECRET = "test-secret-key-0123456789abcdef"


def _reference_hmac(body: bytes, secret: str) -> str:
    return base64.b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).decode()


def test_sign_body_matches_reference_hmac():
    body = b'{"TransactionId":123,"Amount":7900.00}'
    assert sign_body(body, SECRET) == _reference_hmac(body, SECRET)


def test_verify_signature_roundtrip():
    body = json.dumps({"AccountId": "42", "Amount": 7900, "Currency": "RUB"}).encode()
    assert verify_signature(body, sign_body(body, SECRET), SECRET)


def test_verify_signature_rejects_tampered_body():
    body = b'{"Amount":7900}'
    signature = sign_body(body, SECRET)
    assert not verify_signature(b'{"Amount":1}', signature, SECRET)


def test_verify_signature_rejects_wrong_secret():
    body = b'{"Amount":7900}'
    signature = sign_body(body, SECRET)
    assert not verify_signature(body, signature, "another-secret")


def test_verify_signature_rejects_empty():
    assert not verify_signature(b"{}", "", SECRET)
    assert not verify_signature(b"{}", "deadbeef", "")


def _ts(days: float) -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=days)


def test_has_access_matrix():
    now = datetime.now(timezone.utc)
    assert has_access("free", None, now)
    assert has_access("free", _ts(-10), now)
    assert has_access("trial", _ts(5), now)
    assert not has_access("trial", _ts(-1), now)
    assert not has_access("trial", None, now)
    assert has_access("active", _ts(5), now)
    assert not has_access("active", _ts(-1), now)
    assert has_access("past_due", _ts(2), now)
    assert not has_access("past_due", _ts(-2), now)
    assert not has_access("expired", _ts(100), now)
    assert not has_access("expired", None, now)
    assert not has_access("unknown", _ts(100), now)
