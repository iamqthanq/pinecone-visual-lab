"""D02 local document lab; no embedding model or cloud operations."""

import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.document_api import UploadLimit, document_router
from app.documents import MAX_BYTES, DocumentError, Store
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
    version: Literal["0.2.0"] = "0.2.0"
    phase: Literal["D02"] = "D02"
    timestamp: datetime
    pinecone: Literal["not_configured"] = "not_configured"
    embedding: Literal["not_loaded"] = "not_loaded"
    documents: Literal["available"] = "available"


def create_app(
    data_dir: Path | None = None, engine_provider=real_tokenizer, max_bytes: int | None = None
) -> FastAPI:
    root = data_dir or Path(
        os.getenv("PVL_DATA_DIR", Path(__file__).resolve().parents[3] / ".data")
    )
    cap = max_bytes or int(os.getenv("PVL_MAX_UPLOAD_BYTES", str(MAX_BYTES)))
    if not 0 < cap <= 50 * 1024 * 1024:
        raise ValueError("Upload cap must be between 1 byte and 50 MiB")
    app = FastAPI(title="Pinecone Visual Lab", version="0.2.0")
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

    @app.get("/api/health", response_model=Health)
    def health() -> Health:
        return Health(timestamp=datetime.now(UTC))

    app.include_router(document_router(Store(root), engine_provider, cap))
    return app


app = create_app()
