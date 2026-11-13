import json
import math
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.documents import Store
from app.embedding_assets import REVISION, SIGNATURE, model_directory, present
from app.main import create_app
from app.vector_contracts import Target
from app.vector_local import LocalDemoAdapter


@pytest.mark.real_model
@pytest.mark.skipif(not present(model_directory()), reason="Approved cached E5 weights required")
def test_real_e5_confirmed_source_sqlite_storage_restart_namespace_and_owned_delete(tmp_path):
    app = create_app(tmp_path)
    with TestClient(app) as client:
        doc = client.post(
            "/api/documents",
            files={
                "file": (
                    "real-storage.txt",
                    (
                        "Cơ sở dữ liệu vector lưu biểu diễn ngữ nghĩa. "
                        "Tìm kiếm theo độ tương đồng.\n\n"
                    ).encode()
                    * 6,
                    "text/plain",
                )
            },
        ).json()
        response = client.post(
            f"/api/documents/{doc['id']}/preview", json={"size": 150, "overlap": 25}
        )
        assert response.status_code == 201, response.text
        version = response.json()
        assert (
            client.post(f"/api/documents/{doc['id']}/versions/{version['id']}/confirm").status_code
            == 200
        )
        service = app.state.vector_service
        target = Target(namespace="real-e5-d04")
        job = service.preview(target, doc["id"], version["id"])
        for _ in range(30):
            job = service.step(job["id"], job["preview_token"])
            if job["state"] == "active":
                break
        assert job["state"] == "active" and job["verified"] == job["count"]
        record = LocalDemoAdapter(Store(tmp_path)).fetch(target, job["ids"][:1])[0]
        assert len(record["values"]) == 384
        assert all(math.isfinite(v) for v in record["values"])
        assert math.hypot(*record["values"]) == pytest.approx(1, abs=1e-5)
        assert record["metadata"]["embedding_mode"] == "e5"
        assert record["metadata"]["model_revision"] == REVISION
        assert record["metadata"]["model_signature"] == SIGNATURE
        assert record["metadata"]["version_id"] == version["id"]
        assert record["metadata"]["chunk_id"] == version["chunks"][0]["chunk_id"]
        assert not service.local.fetch(Target(namespace="other"), [record["id"]])
        cached = service.embeddings.chunks(
            doc["id"], version["id"], [record["metadata"]["chunk_id"]]
        )[0]
        assert cached["values"] == record["values"] and cached["prefix"] == "passage: "
        evidence = Path(__file__).resolve().parents[3] / "docs/evidence/d08/review-r1/regression"
        evidence.mkdir(parents=True, exist_ok=True)
        (evidence / "real-local-stored-vector.json").write_text(
            json.dumps(
                {
                    "label": "REAL E5 / SQLite — NO CLOUD",
                    "manifest": job,
                    "adapter_record": record,
                    "inference_ms": cached["inference_ms"],
                    "input_token_count": cached["input_token_count"],
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        deletion = service.delete_preview(job["id"])
        for _ in range(30):
            result = service.delete_step(deletion["id"])
            if result["state"] == "deleted":
                break
        assert result["state"] == "deleted"
        assert not service.local.list_ids(target)["ids"]
        assert service.store.get(doc["id"])["confirmed_id"] == version["id"]
