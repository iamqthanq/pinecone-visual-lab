"""Independent search fixtures: deterministic NOT E5, actual persisted ACTIVE storage."""

import json
import math
from urllib.parse import parse_qs, urlsplit

import pytest
from conftest import make_pdf
from fastapi.testclient import TestClient

from app.main import create_app
from app.search_contracts import SearchFilters, SearchRequest
from app.search_service import Measurement, SearchService, live_filter
from app.vector_contracts import Target, VectorError
from testsupport.embedding_fixture import FixtureProvider
from testsupport.fixture_server import fixture_engine


@pytest.fixture
def lab(tmp_path):
    provider = FixtureProvider()
    app = create_app(tmp_path, fixture_engine, embedding_provider=provider)
    with TestClient(app) as client:
        yield client, app.state.vector_service, app.state.search_service, provider


def ingest(client, vectors, name="tiếng Việt.txt", text=None, namespace="", doc=None, size=120):
    if doc is None:
        response = client.post(
            "/api/documents",
            files={
                "file": (
                    name,
                    (text or "Cơ sở dữ liệu vector tìm kiếm ngữ nghĩa.\n\n" * 10).encode(),
                    "text/plain",
                )
            },
        )
        assert response.status_code == 201, response.text
        doc = response.json()
    response = client.post(
        f"/api/documents/{doc['id']}/preview", json={"size": size, "overlap": 20}
    )
    assert response.status_code == 201, response.text
    version = response.json()
    client.post(f"/api/documents/{doc['id']}/versions/{version['id']}/confirm")
    job = vectors.preview(Target(namespace=namespace), doc["id"], version["id"])
    for _ in range(100):
        job = vectors.step(job["id"], job["preview_token"])
        if job["state"] == "active":
            break
    assert job["state"] == "active"
    return doc, version, job


def query(client, **kwargs):
    return client.post("/api/search", json={"query": "Tìm kiếm ngữ nghĩa là gì?", **kwargs})


def replace_vectors(vectors, job, values):
    with vectors.store.db() as db:
        for identifier, vector in zip(job["ids"], values, strict=True):
            row = db.execute("SELECT data FROM local_vectors WHERE id=?", (identifier,)).fetchone()
            record = json.loads(row[0])
            record["values"] = vector
            db.execute(
                "UPDATE local_vectors SET data=? WHERE id=?", (json.dumps(record), identifier)
            )


def controlled_query(service, values, text):
    """NOT E5 oracle vector; identity/count remain the explicit fixture contract."""
    return dict(
        values=values,
        kind="query",
        prefix="query: ",
        mode=service.provider.mode,
        model_id=service.provider.model_id,
        model_revision=service.provider.revision,
        model_signature=service.provider.signature,
        input_token_count=len(fixture_engine().encode("query: " + text, special=True).ids),
        inference_ms=0.0,
    )


def test_exact_ranking_independent_oracle_prefilter_topk_and_real_source(lab, monkeypatch):
    client, vectors, service, provider = lab
    doc, version, job = ingest(client, vectors, text="Một đoạn ngắn về vector.")
    other, _, second = ingest(client, vectors, name="khác.txt", text="Một nội dung khác.")
    assert job["count"] == second["count"] == 1
    axis = [1.0] + [0.0] * 383
    orthogonal = [0.0, 1.0] + [0.0] * 382
    replace_vectors(vectors, job, [axis])
    replace_vectors(vectors, second, [orthogonal])
    calls = []

    def encode(texts, kind, cancel=None):
        calls.append((texts, kind))
        return [controlled_query(service, axis, texts[0])]

    monkeypatch.setattr(service.embeddings, "encode", encode)
    result = query(client, top_k=1, filters={"source_name": "khác.txt"}, compare=True)
    assert result.status_code == 200, result.text
    data = result.json()
    assert data["hits"][0]["document_id"] == other["id"]
    assert data["hits"][0]["score"] == pytest.approx(0, abs=1e-12)
    assert data["comparison"][0]["document_id"] == doc["id"]
    assert data["comparison"][0]["score"] == pytest.approx(1, abs=1e-12)
    assert len(calls) == 1 and calls[0][1] == "query"
    assert data["embedding"]["mode"] == "test-fixture-not-e5"
    source = parse_qs(urlsplit(data["comparison"][0]["source_url"]).query)
    assert source["document"] == [doc["id"]] and source["version"] == [version["id"]]
    assert source["chunk"] == [version["chunks"][0]["chunk_id"]]
    assert data["comparison"][0]["text"] == version["chunks"][0]["text"]
    stages = data["trace"]["stages"]
    assert all(math.isfinite(s["ms"]) and s["ms"] >= 0 for s in stages)
    assert data["trace"]["total_ms"] >= sum(s["ms"] for s in stages)
    assert data["trace"]["candidate_count"] == 1
    assert "not probability" in data["score_meaning"]
    assert provider.mode == "test-fixture-not-e5"


def test_opposite_and_ties_stable_from_persisted_rows_not_embedding_cache(lab, monkeypatch):
    client, vectors, service, _ = lab
    jobs = [ingest(client, vectors, name=f"{i}.txt", text="Một câu.")[2] for i in range(3)]
    axis = [1.0] + [0.0] * 383
    for i, job in enumerate(jobs):
        replace_vectors(vectors, job, [axis if i < 2 else [-1.0] + [0.0] * 383])
    monkeypatch.setattr(
        service.embeddings,
        "encode",
        lambda texts, *args: [controlled_query(service, axis, texts[0])],
    )
    result = query(client, top_k=10).json()
    assert [h["score"] for h in result["hits"]] == pytest.approx([1, 1, -1])
    assert [h["id"] for h in result["hits"][:2]] == sorted([jobs[0]["ids"][0], jobs[1]["ids"][0]])
    with vectors.store.db() as db:
        assert (
            json.loads(db.execute("SELECT data FROM embeddings LIMIT 1").fetchone()[0])["values"]
            != axis
        )


def test_active_pointer_verified_state_model_namespace_and_missing_source(lab):
    client, vectors, _, _ = lab
    doc, v1, old = ingest(client, vectors)
    _, v2, new = ingest(client, vectors, doc=doc, size=150)
    assert vectors.job(old["id"])["state"] == "superseded"
    result = query(client, top_k=10).json()
    assert result["hits"] and all(h["version_id"] == v2["id"] for h in result["hits"])
    assert not query(client, filters={"version_id": v1["id"]}).json()["hits"]
    assert not query(client, target={"namespace": "other"}).json()["hits"]
    for state in ["pending", "running", "failed", "superseded", "deleting", "deleted"]:
        with vectors.store.db() as db:
            db.execute("UPDATE vector_jobs SET state=? WHERE id=?", (state, new["id"]))
        assert not query(client).json()["hits"], state
    with vectors.store.db() as db:
        db.execute("UPDATE vector_jobs SET state='active',verified=0 WHERE id=?", (new["id"],))
    assert not query(client).json()["hits"]
    with vectors.store.db() as db:
        db.execute("UPDATE vector_jobs SET verified=checkpoint WHERE id=?", (new["id"],))
        db.execute("DELETE FROM vector_active WHERE job_id=?", (new["id"],))
    assert not query(client).json()["hits"]
    with vectors.store.db() as db:
        db.execute("INSERT INTO vector_active VALUES(?,?)", (new["scope"], new["id"]))
    client.delete(f"/api/documents/{doc['id']}?confirm=true")
    result = query(client).json()
    assert not result["hits"] and "source_missing_candidates_omitted" in result["trace"]["warnings"]
    assert vectors.local.list_ids(Target())["ids"]


@pytest.mark.parametrize(
    "fields",
    [
        {"top_k": 0},
        {"top_k": 11},
        {"top_k": 1.5},
        {"top_k": True},
        {"query": "  "},
        {"query": "query: invalid"},
        {"filters": {"page_from": 0, "page_to": 2}},
        {"filters": {"page_from": 4, "page_to": 2}},
        {"filters": {"page_from": 1}},
        {"filters": {"page_from": 1, "page_to": 201}},
        {"filters": {"source_name": "../private"}},
        {"filters": {"$or": []}},
        {"filters": {"document_id": "bad"}},
        {"host": "https://evil.example"},
        {"values": [0] * 384},
        {"target": {"namespace": "bad/name"}},
    ],
)
def test_input_validation_omits_private_inputs(lab, fields):
    response = query(lab[0], **fields)
    assert response.status_code == 422, response.text
    assert "private" not in response.text and "evil.example" not in response.text


def test_cap_before_loading_vectors_filter_can_narrow_and_no_query_writes(lab):
    client, vectors, service, _ = lab
    doc, _, _ = ingest(client, vectors, name="one.txt", text="Một câu.")
    ingest(client, vectors, name="two.txt", text="Một câu khác.")
    service.max_candidates = 1
    assert query(client).status_code == 413
    with vectors.store.db() as db:
        before = db.execute("SELECT data FROM local_vectors ORDER BY id").fetchall()
    assert len(query(client, filters={"document_id": doc["id"]}).json()["hits"]) == 1
    with vectors.store.db() as db:
        after = db.execute("SELECT data FROM local_vectors ORDER BY id").fetchall()
        assert [tuple(r) for r in before] == [tuple(r) for r in after]
    with pytest.raises(ValueError):
        SearchService(vectors, 0)


def test_model_error_budget_busy_and_active_race_fail_closed(lab, monkeypatch):
    client, vectors, service, _ = lab
    _, _, job = ingest(client, vectors, text="Dữ liệu vector.")
    original = service.embeddings.encode

    def missing(*args):
        raise VectorError("model_not_cached_run_approved_setup", 503)

    monkeypatch.setattr(service.embeddings, "encode", missing)
    assert query(client).status_code == 503
    monkeypatch.setattr(service.embeddings, "encode", original)
    assert query(client, query="a " * 1200).status_code == 422
    assert service.slots.acquire(False) and service.slots.acquire(False)
    assert query(client).status_code == 429
    service.slots.release()
    service.slots.release()

    def race(*args):
        result = original(*args)
        with vectors.store.db() as db:
            db.execute("DELETE FROM vector_active WHERE job_id=?", (job["id"],))
        return result

    monkeypatch.setattr(service.embeddings, "encode", race)
    assert query(client).status_code == 409


def test_live_read_requires_server_opt_in_and_never_falls_back(lab, monkeypatch):
    client, _, service, _ = lab
    monkeypatch.delenv("PVL_LIVE_SEARCH_ENABLED", raising=False)
    assert query(client, target={"mode": "live"}, confirm_live_read=True).status_code == 403
    monkeypatch.delenv("PVL_DISABLE_CLOUD", raising=False)
    monkeypatch.setenv("PVL_LIVE_SEARCH_ENABLED", "1")
    assert query(client, target={"mode": "live"}).status_code == 403
    assert (
        query(client, target={"mode": "live"}, confirm_live_read=True, compare=True).status_code
        == 403
    )
    assert query(client, target={"mode": "live"}, confirm_live_read=True).status_code == 409
    assert service.status()["model"]["mode"] == "test-fixture-not-e5"


def test_live_filter_is_correlated_before_topk_and_bounded(lab):
    provider = lab[3]
    rows = [
        dict(job_id="job-a", document_id="doc-a", version_id="v-a", chunk_id="chunk-a"),
        dict(job_id="job-b", document_id="doc-b", version_id="v-b", chunk_id="chunk-b"),
    ]
    expression = live_filter(rows, SearchFilters(page_from=2, page_to=3), provider)
    assert {"page_start": {"$lte": 3}} in expression["$and"]
    assert {"page_end": {"$gte": 2}} in expression["$and"]
    assert expression["$and"][0]["$or"][0]["$and"][-1] == {"chunk_id": {"$in": ["chunk-a"]}}
    with pytest.raises(VectorError):
        live_filter(rows * 300, SearchFilters(), provider)


def test_pdf_page_intersection_unicode_exact_filename_and_query_prefix(lab):
    client, vectors, _, provider = lab
    name = "tiê\u0301ng Việt.pdf"
    data = make_pdf(["Nguồn trang một.", "Nguồn trang hai."])
    doc = client.post("/api/documents", files={"file": (name, data, "application/pdf")}).json()
    _, version, _ = ingest(client, vectors, doc=doc, size=300)
    assert version["chunks"][0]["page_start"] == 1 and version["chunks"][0]["page_end"] == 2
    result = query(client, filters={"page_from": 2, "page_to": 2, "source_name": doc["name"]})
    assert result.status_code == 200, result.text
    assert len(result.json()["hits"]) == 1
    assert result.json()["hits"][0]["page_start"] == 1
    tokens = fixture_engine().encode("query: Tìm kiếm ngữ nghĩa là gì?", special=True).ids
    assert provider.calls[-1] == [tokens]
    assert not query(client, filters={"page_from": 3, "page_to": 3}).json()["hits"]
    assert not query(client, filters={"source_name": "' OR 1=1 --.txt"}).json()["hits"]
    vectors.local.create("other-index")
    assert not query(client, target={"index": "other-index"}).json()["hits"]


@pytest.mark.parametrize("bad_field", ["model_signature", "owner_job", "version_id", "chunk_id"])
def test_incoherent_actual_vector_metadata_is_removed_before_ranking(lab, bad_field):
    client, vectors, _, _ = lab
    _, _, job = ingest(client, vectors, text="Một nguồn.")
    with vectors.store.db() as db:
        row = db.execute("SELECT data FROM local_vectors WHERE id=?", (job["ids"][0],)).fetchone()
        record = json.loads(row[0])
        record["metadata"][bad_field] = "FOREIGN"
        db.execute(
            "UPDATE local_vectors SET data=? WHERE id=?", (json.dumps(record), job["ids"][0])
        )
    result = query(client).json()
    assert not result["hits"] and result["trace"]["discarded_count"] > 0
    assert "incoherent_candidates_omitted_before_ranking" in result["trace"]["warnings"]


@pytest.mark.parametrize(
    "field,value",
    [("model_signature", "wrong"), ("prefix", "passage: "), ("input_token_count", 999)],
)
def test_query_model_prefix_and_budget_must_match_source_contract(lab, monkeypatch, field, value):
    client, vectors, service, _ = lab
    ingest(client, vectors, text="Một nguồn.")

    def encode(texts, *args):
        record = controlled_query(service, [1.0] + [0.0] * 383, texts[0])
        record[field] = value
        return [record]

    monkeypatch.setattr(service.embeddings, "encode", encode)
    response = query(client)
    assert response.status_code == 409 and "identity_or_budget" in response.text


@pytest.mark.parametrize("failure", ["unknown", "version", "nan", "duplicate", "extra_metadata"])
def test_live_results_fail_closed_and_strip_untrusted_extras(lab, monkeypatch, failure):
    client, vectors, service, _ = lab
    ingest(client, vectors, text="Một nguồn.")
    with vectors.store.db() as db:
        rows = service.candidates(db, Target(), SearchFilters(), Measurement())
    hit = dict(id=rows[0]["id"], score=0.5, metadata={**rows[0]["metadata"]})
    if failure == "unknown":
        hit["id"] = "NOT-OWNED"
    if failure == "version":
        hit["metadata"]["version_id"] = "FOREIGN-VERSION"
    if failure == "nan":
        hit["score"] = float("nan")
    if failure == "extra_metadata":
        hit["metadata"]["provider_private"] = "SHOULD_NOT_RETURN"
    payload = [hit, hit] if failure == "duplicate" else [hit]
    monkeypatch.setattr(vectors.live, "query", lambda *a, **kw: payload)
    request = SearchRequest(query="Câu hỏi", target=Target(mode="live"), confirm_live_read=True)
    if failure == "extra_metadata":
        result = service.ranked(
            rows,
            request,
            dict(values=[1.0] + [0.0] * 383),
            SearchFilters(),
            Measurement(),
            lambda: None,
        )
        assert "SHOULD_NOT_RETURN" not in json.dumps(result)
    else:
        with pytest.raises(VectorError, match="provider_result_not_active"):
            service.ranked(
                rows,
                request,
                dict(values=[1.0] + [0.0] * 383),
                SearchFilters(),
                Measurement(),
                lambda: None,
            )
