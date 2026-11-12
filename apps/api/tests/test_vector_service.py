import json
import sqlite3

import pytest
from fastapi.testclient import TestClient

from app.documents import DocumentError, Store
from app.main import create_app
from app.vector_contracts import Target, VectorError
from app.vector_local import LocalDemoAdapter
from testsupport.embedding_fixture import FixtureProvider
from testsupport.fixture_server import fixture_engine


@pytest.fixture
def setup(tmp_path):
    app = create_app(tmp_path, fixture_engine, embedding_provider=FixtureProvider())
    with TestClient(app) as client:
        yield client, app.state.vector_service, tmp_path


def confirmed(client, doc=None, size=100):
    doc = (
        doc
        or client.post(
            "/api/documents", files={"file": ("source.txt", b"Source data. " * 100, "text/plain")}
        ).json()
    )
    version = client.post(
        f"/api/documents/{doc['id']}/preview", json={"size": size, "overlap": 20}
    ).json()
    client.post(f"/api/documents/{doc['id']}/versions/{version['id']}/confirm")
    return doc, version


def finish(service, job):
    for _ in range(100):
        if job["state"] == "active":
            return job
        job = service.step(job["id"], job["preview_token"])
    pytest.fail("Unbounded ingest loop")


def test_local_api_full_journal_fetch_from_adapter_namespace_delete_and_restart(setup):
    client, service, root = setup
    doc, version = confirmed(client)
    target = Target(namespace="seminar")
    body = dict(target=target.model_dump(), document_id=doc["id"], version_id=version["id"])
    preview = client.post("/api/vector-store/ingest/preview", json=body)
    assert preview.status_code == 200, preview.text
    job = preview.json()
    assert job["state"] == "pending" and job["checkpoint"] == job["verified"] == 0
    assert (
        client.post(
            f"/api/vector-store/jobs/{job['id']}/step",
            json={"confirmed": False, "preview_token": job["preview_token"]},
        ).status_code
        == 422
    )
    first = service.step(job["id"], job["preview_token"])
    assert first["state"] == "pending" and first["verified"] == 0
    job = finish(service, first)
    assert job["checkpoint"] == job["verified"] == job["count"]
    assert service.preview(target, doc["id"], version["id"])["id"] == job["id"]
    identifier = job["ids"][0]
    fetched = client.post(
        "/api/vector-store/records/fetch", json=dict(target=target.model_dump(), ids=[identifier])
    ).json()
    record = fetched["records"][0]
    assert (
        fetched["data_origin"] == "SQLite adapter fetch"
        and record["metadata"]["owner_job"] == job["id"]
    )
    assert len(record["values"]) == 384
    assert LocalDemoAdapter(Store(root)).fetch(target, [identifier])[0] == record
    other = Target(namespace="other")
    assert (
        client.post(
            "/api/vector-store/records/fetch",
            json=dict(target=other.model_dump(), ids=[identifier]),
        ).json()["records"]
        == []
    )
    assert client.post(
        "/api/vector-store/records/list", json=dict(target=target.model_dump(), limit=1)
    ).json()["next"]
    # Independent proof: change only adapter storage, not the D03 embedding cache.
    changed = {**record, "values": [0.0, 1.0] + [0.0] * 382}
    with service.store.db() as db:
        original_embedding = db.execute(
            "SELECT data FROM embeddings WHERE chunk_id=?", (record["metadata"]["chunk_id"],)
        ).fetchone()[0]
        db.execute("UPDATE local_vectors SET data=? WHERE id=?", (json.dumps(changed), identifier))
    result = client.post(
        "/api/vector-store/records/fetch", json=dict(target=target.model_dump(), ids=[identifier])
    ).json()["records"][0]
    assert result["values"] == changed["values"]
    assert result["values"] != json.loads(original_embedding)["values"]
    deletion = client.post(f"/api/vector-store/jobs/{job['id']}/delete-preview").json()
    assert deletion["ids"] == job["ids"] and deletion["target"] == job["target"]
    assert (
        client.post(
            f"/api/vector-store/deletions/{deletion['id']}/step", json={"confirmed": False}
        ).status_code
        == 422
    )
    for _ in range(100):
        response = client.post(
            f"/api/vector-store/deletions/{deletion['id']}/step", json={"confirmed": True}
        )
        assert response.status_code == 200, response.text
        if response.json()["state"] == "deleted":
            break
    else:
        pytest.fail("Unbounded delete loop")
    assert not service.local.list_ids(target)["ids"]
    assert service.store.get(doc["id"])["confirmed_id"] == version["id"]
    assert service.job(job["id"])["state"] == "deleted"
    renewed = service.preview(target, doc["id"], version["id"])
    assert renewed["id"] != job["id"] and set(renewed["ids"]).isdisjoint(job["ids"])


def test_retry_partial_failure_resume_keeps_active_and_ids_stable(setup):
    client, service, _ = setup
    target = Target(namespace="resumable")
    doc, v1 = confirmed(client)
    old = finish(service, service.preview(target, doc["id"], v1["id"]))
    _, v2 = confirmed(client, doc, size=120)
    job = service.preview(target, doc["id"], v2["id"])

    class Partial(LocalDemoAdapter):
        def upsert(self, target, records):
            super().upsert(target, records[:2])
            raise VectorError("synthetic_timeout_after_partial_commit", 504, True)

    service.local = Partial(service.store)
    service.pause = lambda seconds: None
    with pytest.raises(VectorError):
        service.step(job["id"], job["preview_token"])
    failed = service.job(job["id"])
    assert failed["state"] == "failed" and failed["checkpoint"] == 0 and failed["retries"] == 3
    with service.store.db() as db:
        assert (
            db.execute(
                "SELECT job_id FROM vector_active WHERE scope=?", (old["scope"],)
            ).fetchone()[0]
            == old["id"]
        )
    service.local = LocalDemoAdapter(service.store)
    active = finish(service, failed)
    assert active["ids"] == job["ids"] and active["state"] == "active"
    assert service.job(old["id"])["state"] == "superseded"
    assert set(active["ids"]).isdisjoint(old["ids"])


def test_visibility_verification_and_cas_prevent_stale_activation(setup):
    client, service, _ = setup
    target = Target()
    doc, v1 = confirmed(client)
    a = service.preview(target, doc["id"], v1["id"])
    _, v2 = confirmed(client, doc, size=120)
    b = service.preview(target, doc["id"], v2["id"])
    active = finish(service, b)
    with pytest.raises(VectorError, match="active_version_changed"):
        finish(service, a)
    assert service.job(active["id"])["state"] == "active"
    renewed = service.preview(target, doc["id"], v1["id"])
    assert renewed["id"] != a["id"] and renewed["baseline_active"] == b["id"]

    class Delayed(LocalDemoAdapter):
        misses = 0

        def fetch(self, target, ids):
            self.misses += 1
            return [] if self.misses <= 2 else super().fetch(target, ids)

    service.local = Delayed(service.store)
    service.pause = lambda seconds: None
    result = finish(service, renewed)
    assert result["state"] == "active" and result["retries"] >= 2


def test_source_delete_does_not_implicitly_delete_vectors_and_blocks_new_activation(setup):
    client, service, _ = setup
    doc, version = confirmed(client)
    target = Target()
    job = service.preview(target, doc["id"], version["id"])
    first = service.step(job["id"], job["preview_token"])
    assert service.local.list_ids(target)["ids"]
    client.delete(f"/api/documents/{doc['id']}?confirm=true")
    assert service.local.list_ids(target)["ids"]
    with pytest.raises(DocumentError):
        service.step(first["id"], first["preview_token"])
    assert service.job(job["id"])["state"] == "failed"
    token = service.lease(job["scope"])
    with pytest.raises(VectorError, match="busy"):
        service.lease(job["scope"])
    with service.store.db() as db:
        db.execute("UPDATE vector_leases SET expires=0 WHERE scope=?", (job["scope"],))
    newer = service.lease(job["scope"])
    assert newer != token
    with service.store.db() as db:
        with pytest.raises(VectorError, match="lease_lost"):
            service.assert_lease(db, job["scope"], token)


def test_schema_two_forward_migration_preserves_documents_embeddings_and_unknown_schema(setup):
    client, service, root = setup
    doc, version = confirmed(client)
    service.embeddings.chunks(doc["id"], version["id"], [version["chunks"][0]["chunk_id"]])
    before = service.store.get(doc["id"])
    with sqlite3.connect(root / "documents.sqlite3") as db:
        for table in [
            "vector_deletions",
            "vector_leases",
            "vector_active",
            "vector_items",
            "vector_jobs",
            "local_vectors",
            "vector_indexes",
        ]:
            db.execute("DROP TABLE " + table)
        db.execute("PRAGMA user_version=2")
    assert Store(root).get(doc["id"]) == before
    with service.store.db() as db:
        assert db.execute("PRAGMA user_version").fetchone()[0] == 3
        assert db.execute("SELECT COUNT(*) FROM embeddings").fetchone()[0] == 1


def test_api_security_no_automatic_cloud_or_key_echo(setup, monkeypatch):
    client, _, _ = setup
    monkeypatch.setenv("PINECONE_API_KEY", "FAKE-SECRET-DO-NOT-ECHO")
    status = client.get("/api/vector-store/status")
    assert status.json()["live_key_configured"] is True
    assert "FAKE-SECRET" not in status.text
    assert client.post("/api/vector-store/indexes/list", json={"mode": "live"}).status_code == 403
    assert (
        client.post(
            "/api/vector-store/indexes/list", json={"mode": "live", "confirm_live_read": True}
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/vector-store/records/list",
            json={"target": {"mode": "local", "host": "http://localhost"}},
        ).status_code
        == 422
    )
    assert client.get("/api/vector-store/jobs?namespace=bad/name").status_code == 422
    assert (
        client.post(
            "/api/vector-store/records/fetch", json={"target": {}, "ids": ["x", "x"]}
        ).status_code
        == 422
    )
    preview = client.post(
        "/api/vector-store/indexes/create/preview",
        json={"target": {"index": "new-local"}, "cloud": "local", "region": "this-device"},
    ).json()
    assert (
        client.post(
            "/api/vector-store/indexes/create/confirm",
            json={"preview_id": preview["preview_id"], "confirmed": False},
        ).status_code
        == 422
    )
    assert client.post(
        "/api/vector-store/indexes/create/confirm",
        json={"preview_id": preview["preview_id"], "confirmed": True},
    ).json()["ready"]


def test_identity_changes_cannot_resume_or_delete_another_index(setup):
    client, service, _ = setup
    doc, version = confirmed(client)
    job = service.preview(Target(), doc["id"], version["id"])

    class ChangedIdentity(LocalDemoAdapter):
        def describe(self, name):
            return {**super().describe(name), "region": "changed"}

    service.local = ChangedIdentity(service.store)
    with pytest.raises(VectorError, match="identity_changed"):
        service.step(job["id"], job["preview_token"])
    deletion = service.delete_preview(job["id"])
    with pytest.raises(VectorError, match="identity_changed"):
        service.delete_step(deletion["id"])


def test_partial_delete_reconciles_from_checkpoint_without_touching_other_namespaces(setup):
    client, service, _ = setup
    doc, version = confirmed(client)
    target = Target(namespace="delete-source")
    other = Target(namespace="untouched")
    job = finish(service, service.preview(target, doc["id"], version["id"]))
    records = service.local.fetch(target, job["ids"][:2])
    service.local.upsert(other, records)
    deletion = service.delete_preview(job["id"])

    class PartialDelete(LocalDemoAdapter):
        def delete(self, target, ids, owner):
            super().delete(target, ids[:2], owner)
            raise VectorError("synthetic_delete_timeout", 504, True)

    service.local = PartialDelete(service.store)
    service.pause = lambda seconds: None
    with pytest.raises(VectorError):
        service.delete_step(deletion["id"])
    with service.store.db() as db:
        assert not db.execute(
            "SELECT 1 FROM vector_active WHERE scope=?", (job["scope"],)
        ).fetchone()
        assert (
            db.execute(
                "SELECT checkpoint FROM vector_deletions WHERE id=?", (deletion["id"],)
            ).fetchone()[0]
            == 0
        )
    assert service.job(job["id"])["state"] == "deleting"
    service.local = LocalDemoAdapter(service.store)
    for _ in range(100):
        result = service.delete_step(deletion["id"])
        if result["state"] == "deleted":
            break
    assert result["state"] == "deleted"
    assert service.local.fetch(other, [r["id"] for r in records]) == records
    assert service.store.get(doc["id"])["confirmed_id"] == version["id"]
