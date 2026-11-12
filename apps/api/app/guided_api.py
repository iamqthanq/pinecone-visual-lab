"""No target/host/document ownership override and no delete operation."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.rag_service import run_chat
from app.search_contracts import SearchRequest
from app.vector_api import run_step


class GuidedAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal[
        "reset",
        "upload",
        "extract",
        "preview",
        "confirm",
        "embedding",
        "ingest_preview",
        "ingest_step",
        "fetch",
        "search",
        "skip_rag",
        "rag",
    ]
    size: int = Field(default=300, ge=64, le=400, strict=True)
    overlap: int = Field(default=50, ge=0, le=399, strict=True)
    confirmed: bool = Field(default=False, strict=True)
    query: str = Field(
        default="Tìm kiếm vector sử dụng embedding và cosine như thế nào?",
        min_length=1,
        max_length=2000,
        strict=True,
    )
    top_k: int = Field(default=3, ge=1, le=10, strict=True)
    page: int | None = Field(default=None, ge=1, le=200, strict=True)
    llm_enabled: bool = Field(default=False, strict=True)

    @field_validator("query")
    @classmethod
    def raw_query(cls, value):
        return SearchRequest.raw_query(value)


def guided_router(service):
    router = APIRouter(prefix="/api/guided")

    @router.post("/sessions", status_code=201)
    def create():
        return service.create()

    @router.get("/sessions/{identifier}")
    def get(identifier: UUID):
        return service.get(str(identifier))

    @router.post("/sessions/{identifier}/actions")
    async def action(identifier: UUID, body: GuidedAction, request: Request):
        if body.action == "rag":
            return await run_chat(
                request, lambda cancel: service.rag_action(str(identifier), body, cancel)
            )
        return await run_step(request, lambda cancel: service.action(str(identifier), body, cancel))

    return router
