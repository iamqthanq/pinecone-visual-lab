"""Explicit search/read endpoints; body validation omits private inputs on errors."""

from fastapi import APIRouter, Request
from pydantic import Field

from app.search_contracts import SearchRequest, SearchResponse
from app.vector_api import Browse, CatalogRequest, run_step
from app.vector_contracts import Target


class ReadCatalog(CatalogRequest):
    confirm_live_read: bool = Field(default=False, strict=True)


class ReadBrowse(Browse):
    confirm_live_read: bool = Field(default=False, strict=True)


def search_router(service):
    router = APIRouter(prefix="/api/search")

    @router.get("/status")
    def status():
        return service.status()

    @router.post("/indexes")
    def indexes(body: ReadCatalog):
        target = Target(mode=body.mode)
        service.authorize(target, body.confirm_live_read)
        return dict(
            indexes=service.vectors.live.indexes()
            if body.mode == "live"
            else service.status()["local_indexes"]
        )

    @router.post("/namespaces")
    def namespaces(body: ReadBrowse):
        return dict(namespaces=service.namespaces(body.target, body.confirm_live_read))

    @router.post("", response_model=SearchResponse)
    async def search(body: SearchRequest, request: Request):
        return await run_step(request, lambda cancel: service.search(body, cancel))

    return router
