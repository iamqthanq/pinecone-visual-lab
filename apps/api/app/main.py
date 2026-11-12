"""D07 labs and explicit local guided actions; no cloud startup or model downloads."""

import os
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.document_api import UploadLimit, document_router
from app.documents import MAX_BYTES, DocumentError, Store
from app.embedding_api import embedding_router
from app.embedding_provider import TorchProvider
from app.embeddings import EmbeddingService
from app.guided import GuidedService
from app.guided_api import guided_router
from app.ollama_local import OllamaLocalProvider
from app.rag_api import rag_router
from app.rag_service import RagService
from app.search_api import search_router
from app.search_service import SearchService
from app.tokenization import real_tokenizer
from app.vector_api import vector_router
from app.vector_live import PineconeLiveAdapter
from app.vector_local import LocalDemoAdapter
from app.vector_service import VectorService

DEFAULT_ORIGINS = (
    "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173"
)
origins = [
    value.strip()
    for value in os.getenv("PVL_CORS_ORIGINS", DEFAULT_ORIGINS).split(",")
    if value.strip()
]
if not origins or "*" in origins:
    raise ValueError("PVL_CORS_ORIGINS must contain explicit browser origins")


class Health(BaseModel):
    status: Literal["ok"] = "ok"
    service: Literal["pinecone-visual-lab-api"] = "pinecone-visual-lab-api"
    version: Literal["0.7.0"] = "0.7.0"
    phase: Literal["D07"] = "D07"
    rag: Literal["optional_local"] = "optional_local"
    search: Literal["available"] = "available"
    timestamp: datetime
    pinecone: str = "not_configured"
    vector_store: Literal["local_available"] = "local_available"
    embedding: str = "not_loaded"
    embedding_mode: str = "e5"
    documents: Literal["available"] = "available"


def create_app(
    data_dir: Path | None = None,
    engine_provider=real_tokenizer,
    max_bytes: int | None = None,
    embedding_provider=None,
    live_adapter=None,
    llm_provider=None,
) -> FastAPI:
    root = data_dir or Path(
        os.getenv("PVL_DATA_DIR", Path(__file__).resolve().parents[3] / ".data")
    )
    cap = max_bytes or int(os.getenv("PVL_MAX_UPLOAD_BYTES", str(MAX_BYTES)))
    if not 0 < cap <= 50 * 1024 * 1024:
        raise ValueError("Upload cap must be between 1 byte and 50 MiB")
    provider = embedding_provider or TorchProvider()
    live = live_adapter or PineconeLiveAdapter()
    llm = llm_provider or OllamaLocalProvider()

    @asynccontextmanager
    async def lifespan(_app):
        yield
        provider.close()
        live.close()
        await llm.close()

    app = FastAPI(title="Pinecone Visual Lab", version="0.7.0", lifespan=lifespan)
    app.add_middleware(UploadLimit, max_bytes=cap)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Accept", "Content-Type"],
    )

    @app.exception_handler(DocumentError)
    async def document_error(_request, error: DocumentError):
        return JSONResponse({"detail": error.message}, status_code=error.status)

    @app.exception_handler(RequestValidationError)
    async def invalid_input(_request, _error):
        # Do not echo query text/vectors (including JSON NaN) into validation errors.
        return JSONResponse(
            {"detail": "Invalid fields: check types, IDs, limits and finite vector values."},
            status_code=422,
        )

    @app.get("/api/health", response_model=Health)
    def health() -> Health:
        status = provider.status()
        return Health(
            timestamp=datetime.now(UTC),
            embedding=status["state"],
            embedding_mode=status["mode"],
            pinecone="configured_not_verified"
            if os.getenv("PINECONE_API_KEY")
            else "not_configured",
        )

    store = Store(root)
    app.include_router(document_router(store, engine_provider, cap))
    embeddings = EmbeddingService(store, engine_provider, provider)
    app.include_router(embedding_router(embeddings))
    vectors = VectorService(store, embeddings, LocalDemoAdapter(store), live)
    app.state.vector_service = vectors
    app.include_router(vector_router(vectors))
    search = SearchService(vectors)
    app.state.search_service = search
    app.include_router(search_router(search))
    rag = RagService(search, llm)
    app.state.rag_service = rag
    app.include_router(rag_router(rag))
    guided = GuidedService(vectors, search, rag)
    app.state.guided_service = guided
    app.include_router(guided_router(guided))
    return app


app = create_app()
