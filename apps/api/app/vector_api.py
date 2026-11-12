"""Explicit vector APIs; no startup calls, client hosts/keys or automatic cloud writes."""

import os
import threading
import time
from typing import Literal
from uuid import UUID, uuid4

import anyio
from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field, FiniteFloat

from app.documents import DocumentError
from app.vector_contracts import Target, VectorError


class Inputs(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Browse(Inputs):
    target: Target
    confirm_live_read: bool = False


class CatalogRequest(Inputs):
    mode: Literal["local", "live"] = "local"
    confirm_live_read: bool = False


class CreateIndex(Browse):
    cloud: Literal["local", "aws", "gcp", "azure"] = "local"
    region: str = Field(default="this-device", pattern=r"^[a-z0-9-]{1,40}$")


class Confirm(Inputs):
    confirmed: Literal[True]


class CreateConfirm(Confirm):
    preview_id: UUID


class PreviewIngest(Browse):
    document_id: UUID
    version_id: UUID


class Step(Confirm):
    preview_token: str = Field(min_length=64, max_length=64)


class Listing(Browse):
    cursor: str | None = Field(default=None, max_length=4096)
    limit: int = Field(default=25, ge=1, le=100, strict=True)


class Fetch(Browse):
    ids: list[str] = Field(min_length=1, max_length=8)


class FetchedVector(BaseModel):
    id: str
    values: list[FiniteFloat] = Field(min_length=384, max_length=384)
    metadata: dict


class Fetched(BaseModel):
    target: Target
    mode_label: str
    data_origin: str
    records: list[FetchedVector]


class IdPage(BaseModel):
    target: Target
    ids: list[str]
    next: str | None
    data_origin: str


async def run_step(request: Request, action):
    cancel = threading.Event()
    failure = None

    async def watch():
        while True:
            if await request.is_disconnected():
                cancel.set()
                return
            await anyio.sleep(0.1)

    async with anyio.create_task_group() as group:
        group.start_soon(watch)
        try:
            result = await anyio.to_thread.run_sync(lambda: action(cancel))
        except DocumentError as error:
            failure = error
        finally:
            group.cancel_scope.cancel()
    if failure:
        raise failure
    return result


def vector_router(service):
    router = APIRouter(prefix="/api/vector-store")
    previews = {}

    def explicit_read(target, confirmed):
        if target.mode == "live" and not confirmed:
            raise VectorError("explicit_live_read_confirmation_required", 403)
        return service.adapter(target)

    @router.get("/status")
    def status():
        return dict(
            local_available=True,
            live_key_configured=bool(os.getenv("PINECONE_API_KEY")),
            live_disabled=os.getenv("PVL_DISABLE_CLOUD") == "1",
            sdk_version="10.3.0",
            api_version="2026-07",
            project=os.getenv("PVL_PINECONE_PROJECT", ""),
            embedding_mode=service.embeddings.provider.mode,
            live_verification="LIVE NOT VERIFIED — AWAITING USER AUTHORIZATION",
        )

    @router.post("/indexes/list")
    def indexes(body: CatalogRequest):
        adapter = explicit_read(Target(mode=body.mode), body.confirm_live_read)
        return dict(mode=body.mode, indexes=adapter.indexes())

    @router.post("/indexes/describe")
    def describe(body: Browse):
        return explicit_read(body.target, body.confirm_live_read).describe(body.target.index)

    @router.post("/indexes/create/preview")
    def create_preview(body: CreateIndex):
        adapter = explicit_read(body.target, body.confirm_live_read)
        if any(item["name"] == body.target.index for item in adapter.indexes()):
            raise VectorError("duplicate_index", 409)
        if (body.target.mode == "local") != (body.cloud == "local"):
            raise VectorError("mode_cloud_mismatch", 422)
        for key in list(previews):
            if previews[key][0] < time.time():
                del previews[key]
        if len(previews) >= 100:
            raise VectorError("too_many_previews_try_later", 429)
        identifier = str(uuid4())
        previews[identifier] = (time.time() + 300, body)
        return dict(
            preview_id=identifier,
            target=body.target,
            cloud=body.cloud,
            region=body.region,
            project=os.getenv("PVL_PINECONE_PROJECT", "")
            if body.target.mode == "live"
            else "local",
            dimension=384,
            metric="cosine",
            type="dense BYOV",
            risk="Check plan/quota/cost in Pinecone console. Separate server approval required."
            if body.target.mode == "live"
            else "Local SQLite index only; no cloud traffic.",
        )

    @router.post("/indexes/create/confirm")
    def create_confirm(body: CreateConfirm):
        value = previews.get(str(body.preview_id))
        if not value or value[0] < time.time():
            raise VectorError("preview_expired_repeat_preview", 409)
        spec = value[1]
        adapter = service.adapter(spec.target)
        info = adapter.create(spec.target.index, spec.cloud, spec.region)
        del previews[str(body.preview_id)]
        for _ in range(3):
            if info["ready"]:
                break
            time.sleep(0.25)
            info = adapter.describe(spec.target.index)
        return info

    @router.post("/namespaces")
    def namespaces(body: Browse):
        return dict(
            target=body.target,
            namespaces=explicit_read(body.target, body.confirm_live_read).namespaces(
                body.target.index
            ),
        )

    @router.post("/ingest/preview")
    def preview(body: PreviewIngest):
        explicit_read(body.target, body.confirm_live_read)
        return service.preview(body.target, str(body.document_id), str(body.version_id))

    @router.get("/jobs")
    def jobs(
        mode: Literal["local", "live"] = "local", index: str = "local-e5", namespace: str = ""
    ):
        try:
            target = Target(mode=mode, index=index, namespace=namespace)
        except ValueError:
            raise VectorError("invalid_target", 422) from None
        return dict(jobs=service.jobs(target))

    @router.get("/jobs/{identifier}")
    def job(identifier: UUID):
        return service.job(str(identifier))

    @router.post("/jobs/{identifier}/step")
    async def step(identifier: UUID, body: Step, request: Request):
        return await run_step(
            request, lambda cancel: service.step(str(identifier), body.preview_token, cancel)
        )

    @router.post("/jobs/{identifier}/delete-preview")
    def delete_preview(identifier: UUID):
        return service.delete_preview(str(identifier))

    @router.post("/deletions/{identifier}/step")
    def delete_step(identifier: UUID, body: Confirm):
        return service.delete_step(str(identifier))

    @router.post("/records/list", response_model=IdPage)
    def list_ids(body: Listing):
        page = explicit_read(body.target, body.confirm_live_read).list_ids(
            body.target, body.cursor, body.limit
        )
        return dict(
            target=body.target,
            **page,
            data_origin="SQLite" if body.target.mode == "local" else "Pinecone SDK",
        )

    @router.post("/records/fetch", response_model=Fetched)
    def fetch(body: Fetch):
        if len(set(body.ids)) != len(body.ids) or any(
            not i or len(i) > 128 or any(ord(c) < 32 for c in i) for i in body.ids
        ):
            raise VectorError("invalid_or_duplicate_vector_ids", 422)
        records = explicit_read(body.target, body.confirm_live_read).fetch(body.target, body.ids)
        return dict(
            target=body.target,
            records=records,
            mode_label="LOCAL DEMO" if body.target.mode == "local" else "LIVE PINECONE",
            data_origin="SQLite adapter fetch"
            if body.target.mode == "local"
            else "Pinecone SDK fetch",
        )

    return router
