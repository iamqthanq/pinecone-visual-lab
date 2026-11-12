"""Explicit test transport ONLY: MOCK OLLAMA / NOT REAL LLM. No daemon/socket."""

import json

import httpx

from app.ollama_local import OllamaLocalProvider


class MockOllama:
    def __init__(self):
        self.requests = []
        self.reply = None
        self.before_reply = None

    def handle(self, request):
        self.requests.append(request)
        if request.method == "GET" and request.url.path == "/api/tags":
            return httpx.Response(
                200, json={"models": [dict(name="qwen2.5:1.5b", size=986000000, digest="a" * 64)]}
            )
        assert request.method == "POST" and request.url.path == "/api/chat"
        body = json.loads(request.content)
        context = json.loads(body["messages"][1]["content"])
        if self.before_reply:
            self.before_reply()
        source = context["sources"][0]
        content = (
            self.reply
            if self.reply is not None
            else dict(
                insufficient=False,
                quotes=[dict(source_id=source["source_id"], quote=source["text"][:200])],
            )
        )
        return httpx.Response(
            200,
            json=dict(
                model=body["model"],
                done=True,
                done_reason="stop",
                message=dict(role="assistant", content=json.dumps(content, ensure_ascii=False)),
            ),
        )

    def provider(self):
        provider = OllamaLocalProvider(enabled=True, transport=httpx.MockTransport(self.handle))
        provider.mode = "mock-ollama-not-real-llm"
        return provider
