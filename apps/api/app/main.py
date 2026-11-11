"""D01 exposes backend health only. Later lab capabilities are explicitly planned."""

import os
from datetime import UTC, datetime
from typing import Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DEFAULT_ORIGINS = (
    "http://127.0.0.1:5173,http://localhost:5173,"
    "http://127.0.0.1:4173,http://localhost:4173"
)
origins = [value.strip() for value in os.getenv("PVL_CORS_ORIGINS", DEFAULT_ORIGINS).split(",")
           if value.strip()]
if not origins or "*" in origins:
    raise ValueError("PVL_CORS_ORIGINS must contain explicit browser origins")

app = FastAPI(title="Pinecone Visual Lab", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["Accept", "Content-Type"],
)


class Health(BaseModel):
    status: Literal["ok"] = "ok"
    service: Literal["pinecone-visual-lab-api"] = "pinecone-visual-lab-api"
    version: Literal["0.1.0"] = "0.1.0"
    phase: Literal["D01"] = "D01"
    timestamp: datetime
    pinecone: Literal["not_configured"] = "not_configured"
    embedding: Literal["not_loaded"] = "not_loaded"


@app.get("/api/health", response_model=Health)
def health() -> Health:
    """Fresh timestamp from this process, without credentials or invented storage counts."""
    return Health(timestamp=datetime.now(UTC))
