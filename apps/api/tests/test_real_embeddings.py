import json
import math
from pathlib import Path

import pytest

from app.documents import DocumentError, Store
from app.embedding_assets import model_directory, present
from app.embedding_provider import TorchProvider
from app.embeddings import EmbeddingService
from app.tokenization import real_tokenizer


@pytest.mark.real_model
@pytest.mark.skipif(not present(model_directory()), reason="Explicit approved model setup required")
def test_real_e5_reference_pooling_prefix_batch_repeatability_and_vietnamese(tmp_path):
    import numpy as np
    import torch
    from transformers import AutoModel

    provider = TorchProvider()
    service = EmbeddingService(Store(tmp_path), real_tokenizer, provider)
    texts = [
        "Tôi đang học về cơ sở dữ liệu vector.",
        "Tôi tìm hiểu cách lưu trữ và tìm kiếm vector.",
        "Tôi nướng bánh mì cho bữa sáng.",
    ]
    assert provider.status()["state"] == "not_loaded"
    try:
        records = service.encode(texts, "query")
        passage = service.encode([texts[0]], "passage")[0]
        repeated = service.encode([texts[0]], "query")[0]
        assert provider.status()["state"] == "loaded"
        assert records[0]["values"] == pytest.approx(repeated["values"], abs=2e-5)
        assert passage["prefix"] == "passage: " and records[0]["prefix"] == "query: "
        assert not np.allclose(passage["values"], records[0]["values"], atol=1e-5)
        tokenizer = real_tokenizer()
        first_over_budget = next(
            n
            for n in range(1, 600)
            if len(tokenizer.encode("query: " + "a " * n, special=True).ids) > 512
        )
        boundary = service.encode(["a " * (first_over_budget - 1)], "query")[0]
        assert boundary["input_token_count"] <= 512
        with pytest.raises(DocumentError, match="512 tokens"):
            service.encode(["a " * first_over_budget], "query")
        print("Worker measurements:", json.dumps(provider.last_measurement))
        tokens = [tokenizer.encode("query: " + text, special=True).ids for text in texts]
        # Independent official AutoModel forward + NumPy float64 pooling oracle.
        model = (
            AutoModel.from_pretrained(
                str(model_directory()),
                local_files_only=True,
                use_safetensors=True,
                trust_remote_code=False,
                dtype=torch.float32,
                attn_implementation="eager",
            )
            .to("cpu")
            .eval()
        )
        torch.set_num_threads(2)
        ids = torch.full((3, max(map(len, tokens))), 1, dtype=torch.long)
        mask = torch.zeros_like(ids)
        for i, item in enumerate(tokens):
            ids[i, : len(item)] = torch.tensor(item)
            mask[i, : len(item)] = 1
        with torch.inference_mode():
            hidden = (
                model(input_ids=ids, attention_mask=mask)
                .last_hidden_state.numpy()
                .astype(np.float64)
            )
        weights = mask.numpy()[..., None]
        means = (hidden * weights).sum(axis=1) / weights.sum(axis=1)
        expected = means / np.sqrt((means * means).sum(axis=1, keepdims=True))
        for i, record in enumerate(records):
            assert record["values"] == pytest.approx(expected[i].tolist(), abs=2e-5)
            assert record["dimension"] == 384 and len(record["values"]) == 384
            assert all(math.isfinite(v) for v in record["values"])
            assert record["norm"] == pytest.approx(1, abs=1e-5)
            assert record["input_token_count"] == len(tokens[i]) <= 512
            assert record["inference_ms"] > 0
        scores = {
            "related": float(expected[0] @ expected[1]),
            "unrelated": float(expected[0] @ expected[2]),
        }
        print("Observed Vietnamese experiment (not a general theorem):", json.dumps(scores))
        print(
            "Actual CPU batch inference ms:",
            records[0]["inference_ms"],
            "load ms:",
            records[0]["load_ms"],
        )
        evidence = Path(__file__).resolve().parents[3] / "docs/evidence/d06"
        evidence.mkdir(parents=True, exist_ok=True)
        (evidence / "real-vector-sample.json").write_text(
            json.dumps({"record": records[0], "experiment": scores}, ensure_ascii=False, indent=2)
            + "\n",
            encoding="utf-8",
        )
    finally:
        provider.close()
