"""Opt-in loopback HTTP only. No install, pull, startup probe, redirects or proxy env."""

import asyncio
import ipaddress
import json
import os
from typing import Protocol
from urllib.parse import urlsplit

import httpx

MODELS = ("qwen2.5:1.5b", "qwen2.5:3b")
NUM_CTX = 4096
NUM_PREDICT = 512
PROMPT_BYTES = NUM_CTX - NUM_PREDICT - 512  # conservative UTF-8 bytes + framing reserve


class LLMError(Exception):
    def __init__(self, code, request_attempted=False):
        self.code = code
        self.request_attempted = request_attempted
        super().__init__(code)  # never reflect provider body/exception/query


class LLMProvider(Protocol):
    mode: str

    def passive_status(self) -> dict: ...
    async def inventory(self) -> dict: ...
    async def generate(self, model: str, messages: list[dict]) -> dict: ...
    async def close(self): ...


def loopback_url(value):
    try:
        url = urlsplit(value)
        # Literal addresses only; no localhost/DNS, credentials, path, query or fragment.
        address = ipaddress.ip_address(url.hostname or "")
        port = 11434 if url.port is None else url.port
        if (
            url.scheme != "http"
            or not address.is_loopback
            or url.username is not None
            or url.password is not None
            or url.path not in ("", "/")
            or "?" in value
            or "#" in value
            or not 1 <= port <= 65535
        ):
            raise ValueError
        host = f"[{address}]" if address.version == 6 else str(address)
        return f"http://{host}:{port}"
    except ValueError:
        raise ValueError("PVL_OLLAMA_URL must be a literal HTTP loopback host/port only") from None


class OllamaLocalProvider:
    mode = "local-ollama"

    def __init__(self, *, enabled=None, url=None, transport=None, timeout=60):
        self.enabled = os.getenv("PVL_OLLAMA_ENABLED", "0") == "1" if enabled is None else enabled
        self.config_error = False
        try:
            self.url = loopback_url(url or os.getenv("PVL_OLLAMA_URL", "http://127.0.0.1:11434"))
        except ValueError:
            # Optional adapter failure must not prevent independent D05 Search startup.
            self.url, self.enabled, self.config_error = None, False, True
        self.timeout = min(max(float(timeout), 0.01), 60)
        self.transport = transport  # injection only, never from HTTP/env
        self.slot = asyncio.Lock()

    def passive_status(self):
        return dict(
            mode=self.mode,
            state="invalid_config"
            if self.config_error
            else "not_checked"
            if self.enabled
            else "disabled",
            enabled=self.enabled,
            allowed_models=list(MODELS),
            models=[],
            message="Invalid loopback configuration; optional Ollama adapter disabled."
            if self.config_error
            else "Explicit refresh checks downloaded models; inventory does not mean loaded."
            if self.enabled
            else "Ollama disabled; operator approval/setup required. Semantic Search still works.",
        )

    async def close(self):
        pass  # per-operation clients close on completion/cancellation

    async def _request(self, method, path, body=None, cap=65536):
        if not self.enabled:
            raise LLMError("disabled")
        try:
            async with asyncio.timeout(self.timeout):
                async with httpx.AsyncClient(
                    base_url=self.url,
                    trust_env=False,
                    follow_redirects=False,
                    transport=self.transport,
                    timeout=httpx.Timeout(self.timeout, connect=2),
                    limits=httpx.Limits(max_connections=1, max_keepalive_connections=0),
                ) as client:
                    async with client.stream(method, path, json=body) as response:
                        if response.status_code != 200:
                            code = {
                                404: "model_missing",
                                429: "busy",
                                401: "request_rejected",
                                403: "request_rejected",
                            }.get(response.status_code, "provider_error")
                            raise LLMError(code)
                        data = bytearray()
                        async for block in response.aiter_bytes():
                            data.extend(block)
                            if len(data) > cap:
                                raise LLMError("response_too_large")
                        return json.loads(data)
        except LLMError as error:
            error.request_attempted = True
            raise
        except (TimeoutError, httpx.TimeoutException):
            raise LLMError("timeout", True) from None
        except httpx.ConnectError:
            raise LLMError("daemon_unavailable", True) from None
        except (httpx.HTTPError, ValueError, UnicodeError, RecursionError):
            raise LLMError("invalid_response", True) from None

    async def inventory(self):
        if self.slot.locked():
            raise LLMError("busy")
        async with self.slot:
            data = await self._request("GET", "/api/tags", cap=131072)
            if not isinstance(data, dict) or not isinstance(data.get("models"), list):
                raise LLMError("invalid_response")
            models = []
            for item in data["models"][:256]:
                if not isinstance(item, dict) or item.get("name") not in MODELS:
                    continue
                size, digest = item.get("size"), item.get("digest")
                if (
                    type(size) is not int
                    or size < 0
                    or not isinstance(digest, str)
                    or len(digest) > 80
                ):
                    raise LLMError("invalid_response")
                # Digest can only be hex/sha256:; never echo arbitrary model metadata.
                raw_digest = digest.removeprefix("sha256:")
                if len(raw_digest) != 64 or any(c not in "0123456789abcdef" for c in raw_digest):
                    raise LLMError("invalid_response")
                models.append(dict(name=item["name"], size=size, digest=digest))
            return {
                **self.passive_status(),
                "state": "available" if models else "model_missing",
                "models": models,
                "message": "Downloaded allowlisted artifacts; load/inference not verified.",
            }

    async def generate(self, model, messages):
        if model not in MODELS:
            raise LLMError("model_not_allowed")
        if sum(len(m["content"].encode("utf-8")) for m in messages) > PROMPT_BYTES:
            raise LLMError("context_budget")
        if self.slot.locked():
            raise LLMError("busy")
        async with self.slot:
            data = await self._request(
                "POST",
                "/api/chat",
                dict(
                    model=model,
                    messages=messages,
                    stream=False,
                    format="json",
                    keep_alive=0,
                    options=dict(
                        num_ctx=NUM_CTX, num_predict=NUM_PREDICT, temperature=0, num_thread=2
                    ),
                ),
            )
            if (
                not isinstance(data, dict)
                or data.get("model") != model
                or data.get("done") is not True
                or data.get("done_reason") == "length"
                or not isinstance(data.get("message"), dict)
                or data["message"].get("role") != "assistant"
                or data["message"].get("tool_calls")
            ):
                raise LLMError("invalid_response", True)
            text = data["message"].get("content")
            if not isinstance(text, str) or not text.strip() or len(text.encode()) > 16384:
                raise LLMError("invalid_response", True)
            usage = {}
            for field in ("prompt_eval_count", "eval_count", "total_duration", "load_duration"):
                if field in data:
                    if type(data[field]) is not int or not 0 <= data[field] <= 10**15:
                        raise LLMError("invalid_response", True)
                    usage[field] = data[field]
            if (
                usage.get("prompt_eval_count", 0) > NUM_CTX - NUM_PREDICT
                or usage.get("eval_count", 0) > NUM_PREDICT
            ):
                raise LLMError("context_budget", True)
            return dict(content=text, model=data["model"], mode=self.mode, usage=usage)
