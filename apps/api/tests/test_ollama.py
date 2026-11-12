"""Official HTTP contracts under MockTransport; no daemon, model or cloud traffic."""

import asyncio
import json

import httpx
import pytest

from app.ollama_local import LLMError, OllamaLocalProvider, loopback_url
from testsupport.ollama_mock import MockOllama


@pytest.mark.parametrize(
    "url",
    [
        "https://127.0.0.1:11434",
        "http://localhost:11434",
        "http://127.0.0.1.evil",
        "http://example.com",
        "http://192.168.1.2",
        "http://169.254.169.254",
        "http://u:p@127.0.0.1",
        "http://127.0.0.1/api/chat",
        "http://127.0.0.1?x=1",
        "http://127.0.0.1#x",
        "http://127.0.0.1:99999",
    ],
)
def test_ssrf_rejected(url):
    with pytest.raises(ValueError):
        loopback_url(url)


def test_passive_init_and_inventory_contract(monkeypatch):
    monkeypatch.setenv("HTTP_PROXY", "http://invalid-proxy.example:90")
    mock = MockOllama()
    provider = mock.provider()
    assert loopback_url("http://[::1]:11434") == "http://[::1]:11434"
    assert provider.passive_status()["state"] == "not_checked" and not mock.requests
    state = asyncio.run(provider.inventory())
    assert state["state"] == "available" and state["models"][0]["size"] == 986000000
    assert len(mock.requests) == 1 and mock.requests[0].url.host == "127.0.0.1"
    assert mock.requests[0].headers.get("authorization") is None


def test_chat_contract_json_budget_and_no_tools():
    mock = MockOllama()
    provider = mock.provider()
    messages = [
        dict(role="system", content="UNTRUSTED"),
        dict(
            role="user",
            content=json.dumps(
                dict(
                    sources=[dict(source_id="S1", text="Nội dung tiếng Việt đủ dài để trích dẫn.")]
                )
            ),
        ),
    ]
    result = asyncio.run(provider.generate("qwen2.5:1.5b", messages))
    body = json.loads(mock.requests[0].content)
    assert body["stream"] is False and body["format"] == "json" and body["keep_alive"] == 0
    assert body["options"] == dict(num_ctx=4096, num_predict=512, temperature=0, num_thread=2)
    assert "tools" not in body and result["usage"] == {}
    with pytest.raises(LLMError, match="model_not_allowed"):
        asyncio.run(provider.generate("remote:cloud", messages))
    with pytest.raises(LLMError, match="context_budget"):
        asyncio.run(provider.generate("qwen2.5:1.5b", [dict(content="x" * 3073)]))
    disabled = OllamaLocalProvider(enabled=False, transport=httpx.MockTransport(mock.handle))
    with pytest.raises(LLMError, match="disabled"):
        asyncio.run(disabled.generate("qwen2.5:1.5b", messages))
    assert len(mock.requests) == 1


@pytest.mark.parametrize(
    "status,code",
    [
        (301, "provider_error"),
        (404, "model_missing"),
        (429, "busy"),
        (500, "provider_error"),
        (403, "request_rejected"),
    ],
)
def test_http_errors_sanitized_no_redirect_or_body_reflection(status, code):
    seen = []

    def handle(request):
        seen.append(request)
        return httpx.Response(
            status,
            headers={"location": "https://evil.example"},
            text="PRIVATE_KEY_IN_PROVIDER_ERROR",
        )

    provider = OllamaLocalProvider(enabled=True, transport=httpx.MockTransport(handle))
    with pytest.raises(LLMError, match=code) as exc:
        asyncio.run(provider.inventory())
    assert "PRIVATE" not in str(exc.value) and len(seen) == 1


@pytest.mark.parametrize(
    "data",
    [
        [],
        {},
        {"models": "wrong"},
        {"models": [dict(name="qwen2.5:1.5b", size=-1, digest="bad")]},
        {"models": [dict(name="qwen2.5:1.5b", size=2, digest="SECRET")]},
    ],
)
def test_malformed_inventory(data):
    provider = OllamaLocalProvider(
        enabled=True, transport=httpx.MockTransport(lambda _: httpx.Response(200, json=data))
    )
    with pytest.raises(LLMError, match="invalid_response"):
        asyncio.run(provider.inventory())


def test_timeout_cancellation_and_busy_release_slot():
    async def scenario():
        entered, stopped = asyncio.Event(), asyncio.Event()

        async def handle(_request):
            entered.set()
            try:
                await asyncio.Event().wait()
            finally:
                stopped.set()

        provider = OllamaLocalProvider(
            enabled=True, timeout=0.03, transport=httpx.MockTransport(handle)
        )
        task = asyncio.create_task(provider.inventory())
        await entered.wait()
        with pytest.raises(LLMError, match="busy"):
            await provider.inventory()
        with pytest.raises(LLMError, match="timeout"):
            await task
        assert stopped.is_set() and not provider.slot.locked()
        stopped.clear()
        task = asyncio.create_task(provider.inventory())
        await asyncio.sleep(0)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert stopped.is_set() and not provider.slot.locked()

    asyncio.run(scenario())


@pytest.mark.parametrize(
    "response",
    [
        dict(model="wrong", done=True),
        dict(model="qwen2.5:1.5b", done=False),
        dict(
            model="qwen2.5:1.5b",
            done=True,
            message=dict(role="assistant", content="{}"),
            prompt_eval_count=4000,
        ),
        dict(
            model="qwen2.5:1.5b",
            done=True,
            message=dict(role="assistant", content="{}"),
            eval_count=True,
        ),
    ],
)
def test_invalid_chat_response_and_usage(response):
    provider = OllamaLocalProvider(
        enabled=True, transport=httpx.MockTransport(lambda _: httpx.Response(200, json=response))
    )
    with pytest.raises(LLMError):
        asyncio.run(provider.generate("qwen2.5:1.5b", [dict(role="user", content="x")]))
