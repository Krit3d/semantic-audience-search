import asyncio
import random
from typing import Any
from urllib.parse import urlparse

import httpx


class BridgitAPIError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        status_code: int = 502,
        error_code: int | None = None,
        result: str | None = None,
        field: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.error_code = error_code
        self.result = result
        self.field = field


class BridgitTimeoutError(BridgitAPIError):
    def __init__(self) -> None:
        super().__init__("Bridgit request timed out", status_code=504)


class BridgitClient:
    def __init__(
        self,
        api_key: str,
        account_login: str | None = None,
        base_url: str = "https://app.bridgit.me/api/public/v3/",
        timeout: float = 30.0,
        get_retries: int = 3,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        normalized_base_url = base_url.rstrip("/")
        if urlparse(normalized_base_url).scheme != "https" and client is None:
            raise ValueError("Bridgit base URL must use HTTPS")
        self._api_key = api_key
        self._account_login = self._clean_login(account_login) if account_login else None
        self._base_url = normalized_base_url
        self._get_retries = max(0, min(get_retries, 3))
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(
            base_url=self._base_url,
            timeout=httpx.Timeout(timeout, connect=min(timeout, 10.0)),
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=50),
        )

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def __aenter__(self) -> "BridgitClient":
        return self

    async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        await self.aclose()

    @staticmethod
    def _clean_login(login: str) -> str:
        return login.strip().lstrip("@").lower()

    @staticmethod
    def _payload_error(data: dict[str, Any], fallback: str) -> BridgitAPIError:
        error_code = data.get("error_code")
        result = data.get("result")
        explain = data.get("explain")
        message = data.get("message")
        field = explain if message == "missed_params" and isinstance(explain, str) else None
        safe_message = "Bridgit rejected the request"
        if message == "missed_params":
            safe_message = "Bridgit reported a missing parameter"
        elif result == "already1":
            safe_message = "This profile is already added by your team"
        elif result == "already2":
            safe_message = "This profile is used by another team"
        return BridgitAPIError(
            safe_message if fallback == "" else fallback,
            error_code=error_code if isinstance(error_code, int) else None,
            result=result if isinstance(result, str) else None,
            field=field,
        )

    @staticmethod
    def _ensure_success(data: dict[str, Any]) -> dict[str, Any]:
        if data.get("status") != "success":
            raise BridgitClient._payload_error(data, "")
        return data

    async def _request(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        is_get = method == "GET"
        attempts = self._get_retries + 1 if is_get else 1
        for attempt in range(attempts):
            try:
                if is_get:
                    response = await self._client.get(path, params=payload)
                else:
                    response = await self._client.post(path, data=payload)
            except httpx.TimeoutException:
                if attempt + 1 < attempts:
                    await self._backoff(attempt)
                    continue
                raise BridgitTimeoutError() from None
            except httpx.HTTPError:
                if is_get and attempt + 1 < attempts:
                    await self._backoff(attempt)
                    continue
                raise BridgitAPIError("Bridgit is unavailable") from None
            if is_get and response.status_code in {500, 502, 504} and attempt + 1 < attempts:
                await self._backoff(attempt)
                continue
            if response.status_code == 504 and is_get:
                raise BridgitTimeoutError()
            if response.status_code != 200:
                raise BridgitAPIError(
                    f"Bridgit returned HTTP {response.status_code}",
                    status_code=502,
                )
            try:
                data = response.json()
            except (ValueError, TypeError):
                raise BridgitAPIError("Bridgit returned invalid JSON") from None
            if not isinstance(data, dict):
                raise BridgitAPIError("Bridgit returned an unexpected payload")
            return data
        raise BridgitAPIError("Bridgit request failed")

    @staticmethod
    async def _backoff(attempt: int) -> None:
        await asyncio.sleep((2**attempt) + random.uniform(0.0, 0.25))

    async def resolve_account_login(self) -> str:
        if self._account_login:
            return self._account_login
        data = self._ensure_success(await self._request("GET", "/account/my", payload={"api_key": self._api_key}))
        accounts = data.get("accounts")
        if not isinstance(accounts, list) or not accounts:
            raise BridgitAPIError("No active accounts found in Bridgit profile")
        chosen: str | None = None
        for account in accounts:
            if not isinstance(account, dict) or not isinstance(account.get("login"), str):
                continue
            candidate = self._clean_login(account["login"])
            if not candidate:
                continue
            if account.get("status") == "ok":
                chosen = candidate
                break
            if chosen is None:
                chosen = candidate
        if chosen is None:
            raise BridgitAPIError("No active accounts found in Bridgit profile")
        self._account_login = chosen
        return chosen

    async def add_account(
        self,
        login: str,
        password: str,
        two_factor: str | None = None,
        country: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "api_key": self._api_key,
            "login": self._clean_login(login),
            "password": password,
        }
        if two_factor is not None:
            payload["two_factor"] = two_factor
        if country is not None:
            payload["country"] = country
        data = self._ensure_success(await self._request("POST", "/account/add2bridgit", payload=payload))
        if data.get("result") != "in_queue":
            raise BridgitAPIError("Bridgit returned an unexpected account state")
        return data

    async def get_account_status(self, login: str | None = None) -> dict[str, Any]:
        target_login = self._clean_login(login) if login else self._account_login
        if not target_login:
            target_login = await self.resolve_account_login()
        data = self._ensure_success(await self._request(
            "GET",
            "/account/currentstatus",
            payload={"api_key": self._api_key, "login": target_login},
        ))
        result = data.get("result")
        if not isinstance(result, str):
            raise BridgitAPIError("Bridgit returned an invalid account status")
        return data

    async def get_accounts(self, login: str | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {"api_key": self._api_key}
        if login is not None:
            payload["login"] = self._clean_login(login)
        return self._ensure_success(await self._request("GET", "/account/my", payload=payload))

    async def update_account(
        self,
        login: str,
        password: str,
        two_factor: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "api_key": self._api_key,
            "login": self._clean_login(login),
            "password": password,
        }
        if two_factor is not None:
            payload["two_factor"] = two_factor
        data = self._ensure_success(await self._request("POST", "/account/update", payload=payload))
        if data.get("result") != "in_queue":
            raise BridgitAPIError("Bridgit returned an unexpected account state")
        return data

    async def remove_account(self, login: str) -> dict[str, Any]:
        data = self._ensure_success(await self._request(
            "POST",
            "/account/remove",
            payload={"api_key": self._api_key, "login": self._clean_login(login)},
        ))
        return data

    async def send_direct_message(
        self,
        recipient: str,
        text: str,
        media_url: str | None = None,
        login: str | None = None,
    ) -> list[str]:
        clean_recipient = self._clean_login(recipient)
        full_text = f"{text}\n{media_url}" if media_url else text
        sender_login = self._clean_login(login) if login else self._account_login
        if not sender_login:
            sender_login = await self.resolve_account_login()
        data = self._ensure_success(await self._request(
            "POST",
            "/direct/createlist",
            payload={
                "api_key": self._api_key,
                "login": sender_login,
                "list": clean_recipient,
                "message": full_text,
            },
        ))
        raw_log = data.get("log")
        if not isinstance(raw_log, list):
            raise BridgitAPIError("Bridgit returned an invalid direct response")
        log = [self._clean_login(str(item)) for item in raw_log]
        if clean_recipient not in log:
            raise BridgitAPIError("Recipient was not queued by Bridgit")
        return [str(item) for item in raw_log]

    async def get_direct_stats(
        self,
        login: str | None = None,
        start: int | str | None = None,
        end: int | str | None = None,
    ) -> dict[str, Any]:
        target_login = self._clean_login(login) if login else self._account_login
        if not target_login:
            target_login = await self.resolve_account_login()
        params: dict[str, Any] = {"api_key": self._api_key, "login": target_login}
        start_value = self._coerce_time_param(start)
        if start_value is not None:
            params["start"] = start_value
        end_value = self._coerce_time_param(end)
        if end_value is not None:
            params["end"] = end_value
        return self._ensure_success(await self._request("GET", "/direct/stats", payload=params))

    @staticmethod
    def _coerce_time_param(value: int | str | None) -> int | str | None:
        if value is None:
            return None
        if isinstance(value, bool):
            return int(value)
        if isinstance(value, int):
            return value
        if isinstance(value, float):
            return int(value)
        text = str(value).strip()
        if not text:
            return None
        try:
            return int(float(text))
        except (TypeError, ValueError):
            return text

    async def get_direct_waiting(self, login: str | None = None) -> dict[str, Any]:
        target_login = self._clean_login(login) if login else self._account_login
        if not target_login:
            target_login = await self.resolve_account_login()
        return self._ensure_success(await self._request(
            "GET",
            "/direct/waiting",
            payload={"api_key": self._api_key, "login": target_login},
        ))
