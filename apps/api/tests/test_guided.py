"""Actual D02–D06 local services + NOT E5 / MOCK OLLAMA; no fake completion by navigation."""

import json
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.documents import DocumentError
from app.guided import SAMPLE
from app.main import create_app
from testsupport.embedding_fixture import FixtureProvider
from testsupport.fixture_server import fixture_engine
from testsupport.ollama_mock import MockOllama


@pytest.fixture
def tour(tmp_path):
    mock = MockOllama()
    app = create_app(
        tmp_path, fixture_engine, embedding_provider=FixtureProvider(), llm_provider=mock.provider()
    )
    with TestClient(app) as client:
        yield client, app.state.guided_service, mock


def act(client, sid, action, **options):
    return client.post(f"/api/guided/sessions/{sid}/actions", json=dict(action=action, **options))


def prepared(client):
    response = client.post("/api/guided/sessions")
    assert response.status_code == 201, response.text
    sid = response.json()["id"]
    for action in ("upload", "extract", "preview", "confirm", "embedding", "ingest_preview"):
        response = act(client, sid, action, confirmed=True)
        assert response.status_code == 200, response.text
    for _ in range(16):
        response = act(client, sid, "ingest_step", confirmed=True)
        assert response.status_code == 200, response.text
        if response.json()["result"]["state"] == "active":
            break
    response = act(client, sid, "fetch")
    assert response.status_code == 200, response.text
    return sid, response.json()


def test_create_get_and_route_reads_do_not_fabricate_completion_or_call_models(tour):
    client, service, mock = tour
    session = client.post("/api/guided/sessions").json()
    assert session["embedding_mode"] == "test-fixture-not-e5"
    assert session["target"]["mode"] == "local" and session["target"]["namespace"].startswith(
        "pvl-demo-"
    )
    for _ in range(3):
        assert not any(
            client.get(f"/api/guided/sessions/{session['id']}").json()["completed"].values()
        )
    assert not service.store.list() and not mock.requests
    assert act(client, session["id"], "confirm", confirmed=True).status_code == 409
    assert act(client, session["id"], "embedding").status_code == 409
    assert act(client, session["id"], "preview").status_code == 409
    assert act(client, session["id"], "skip_rag").status_code == 409


def test_sample_idempotence_actual_pages_preview_confirm_and_no_confirm_on_preview(tour):
    client, service, _ = tour
    sid = client.post("/api/guided/sessions").json()["id"]
    first = act(client, sid, "upload").json()
    second = act(client, sid, "upload").json()
    assert first["result"]["id"] == second["result"]["id"]
    assert len(service.store.list()) == 1
    assert first["result"]["page_count"] == 1 and first["result"]["kind"] == "txt"
    assert first["result"]["pages"][0]["text"] == SAMPLE.read_text(encoding="utf-8")
    assert "CC0-1.0" in SAMPLE.read_text(encoding="utf-8")
    assert not first["session"]["completed"]["extract"]
    extracted = act(client, sid, "extract").json()
    assert extracted["session"]["completed"]["extract"]
    assert extracted["result"]["pages"][0]["page_number"] == 1
    preview = act(client, sid, "preview").json()
    assert preview["result"]["state"] == "draft" and not preview["session"]["completed"]["chunks"]
    assert act(client, sid, "confirm").status_code == 409
    confirmed = act(client, sid, "confirm", confirmed=True).json()
    assert (
        confirmed["result"]["state"] == "confirmed" and confirmed["session"]["completed"]["chunks"]
    )
    assert all(c["model_token_count"] <= 512 for c in confirmed["result"]["chunks"])


def test_full_guide_backend_evidence_source_receipts_persistence_and_exact_d05_reuse(
    tour, monkeypatch
):
    client, service, mock = tour
    sid, fetched = prepared(client)
    assert fetched["session"]["completed"]["upsert"]
    assert len(fetched["result"]["records"][0]["values"]) == 384
    calls = []
    original = service.search.search

    def search(request, cancel=None):
        calls.append(request)
        return original(request, cancel)

    monkeypatch.setattr(service.search, "search", search)
    question = "Namespace cô lập dữ liệu như thế nào?"
    response = act(client, sid, "search", query=question, top_k=1, page=1)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["session"]["completed"]["search"] and len(calls) == 1
    assert calls[0].target.namespace == result["session"]["target"]["namespace"]
    assert str(calls[0].filters.document_id) == result["session"]["document_id"]
    hit = result["result"]["hits"][0]
    assert hit["version_id"] == result["session"]["version_id"]
    assert hit["source_url"].startswith("/documents?") and 0 <= hit["score"] <= 1
    off = act(client, sid, "rag", query=question).json()
    assert off["result"]["status"] == "search_only" and off["session"]["completed"]["rag"]
    assert not mock.requests
    live_mock = act(client, sid, "rag", query=question, llm_enabled=True).json()
    assert live_mock["result"]["llm_model"]["mode"] == "mock-ollama-not-real-llm"
    assert live_mock["result"]["status"] in ("answered", "invalid_citations")
    with service.db() as db:
        journal = db.execute("SELECT data FROM sessions WHERE id=?", (sid,)).fetchone()[0]
    readable = json.dumps(json.loads(journal), ensure_ascii=False)
    assert (
        question not in readable
        and '"canonical_text"' not in readable
        and '"answer"' not in readable
    )
    restored = create_app(
        service.store.root,
        fixture_engine,
        embedding_provider=FixtureProvider(),
        llm_provider=MockOllama().provider(),
    )
    with TestClient(restored) as another:
        assert another.get(f"/api/guided/sessions/{sid}").json()["completed"]["search"]


def test_reset_preserves_owned_and_unrelated_documents_vectors_namespaces_indexes(tour):
    client, service, _ = tour
    unrelated = service.store.upload(
        "Tài liệu cá nhân tổng hợp dùng riêng cho kiểm thử.".encode(), "unrelated.txt", "text/plain"
    )
    service.vectors.local.create("unrelated-index", "local", "this-device")
    sid, _ = prepared(client)
    before_docs = service.store.list()
    with service.store.db() as db:
        before = [tuple(r) for r in db.execute("SELECT * FROM local_vectors ORDER BY id")]
        schema = db.execute("PRAGMA user_version").fetchone()[0]
    reset = act(client, sid, "reset").json()["session"]
    assert not any(reset["completed"].values())
    assert service.store.list() == before_docs and service.store.get(unrelated["id"])
    assert service.vectors.local.describe("unrelated-index")["compatible"]
    with service.store.db() as db:
        assert [tuple(r) for r in db.execute("SELECT * FROM local_vectors ORDER BY id")] == before
        assert db.execute("PRAGMA user_version").fetchone()[0] == schema == 3
    assert act(client, sid, "delete").status_code == 422
    assert client.delete(f"/api/guided/sessions/{sid}").status_code == 405


def test_deleted_source_modified_file_and_changed_active_manifest_invalidate_progress(tour):
    client, service, _ = tour
    sid, state = prepared(client)
    job_id = state["session"]["job_id"]
    with service.store.db() as db:
        db.execute("UPDATE vector_jobs SET state='superseded' WHERE id=?", (job_id,))
    current = service.get(sid)
    assert not current["completed"]["upsert"] and not current["completed"]["search"]
    assert current["source_error"]
    doc_id = state["session"]["document_id"]
    raw = service.store.root / f"{doc_id}.txt"
    raw.write_text("Changed synthetic fixture", encoding="utf-8")
    assert not any(service.get(sid)["completed"].values())
    service.store.delete(doc_id)
    assert not any(service.get(sid)["completed"].values())


@pytest.mark.parametrize(
    "fields",
    [
        dict(target={"mode": "live"}),
        dict(document_id=str(uuid4())),
        dict(action="delete"),
        dict(action="preview", size=0),
        dict(action="preview", size=64, overlap=64),
        dict(action="search", top_k=11),
        dict(action="search", query=" "),
        dict(action="rag", model="remote"),
    ],
)
def test_invalid_fields_scope_and_actions(tour, fields):
    client, _, mock = tour
    sid = client.post("/api/guided/sessions").json()["id"]
    action = fields.pop("action", "upload")
    response = act(client, sid, action, **fields)
    assert response.status_code in (409, 422)
    assert not mock.requests


def test_missing_model_no_false_success_and_busy_duplicate_guard(tour, monkeypatch):
    client, service, _ = tour
    sid = client.post("/api/guided/sessions").json()["id"]
    for action in ("upload", "extract", "preview", "confirm"):
        assert act(client, sid, action, confirmed=True).status_code == 200

    def missing(*_args):
        raise DocumentError("Model unavailable; opt-in setup required.", 503)

    monkeypatch.setattr(service.embeddings, "chunks", missing)
    assert act(client, sid, "embedding").status_code == 503
    assert not service.get(sid)["completed"]["embedding"]
    with service.lock(sid):
        assert act(client, sid, "upload").status_code == 429


def test_reconfirm_is_idempotent_and_reset_detaches_changed_source_without_deletion(tour):
    client, service, _ = tour
    sid, fetched = prepared(client)
    again = act(client, sid, "confirm", confirmed=True).json()
    assert again["session"]["job_id"] == fetched["session"]["job_id"]
    assert again["session"]["completed"]["upsert"]
    doc_id = fetched["session"]["document_id"]
    raw = service.store.root / f"{doc_id}.txt"
    raw.write_text("Owner-modified synthetic source", encoding="utf-8")
    assert not any(service.get(sid)["completed"].values())
    reset = act(client, sid, "reset").json()["session"]
    assert reset["document_id"] is None
    assert raw.read_text(encoding="utf-8") == "Owner-modified synthetic source"
    assert service.store.get(doc_id)["id"] == doc_id
    uploaded = act(client, sid, "upload").json()["session"]
    assert uploaded["document_id"] != doc_id and uploaded["completed"]["upload"]
    assert service.store.get(doc_id)["id"] == doc_id
