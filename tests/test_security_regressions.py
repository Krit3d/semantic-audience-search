"""Regression tests using synthetic data only; no credentials or production endpoints."""

from types import SimpleNamespace
from io import BytesIO

import pytest
from fastapi import BackgroundTasks, HTTPException, UploadFile
from starlette.datastructures import Headers
from starlette.requests import Request

from src.api.routers.crm import creators, media, webhooks
from src.api.routers.search import authorize_contact_results, search_content
from src.api.schemas import SearchRequest
from src.utils.rate_limiter import InMemoryRateLimiter
from src.utils import media_bridge
from src.utils.security import _b64url_encode, decode_access_token
from src.utils.url_security import is_allowed_destination
import hashlib
import hmac
import json


def make_request(headers=None, body=b"", client=("192.0.2.10", 1234)):
    raw_headers = [(key.lower().encode(), value.encode()) for key, value in (headers or {}).items()]
    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
        "method": "POST", "scheme": "http", "path": "/", "raw_path": b"/",
        "query_string": b"", "headers": raw_headers, "client": client,
        "server": ("testserver", 80),
    }

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    return Request(scope, receive)


@pytest.mark.asyncio
@pytest.mark.parametrize("provided_secret", [None, "incorrect-test-value"])
async def test_webhook_rejects_missing_or_invalid_configured_secret(provided_secret):
    headers = {"x-webhook-secret": provided_secret} if provided_secret else {}
    request = make_request(headers)
    request.scope["app"] = SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace(bridgit_api_key="expected-test-value")))
    with pytest.raises(HTTPException) as exc:
        await webhooks.inbound_webhook(request, BackgroundTasks(), None)  # type: ignore[arg-type]
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_webhook_rejects_when_secret_is_unconfigured():
    request = make_request()
    request.scope["app"] = SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace(bridgit_api_key="")))
    with pytest.raises(HTTPException) as exc:
        await webhooks.inbound_webhook(request, BackgroundTasks(), None)  # type: ignore[arg-type]
    assert exc.value.status_code == 401


@pytest.mark.parametrize(
    "payload",
    [
        {"user_id": 1, "exp": "soon", "iat": 1},
        {"user_id": 1, "exp": 4_000_000_000},
        {"exp": 4_000_000_000, "iat": 1},
        {"user_id": 1, "exp": True, "iat": 1},
    ],
    ids=["text-exp", "missing-iat", "missing-user", "boolean-exp"],
)
def test_jwt_rejects_missing_or_non_numeric_claims(payload):
    key = "synthetic-signing-key"
    header = _b64url_encode(b'{"alg":"HS256","typ":"JWT"}')
    body = _b64url_encode(json.dumps(payload).encode())
    signing_input = f"{header}.{body}".encode()
    signature = _b64url_encode(hmac.new(key.encode(), signing_input, hashlib.sha256).digest())
    assert decode_access_token(f"{header}.{body}.{signature}", key) is None


def test_destination_allowlisting_is_exact_and_rejects_credentials():
    hosts = ["media.example.invalid"]
    assert is_allowed_destination("https://media.example.invalid/upload", hosts)
    assert not is_allowed_destination("https://evil.example.invalid/upload", hosts)
    assert not is_allowed_destination("https://user@media.example.invalid/upload", hosts)


@pytest.mark.asyncio
async def test_media_bridge_rejects_missing_secret_and_traversal_filename(monkeypatch, tmp_path):
    monkeypatch.setattr(media_bridge, "Settings", lambda: SimpleNamespace(media_bridge_secret="bridge-test-secret"))
    monkeypatch.setattr(media_bridge, "MEDIA_DIR", tmp_path)
    req = make_request()
    upload = UploadFile(filename="../../outside.png", file=BytesIO(b"\x89PNG\r\n\x1a\n"))
    with pytest.raises(HTTPException) as exc:
        await media_bridge.upload(req, upload)
    assert exc.value.status_code == 403

    req = make_request({"x-bridge-secret": "bridge-test-secret"})
    upload = UploadFile(filename="../../outside.png", file=BytesIO(b"\x89PNG\r\n\x1a\n"))
    response = await media_bridge.upload(req, upload)
    assert response["name"] == "outside.png"
    assert list(tmp_path.glob("*.png"))
    assert not (tmp_path.parent / "outside.png").exists()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("filename", "content", "expected_status"),
    [
        pytest.param("payload.exe", b"MZ", 415, id="extension"),
        pytest.param("fake.png", b"not-a-png", 415, id="signature"),
        pytest.param("large.pdf", None, 413, id="size-limit"),
    ],
)
async def test_media_bridge_rejects_invalid_type_signature_and_oversize(
    monkeypatch, tmp_path, filename, content, expected_status
):
    monkeypatch.setattr(media_bridge, "Settings", lambda: SimpleNamespace(media_bridge_secret="bridge-test-secret"))
    monkeypatch.setattr(media_bridge, "MEDIA_DIR", tmp_path)
    request = make_request({"x-bridge-secret": "bridge-test-secret"})
    if content is None:
        content = b"%PDF-" + b"x" * media_bridge.MAX_UPLOAD_SIZE
    upload = UploadFile(filename=filename, file=BytesIO(content))
    with pytest.raises(HTTPException) as exc:
        await media_bridge.upload(request, upload)
    assert exc.value.status_code == expected_status
    assert list(tmp_path.iterdir()) == []


@pytest.mark.asyncio
async def test_media_bridge_get_rejects_path_traversal(monkeypatch, tmp_path):
    monkeypatch.setattr(media_bridge, "MEDIA_DIR", tmp_path)
    outside_file = tmp_path.parent / "bridge-secret-test.txt"
    outside_file.write_text("synthetic", encoding="utf-8")
    try:
        with pytest.raises(HTTPException) as exc:
            await media_bridge.get_media("../bridge-secret-test.txt")
        assert exc.value.status_code == 404
    finally:
        outside_file.unlink(missing_ok=True)


@pytest.mark.asyncio
async def test_upload_does_not_forward_secret_to_unallowlisted_bridge():
    request = make_request()
    request.scope["app"] = SimpleNamespace(
        state=SimpleNamespace(
            settings=SimpleNamespace(
                media_bridge_url="https://attacker.example.invalid",
                media_bridge_secret="synthetic-secret",
                media_bridge_allowed_hosts=["bridge.example.invalid"],
            )
        )
    )
    file = UploadFile(filename="valid.png", file=BytesIO(b"\x89PNG\r\n\x1a\nrest"))
    with pytest.raises(HTTPException) as exc:
        await media.upload_file(request, file, current_user=SimpleNamespace(id=1))
    assert exc.value.status_code == 503


@pytest.mark.asyncio
async def test_creator_delete_requires_local_user_ownership(monkeypatch):
    account = SimpleNamespace(id=42)
    monkeypatch.setattr(creators, "resolve_account", lambda *_args, **_kwargs: _async_result(account))

    class Session:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def execute(self, _statement):
            return SimpleNamespace(scalar_one_or_none=lambda: None)

    class CrmClient:
        deleted = False

        async def delete_creator(self, *_args):
            self.deleted = True

    crm_client = CrmClient()
    with pytest.raises(HTTPException) as exc:
        await creators.crm_delete_creator(
            "creator-from-another-user",
            SimpleNamespace(id=2, email="user-b@example.invalid"),
            SimpleNamespace(async_session=lambda: Session()),
            crm_client,
        )
    assert exc.value.status_code == 404
    assert crm_client.deleted is False


async def _async_result(value):
    return value


@pytest.mark.asyncio
async def test_webhook_rejects_oversized_declared_body():
    request = make_request({
        "content-length": str(webhooks.MAX_WEBHOOK_BODY + 1),
        "x-webhook-secret": "expected-test-value",
    })
    request.scope["app"] = SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace(bridgit_api_key="expected-test-value")))
    with pytest.raises(HTTPException) as exc:
        await webhooks.inbound_webhook(request, BackgroundTasks(), None)  # type: ignore[arg-type]
    assert exc.value.status_code == 413


@pytest.mark.asyncio
@pytest.mark.parametrize("url", [
    "http://public.example.invalid/asset.jpg",
    "http://8.8.8.8/asset.jpg",
    "https://127.0.0.1/asset.jpg",
    "https://private.example.invalid/asset.jpg",
])
async def test_webhook_attachment_rejects_unsafe_scheme_or_resolved_address(monkeypatch, url):
    def resolve(*_args, **_kwargs):
        return [(None, None, None, None, ("127.0.0.1", 443))]

    monkeypatch.setattr(webhooks.socket, "getaddrinfo", resolve)
    result = await webhooks._save_webhook_media(
        url, "asset.jpg", SimpleNamespace(media_bridge_url="")  # type: ignore[arg-type]
    )
    assert result == (None, None, None)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status_code", "content_length"),
    [(302, "10"), (200, str(webhooks.MAX_WEBHOOK_MEDIA + 1)), (200, "1")],
)
async def test_webhook_attachment_rejects_redirect_and_declared_oversize(
    monkeypatch, status_code, content_length
):
    monkeypatch.setattr(
        webhooks.socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [(None, None, None, None, ("8.8.8.8", 443))],
    )

    class Response:
        def __init__(self):
            self.status_code = status_code
            self.headers = {"content-length": content_length}

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def aiter_bytes(self):
            yield b"x" * (webhooks.MAX_WEBHOOK_MEDIA + 1)

    class Client:
        def __init__(self, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        def stream(self, *_args, **_kwargs):
            return Response()

    monkeypatch.setattr(webhooks.httpx, "AsyncClient", Client)
    result = await webhooks._save_webhook_media(
        "https://public.example.invalid/asset.jpg",
        "asset.jpg",
        SimpleNamespace(
            media_bridge_url="", webhook_media_allowed_hosts=["public.example.invalid"]
        ),  # type: ignore[arg-type]
    )
    assert result == (None, None, None)


@pytest.mark.parametrize(
    ("extension", "content"),
    [(".jpg", b"not an image"), (".png", b"\xff\xd8\xffinvalid-png")],
)
def test_upload_rejects_extension_signature_mismatch(extension, content):
    assert media.validate_file_signature(content, extension) is False


@pytest.mark.asyncio
async def test_upload_rejects_over_limit_and_removes_partial_file(monkeypatch, tmp_path):
    monkeypatch.setattr(media, "MEDIA_DIR", tmp_path)
    request = make_request()
    request.scope["app"] = SimpleNamespace(
        state=SimpleNamespace(settings=SimpleNamespace(media_bridge_url="", media_bridge_secret=""))
    )
    content = b"\x89PNG\r\n\x1a\n" + b"x" * media.MAX_UPLOAD_SIZE
    upload = UploadFile(
        filename="oversized.png",
        file=BytesIO(content),
        headers=Headers({"content-type": "image/png"}),
    )
    with pytest.raises(HTTPException) as exc:
        await media.upload_file(request, upload, current_user=SimpleNamespace(id=123))
    assert exc.value.status_code == 413
    assert list(tmp_path.iterdir()) == []


@pytest.mark.asyncio
async def test_upload_user_propagates_revoked_or_inactive_user_rejection(monkeypatch):
    request = make_request()
    request.scope["app"] = SimpleNamespace(
        state=SimpleNamespace(settings=SimpleNamespace(secret_key="test-internal-key"))
    )

    async def reject_user(*_args):
        raise HTTPException(status_code=403, detail="inactive")

    monkeypatch.setattr(media, "get_current_user", reject_user)
    with pytest.raises(HTTPException) as exc:
        await media.get_upload_user(request, None)  # type: ignore[arg-type]
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_contacts_require_token_and_active_user(monkeypatch):
    request = make_request()
    request.scope["app"] = SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace(secret_key="test-signing-key")))

    async def reject_missing_token(*_args):
        return None

    monkeypatch.setattr("src.api.routers.search.decode_access_token", reject_missing_token)
    with pytest.raises(HTTPException) as exc:
        await authorize_contact_results(request, None)  # type: ignore[arg-type]
    assert exc.value.status_code == 401

    request = make_request({"Authorization": "Bearer invalid-test-token"})
    request.scope["app"] = SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace(secret_key="test-signing-key")))
    monkeypatch.setattr("src.api.routers.search.decode_access_token", lambda *_args: None)
    with pytest.raises(HTTPException) as exc:
        await authorize_contact_results(request, None)  # type: ignore[arg-type]
    assert exc.value.status_code == 401

    request = make_request({"Authorization": "Bearer synthetic-token"})
    request.scope["app"] = SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace(secret_key="test-signing-key")))
    monkeypatch.setattr(
        "src.api.routers.search.decode_access_token",
        lambda *_args: {"user_id": 123},
    )

    class Session:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def execute(self, _statement):
            return SimpleNamespace(scalar_one_or_none=lambda: SimpleNamespace(is_active=False))

    db = SimpleNamespace(async_session=lambda: Session())
    with pytest.raises(HTTPException) as exc:
        await authorize_contact_results(request, db)  # type: ignore[arg-type]
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_contact_authorization_allows_active_user(monkeypatch):
    request = make_request({"Authorization": "Bearer synthetic-token"})
    request.scope["app"] = SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace(secret_key="test-signing-key")))
    monkeypatch.setattr(
        "src.api.routers.search.decode_access_token",
        lambda *_args: {"user_id": 123},
    )

    class Session:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def execute(self, _statement):
            return SimpleNamespace(scalar_one_or_none=lambda: SimpleNamespace(is_active=True))

    await authorize_contact_results(request, SimpleNamespace(async_session=lambda: Session()))  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_active_user_search_returns_contact_results(monkeypatch):
    request = make_request({"Authorization": "Bearer synthetic-token"})
    request.scope["app"] = SimpleNamespace(
        state=SimpleNamespace(settings=SimpleNamespace(secret_key="test-signing-key"))
    )
    monkeypatch.setattr(
        "src.api.routers.search.decode_access_token",
        lambda *_args: {"user_id": 123},
    )

    class Session:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def execute(self, _statement):
            return SimpleNamespace(scalar_one_or_none=lambda: SimpleNamespace(is_active=True))

    contacts = {"emails": ["synthetic@example.invalid"]}

    async def execute_search(payload):
        assert payload.include_contacts is True
        return SimpleNamespace(total=1, items=[SimpleNamespace(contacts=contacts)])

    response = await search_content(
        SearchRequest(query="synthetic contact query", include_contacts=True),
        request,
        SimpleNamespace(async_session=lambda: Session()),  # type: ignore[arg-type]
        SimpleNamespace(execute_search=execute_search),  # type: ignore[arg-type]
    )
    assert response.total == 1
    assert response.items[0].contacts == contacts


@pytest.mark.asyncio
async def test_anonymous_search_without_contacts_is_allowed():
    request = make_request()

    async def execute_search(payload):
        assert payload.include_contacts is False
        return SimpleNamespace(total=0, items=[])

    service = SimpleNamespace(execute_search=execute_search)
    response = await search_content(
        SearchRequest(query="synthetic anonymous query", include_contacts=False),
        request,
        None,  # type: ignore[arg-type]
        service,  # type: ignore[arg-type]
    )
    assert response.total == 0
    assert response.items == []


@pytest.mark.asyncio
async def test_webhook_rejects_oversized_actual_body_without_content_length():
    body = b"x" * (webhooks.MAX_WEBHOOK_BODY + 1)
    request = make_request({"x-webhook-secret": "expected-test-value"}, body)
    request.scope["app"] = SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace(bridgit_api_key="expected-test-value")))
    with pytest.raises(HTTPException) as exc:
        await webhooks.inbound_webhook(request, BackgroundTasks(), None)  # type: ignore[arg-type]
    assert exc.value.status_code == 413


@pytest.mark.asyncio
async def test_rate_limiter_ignores_spoofed_forwarding_headers():
    limiter = InMemoryRateLimiter()
    request = make_request({
        "x-forwarded-for": "198.51.100.20",
        "x-real-ip": "203.0.113.20",
    })
    assert limiter.get_client_ip(request) == "192.0.2.10"
