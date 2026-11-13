"""REAL cached E5 + actual SQLite/D05 + MOCK OLLAMA / NOT REAL LLM, no cloud."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from test_search import ingest

from app.embedding_assets import SIGNATURE, model_directory, present
from app.main import create_app
from testsupport.ollama_mock import MockOllama


@pytest.mark.real_model
@pytest.mark.skipif(not present(model_directory()), reason="Approved verified E5 cache required")
def test_real_e5_rag_context_citation_fallback_and_no_cloud(tmp_path):
    mock = MockOllama()
    app = create_app(tmp_path, llm_provider=mock.provider())
    with TestClient(app) as client:
        doc, version, _ = ingest(
            client,
            app.state.vector_service,
            text=(
                "Cơ sở dữ liệu vector biểu diễn ngữ nghĩa bằng embedding. "
                "Tìm kiếm cosine chọn các vector gần nhau và trả về nguồn văn bản."
            ),
            size=300,
        )
        request = dict(
            query="Cơ sở dữ liệu vector tìm kiếm ngữ nghĩa như thế nào?",
            top_k=1,
            filters=dict(document_id=doc["id"]),
        )
        response = client.post("/api/rag/chat", json=request)
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["status"] == "answered"
        assert data["search"]["embedding"]["mode"] == "e5"
        assert data["search"]["embedding"]["model_signature"] == SIGNATURE
        assert data["search"]["embedding"]["prefix"] == "query: "
        assert data["used_sources"][0]["hit"]["version_id"] == version["id"]
        assert data["used_sources"][0]["text"] == version["chunks"][0]["text"]
        assert data["answer"] == version["chunks"][0]["text"][:200] + " [S1]"
        assert data["llm_model"]["mode"] == "mock-ollama-not-real-llm"
        calls = len(mock.requests)
        off = client.post("/api/rag/chat", json={**request, "llm_enabled": False}).json()
        assert off["status"] == "search_only" and len(mock.requests) == calls
        app.state.rag_service.llm.enabled = False
        fallback = client.post("/api/rag/chat", json=request).json()
        assert fallback["status"] == "llm_unavailable" and fallback["retrieval_hits"]
        assert client.post("/api/search", json=request).json()["hits"]
        evidence = Path(__file__).resolve().parents[3] / "docs/evidence/d08/review-r1/regression"
        evidence.mkdir(parents=True, exist_ok=True)
        (evidence / "real-e5-mock-ollama-example.json").write_text(
            json.dumps(
                dict(
                    label="REAL E5 + SQLite + MOCK OLLAMA / NOT REAL LLM / NO CLOUD",
                    request=request,
                    response=data,
                    search_only=off,
                    unavailable=fallback,
                ),
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
            newline="\n",
        )
