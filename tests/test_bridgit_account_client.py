import base64
import json

import httpx
import pytest

from src.api.services.bridgit_client import BridgitAPIError, BridgitClient, BridgitTimeoutError
from src.api.services.instagram_password_cipher import InstagramPasswordCipher


def make_cipher() -> InstagramPasswordCipher:
    return InstagramPasswordCipher(bytes(range(32)))


def make_client(handler) -> BridgitClient:
    transport = httpx.MockTransport(handler)
    http_client = httpx.AsyncClient(transport=transport, base_url="https://bridgit.test/api/public/v3")
    return BridgitClient("secret-api-key", client=http_client)


def test_password_encryption_round_trip_and_random_nonce() -> None:
    cipher = make_cipher()
    first_ciphertext, first_nonce = cipher.encrypt("correct horse battery staple")
    second_ciphertext, second_nonce = cipher.encrypt("correct horse battery staple")
    assert first_nonce != second_nonce
    assert first_ciphertext != second_ciphertext
    assert cipher.decrypt(first_ciphertext, first_nonce) == "correct horse battery staple"


def test_password_encryption_rejects_ciphertext_damage() -> None:
    cipher = make_cipher()
    ciphertext, nonce = cipher.encrypt("private-password")
    damaged = bytes([ciphertext[0] ^ 1]) + ciphertext[1:]
    with pytest.raises(ValueError, match="decryption failed"):
        cipher.decrypt(damaged, nonce)


def test_password_key_requires_base64_encoded_32_bytes() -> None:
    encoded = base64.b64encode(bytes(range(32))).decode("ascii")
    assert isinstance(InstagramPasswordCipher.from_base64(encoded), InstagramPasswordCipher)
    with pytest.raises(ValueError):
        InstagramPasswordCipher.from_base64("not-base64!")
    with pytest.raises(ValueError):
        InstagramPasswordCipher(b"short")


@pytest.mark.asyncio
async def test_add_account_uses_post_body_without_url_secrets() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert request.url.path == "/api/public/v3/account/add2bridgit"
        assert not request.url.query
        assert request.content == b"api_key=secret-api-key&login=creator&password=private-password&two_factor=123456&country=de"
        return httpx.Response(200, json={"status": "success", "result": "in_queue"})

    client = make_client(handler)
    result = await client.add_account("Creator", "private-password", "123456", "de")
    assert result["result"] == "in_queue"
    await client.aclose()


@pytest.mark.asyncio
async def test_update_and_remove_use_expected_methods() -> None:
    paths: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        return httpx.Response(200, json={"status": "success", "result": "in_queue"})

    client = make_client(handler)
    await client.update_account("creator", "new-password", "654321")
    await client.remove_account("creator")
    assert paths == ["/api/public/v3/account/update", "/api/public/v3/account/remove"]
    await client.aclose()


@pytest.mark.asyncio
async def test_current_status_and_account_list_use_get_query() -> None:
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path.endswith("/currentstatus"):
            return httpx.Response(200, json={"status": "success", "result": "needcheck"})
        return httpx.Response(200, json={"status": "success", "accounts": []})

    client = make_client(handler)
    status = await client.get_account_status("Creator")
    accounts = await client.get_accounts("Creator")
    assert status["result"] == "needcheck"
    assert accounts["accounts"] == []
    assert all(request.method == "GET" for request in requests)
    assert all(request.url.params["api_key"] == "secret-api-key" for request in requests)
    assert all(request.url.params["login"] == "creator" for request in requests)
    await client.aclose()


@pytest.mark.asyncio
@pytest.mark.parametrize("status_code", [500, 502, 504])
async def test_get_retries_transient_statuses(status_code: int, monkeypatch: pytest.MonkeyPatch) -> None:
    calls = 0
    delays: list[float] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls < 4:
            return httpx.Response(status_code, text="private response")
        return httpx.Response(200, json={"status": "success", "result": "ok"})

    async def no_sleep(delay: float) -> None:
        delays.append(delay)

    monkeypatch.setattr("src.api.services.bridgit_client.asyncio.sleep", no_sleep)
    monkeypatch.setattr("src.api.services.bridgit_client.random.uniform", lambda start, end: 0.0)
    client = make_client(handler)
    result = await client.get_account_status("creator")
    assert result["result"] == "ok"
    assert calls == 4
    assert delays == [1.0, 2.0, 4.0]
    await client.aclose()


@pytest.mark.asyncio
async def test_post_is_never_retried(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(500, text="private response")

    async def fail_sleep(delay: float) -> None:
        raise AssertionError("POST must not retry")

    monkeypatch.setattr("src.api.services.bridgit_client.asyncio.sleep", fail_sleep)
    client = make_client(handler)
    with pytest.raises(BridgitAPIError) as error:
        await client.add_account("creator", "private-password")
    assert calls == 1
    assert "private-password" not in str(error.value)
    assert "secret-api-key" not in str(error.value)
    assert "private response" not in str(error.value)
    await client.aclose()


@pytest.mark.asyncio
async def test_get_timeout_exhaustion_returns_safe_timeout_error() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("private-password secret-api-key", request=request)

    client = make_client(handler)
    client._get_retries = 0
    with pytest.raises(BridgitTimeoutError) as error:
        await client.get_account_status("creator")
    assert error.value.status_code == 504
    assert "private-password" not in str(error.value)
    assert "secret-api-key" not in str(error.value)
    await client.aclose()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("payload", "result", "field"),
    [
        ({"status": "error", "error_code": 200, "result": "already1"}, "already1", None),
        ({"status": "error", "error_code": 200, "result": "already2"}, "already2", None),
        ({"status": "error", "error_code": 5, "message": "missed_params", "explain": "country"}, None, "country"),
    ],
)
async def test_account_errors_are_machine_readable(payload: dict, result: str | None, field: str | None) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload)

    client = make_client(handler)
    with pytest.raises(BridgitAPIError) as error:
        await client.add_account("creator", "private-password")
    assert error.value.result == result
    assert error.value.field == field
    assert error.value.status_code == 502
    await client.aclose()


@pytest.mark.asyncio
@pytest.mark.parametrize("body", ["[]", "null", json.dumps({"status": "success", "result": None})])
async def test_unknown_payload_is_safe_error(body: str) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=body)

    client = make_client(handler)
    with pytest.raises(BridgitAPIError):
        await client.get_account_status("creator")
    await client.aclose()
