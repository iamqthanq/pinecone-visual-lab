"""Real cached E5 + synthetic Vietnamese PDF/TXT + actual SQLite, never cloud."""

import json
from pathlib import Path

import pytest
from conftest import make_pdf
from fastapi.testclient import TestClient

from app.embedding_assets import SIGNATURE, model_directory, present
from app.main import create_app
from app.vector_contracts import Target


@pytest.mark.real_model
@pytest.mark.skipif(not present(model_directory()), reason="Approved verified E5 cache required")
def test_real_e5_search_pdf_txt_known_example_filters_trace_and_exact_active_sources(tmp_path):
    app = create_app(tmp_path)
    with TestClient(app) as client:
        vectors = app.state.vector_service
        documents = []
        samples = [
            (
                "kiến-thức.pdf",
                make_pdf(
                    [
                        "Cơ sở dữ liệu vector lưu embedding biểu diễn ngữ nghĩa của tài liệu.",
                        "Pinecone tìm kiếm các vector gần nhau bằng cosine similarity. "
                        "Namespace cô lập dữ liệu.",
                    ]
                ),
                "application/pdf",
            ),
            (
                "nấu-ăn.txt",
                "Bánh mì được nướng trong lò. Trộn bột mì, men, muối và nước để làm bánh.".encode(),
                "text/plain",
            ),
        ]
        for name, content, mime in samples:
            response = client.post("/api/documents", files={"file": (name, content, mime)})
            assert response.status_code == 201, response.text
            doc = response.json()
            documents.append(doc)
            version = client.post(
                f"/api/documents/{doc['id']}/preview", json={"size": 300, "overlap": 50}
            ).json()
            client.post(f"/api/documents/{doc['id']}/versions/{version['id']}/confirm")
            job = vectors.preview(Target(namespace="real-search"), doc["id"], version["id"])
            for _ in range(30):
                job = vectors.step(job["id"], job["preview_token"])
                if job["state"] == "active":
                    break
            assert job["state"] == "active"
        request = dict(
            query="Cơ sở dữ liệu vector tìm kiếm ngữ nghĩa bằng embedding như thế nào?",
            top_k=2,
            target=dict(mode="local", index="local-e5", namespace="real-search"),
        )
        response = client.post("/api/search", json=request)
        assert response.status_code == 200, response.text
        result = response.json()
        assert (
            result["embedding"]["mode"] == "e5"
            and result["embedding"]["model_signature"] == SIGNATURE
        )
        assert (
            result["embedding"]["prefix"] == "query: "
            and result["embedding"]["input_token_count"] <= 512
        )
        assert result["hits"][0]["document_id"] == documents[0]["id"]
        assert len(result["hits"]) == 2
        filtered_request = {**request, "filters": {"page_from": 2, "page_to": 2}, "compare": True}
        filtered = client.post("/api/search", json=filtered_request).json()
        assert len(filtered["hits"]) == 1 and filtered["hits"][0]["page_start"] == 1
        assert filtered["hits"][0]["page_end"] == 2
        assert len(filtered["comparison"]) == 2
        assert all(s["ms"] >= 0 for s in filtered["trace"]["stages"])
        evidence = Path(__file__).resolve().parents[3] / "docs/evidence/d07"
        evidence.mkdir(parents=True, exist_ok=True)
        (evidence / "real-search-example.json").write_text(
            json.dumps(
                dict(
                    label="REAL E5 / LOCAL SQLite / synthetic PDF+TXT / NO CLOUD",
                    observation="Known relevant example, not a universal ranking theorem",
                    request=request,
                    response=result,
                    filtered_request=filtered_request,
                    filtered_response=filtered,
                ),
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
            newline="\n",
        )
