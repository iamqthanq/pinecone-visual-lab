"""D06: no request-controlled endpoints/runtime, no persistent transcript/history."""

from typing import Literal

from pydantic import BaseModel, Field, FiniteFloat

from app.ollama_local import MODELS
from app.search_contracts import SearchHit, SearchRequest, SearchResponse


class RagRequest(SearchRequest):
    llm_enabled: bool = Field(default=True, strict=True)
    model: Literal["qwen2.5:1.5b", "qwen2.5:3b"] = MODELS[0]
    # Comparison belongs to Semantic Search. Never issue a hidden second retrieval.
    compare: Literal[False] = False
    confirm_live_compare: Literal[False] = False


class ContextSource(BaseModel):
    source_id: str
    hit: SearchHit
    text: str  # exact portion actually sent, not the full retrieved hit if truncated
    truncated: bool
    cited: bool = False


class RagStage(BaseModel):
    name: str
    ms: FiniteFloat = Field(ge=0)


class RagTrace(BaseModel):
    total_ms: FiniteFloat = Field(ge=0)
    stages: list[RagStage]
    warnings: list[str]
    scope: str = "Measured server orchestration; nested D05 Search Trace is reported separately"


class ContextBudget(BaseModel):
    max_prompt_bytes: int
    prompt_bytes: int
    num_ctx: int
    reply_token_reserve: int
    framing_token_reserve: int
    conservative_prompt_token_estimate: int
    estimate_kind: str
    request_attempted: bool
    warnings: list[str]


class LLMModel(BaseModel):
    requested_model: Literal["qwen2.5:1.5b", "qwen2.5:3b"]
    actual_model: Literal["qwen2.5:1.5b", "qwen2.5:3b"] | None
    mode: Literal["local-ollama", "mock-ollama-not-real-llm"]
    usage: dict[str, int] | None


class RagResponse(BaseModel):
    status: Literal[
        "answered",
        "insufficient_context",
        "search_only",
        "llm_unavailable",
        "timeout",
        "invalid_citations",
        "stale_sources",
    ]
    answer: str | None
    no_answer_reason: str | None
    used_sources: list[ContextSource]
    retrieval_hits: list[SearchHit]
    assembled_context: str
    context_budget: ContextBudget
    llm_model: LLMModel
    search: SearchResponse
    trace: RagTrace
    grounding_policy: str = (
        "Verified verbatim excerpts, not independently verified truth or relevance."
    )
