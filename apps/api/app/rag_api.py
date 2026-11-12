"""Explicit local RAG requests; passive status never contacts Ollama."""

from fastapi import APIRouter, Request

from app.rag_contracts import RagRequest, RagResponse
from app.rag_service import run_chat


def rag_router(service):
    router = APIRouter(prefix="/api/rag")

    @router.get("/status")
    async def status(probe: bool = False):
        return await service.status(probe)

    @router.post("/chat", response_model=RagResponse)
    async def chat(body: RagRequest, request: Request):
        return await run_chat(request, lambda cancel: service.chat(body, cancel))

    return router
