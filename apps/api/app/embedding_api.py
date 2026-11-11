"""Typed local embedding API with disconnect cancellation; never downloads assets."""

import threading
import time
from typing import Literal
from uuid import UUID

import anyio
from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field, FiniteFloat

from app.documents import DocumentError
from app.embedding_contracts import CosineResult, EmbeddingBatch, ModelStatus
from app.embeddings import EmbeddingService, compare


class QueryBatch(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    texts: list[str] = Field(min_length=1, max_length=8)
    kind: Literal["query", "passage"] = "query"


class ChunkBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    document_id: UUID
    version_id: UUID
    chunk_ids: list[UUID] = Field(min_length=1, max_length=8)


class VectorOperand(BaseModel):
    model_config = ConfigDict(extra="ignore", strict=True)
    model_id: str = Field(max_length=200)
    model_revision: str = Field(max_length=100)
    model_signature: str = Field(max_length=300)
    mode: Literal["e5", "test-fixture-not-e5"]
    values: list[FiniteFloat] = Field(min_length=384, max_length=384)


class Comparison(BaseModel):
    left: VectorOperand
    right: VectorOperand


async def cancellable(request: Request, operation):
    cancel = threading.Event()

    async def watch_disconnect():
        while True:
            if await request.is_disconnected():
                cancel.set()
                return
            await anyio.sleep(0.1)

    started = time.perf_counter()
    failure = None
    async with anyio.create_task_group() as group:
        group.start_soon(watch_disconnect)
        try:
            records = await anyio.to_thread.run_sync(lambda: operation(cancel))
        except DocumentError as error:
            failure = error
        finally:
            group.cancel_scope.cancel()
    if failure is not None:
        raise failure
    return {
        "records": records,
        "wall_ms": (time.perf_counter() - started) * 1000,
        "inference_ms": next((r["inference_ms"] for r in records if not r["cached"]), None),
        "timing_note": "Inference is measured for the whole uncached batch; cache hits retain "
        "their original measurement. No invented per-item timing.",
    }


def embedding_router(service: EmbeddingService):
    router = APIRouter(prefix="/api/embeddings")

    @router.get("/status", response_model=ModelStatus)
    def status():
        return service.provider.status()

    @router.post("/encode", response_model=EmbeddingBatch)
    async def encode(body: QueryBatch, request: Request):
        return await cancellable(
            request, lambda cancel: service.encode(body.texts, body.kind, cancel)
        )

    @router.post("/chunks", response_model=EmbeddingBatch)
    async def chunks(body: ChunkBatch, request: Request):
        return await cancellable(
            request,
            lambda cancel: service.chunks(
                str(body.document_id), str(body.version_id), list(map(str, body.chunk_ids)), cancel
            ),
        )

    @router.post("/compare", response_model=CosineResult)
    def compare_vectors(body: Comparison):
        return compare(body.left.model_dump(), body.right.model_dump())

    return router
