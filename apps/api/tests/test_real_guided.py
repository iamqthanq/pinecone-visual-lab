"""Real cached E5 guided pipeline; optional LLM is Mock Ollama, no daemon/cloud."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from test_guided import act, prepared

from app.embedding_assets import SIGNATURE, model_directory, present
from app.main import create_app
from testsupport.ollama_mock import MockOllama


@pytest.mark.real_model
@pytest.mark.skipif(not present(model_directory()), reason="Approved real E5 cache required")
def test_real_e5_guided_pipeline_receipts_search_source_and_reset(tmp_path):
    app = create_app(tmp_path, llm_provider=MockOllama().provider())
    with TestClient(app) as client:
        sid, fetched = prepared(client)
        record = fetched["result"]["records"][0]
        assert record["metadata"]["embedding_mode"] == "e5"
        assert record["metadata"]["model_signature"] == SIGNATURE and len(record["values"]) == 384
        search = act(client, sid, "search", top_k=1, page=1).json()
        assert search["session"]["completed"]["search"]
        assert search["result"]["embedding"]["mode"] == "e5"
        assert search["result"]["embedding"]["prefix"] == "query: "
        assert search["result"]["hits"][0]["document_id"] == fetched["session"]["document_id"]
        rag = act(client, sid, "rag").json()
        assert rag["result"]["status"] == "search_only"
        assert rag["session"]["completed"]["rag"]
        before = app.state.guided_service.store.list()
        reset = act(client, sid, "reset").json()
        assert not any(reset["session"]["completed"].values())
        assert app.state.guided_service.store.list() == before
        path = (Path(__file__).resolve().parents[3]
                / "docs/evidence/d08/review-r1/regression/real-guided-example.json")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(
                dict(
                    label="REAL E5 + SQLite / search-only RAG / NO CLOUD",
                    fetched=fetched,
                    search=search,
                    rag=rag,
                    reset=reset,
                ),
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
            newline="\n",
        )
