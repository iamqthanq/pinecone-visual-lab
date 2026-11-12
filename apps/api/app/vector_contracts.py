"""D04 contracts: explicit target, real adapter origin, bounded records and safe errors."""

import json
import math
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.documents import DocumentError
from app.embedding_math import checked_vector


class VectorError(DocumentError):
    def __init__(self, code: str, status: int = 409, retryable: bool = False):
        super().__init__(
            f"Vector operation: {code}. Check target/settings and retry safely.", status
        )
        self.code, self.retryable = code, retryable


class Target(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    mode: Literal["local", "live"] = "local"
    index: str = Field(default="local-e5", pattern=r"^[a-z0-9](?:[a-z0-9-]{0,43}[a-z0-9])?$")
    namespace: str = Field(default="", max_length=64, pattern=r"^[a-zA-Z0-9_.-]*$")

    def key(self) -> str:
        return json.dumps(self.model_dump(), sort_keys=True, separators=(",", ":"))


class Record(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    id: str = Field(min_length=1, max_length=128)
    values: list[float] = Field(min_length=384, max_length=384)
    metadata: dict

    @field_validator("values")
    @classmethod
    def finite_unit(cls, values):
        try:
            checked_vector(values)
        except DocumentError:
            raise ValueError("Expected a nonzero finite 384D vector") from None
        if abs(math.hypot(*values) - 1) > 1e-5:
            raise ValueError("Require a finite unit-normalized 384D vector")
        return values

    @field_validator("metadata")
    @classmethod
    def flat_metadata(cls, data):
        if len(json.dumps(data, allow_nan=False).encode()) > 8192 or any(
            not isinstance(k, str)
            or not isinstance(v, (str, bool, int, float))
            or isinstance(v, float)
            and not math.isfinite(v)
            for k, v in data.items()
        ):
            raise ValueError("Require flat metadata under 8 KiB")
        required = {
            "owner_job",
            "document_id",
            "version_id",
            "chunk_id",
            "model_signature",
            "model_revision",
            "embedding_mode",
            "page_start",
            "page_end",
        }
        if not required <= data.keys():
            raise ValueError("Incomplete vector provenance")
        return data


def records_checked(records: list[dict]):
    if not 1 <= len(records) <= 8:
        raise VectorError("batch_size_1_to_8", 422)
    try:
        identifiers = {r["id"] for r in records}
        payload_size = len(json.dumps(records, allow_nan=False).encode())
    except (KeyError, TypeError, ValueError):
        raise VectorError("invalid_vector_or_metadata", 422) from None
    if len(identifiers) != len(records):
        raise VectorError("duplicate_ids", 422)
    if payload_size > 128 * 1024:
        raise VectorError("batch_payload_too_large", 413)
    for record in records:
        try:
            Record.model_validate(record)
        except ValueError:
            raise VectorError("invalid_vector_or_metadata", 422) from None


class VectorStore(Protocol):
    mode: str

    def indexes(self) -> list[dict]: ...
    def describe(self, name: str) -> dict: ...
    def create(self, name: str, cloud: str, region: str) -> dict: ...
    def namespaces(self, name: str) -> list[dict]: ...
    def upsert(self, target: Target, records: list[dict]) -> None: ...
    def fetch(self, target: Target, ids: list[str]) -> list[dict]: ...
    def list_ids(self, target: Target, cursor: str | None, limit: int) -> dict: ...
    def delete(self, target: Target, ids: list[str], owner: str) -> None: ...
