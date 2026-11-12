"""Public typed embedding contracts; fixture provenance can never be labeled E5."""

from typing import Literal

from pydantic import BaseModel, Field, FiniteFloat


class ModelStatus(BaseModel):
    state: Literal["not_cached", "not_loaded", "loading", "loaded", "unavailable"]
    mode: Literal["e5", "test-fixture-not-e5"]
    model_id: str
    model_revision: str
    dimension: Literal[384]
    model_signature: str
    weights_sha256: str | None = None
    cache_state: str
    message: str
    setup_command: str | None = None
    device: Literal["cpu"]
    dtype: Literal["float32"]
    max_batch: Literal[8]


class EmbeddingRecord(BaseModel):
    id: str
    model_id: str
    model_revision: str
    model_signature: str
    weights_sha256: str | None
    mode: Literal["e5", "test-fixture-not-e5"]
    dimension: Literal[384]
    values: list[FiniteFloat] = Field(min_length=384, max_length=384)
    norm: FiniteFloat
    normalized: Literal[True]
    pooling: Literal["attention-mask-mean", "fixture-hash-l2-NOT-E5"]
    dtype: Literal["float32"]
    device: Literal["cpu"]
    kind: Literal["query", "passage"]
    prefix: Literal["query: ", "passage: "]
    input_token_count: int = Field(gt=0, le=512)
    inference_ms: FiniteFloat = Field(ge=0)
    timing_scope: Literal["whole_batch"]
    batch_size: int = Field(ge=1, le=8)
    item_inference_ms: None
    load_ms: FiniteFloat = Field(ge=0)
    source_document_id: str | None
    source_version_id: str | None
    source_chunk_id: str | None
    page_start: int | None
    page_end: int | None
    source_text_sha256: str | None = None
    cached: bool


class EmbeddingBatch(BaseModel):
    records: list[EmbeddingRecord]
    wall_ms: FiniteFloat = Field(ge=0)
    inference_ms: FiniteFloat | None
    timing_note: str


class CosineResult(BaseModel):
    cosine: FiniteFloat = Field(ge=-1, le=1)
    range: list[int]
    metric: Literal["cosine_similarity"]
    meaning: str
    mode: Literal["e5", "test-fixture-not-e5"]
    model_revision: str
    compute_ms: FiniteFloat = Field(ge=0)
