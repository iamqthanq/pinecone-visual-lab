"""Read-only ACTIVE snapshot -> SQL prefilter -> exact/ANN ranking -> original source.

No cached D03 vector is used as a stored search result. No automatic cloud calls.
"""

import json
import math
import os
import sqlite3
import threading
import time
from contextlib import contextmanager
from urllib.parse import urlencode

from app.documents import DocumentError
from app.embedding_math import checked_vector, cosine
from app.search_contracts import SearchFilters, SearchResponse
from app.vector_contracts import VectorError

ACTIVE = """
FROM vector_active a JOIN vector_jobs j ON j.id=a.job_id AND j.scope=a.scope
JOIN vector_items i ON i.job_id=j.id
"""
VERIFIED = """
j.target=? AND j.signature=? AND j.state='active' AND j.checkpoint>0
AND j.verified=j.checkpoint
AND j.verified=(SELECT COUNT(*) FROM vector_items n WHERE n.job_id=j.id)
"""
SOURCES = """
JOIN versions v ON v.id=j.version_id AND v.document_id=j.document_id AND v.state='confirmed'
JOIN chunks c ON c.id=i.chunk_id AND c.version_id=v.id
JOIN documents d ON d.id=j.document_id
"""


def live_filter(rows, filters, provider):
    """A bounded correlated generation/chunk allowlist BEFORE provider Top-K."""
    groups = {}
    for row in rows:
        groups.setdefault((row["job_id"], row["document_id"], row["version_id"]), []).append(
            row["chunk_id"]
        )
    if len(groups) > 32 or len(rows) > 512:
        raise VectorError("live_filter_cap_narrow_document_or_page", 413)
    clauses = [
        {
            "$or": [
                {
                    "$and": [
                        {"owner_job": {"$eq": job}},
                        {"document_id": {"$eq": doc}},
                        {"version_id": {"$eq": version}},
                        {"chunk_id": {"$in": ids}},
                    ]
                }
                for (job, doc, version), ids in sorted(groups.items())
            ]
        },
        {"model_signature": {"$eq": provider.signature}},
        {"model_revision": {"$eq": provider.revision}},
        {"model_id": {"$eq": provider.model_id}},
        {"embedding_mode": {"$eq": provider.mode}},
    ]
    for key in ("document_id", "version_id", "source_name"):
        value = getattr(filters, key)
        if value is not None:
            clauses.append({key: {"$eq": str(value)}})
    if filters.page_from is not None:
        clauses.extend(
            [{"page_start": {"$lte": filters.page_to}}, {"page_end": {"$gte": filters.page_from}}]
        )
    result = {"$and": clauses}
    if len(json.dumps(result).encode()) > 32768:
        raise VectorError("live_filter_bytes_cap_narrow_source", 413)
    return result


class Measurement:
    def __init__(self):
        self.started = time.perf_counter()
        self.stages, self.warnings, self.discarded = [], [], 0

    @contextmanager
    def stage(self, name, skipped=False):
        begin = time.perf_counter()
        yield
        self.stages.append(
            dict(
                name=name,
                ms=(time.perf_counter() - begin) * 1000,
                status="skipped_no_candidates" if skipped else "measured",
            )
        )


class SearchService:
    def __init__(self, vectors, max_candidates=None):
        self.vectors, self.store = vectors, vectors.store
        self.embeddings, self.provider = vectors.embeddings, vectors.embeddings.provider
        self.max_candidates = (
            int(os.getenv("PVL_SEARCH_MAX_CANDIDATES", "2000"))
            if max_candidates is None
            else max_candidates
        )
        if not 1 <= self.max_candidates <= 10000:
            raise ValueError("PVL_SEARCH_MAX_CANDIDATES must be 1â€“10000")
        self.slots = threading.BoundedSemaphore(2)

    @staticmethod
    def authorize(target, confirmed=False, compare=False, compare_confirmed=False):
        if target.mode == "live":
            if os.getenv("PVL_DISABLE_CLOUD") == "1":
                raise VectorError("cloud_disabled_in_this_process", 403)
            if os.getenv("PVL_LIVE_SEARCH_ENABLED") != "1" or confirmed is not True:
                raise VectorError("live_read_requires_owner_opt_in_and_explicit_confirmation", 403)
            if compare and not compare_confirmed:
                raise VectorError("live_compare_requires_separate_read_confirmation", 403)

    def status(self):
        with self.store.db() as db:
            indexes = [
                json.loads(row[0])
                for row in db.execute("SELECT data FROM vector_indexes ORDER BY name")
            ]
        return dict(
            model=self.provider.status(),
            local_indexes=indexes,
            max_candidates=self.max_candidates,
            max_payload_bytes=32 * 1024 * 1024,
            live_max_candidates=512,
            live_max_jobs=32,
            live_enabled=os.getenv("PVL_LIVE_SEARCH_ENABLED") == "1",
            live_key_configured=bool(os.getenv("PINECONE_API_KEY")),
            live_verification="LIVE NOT VERIFIED â€” AWAITING USER AUTHORIZATION",
        )

    def index_info(self, db, target):
        if target.mode == "live":
            return self.vectors.live.valid(target.index)
        row = db.execute("SELECT data FROM vector_indexes WHERE name=?", (target.index,)).fetchone()
        if not row:
            raise VectorError("local_index_not_found_ingest_in_vector_explorer_first", 404)
        info = json.loads(row[0])
        if (
            not info["compatible"]
            or not info["ready"]
            or info["dimension"] != 384
            or info["metric"] != "cosine"
        ):
            raise VectorError("incompatible_index", 409)
        return info

    def namespaces(self, target, confirmed):
        self.authorize(target, confirmed)
        if target.mode == "live":
            return self.vectors.live.namespaces(target.index)
        with self.store.db() as db:
            self.index_info(db, target)
            return [
                dict(namespace=row[0], count=row[1])
                for row in db.execute(
                    "SELECT namespace,COUNT(*) FROM local_vectors WHERE index_name=? "
                    "GROUP BY namespace ORDER BY namespace",
                    (target.index,),
                )
            ]

    def candidates(self, db, target, filters, trace, suffix=""):
        params = [target.key(), self.provider.signature]
        local = target.mode == "local"
        join = (
            (
                "JOIN local_vectors l ON l.id=i.vector_id AND l.owner_job=j.id "
                "AND l.index_name=? AND l.namespace=?"
            )
            if local
            else ""
        )
        if local:
            params = [target.index, target.namespace, *params]
        where = VERIFIED
        for key, column in [
            ("document_id", "d.id"),
            ("version_id", "v.id"),
            ("source_name", "d.name"),
        ]:
            value = getattr(filters, key)
            if value is not None:
                where += f" AND {column}=?"
                params.append(str(value))
        if filters.page_from is not None:
            where += (
                " AND json_extract(c.data,'$.page_start')<=? "
                "AND json_extract(c.data,'$.page_end')>=?"
            )
            params.extend([filters.page_to, filters.page_from])
        fields = (
            "SELECT j.id job_id,j.document_id,j.version_id,j.index_identity,i.vector_id id,"
            "i.chunk_id,c.data chunk,d.name source_name,"
            "json_extract(i.record,'$.metadata') metadata,"
        )
        fields += "l.data vector_data " if local else "NULL vector_data "
        query = fields + ACTIVE + SOURCES + join + " WHERE " + where
        with trace.stage("metadata_prefilter" + suffix):
            count, size = db.execute(
                "SELECT COUNT(*),COALESCE(SUM(COALESCE(length(CAST(chunk AS BLOB)),0)+"
                "COALESCE(length(CAST(metadata AS BLOB)),0)+"
                "COALESCE(length(CAST(vector_data AS BLOB)),0)),0) FROM (" + query + ")",
                params,
            ).fetchone()
            if count > self.max_candidates or size > 32 * 1024 * 1024:
                raise VectorError("exact_search_cap_narrow_filters_or_raise_configured_limit", 413)
            raw_rows = db.execute(query + " ORDER BY i.vector_id", params).fetchall()
        rows = []
        with trace.stage("source_lookup" + suffix):
            for raw in raw_rows:
                row = dict(raw)
                chunk = json.loads(row.pop("chunk"))
                metadata = json.loads(row.pop("metadata") or "{}")
                expected = dict(
                    owner_job=row["job_id"],
                    document_id=row["document_id"],
                    version_id=row["version_id"],
                    chunk_id=row["chunk_id"],
                    source_name=row["source_name"],
                    page_start=chunk["page_start"],
                    page_end=chunk["page_end"],
                    model_id=self.provider.model_id,
                    model_revision=self.provider.revision,
                    model_signature=self.provider.signature,
                    embedding_mode=self.provider.mode,
                )
                if any(metadata.get(k) != v for k, v in expected.items()):
                    trace.discarded += 1
                    continue
                row.update(
                    metadata=expected,
                    text=chunk["text"],
                    page_start=chunk["page_start"],
                    page_end=chunk["page_end"],
                )
                if local:
                    try:
                        stored = json.loads(row.pop("vector_data"))
                        values = checked_vector(stored["values"])
                        if (
                            stored["id"] != row["id"]
                            or abs(math.hypot(*values) - 1) > 1e-5
                            or any(stored["metadata"].get(k) != v for k, v in expected.items())
                        ):
                            raise ValueError("incoherent stored record")
                        row["values"] = values
                    except (DocumentError, ValueError, KeyError, TypeError):
                        trace.discarded += 1
                        continue
                else:
                    row.pop("vector_data")
                rows.append(row)
        return rows

    @staticmethod
    def hit(row, score, rank):
        return dict(
            id=row["id"],
            rank=rank,
            score=score,
            document_id=row["document_id"],
            version_id=row["version_id"],
            chunk_id=row["chunk_id"],
            source_name=row["source_name"],
            page_start=row["page_start"],
            page_end=row["page_end"],
            text=row["text"],
            snippet=row["text"][:360],
            metadata=row["metadata"],
            source_url="/documents?"
            + urlencode(
                dict(
                    document=row["document_id"],
                    version=row["version_id"],
                    chunk=row["chunk_id"],
                    page=row["page_start"],
                )
            ),
        )

    def ranked(self, rows, request, query, filters, trace, check, suffix=""):
        with trace.stage("vector_query" + suffix, not rows):
            if rows and query is None:
                raise VectorError("query_embedding_unavailable", 503)
            if request.target.mode == "local":
                scores = []
                for row in rows:
                    check()
                    scores.append((row, cosine(query["values"], row["values"])))
                scores.sort(key=lambda item: (-item[1], item[0]["id"]))
                chosen = scores[: request.top_k]
            elif rows:
                expression = live_filter(rows, filters, self.provider)
                matches = self.vectors.live.query(
                    request.target,
                    query["values"],
                    request.top_k,
                    expression,
                    confirmed=request.confirm_live_read,
                )
                known = {row["id"]: row for row in rows}
                chosen, seen = [], set()
                for match in matches:
                    row = known.get(match["id"])
                    score = match["score"]
                    if (
                        not row
                        or match["id"] in seen
                        or not math.isfinite(score)
                        or not -1.00002 <= score <= 1.00002
                        or any(match["metadata"].get(k) != v for k, v in row["metadata"].items())
                    ):
                        raise VectorError("provider_result_not_active_owned_or_coherent_retry", 409)
                    seen.add(match["id"])
                    chosen.append((row, max(-1.0, min(1.0, score))))
                chosen.sort(key=lambda item: (-item[1], item[0]["id"]))
            else:
                chosen = []
        check()
        with trace.stage("source_hydration" + suffix, not chosen):
            return [self.hit(row, score, i + 1) for i, (row, score) in enumerate(chosen)]

    def search(self, request, cancel=None):
        trace = Measurement()

        def check():
            if cancel is not None and cancel.is_set():
                raise VectorError("search_cancelled", 408)
            if time.perf_counter() - trace.started > 150:
                raise VectorError("search_deadline_exceeded", 504)

        with trace.stage("input_validation"):
            self.authorize(
                request.target,
                request.confirm_live_read,
                request.compare,
                request.confirm_live_compare,
            )
            if request.target.mode == "live" and self.provider.mode != "e5":
                raise VectorError("fixture_vectors_never_queried_live", 409)
            tokenizer = self.embeddings.tokenizer_provider()
            if tokenizer.mode != self.provider.mode or tokenizer.revision != self.provider.revision:
                raise VectorError("search_tokenizer_model_mismatch", 409)
            query_tokens = len(tokenizer.encode("query: " + request.query, special=True).ids)
            if query_tokens > 512:
                raise DocumentError("Input exceeds 512 tokens including query prefix and specials.")
        if not self.slots.acquire(blocking=False):
            raise VectorError("search_busy_retry_later", 429)
        try:
            with self.store.db() as db:
                db.execute("BEGIN")
                with trace.stage("active_manifest_selection"):
                    info = self.index_info(db, request.target)
                    jobs = {
                        r["id"]: dict(r)
                        for r in db.execute(
                            "SELECT j.* FROM vector_active a JOIN vector_jobs j "
                            "ON j.id=a.job_id AND j.scope=a.scope WHERE " + VERIFIED,
                            (request.target.key(), self.provider.signature),
                        )
                    }
                    if request.target.mode == "live" and any(
                        j["index_identity"] != self.vectors.index_identity(info)
                        for j in jobs.values()
                    ):
                        raise VectorError("index_identity_changed_reingest_required", 409)
                    missing = db.execute(
                        "SELECT COUNT(*) " + ACTIVE + " LEFT JOIN versions v ON v.id=j.version_id "
                        "AND v.document_id=j.document_id "
                        "LEFT JOIN chunks c ON c.id=i.chunk_id AND c.version_id=v.id "
                        "LEFT JOIN documents d ON d.id=j.document_id WHERE "
                        + VERIFIED
                        + " AND (c.id IS NULL OR d.id IS NULL "
                        "OR v.id IS NULL OR v.state!='confirmed')",
                        (request.target.key(), self.provider.signature),
                    ).fetchone()[0]
                    if missing:
                        trace.warnings.append("source_missing_candidates_omitted")
                rows = self.candidates(db, request.target, request.filters, trace)
                baseline = (
                    self.candidates(db, request.target, SearchFilters(), trace, "_unfiltered")
                    if request.compare
                    else []
                )
            if trace.discarded:
                trace.warnings.append("incoherent_candidates_omitted_before_ranking")
            check()
            with trace.stage("query_embedding", not (rows or baseline)):
                query = (
                    self.embeddings.encode([request.query], "query", cancel)[0]
                    if rows or baseline
                    else None
                )
                if query:
                    source_model = (rows or baseline)[0]["metadata"]
                    if (
                        query.get("prefix") != "query: "
                        or query.get("kind") != "query"
                        or query["input_token_count"] != query_tokens
                        or any(
                            query.get(k) != source_model[k]
                            for k in ("model_id", "model_revision", "model_signature")
                        )
                        or query.get("mode") != source_model["embedding_mode"]
                    ):
                        raise VectorError("query_embedding_identity_or_budget_mismatch", 409)
                    checked_vector(query["values"])
                    if abs(math.hypot(*query["values"]) - 1) > 1e-5:
                        raise VectorError("query_embedding_not_unit_normalized", 503)
            hits = self.ranked(rows, request, query, request.filters, trace, check)
            comparison = (
                self.ranked(baseline, request, query, SearchFilters(), trace, check, "_unfiltered")
                if request.compare
                else None
            )
            with trace.stage("active_source_revalidation"):
                with self.store.db() as db:
                    db.execute("BEGIN")
                    current = {
                        r[0]
                        for r in db.execute(
                            "SELECT j.id FROM vector_active a JOIN vector_jobs j "
                            "ON j.id=a.job_id AND j.scope=a.scope WHERE " + VERIFIED,
                            (request.target.key(), self.provider.signature),
                        )
                    }
                    if current != set(jobs):
                        raise VectorError("active_set_changed_retry_search", 409)
                    for hit in hits + (comparison or []):
                        found = db.execute(
                            "SELECT c.data FROM chunks c JOIN versions v ON v.id=c.version_id "
                            "AND v.state='confirmed' JOIN documents d ON d.id=v.document_id "
                            "WHERE c.id=? AND v.id=? AND d.id=?",
                            (hit["chunk_id"], hit["version_id"], hit["document_id"]),
                        ).fetchone()
                        if not found or json.loads(found[0])["text"] != hit["text"]:
                            raise VectorError("source_changed_retry_search", 409)
            check()
            with trace.stage("response_assembly"):
                result = dict(
                    target=request.target,
                    top_k=request.top_k,
                    filters=request.filters,
                    retrieval_mode="LOCAL EXACT COSINE"
                    if request.target.mode == "local"
                    else "PINECONE ANN",
                    data_origin="SQLite local_vectors + confirmed chunks"
                    if request.target.mode == "local"
                    else "Pinecone SDK query + confirmed chunks",
                    embedding=dict(
                        mode=self.provider.mode,
                        model_id=self.provider.model_id,
                        model_revision=self.provider.revision,
                        model_signature=self.provider.signature,
                        input_token_count=query["input_token_count"] if query else query_tokens,
                        inference_ms=query["inference_ms"] if query else None,
                    ),
                    hits=hits,
                    comparison=comparison,
                    empty_reason=None
                    if hits
                    else (
                        "No matching eligible ACTIVE vectors; "
                        "check namespace, filters and confirmed sources."
                    ),
                )
            result["trace"] = dict(
                stages=trace.stages,
                total_ms=(time.perf_counter() - trace.started) * 1000,
                candidate_count=len(rows),
                candidate_count_kind="exact stored eligible count"
                if request.target.mode == "local"
                else "manifest eligible IDs; not a cloud total",
                manifest_count=len(jobs),
                discarded_count=trace.discarded + missing,
                warnings=trace.warnings,
            )
            return SearchResponse.model_validate(result).model_dump(mode="json")
        except (sqlite3.Error, json.JSONDecodeError):
            raise VectorError("search_storage_unavailable_preserve_data", 503) from None
        finally:
            self.slots.release()
