"""D03 local document/embedding labs; no cloud operations or automatic downloads."""

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
from app.tokenization import real_tokenizer

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
    version: Literal["0.3.0"] = "0.3.0"
    phase: Literal["D03"] = "D03"
    timestamp: datetime
    pinecone: Literal["not_configured"] = "not_configured"
    embedding: str = "not_loaded"
    embedding_mode: str = "e5"
    documents: Literal["available"] = "available"


def create_app(
    data_dir: Path | None = None,
    engine_provider=real_tokenizer,
    max_bytes: int | None = None,
    embedding_provider=None,
) -> FastAPI:
    root = data_dir or Path(
        os.getenv("PVL_DATA_DIR", Path(__file__).resolve().parents[3] / ".data")
    )
    cap = max_bytes or int(os.getenv("PVL_MAX_UPLOAD_BYTES", str(MAX_BYTES)))
    if not 0 < cap <= 50 * 1024 * 1024:
        raise ValueError("Upload cap must be between 1 byte and 50 MiB")
    provider = embedding_provider or TorchProvider()

    @asynccontextmanager
    async def lifespan(_app):
        yield
        provider.close()

    app = FastAPI(title="Pinecone Visual Lab", version="0.3.0", lifespan=lifespan)
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
            {
                "detail": "Invalid fields: check types, IDs, limits and finite vector values."
            },
            status_code=422,
        )

    @app.get("/api/health", response_model=Health)
    def health() -> Health:
        status = provider.status()
        return Health(
            timestamp=datetime.now(UTC), embedding=status["state"], embedding_mode=status["mode"]
        )

    store = Store(root)
    app.include_router(document_router(store, engine_provider, cap))
    app.include_router(embedding_router(EmbeddingService(store, engine_provider, provider)))
    return app


app = create_app()
