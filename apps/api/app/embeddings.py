"""Reusable E5 service; confirmed-source persistence, no vector database operations."""

import hashlib
import json
import math
import sqlite3
import time
from uuid import NAMESPACE_URL, uuid5

from app.documents import MAX_PAGES, MAX_TEXT, DocumentError, Store
from app.embedding_math import checked_vector, cosine
from app.tokenization import MODEL_LIMIT


class EmbeddingService:
    def __init__(self, store: Store, tokenizer_provider, provider):
        self.store, self.tokenizer_provider, self.provider = store, tokenizer_provider, provider

    def encode(self, texts: list[str], kind: str, cancel=None, *, canonical_source: bool = False):
        if not 1 <= len(texts) <= 8 or kind not in ("query", "passage"):
            raise DocumentError("Use 1–8 raw inputs and kind query or passage.")
        tokenizer = self.tokenizer_provider()
        if tokenizer.mode != self.provider.mode or tokenizer.revision != self.provider.revision:
            raise DocumentError("Tokenizer/model revision or fixture mode mismatch.", 409)
        inputs, prefix = [], kind + ": "
        for text in texts:
            character_limit = MAX_TEXT + 2 * MAX_PAGES if canonical_source else 20_000
            if not text.strip() or len(text) > character_limit:
                raise DocumentError(
                    f"Use nonblank raw text of at most {character_limit:,} characters."
                )
            if not canonical_source and text.lstrip().startswith(("passage:", "query:")):
                raise DocumentError("Enter raw text without query:/passage:; prefix is added once.")
            ids = tokenizer.encode(prefix + text, special=True).ids
            if len(ids) > MODEL_LIMIT:
                raise DocumentError(
                    "Input exceeds 512 tokens including prefix and specials; shorten it."
                )
            inputs.append(ids)
        result = self.provider.encode(inputs, cancel)
        if len(result["values"]) != len(texts):
            raise DocumentError("Provider returned an invalid batch length.", 503)
        records = []
        for text, ids, values in zip(texts, inputs, result["values"], strict=True):
            checked_vector(values)
            norm = math.sqrt(math.fsum(v * v for v in values))
            if abs(norm - 1) > 1e-5:
                raise DocumentError("Provider output failed L2-normalization validation.", 503)
            records.append(
                {
                    "id": str(uuid5(NAMESPACE_URL, self.provider.signature + kind + text)),
                    "model_id": self.provider.model_id,
                    "model_revision": self.provider.revision,
                    "model_signature": self.provider.signature,
                    "weights_sha256": self.provider.weights_hash,
                    "mode": self.provider.mode,
                    "dimension": 384,
                    "values": values,
                    "norm": norm,
                    "normalized": True,
                    "pooling": "attention-mask-mean"
                    if self.provider.mode == "e5"
                    else "fixture-hash-l2-NOT-E5",
                    "dtype": "float32",
                    "device": "cpu",
                    "kind": kind,
                    "prefix": prefix,
                    "input_token_count": len(ids),
                    "inference_ms": result["inference_ms"],
                    "timing_scope": "whole_batch",
                    "batch_size": len(texts),
                    "item_inference_ms": None,
                    "load_ms": result["load_ms"],
                    "source_document_id": None,
                    "source_version_id": None,
                    "source_chunk_id": None,
                    "page_start": None,
                    "page_end": None,
                    "cached": False,
                }
            )
        return records

    def chunks(self, document_id: str, version_id: str, chunk_ids: list[str], cancel=None):
        if not 1 <= len(chunk_ids) <= 8 or len(set(chunk_ids)) != len(chunk_ids):
            raise DocumentError("Choose 1–8 distinct confirmed chunk IDs.")
        version = self.store.version(document_id, version_id)
        if version["state"] != "confirmed":
            raise DocumentError("Only confirmed chunk versions can be embedded.", 409)
        lookup = {chunk["chunk_id"]: chunk for chunk in version["chunks"]}
        if any(identifier not in lookup for identifier in chunk_ids):
            raise DocumentError("A chunk does not belong to this document/version.", 404)
        chunks = [lookup[identifier] for identifier in chunk_ids]
        tokenizer = self.tokenizer_provider()
        for chunk in chunks:
            if (
                chunk["tokenizer_revision"] != self.provider.revision
                or chunk["tokenizer_mode"] != self.provider.mode
                or chunk["model_token_count"]
                != len(tokenizer.encode("passage: " + chunk["text"], special=True).ids)
            ):
                raise DocumentError("Stored chunk tokenizer/budget metadata is incompatible.", 409)
        records, missing = {}, []
        with self.store.db() as db:
            for chunk in chunks:
                row = db.execute(
                    "SELECT data FROM embeddings WHERE chunk_id=? AND model_signature=?",
                    (chunk["chunk_id"], self.provider.signature),
                ).fetchone()
                if row:
                    records[chunk["chunk_id"]] = {**json.loads(row[0]), "cached": True}
                else:
                    missing.append(chunk)
        if missing:
            generated = self.encode(
                [chunk["text"] for chunk in missing], "passage", cancel, canonical_source=True
            )
            try:
                with self.store.db() as db:
                    for chunk, record in zip(missing, generated, strict=True):
                        record.update(
                            {
                                "id": str(
                                    uuid5(
                                        NAMESPACE_URL, chunk["chunk_id"] + self.provider.signature
                                    )
                                ),
                                "source_document_id": document_id,
                                "source_version_id": version_id,
                                "source_chunk_id": chunk["chunk_id"],
                                "page_start": chunk["page_start"],
                                "page_end": chunk["page_end"],
                                "source_text_sha256": hashlib.sha256(
                                    chunk["text"].encode()
                                ).hexdigest(),
                            }
                        )
                        db.execute(
                            "INSERT INTO embeddings VALUES(?,?,?,?) "
                            "ON CONFLICT(chunk_id,model_signature) DO NOTHING",
                            (
                                record["id"],
                                chunk["chunk_id"],
                                self.provider.signature,
                                json.dumps(record, allow_nan=False),
                            ),
                        )
                        saved = db.execute(
                            "SELECT data FROM embeddings WHERE id=?", (record["id"],)
                        ).fetchone()
                        records[chunk["chunk_id"]] = json.loads(saved[0])
            except sqlite3.IntegrityError as failure:
                raise DocumentError(
                    "Source was deleted during inference. Select a source again.", 409
                ) from failure
        return [records[identifier] for identifier in chunk_ids]


def compare(left: dict, right: dict):
    keys = ("model_id", "model_revision", "model_signature", "mode")
    if any(left[key] != right[key] for key in keys):
        raise DocumentError("Cosine requires the same model revision/signature and mode.", 409)
    started = time.perf_counter()
    score = cosine(left["values"], right["values"])
    return {
        "cosine": score,
        "range": [-1, 1],
        "metric": "cosine_similarity",
        "meaning": "Similarity, not probability. This is not a Pinecone score.",
        "mode": left["mode"],
        "model_revision": left["model_revision"],
        "compute_ms": (time.perf_counter() - started) * 1000,
    }
