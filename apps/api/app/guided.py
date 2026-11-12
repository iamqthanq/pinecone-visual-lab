"""Explicit local teaching actions reuse D02–D06. Separate ignored receipt journal.

No query/answer/source text in receipts. Reset changes guide metadata only.
No data-deletion operation. No request-controlled target or document ownership.
"""

import hashlib
import json
import math
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from uuid import UUID, uuid4

from app.chunking import chunk_document
from app.documents import DocumentError, now
from app.embedding_math import checked_vector
from app.rag_contracts import RagRequest
from app.search_contracts import SearchFilters, SearchRequest
from app.vector_contracts import Target

SAMPLE = Path(__file__).with_name("demo_sample.txt")
STEPS = ("upload", "extract", "chunks", "embedding", "upsert", "search", "rag")


class GuidedService:
    def __init__(self, vectors, search, rag):
        self.vectors, self.search, self.rag = vectors, search, rag
        self.store, self.embeddings = vectors.store, vectors.embeddings
        self.locks = [threading.Lock() for _ in range(16)]

    @contextmanager
    def db(self):
        self.store.root.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.store.root / "guided-sessions.sqlite3", timeout=5)
        try:
            version = db.execute("PRAGMA user_version").fetchone()[0]
            tables = db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
            if version not in (0, 1) or version == 0 and tables:
                raise DocumentError("Unsupported guided journal; preserve data and inspect.", 503)
            if version == 0:
                db.executescript(
                    "CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,"
                    "data TEXT NOT NULL); PRAGMA user_version=1;"
                )
            with db:
                yield db
        finally:
            db.close()

    def create(self):
        identifier = str(uuid4())
        data = dict(
            id=identifier,
            created_at=now(),
            target=Target(namespace="pvl-demo-" + UUID(identifier).hex).model_dump(),
            document_id=None,
            source_hash=None,
            draft_id=None,
            version_id=None,
            chunk_id=None,
            job_id=None,
            proofs={},
        )
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] >= 128:
                raise DocumentError(
                    "Guided journal limit128 reached; preserve data, inspect manually.", 409
                )
            db.execute("INSERT INTO sessions VALUES(?,?)", (identifier, json.dumps(data)))
        return self.view(data)

    def load(self, identifier):
        identifier = str(UUID(identifier))
        with self.db() as db:
            row = db.execute("SELECT data FROM sessions WHERE id=?", (identifier,)).fetchone()
        if not row:
            raise DocumentError("Guide not found. Start a new guide; existing data remains.", 404)
        data = json.loads(row[0])
        if data["target"] != Target(namespace="pvl-demo-" + UUID(identifier).hex).model_dump():
            raise DocumentError("Guided target mismatch; preserve data and inspect.", 409)
        return data

    def save(self, data):
        encoded = json.dumps(data, allow_nan=False)
        if len(encoded.encode()) > 16384:
            raise DocumentError("Guided receipt limit exceeded.", 413)
        with self.db() as db:
            db.execute("UPDATE sessions SET data=? WHERE id=?", (encoded, data["id"]))

    def lock(self, identifier):
        return self.locks[UUID(identifier).int % len(self.locks)]

    def source(self, data):
        if not data["document_id"]:
            raise DocumentError("Upload the owned demo sample first.", 409)
        doc = self.store.get(data["document_id"])
        raw = self.store.root / f"{UUID(doc['id'])}.txt"
        if (
            doc["kind"] != "txt"
            or raw.is_symlink()
            or raw.resolve().parent != self.store.root
            or not raw.is_file()
            or raw.stat().st_size != doc["size"]
            or hashlib.sha256(raw.read_bytes()).hexdigest() != data["source_hash"]
        ):
            raise DocumentError(
                "Demo source missing/changed. Reset metadata; data was not deleted.", 409
            )
        return doc

    def version(self, data):
        self.source(data)
        if not data["version_id"]:
            raise DocumentError("Preview and explicitly confirm demo chunks first.", 409)
        version = self.store.version(data["document_id"], data["version_id"])
        if version["state"] != "confirmed" or not version["chunks"]:
            raise DocumentError("Confirmed nonempty demo version required.", 409)
        return version

    def active_job(self, data):
        self.version(data)
        if not data["job_id"]:
            raise DocumentError("Preview and ingest the confirmed demo version first.", 409)
        job = self.vectors.job(data["job_id"])
        with self.store.db() as db:
            pointer = db.execute(
                "SELECT job_id FROM vector_active WHERE scope=?", (job["scope"],)
            ).fetchone()
        if (
            not pointer
            or pointer[0] != job["id"]
            or job["state"] != "active"
            or job["verified"] != job["count"]
            or not job["count"]
            or job["checkpoint"] != job["count"]
            or job["target"] != data["target"]
            or job["document_id"] != data["document_id"]
            or job["version_id"] != data["version_id"]
            or job["signature"] != self.embeddings.provider.signature
        ):
            raise DocumentError("Demo manifest not verified ACTIVE; ingest/recheck.", 409)
        return job

    def fetched(self, data):
        job = self.active_job(data)
        records = self.vectors.local.fetch(Target(**data["target"]), job["ids"][:1])
        if len(records) != 1:
            raise DocumentError("Owned demo vector missing; recheck ACTIVE storage.", 409)
        record = records[0]
        values = checked_vector(record["values"])
        expected = dict(
            owner_job=job["id"],
            document_id=data["document_id"],
            version_id=data["version_id"],
            chunk_id=data["chunk_id"],
            model_signature=self.embeddings.provider.signature,
        )
        if (
            abs(math.hypot(*values) - 1) > 1e-5
            or record["id"] != job["ids"][0]
            or any(record["metadata"].get(k) != v for k, v in expected.items())
        ):
            raise DocumentError("Demo fetched vector/provenance mismatch.", 409)
        return records

    def view(self, data):
        done = dict.fromkeys(STEPS, False)
        reason = None
        try:
            doc = self.source(data)
            done["upload"] = bool(data["proofs"].get("upload"))
            done["extract"] = bool(
                done["upload"]
                and data["proofs"].get("extract")
                and any(p["text"].strip() for p in doc["pages"])
            )
            if data["version_id"]:
                version = self.version(data)
                done["chunks"] = bool(done["extract"] and data["proofs"].get("chunks"))
                if data["proofs"].get("embedding") == self.embeddings.provider.signature:
                    with self.store.db() as db:
                        row = db.execute(
                            "SELECT data FROM embeddings WHERE chunk_id=? AND model_signature=?",
                            (data["chunk_id"], self.embeddings.provider.signature),
                        ).fetchone()
                    record = json.loads(row[0]) if row else None
                    chunk = version["chunks"][0]
                    valid_vector = bool(
                        record and abs(math.hypot(*checked_vector(record["values"])) - 1) <= 1e-5
                    )
                    done["embedding"] = bool(
                        done["chunks"]
                        and valid_vector
                        and record["source_document_id"] == data["document_id"]
                        and record["source_chunk_id"] == data["chunk_id"]
                        and record["mode"] == self.embeddings.provider.mode
                        and record["source_text_sha256"]
                        == hashlib.sha256(chunk["text"].encode()).hexdigest()
                        and record["source_version_id"] == data["version_id"]
                    )
                if data["proofs"].get("fetch"):
                    self.fetched(data)
                    done["upsert"] = done["embedding"]
                for name in ("search", "rag"):
                    proof = data["proofs"].get(name)
                    done[name] = bool(
                        done["upsert"]
                        and proof
                        and (name != "rag" or done["search"])
                        and proof["job_id"] == data["job_id"]
                        and proof["version_id"] == data["version_id"]
                        and proof["signature"] == self.embeddings.provider.signature
                    )
        except (DocumentError, OSError, KeyError, ValueError) as error:
            reason = (
                error.message
                if isinstance(error, DocumentError)
                else "Demo evidence unavailable; preserve data and recheck."
            )
        return dict(
            **{k: v for k, v in data.items() if k not in {"source_hash", "proofs"}},
            completed=done,
            source_error=reason,
            embedding_mode=self.embeddings.provider.mode,
            rag_outcome=data["proofs"].get("rag", {}).get("outcome"),
            provenance="Project-authored CC0-1.0 synthetic Vietnamese sample; LOCAL DEMO only",
            reset_policy="Tour metadata/simulation only. No data deletion endpoint.",
        )

    def get(self, identifier):
        return self.view(self.load(identifier))

    def receipt(self, data, **extra):
        return dict(
            job_id=self.active_job(data)["id"],
            version_id=data["version_id"],
            signature=self.embeddings.provider.signature,
            **extra,
        )

    def action(self, identifier, body, cancel=None):
        lock = self.lock(identifier)
        if not lock.acquire(blocking=False):
            raise DocumentError("Guided action busy; retry explicitly.", 429)
        try:
            data = self.load(identifier)
            result = None
            action = body.action
            if action == "reset":
                if data["document_id"]:
                    try:
                        self.source(data)
                    except (DocumentError, OSError):
                        data.update(document_id=None, source_hash=None)
                data.update(draft_id=None, version_id=None, chunk_id=None, job_id=None, proofs={})
            elif action == "upload":
                if not data["document_id"]:
                    raw = SAMPLE.read_bytes()
                    doc = self.store.upload(raw, "pinecone-seminar-cc0.txt", "text/plain")
                    data.update(document_id=doc["id"], source_hash=hashlib.sha256(raw).hexdigest())
                    self.save(data)
                result = self.source(data)
                data["proofs"]["upload"] = True
            elif action == "extract":
                if not self.view(data)["completed"]["upload"]:
                    raise DocumentError("Verify/upload the demo sample first.", 409)
                result = self.source(data)
                if not any(p["text"].strip() for p in result["pages"]):
                    raise DocumentError("No extracted text; OCR unavailable.", 409)
                data["proofs"]["extract"] = True
            elif action == "preview":
                if not self.view(data)["completed"]["extract"]:
                    raise DocumentError("Inspect extracted demo text first.", 409)
                engine = self.embeddings.tokenizer_provider()

                def make(doc, version, version_id):
                    chunks = chunk_document(
                        doc, body.size, body.overlap, engine, version, version_id
                    )
                    if len(chunks) > 16:
                        raise DocumentError("Guided sample cap16 chunks; increase size.", 413)
                    return chunks

                result = self.store.save_preview(
                    data["document_id"], dict(size=body.size, overlap=body.overlap), make
                )
                data["draft_id"] = result["id"]
            elif action == "confirm":
                self.source(data)
                if not body.confirmed or not data["draft_id"]:
                    raise DocumentError("Explicitly confirm the displayed demo preview.", 409)
                if data["version_id"] == data["draft_id"] and data["proofs"].get("chunks"):
                    return dict(session=self.view(data), result=self.version(data))
                result = self.store.confirm(data["document_id"], data["draft_id"])
                data.update(
                    version_id=result["id"], chunk_id=result["chunks"][0]["chunk_id"], job_id=None
                )
                data["proofs"] = {
                    k: v for k, v in data["proofs"].items() if k in ("upload", "extract")
                }
                data["proofs"]["chunks"] = True
            elif action == "embedding":
                self.version(data)
                result = dict(
                    records=self.embeddings.chunks(
                        data["document_id"], data["version_id"], [data["chunk_id"]], cancel
                    )
                )
                data["proofs"]["embedding"] = self.embeddings.provider.signature
            elif action == "ingest_preview":
                if not self.view(data)["completed"]["embedding"]:
                    raise DocumentError("Generate/inspect source embedding first.", 409)
                result = self.vectors.preview(
                    Target(**data["target"]), data["document_id"], data["version_id"]
                )
                data["job_id"] = result["id"]
            elif action == "ingest_step":
                if not body.confirmed or not data["job_id"]:
                    raise DocumentError("Preview and explicitly confirm LOCAL ingestion.", 409)
                job = self.vectors.job(data["job_id"])
                if job["target"] != data["target"] or job["version_id"] != data["version_id"]:
                    raise DocumentError("Demo ingest scope mismatch.", 409)
                result = self.vectors.step(job["id"], job["preview_token"], cancel)
            elif action == "fetch":
                records = self.fetched(data)
                result = dict(
                    records=records,
                    target=data["target"],
                    mode_label="LOCAL DEMO",
                    data_origin="SQLite LocalDemoAdapter",
                )
                data["proofs"]["fetch"] = records[0]["id"]
            elif action == "search":
                if not self.view(data)["completed"]["upsert"]:
                    raise DocumentError("Fetch/verify ACTIVE stored vector first.", 409)
                result = self.search.search(self.request(data, body), cancel)
                data["proofs"].pop("search", None)
                data["proofs"].pop("rag", None)
                if result["hits"]:
                    data["proofs"]["search"] = self.receipt(
                        data, hit_ids=[h["id"] for h in result["hits"]]
                    )
            elif action == "skip_rag":
                if not self.view(data)["completed"]["search"]:
                    raise DocumentError("Run the verified demo search first.", 409)
                data["proofs"]["rag"] = self.receipt(
                    data, outcome="SKIPPED — optional LLM not required"
                )
            else:
                raise DocumentError("Unknown guided action.", 422)
            self.save(data)
            return dict(session=self.view(data), result=result)
        finally:
            lock.release()

    def request(self, data, body):
        return SearchRequest(
            query=body.query,
            top_k=body.top_k,
            target=Target(**data["target"]),
            filters=SearchFilters(
                document_id=data["document_id"], page_from=body.page, page_to=body.page
            ),
        )

    async def rag_action(self, identifier, body, cancel):
        lock = self.lock(identifier)
        if not lock.acquire(blocking=False):
            raise DocumentError("Guided action busy; retry explicitly.", 429)
        try:
            data = self.load(identifier)
            if not self.view(data)["completed"]["search"]:
                raise DocumentError("Run the verified demo search first.", 409)
            request = RagRequest(
                **self.request(data, body).model_dump(), llm_enabled=body.llm_enabled
            )
            result = await self.rag.chat(request, cancel)
            data["proofs"].pop("rag", None)
            if result["retrieval_hits"] and result["status"] in ("answered", "search_only"):
                data["proofs"]["rag"] = self.receipt(
                    data, outcome=result["status"], llm_mode=result["llm_model"]["mode"]
                )
            self.save(data)
            return dict(session=self.view(data), result=result)
        finally:
            lock.release()
