import json
import math
import sqlite3
import threading
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.chunking import chunk_document
from app.documents import DocumentError, Store
from app.embedding_assets import verify
from app.embedding_math import checked_vector, cosine, masked_mean_pool
from app.embedding_provider import TorchProvider
from app.embeddings import EmbeddingService, compare
from app.main import create_app
from app.tokenization import REVISION
from testsupport.embedding_fixture import FixtureProvider
from testsupport.fixture_server import fixture_engine


@pytest.fixture
def api(tmp_path):
    provider = FixtureProvider()
    with TestClient(create_app(tmp_path, fixture_engine, embedding_provider=provider)) as client:
        yield client, provider, tmp_path


def source(client):
    doc = client.post(
        "/api/documents",
        files={"file": ("synthetic.txt", ("Dữ liệu vector. " * 60).encode(), "text/plain")},
    ).json()
    version = client.post(
        f"/api/documents/{doc['id']}/preview", json={"size": 100, "overlap": 20}
    ).json()
    return doc, version


def test_prefixes_budget_and_no_automatic_download(tmp_path, monkeypatch):
    import urllib.request

    monkeypatch.setattr(
        urllib.request, "urlopen", lambda *a, **k: pytest.fail("Unexpected network")
    )
    engine, provider = fixture_engine(), FixtureProvider()
    service = EmbeddingService(Store(tmp_path), lambda: engine, provider)
    for kind in ["query", "passage"]:
        record = service.encode(["Tiếng Việt."], kind)[0]
        assert provider.calls[-1] == [engine.encode(kind + ": Tiếng Việt.", special=True).ids]
        assert record["prefix"] == kind + ": "
        assert record["mode"] == "test-fixture-not-e5"
    overhead = len(engine.encode("query: ", special=True).ids)
    assert service.encode(["a" * (512 - overhead)], "query")[0]["input_token_count"] == 512
    with pytest.raises(DocumentError, match="512 tokens"):
        service.encode(["a" * (513 - overhead)], "query")
    for text in ["", "  ", "query: already prefixed", "passage: already prefixed"]:
        with pytest.raises(DocumentError):
            service.encode([text], "query")
    with pytest.raises(DocumentError):
        service.encode(["text"] * 9, "query")


def test_api_batch_order_norm_and_fixture_label(api):
    client, provider, _ = api
    response = client.post("/api/embeddings/encode", json={"texts": ["Một", "Hai", "Ba"]})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["wall_ms"] >= 0 and result["inference_ms"] >= 0
    assert len(result["records"]) == 3
    for index, text in enumerate(["Một", "Hai", "Ba"]):
        record = result["records"][index]
        single = client.post("/api/embeddings/encode", json={"texts": [text]}).json()["records"][0]
        assert record["values"] == single["values"]
        assert record["dimension"] == len(record["values"]) == 384
        assert math.sqrt(sum(v * v for v in record["values"])) == pytest.approx(1, abs=1e-5)
        assert record["source_chunk_id"] is None
        assert record["batch_size"] == 3 and record["item_inference_ms"] is None
    assert client.get("/api/embeddings/status").json()["mode"] == provider.mode


def test_confirmed_source_ownership_idempotence_and_delete_cascade(api):
    client, provider, root = api
    doc, version = source(client)
    identifiers = [c["chunk_id"] for c in version["chunks"][:2]][::-1]
    body = {"document_id": doc["id"], "version_id": version["id"], "chunk_ids": identifiers}
    assert client.post("/api/embeddings/chunks", json=body).status_code == 409
    client.post(f"/api/documents/{doc['id']}/versions/{version['id']}/confirm")
    result = client.post("/api/embeddings/chunks", json=body)
    assert result.status_code == 200, result.text
    records = result.json()["records"]
    assert [r["source_chunk_id"] for r in records] == identifiers
    assert all(
        r["source_document_id"] == doc["id"] and r["source_version_id"] == version["id"]
        for r in records
    )
    assert all(
        r["prefix"] == "passage: " and r["page_start"] == r["page_end"] == 1 for r in records
    )
    calls = len(provider.calls)
    again = client.post("/api/embeddings/chunks", json=body).json()
    assert len(provider.calls) == calls
    assert again["inference_ms"] is None
    assert all(r["cached"] for r in again["records"])
    assert [r["id"] for r in records] == [r["id"] for r in again["records"]]
    body["chunk_ids"] = [identifiers[0], identifiers[0]]
    assert client.post("/api/embeddings/chunks", json=body).status_code == 422
    body["chunk_ids"] = [str(uuid4())]
    assert client.post("/api/embeddings/chunks", json=body).status_code == 404
    other, _ = source(client)
    body["document_id"] = other["id"]
    assert client.post("/api/embeddings/chunks", json=body).status_code == 404
    client.delete(f"/api/documents/{doc['id']}?confirm=true")
    with Store(root).db() as db:
        assert db.execute("SELECT COUNT(*) FROM embeddings").fetchone()[0] == 0


def test_forward_schema_migration_preserves_d02_records_and_rejects_future(tmp_path):
    store = Store(tmp_path)
    doc = store.upload(b"Preserve this D02 source.", "source.txt", "text/plain")
    draft = store.save_preview(
        doc["id"],
        {"size": 100, "overlap": 20},
        lambda source, version, identifier: chunk_document(
            source, 100, 20, fixture_engine(), version, identifier
        ),
    )
    store.confirm(doc["id"], draft["id"])
    before = store.get(doc["id"])
    with sqlite3.connect(tmp_path / "documents.sqlite3") as db:
        db.execute("DROP TABLE embeddings")
        db.execute("PRAGMA user_version=1")
    assert Store(tmp_path).get(doc["id"])["canonical_text"] == doc["canonical_text"]
    assert store.get(doc["id"]) == before
    assert store.version(doc["id"], draft["id"])["chunks"] == draft["chunks"]
    with store.db() as db:
        assert db.execute("PRAGMA user_version").fetchone()[0] == 2
    with sqlite3.connect(tmp_path / "documents.sqlite3") as db:
        db.execute("PRAGMA user_version=999")
    with pytest.raises(DocumentError, match="Unsupported database schema"):
        store.get(doc["id"])


@pytest.mark.parametrize(
    "values", [[0.0] * 384, [1.0] * 383, [float("nan")] * 384, [float("inf")] * 384, [True] * 384]
)
def test_invalid_vectors_rejected(values):
    with pytest.raises(DocumentError):
        checked_vector(values)


def test_cosine_independent_decimal_oracle_and_model_parity():
    left = [1.0, 2.0, 3.0] + [0.0] * 381
    right = [3.0, 1.0, 2.0] + [0.0] * 381
    expected = sum(Decimal(a) * Decimal(b) for a, b in zip(left, right, strict=True)) / Decimal(14)
    assert cosine(left, right) == pytest.approx(float(expected), abs=1e-14)
    assert cosine(left, left) == pytest.approx(1)
    assert cosine([1e150] * 384, [1e150] * 384) == pytest.approx(1)
    assert cosine(left, [-v for v in left]) == pytest.approx(-1)
    assert cosine([1.0] + [0.0] * 383, [0.0, 1.0] + [0.0] * 382) == 0
    operand = dict(
        values=left, model_id="model", model_revision="revision", model_signature="sig", mode="e5"
    )
    with pytest.raises(DocumentError, match="same model"):
        compare(operand, {**operand, "model_revision": "wrong"})


def test_masked_mean_pool_independent_loop_oracle():
    import torch

    hidden = torch.arange(2 * 3 * 384, dtype=torch.float32).reshape(2, 3, 384) / 100
    mask = torch.tensor([[1, 1, 0], [1, 0, 0]])
    actual = masked_mean_pool(hidden, mask).tolist()
    for batch in range(2):
        indices = [i for i in range(3) if mask[batch, i]]
        expected = [
            sum(float(hidden[batch, i, j]) for i in indices) / len(indices) for j in range(384)
        ]
        norm = math.sqrt(sum(v * v for v in expected))
        assert actual[batch] == pytest.approx([v / norm for v in expected], abs=2e-7)
    with pytest.raises(DocumentError):
        masked_mean_pool(hidden, torch.zeros_like(mask))


def test_missing_and_corrupt_assets_status_does_not_load_or_download(tmp_path, monkeypatch):
    import app.embedding_assets as assets

    provider = TorchProvider(tmp_path)
    assert provider.status()["state"] == "not_cached"
    assert provider.process is None
    with pytest.raises(DocumentError, match="not cached"):
        provider.encode([[1, 2]])
    (tmp_path / "config.json").write_text("corrupt")
    monkeypatch.setattr(assets, "ASSETS", {"config.json": (7, "0" * 64)})
    with pytest.raises(DocumentError, match="checksum mismatch"):
        verify(tmp_path)
    provider.close()


def test_provider_mismatch_and_bad_output(tmp_path):
    engine, provider = fixture_engine(), FixtureProvider()
    service = EmbeddingService(Store(tmp_path), lambda: engine, provider)
    engine.revision = REVISION
    with pytest.raises(DocumentError, match="mismatch"):
        service.encode(["Raw input"], "query")
    engine.revision = provider.revision
    provider.encode = lambda *a: {"values": [[1.0] * 384], "inference_ms": 1, "load_ms": 0}
    with pytest.raises(DocumentError, match="normalization"):
        service.encode(["Raw input"], "query")


def test_api_invalid_inputs_and_math_feedback(api):
    client, _, _ = api
    for body in [
        {"texts": []},
        {"texts": [""]},
        {"texts": ["query: duplicate"]},
        {"texts": ["text"], "kind": "bad"},
        {"texts": ["a" * 1000]},
    ]:
        assert client.post("/api/embeddings/encode", json=body).status_code == 422
    record = client.post("/api/embeddings/encode", json={"texts": ["safe"]}).json()["records"][0]
    assert client.post("/api/embeddings/compare", json={"left": record, "right": record}).json()[
        "cosine"
    ] == pytest.approx(1)
    assert (
        client.post(
            "/api/embeddings/compare",
            json={"left": record, "right": {**record, "values": [0.0] * 384}},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/embeddings/compare", json={"left": record, "right": {**record, "values": [1.0]}}
        ).status_code
        == 422
    )


def test_cancelled_worker_and_timeout_use_owned_process_only(tmp_path, monkeypatch):
    # Stub process/pipe, so no heavy model or network is involved in control-flow tests.
    import app.embedding_provider as module

    class Process:
        stopped = False

        def is_alive(self):
            return not self.stopped

        def terminate(self):
            self.stopped = True

        def join(self, timeout):
            pass

        def close(self):
            pass

    class Pipe:
        def send(self, data):
            pass

        def poll(self, timeout):
            return False

        def close(self):
            pass

    monkeypatch.setattr(module, "present", lambda p: True)
    for cancelled in [True, False]:
        provider = TorchProvider(tmp_path, timeout=0)
        process = Process()
        provider.process, provider.connection = process, Pipe()
        event = threading.Event()
        if cancelled:
            event.set()
        with pytest.raises(DocumentError) as error:
            provider.encode([[1, 2]], event)
        assert error.value.status == (408 if cancelled else 504)
        assert process.stopped and provider.process is None


def test_nonfinite_api_errors_and_bounded_json_body_do_not_echo_queries(api):
    client, _, _ = api
    record = client.post("/api/embeddings/encode", json={"texts": ["synthetic"]}).json()["records"][
        0
    ]
    for value in [float("nan"), float("inf"), float("-inf")]:
        response = client.post(
            "/api/embeddings/compare",
            content=json.dumps({"left": record, "right": {**record, "values": [value] * 384}}),
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 422
        assert "values" in response.json()["detail"]
    assert (
        client.post(
            "/api/embeddings/encode",
            content=b" " * 1_048_577,
            headers={"Content-Type": "application/json"},
        ).status_code
        == 413
    )


def test_missing_real_provider_returns_actionable_503_without_network(tmp_path):
    engine = fixture_engine()
    # Input-only spy impersonation is explicit in this test; it never emits vectors.
    engine.mode, engine.revision = "e5", REVISION
    with TestClient(
        create_app(
            tmp_path, lambda: engine, embedding_provider=TorchProvider(tmp_path / "absent-model")
        )
    ) as client:
        status = client.get("/api/embeddings/status").json()
        assert status["state"] == "not_cached"
        response = client.post("/api/embeddings/encode", json={"texts": ["synthetic"]})
        assert response.status_code == 503
        assert "--accept-download" in response.json()["detail"]


@pytest.mark.parametrize(
    "literal", ["query: is a documented prefix.", "passage: is literal source content."]
)
def test_confirmed_source_preserves_literal_prefix_words(api, literal):
    client, provider, _ = api
    doc = client.post(
        "/api/documents", files={"file": ("literal.txt", literal.encode(), "text/plain")}
    ).json()
    version = client.post(
        f"/api/documents/{doc['id']}/preview", json={"size": 300, "overlap": 50}
    ).json()
    client.post(f"/api/documents/{doc['id']}/versions/{version['id']}/confirm")
    response = client.post(
        "/api/embeddings/chunks",
        json={
            "document_id": doc["id"],
            "version_id": version["id"],
            "chunk_ids": [version["chunks"][0]["chunk_id"]],
        },
    )
    assert response.status_code == 200, response.text
    assert provider.calls[-1] == [fixture_engine().encode("passage: " + literal, special=True).ids]
