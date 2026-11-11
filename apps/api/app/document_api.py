"""Document routes, request caps, preview/confirm/export semantics."""

import json
from collections.abc import Callable
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field

from app.chunking import chunk_document
from app.documents import MAX_BYTES, DocumentError, Store
from app.tokenization import TokenizerEngine, real_tokenizer


class ChunkConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    size: int = Field(default=300, gt=0, le=512)
    overlap: int = Field(default=50, ge=0)


class UploadLimit:
    """Bound the body before the multipart parser can spool unbounded input."""

    def __init__(self, app, max_bytes: int = MAX_BYTES):
        self.app, self.limit = app, max_bytes + 64 * 1024

    async def __call__(self, scope, receive, send):
        if (
            scope["type"] != "http"
            or scope.get("method") != "POST"
            or scope.get("path") != "/api/documents"
        ):
            return await self.app(scope, receive, send)
        blocks, size = [], 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            block = message.get("body", b"")
            size += len(block)
            if size > self.limit:
                response = JSONResponse({"detail": "Upload body exceeds the file size limit."}, 413)
                return await response(scope, receive, send)
            blocks.append(block)
            if not message.get("more_body", False):
                break
        sent = False

        async def replay():
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": b"".join(blocks), "more_body": False}
            return await receive()

        return await self.app(scope, replay, send)


def document_router(
    store: Store, engine_provider: Callable[[], TokenizerEngine], max_bytes: int = MAX_BYTES
) -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.get("/tokenizer")
    def tokenizer_status():
        try:
            return engine_provider().info()
        except DocumentError as error:
            return {"available": False, "mode": "unavailable", "message": error.message}

    @router.get("/documents")
    def list_documents():
        return {"documents": store.list(), "max_file_bytes": max_bytes}

    @router.post("/documents", status_code=201)
    def upload(file: Annotated[UploadFile, File()]):
        try:
            blocks, size = [], 0
            while block := file.file.read(1024 * 1024):
                size += len(block)
                if size > max_bytes:
                    raise DocumentError(f"File exceeds {max_bytes // 1024:,} KiB limit.", 413)
                blocks.append(block)
            return store.upload(b"".join(blocks), file.filename or "", file.content_type or "")
        finally:
            file.file.close()

    @router.get("/documents/{identifier}")
    def document(identifier: UUID):
        return store.get(str(identifier))

    @router.delete("/documents/{identifier}", status_code=204)
    def delete(identifier: UUID, confirm: bool = False):
        if not confirm:
            raise DocumentError("Explicit delete confirmation is required.", 409)
        store.delete(str(identifier))
        return Response(status_code=204)

    @router.post("/documents/{identifier}/preview", status_code=201)
    def preview(identifier: UUID, config: ChunkConfig):
        engine = engine_provider()
        if config.overlap >= config.size:
            raise DocumentError("Overlap must be smaller than chunk size.")
        return store.save_preview(
            str(identifier),
            config.model_dump(),
            lambda doc, number, version_id: chunk_document(
                doc, config.size, config.overlap, engine, number, version_id
            ),
        )

    @router.get("/documents/{identifier}/versions/{version_id}")
    def version(identifier: UUID, version_id: UUID):
        return store.version(str(identifier), str(version_id))

    @router.post("/documents/{identifier}/versions/{version_id}/confirm")
    def confirm_version(identifier: UUID, version_id: UUID):
        return store.confirm(str(identifier), str(version_id))

    @router.get("/documents/{identifier}/versions/{version_id}/export")
    def export(identifier: UUID, version_id: UUID):
        saved = store.version(str(identifier), str(version_id))
        if saved["state"] != "confirmed":
            raise DocumentError("Confirm this preview before exporting JSONL.", 409)
        content = "".join(json.dumps(chunk, ensure_ascii=False) + "\n" for chunk in saved["chunks"])
        return Response(
            content.encode("utf-8"),
            media_type="application/x-ndjson",
            headers={"Content-Disposition": f'attachment; filename="chunks-{version_id}.jsonl"'},
        )

    return router


DEFAULT_ENGINE = real_tokenizer
