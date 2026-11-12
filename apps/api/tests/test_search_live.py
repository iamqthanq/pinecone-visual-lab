"""Actual pinned SDK wire tests. Synthetic vectors are NOT E5; no real cloud test."""

import json
import socket

import httpx
import pytest
from pinecone import Pinecone, RetryConfig

from app.vector_contracts import Target, VectorError
from app.vector_live import PineconeLiveAdapter


def index_description():
    return dict(
        name="search-test",
        host="search-test.svc.pinecone.io",
        status={"ready": True, "state": "Ready"},
        deletion_protection="enabled",
        schema={
            "fields": {"_values": {"type": "dense_vector", "dimension": 384, "metric": "cosine"}}
        },
        deployment={"deployment_type": "managed", "cloud": "aws", "region": "us-east-1"},
    )


@pytest.mark.parametrize("status", [200, 401, 403, 404, 429, 500, 504])
def test_actual_sdk_query_reserved_values_wire_filter_namespace_sanitized_errors(
    monkeypatch, status
):
    monkeypatch.delenv("PVL_DISABLE_CLOUD", raising=False)
    monkeypatch.setenv("PVL_LIVE_SEARCH_ENABLED", "1")
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: pytest.fail("DNS/cloud forbidden"))
    calls = []
    expression = {
        "$and": [
            {"owner_job": {"$in": ["ACTIVE-A", "ACTIVE-B"]}},
            {"page_start": {"$lte": 3}},
            {"page_end": {"$gte": 2}},
        ]
    }

    def send(transport, request):
        calls.append((request.method, request.url.path))
        assert request.headers["X-Pinecone-API-Version"] == "2026-07"
        if request.url.path == "/indexes/search-test":
            return httpx.Response(200, json=index_description(), request=request)
        assert request.method == "POST" and request.url.path == "/query"
        assert request.url.host == "search-test.svc.pinecone.io"
        body = json.loads(request.content)
        assert body["namespace"] == "seminar" and body["topK"] == 2
        assert body["filter"] == expression and body["includeMetadata"] is True
        assert body["includeValues"] is False and len(body["vector"]) == 384
        payload = {
            "matches": [{"id": "owned-id", "score": 0.8123, "metadata": {"owner_job": "ACTIVE-A"}}],
            "namespace": "seminar",
            "usage": {"readUnits": 1},
        }
        return httpx.Response(
            status,
            json=payload if status == 200 else {"message": "PRIVATE api_key=MUST_NOT_LEAK"},
            request=request,
        )

    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", send)
    adapter = PineconeLiveAdapter(
        Pinecone(
            api_key="OFFLINE-FAKE-NOT-REAL", timeout=5, retry_config=RetryConfig(max_retries=0)
        )
    )
    try:
        if status == 200:
            assert adapter.query(
                Target(mode="live", index="search-test", namespace="seminar"),
                [1.0] + [0.0] * 383,
                2,
                expression,
                confirmed=True,
            ) == [{"id": "owned-id", "score": 0.8123, "metadata": {"owner_job": "ACTIVE-A"}}]
        else:
            with pytest.raises(VectorError) as error:
                adapter.query(
                    Target(mode="live", index="search-test", namespace="seminar"),
                    [1.0] + [0.0] * 383,
                    2,
                    expression,
                    confirmed=True,
                )
            assert error.value.status == status
            assert (
                "PRIVATE" not in error.value.message and "MUST_NOT_LEAK" not in error.value.message
            )
    finally:
        adapter.close()
    assert calls == [("GET", "/indexes/search-test"), ("POST", "/query")]


def test_reserved_values_schema_exactly_matches_sdk_legacy_byov_translation():
    from pinecone._internal.legacy_index_translation import legacy_vector_schema

    expected = legacy_vector_schema(dimension=384, metric="cosine", vector_type="dense")
    assert index_description()["schema"] == expected
    # This comparison validates operation-family translation, not a live backend.
