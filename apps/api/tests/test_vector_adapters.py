import json
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest
from pinecone import Pinecone, RetryConfig

from app.documents import Store
from app.embedding_assets import SIGNATURE
from app.tokenization import MODEL_ID, REVISION
from app.vector_contracts import Record, Target, VectorError
from app.vector_live import LiveAuthorization, PineconeLiveAdapter, trusted_host
from app.vector_local import LocalDemoAdapter


def record(identifier="v1", owner="job1", mode="test-fixture-not-e5"):
    return dict(
        id=identifier,
        values=[1.0] + [0.0] * 383,
        metadata=dict(
            owner_job=owner,
            document_id="doc",
            version_id="version",
            chunk_id=identifier,
            page_start=1,
            page_end=1,
            model_signature=SIGNATURE if mode == "e5" else "sig",
            model_revision=REVISION if mode == "e5" else "rev",
            model_id=MODEL_ID,
            embedding_mode=mode,
        ),
    )


def description(**changes):
    return dict(
        name="fixture",
        host="https://fixture.svc.pinecone.io",
        status={"ready": True, "state": "Ready"},
        schema={
            "fields": {"_values": {"type": "dense_vector", "dimension": 384, "metric": "cosine"}}
        },
        deployment={"deployment_type": "managed", "cloud": "aws", "region": "us-east-1"},
        deletion_protection="enabled",
        **changes,
    )


def test_local_real_persistence_isolation_collision_paging_and_cosine(tmp_path):
    adapter = LocalDemoAdapter(Store(tmp_path))
    a = Target(namespace="a")
    b = Target(namespace="b")
    assert adapter.namespaces(a.index) == []
    adapter.upsert(a, [record("a"), record("b")])
    adapter.upsert(a, [record("a")])
    adapter.upsert(b, [record("a")])
    restarted = LocalDemoAdapter(Store(tmp_path))
    assert restarted.fetch(a, ["a"])[0] == record("a")
    page = restarted.list_ids(a, limit=1)
    assert page == {"ids": ["a"], "next": "a"}
    assert restarted.list_ids(a, page["next"], 1) == {"ids": ["b"], "next": None}
    with pytest.raises(VectorError, match="id_collision"):
        adapter.upsert(a, [record("a", "foreign")])
    with pytest.raises(VectorError, match="foreign_id"):
        adapter.delete(a, ["a"], "foreign")
    adapter.delete(a, ["a"], "job1")
    assert adapter.fetch(a, ["a"]) == [] and adapter.fetch(b, ["a"])
    assert adapter.cosine(record()["values"], record()["values"]) == pytest.approx(1)
    assert restarted.namespaces(a.index) == [
        dict(namespace="a", count=1, exists=True),
        dict(namespace="b", count=1, exists=True),
    ]


def test_local_concurrent_idempotence_and_invalid_vector(tmp_path):
    adapter = LocalDemoAdapter(Store(tmp_path))
    target = Target()
    adapter.indexes()
    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(lambda _: adapter.upsert(target, [record()]), range(3)))
    assert adapter.list_ids(target)["ids"] == ["v1"]
    for values in [[0.0] * 384, [1.0], [float("nan")] * 384]:
        with pytest.raises((ValueError, VectorError)):
            Record.model_validate({**record(), "values": values})
    with pytest.raises(VectorError, match="duplicate_index"):
        adapter.create("local-e5")


@pytest.mark.parametrize(
    "host",
    [
        "http://fixture.svc.pinecone.io",
        "localhost",
        "127.0.0.1",
        "fixture.svc.pinecone.io.evil.example",
        "https://secret@fixture.svc.pinecone.io",
        "https://fixture.svc.pinecone.io/path",
        "https://fixture.svc.pinecone.io?api_key=x",
        "https://fixture.svc.pinecone.io:invalid",
    ],
)
def test_no_client_ssrf_hosts(host):
    with pytest.raises(VectorError):
        trusted_host(host)


def test_index_shape_validation():
    assert PineconeLiveAdapter.description(description())["compatible"]
    for field in [
        dict(type="dense_vector", dimension=385, metric="cosine"),
        dict(type="dense_vector", dimension=384, metric="euclidean"),
        dict(type="semantic_text", model="hosted-model"),
    ]:
        raw = description()
        raw["schema"]["fields"]["_values"] = field
        assert not PineconeLiveAdapter.description(raw)["compatible"]
    raw = description()
    raw["schema"]["fields"]["other"] = {"type": "string"}
    assert not PineconeLiveAdapter.description(raw)["compatible"]
    raw = description()
    raw["status"]["ready"] = False
    assert not PineconeLiveAdapter.description(raw)["compatible"]
    raw = description()
    raw["embed"] = {"model": "integrated-model"}
    assert not PineconeLiveAdapter.description(raw)["compatible"]


def test_missing_key_and_disabled_cloud_never_construct_sdk(monkeypatch):
    monkeypatch.delenv("PVL_DISABLE_CLOUD", raising=False)
    monkeypatch.delenv("PINECONE_API_KEY", raising=False)
    with pytest.raises(VectorError, match="server_api_key"):
        PineconeLiveAdapter().indexes()
    monkeypatch.setenv("PVL_DISABLE_CLOUD", "1")
    monkeypatch.setenv("PINECONE_API_KEY", "fixture-not-real")
    with pytest.raises(VectorError, match="cloud_disabled"):
        PineconeLiveAdapter().indexes()


def test_real_sdk_transport_contract_no_network_and_no_secret_errors(monkeypatch):
    calls = []
    data = {}

    def send(client, request, **kwargs):
        assert request.headers.get("X-Pinecone-API-Version") == "2026-07"
        calls.append((request.method, request.url.host, request.url.path))
        path = request.url.path
        if path == "/indexes":
            payload = {"indexes": [description()]}
        elif path == "/indexes/fixture":
            payload = description()
        elif path == "/vectors/upsert":
            body = json.loads(request.content)
            assert body["namespace"] == "demo"
            data.update({r["id"]: r for r in body["vectors"]})
            payload = {"upsertedCount": len(data)}
        elif path == "/vectors/fetch":
            payload = {"vectors": data, "namespace": "demo"}
        elif path == "/vectors/list":
            payload = {"vectors": [{"id": i} for i in data], "namespace": "demo"}
        elif path == "/describe_index_stats":
            payload = {
                "namespaces": {"demo": {"vectorCount": len(data)}},
                "dimension": 384,
                "indexFullness": 0.0,
                "totalVectorCount": len(data),
            }
        elif path == "/vectors/delete":
            body = json.loads(request.content)
            assert set(body) == {"ids", "namespace"}
            for i in body["ids"]:
                data.pop(i, None)
            payload = {}
        else:
            pytest.fail("Unexpected SDK transport route " + path)
        return httpx.Response(200, json=payload, request=request)

    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", send)
    import socket

    monkeypatch.setattr(
        socket, "getaddrinfo", lambda *a, **k: pytest.fail("Unexpected network/DNS")
    )

    class Allow:
        def check(self, *args):
            pass

    pc = Pinecone(
        api_key="OFFLINE-SDK-FIXTURE-NOT-REAL", timeout=5, retry_config=RetryConfig(max_retries=0)
    )
    live = PineconeLiveAdapter(pc, Allow())
    target = Target(mode="live", index="fixture", namespace="demo")
    try:
        assert live.indexes()[0]["compatible"]
        live.upsert(target, [record(mode="e5")])
        assert live.fetch(target, ["v1"])[0]["values"] == record()["values"]
        assert live.list_ids(target)["ids"] == ["v1"]
        assert live.namespaces("fixture")[0]["count"] == 1
        live.delete(target, ["v1"], "job1")
        assert not data
        with pytest.raises(VectorError, match="fixture_vectors"):
            live.upsert(target, [record()])
    finally:
        live.close()
    assert all(host in ("api.pinecone.io", "fixture.svc.pinecone.io") for _, host, _ in calls)


@pytest.mark.parametrize("status", [401, 403, 404, 408, 409, 429, 500, 503, 504])
def test_sdk_errors_sanitized_and_classified(status):
    class Failure(Exception):
        status_code = status

    def fail():
        raise Failure("DO NOT LEAK api_key=TOP_SECRET or provider response body")

    with pytest.raises(VectorError) as error:
        PineconeLiveAdapter.call(fail)
    assert "TOP_SECRET" not in error.value.message
    assert error.value.retryable == (status in (408, 429, 500, 503, 504))


def test_real_sdk_create_byov_wire_shape_no_automatic_poll_or_network(monkeypatch):
    def send(client, request, **kwargs):
        if request.method == "GET" and request.url.path == "/indexes":
            return httpx.Response(200, json={"indexes": []}, request=request)
        assert request.method == "POST" and request.url.path == "/indexes"
        data = json.loads(request.content)
        assert data["schema"] == description()["schema"]
        assert data["deployment"] == description()["deployment"]
        raw = description()
        raw["status"] = {"ready": False, "state": "Initializing"}
        return httpx.Response(201, json=raw, request=request)

    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", send)
    import socket

    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: pytest.fail("Unexpected DNS"))

    class Approval:
        def check(self, action, target, ids, info):
            assert action == "create_index" and target.index == "fixture" and ids == []
            assert info == dict(cloud="aws", region="us-east-1")

    adapter = PineconeLiveAdapter(Pinecone(api_key="OFFLINE-NOT-REAL", timeout=5), Approval())
    try:
        assert adapter.create("fixture", "aws", "us-east-1")["ready"] is False
    finally:
        adapter.close()


def test_live_authorization_is_explicit_scoped_expiring_and_separate_delete(tmp_path, monkeypatch):
    policy = LiveAuthorization()
    target = Target(mode="live", index="fixture", namespace="demo")
    with pytest.raises(VectorError):
        policy.check("upsert", target, ["v1"], dict(cloud="aws", region="us-east-1"))
    path = tmp_path / "approval.json"
    approval = dict(
        project="demo-project",
        index="fixture",
        namespace="demo",
        cloud="aws",
        region="us-east-1",
        index_host="https://fixture.svc.pinecone.io",
        record_ids=["v1"],
        actions=["upsert"],
        plan_quota_acknowledged=True,
        expires_at="2099-01-01T00:00:00+00:00",
    )
    path.write_text(json.dumps(approval))
    monkeypatch.setenv("PVL_LIVE_AUTHORIZATION_FILE", str(path))
    monkeypatch.setenv("PVL_PINECONE_PROJECT", "demo-project")
    info = dict(cloud="aws", region="us-east-1", host=approval["index_host"])
    policy.check("upsert", target, ["v1"], info)
    for action, ids in [("delete", ["v1"]), ("upsert", ["foreign"])]:
        with pytest.raises(VectorError):
            policy.check(action, target, ids, info)
    for changes in [
        {"actions": "upsert-delete"},
        {"plan_quota_acknowledged": "yes"},
        {"expires_at": "2000-01-01T00:00:00+00:00"},
        {"project": "another-project"},
        {"namespace": "other"},
        {"index_host": "https://evil.example"},
        {"record_ids": "v1"},
    ]:
        path.write_text(json.dumps({**approval, **changes}))
        with pytest.raises(VectorError):
            policy.check("upsert", target, ["v1"], info)
    path.write_text("[]")
    with pytest.raises(VectorError):
        policy.check("upsert", target, ["v1"], info)
