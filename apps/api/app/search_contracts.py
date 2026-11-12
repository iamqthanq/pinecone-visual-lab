"""Whitelisted D05 search grammar; no client vectors, hosts, operators or secrets."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, field_validator, model_validator

from app.vector_contracts import Target


class SearchFilters(BaseModel):
    model_config = ConfigDict(extra="forbid")
    document_id: UUID | None = None
    version_id: UUID | None = None
    source_name: str | None = Field(default=None, min_length=1, max_length=120, strict=True)
    page_from: int | None = Field(default=None, ge=1, le=200, strict=True)
    page_to: int | None = Field(default=None, ge=1, le=200, strict=True)

    @field_validator("source_name")
    @classmethod
    def filename(cls, value):
        if value is not None and (
            not value.strip() or any(ord(c) < 32 or c in '/\\:*?"<>|' for c in value)
        ):
            raise ValueError("Use an exact safe source filename")
        return value

    @model_validator(mode="after")
    def page_range(self):
        if (self.page_from is None) != (self.page_to is None) or (
            self.page_from is not None and self.page_from > self.page_to
        ):
            raise ValueError("Supply both page endpoints, 1 <= from <= to <= 200")
        return self


class SearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(min_length=1, max_length=20_000, strict=True)
    top_k: int = Field(default=5, ge=1, le=10, strict=True)
    target: Target = Field(default_factory=Target)
    filters: SearchFilters = Field(default_factory=SearchFilters)
    compare: bool = Field(default=False, strict=True)
    confirm_live_read: bool = Field(default=False, strict=True)
    confirm_live_compare: bool = Field(default=False, strict=True)

    @field_validator("query")
    @classmethod
    def raw_query(cls, text):
        if not text.strip() or text.lstrip().startswith(("passage:", "query:")):
            raise ValueError("Enter nonblank raw query text without a model prefix")
        return text


class SearchHit(BaseModel):
    id: str
    rank: int
    score: FiniteFloat = Field(ge=-1, le=1)
    document_id: str
    version_id: str
    chunk_id: str
    source_name: str
    page_start: int
    page_end: int
    text: str
    snippet: str
    source_url: str
    metadata: dict


class TraceStage(BaseModel):
    name: str
    ms: FiniteFloat = Field(ge=0)
    status: Literal["measured", "skipped_no_candidates"] = "measured"


class SearchTrace(BaseModel):
    stages: list[TraceStage]
    total_ms: FiniteFloat = Field(ge=0)
    scope: str = "Server handler; excludes HTTP transfer and browser rendering"
    candidate_count: int
    candidate_count_kind: str
    manifest_count: int
    discarded_count: int
    warnings: list[str]


class QueryEmbedding(BaseModel):
    mode: str
    model_id: str
    model_revision: str
    model_signature: str
    prefix: Literal["query: "] = "query: "
    input_token_count: int | None
    inference_ms: FiniteFloat | None


class SearchResponse(BaseModel):
    target: Target
    top_k: int
    filters: SearchFilters
    retrieval_mode: Literal["LOCAL EXACT COSINE", "PINECONE ANN"]
    data_origin: str
    embedding: QueryEmbedding
    score_meaning: str = "Raw cosine similarity [-1,+1], not probability or percentage"
    hits: list[SearchHit]
    comparison: list[SearchHit] | None
    empty_reason: str | None
    trace: SearchTrace
