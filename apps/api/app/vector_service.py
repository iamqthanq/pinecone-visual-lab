"""Durable version-safe ingest/delete journal; one bounded step per explicit request."""

import hashlib
import json
import random
import time
from uuid import NAMESPACE_URL, uuid4, uuid5

from app.documents import DocumentError, now
from app.vector_contracts import Target, VectorError, records_checked


class VectorService:
    def __init__(self, store, embeddings, local, live, pause=time.sleep):
        self.store, self.embeddings = store, embeddings
        self.local, self.live, self.pause = local, live, pause

    def adapter(self, target):
        return self.local if target.mode == "local" else self.live

    @staticmethod
    def index_identity(info):
        return json.dumps(
            {
                key: info.get(key)
                for key in ("host", "project", "cloud", "region", "dimension", "metric")
            },
            sort_keys=True,
        )

    def job(self, identifier):
        with self.store.db() as db:
            row = db.execute("SELECT * FROM vector_jobs WHERE id=?", (identifier,)).fetchone()
            if row is None:
                raise VectorError("manifest_not_found", 404)
            job = dict(row)
            items = [
                dict(r)
                for r in db.execute(
                    "SELECT ordinal,vector_id,chunk_id FROM vector_items "
                    "WHERE job_id=? ORDER BY ordinal",
                    (identifier,),
                )
            ]
        job["target"] = json.loads(job["target"])
        job["count"], job["ids"] = len(items), [i["vector_id"] for i in items]
        job["preview_token"] = hashlib.sha256(
            (identifier + json.dumps(job["ids"])).encode()
        ).hexdigest()
        return job

    def jobs(self, target):
        with self.store.db() as db:
            ids = [
                r[0]
                for r in db.execute(
                    "SELECT id FROM vector_jobs WHERE target=? ORDER BY created_at DESC LIMIT 100",
                    (target.key(),),
                )
            ]
        return [self.job(i) for i in ids]

    def preview(self, target, document_id, version_id):
        version = self.store.version(document_id, version_id)
        if version["state"] != "confirmed" or not version["chunks"]:
            raise VectorError("confirmed_nonempty_version_required", 409)
        signature = self.embeddings.provider.signature
        if target.mode == "live" and self.embeddings.provider.mode != "e5":
            raise VectorError("fixture_vectors_never_uploaded_live", 409)
        info = self.adapter(target).describe(target.index)
        if not info["compatible"]:
            raise VectorError("incompatible_index", 409)
        identity = self.index_identity(info)
        scope = target.key() + ":" + document_id
        if target.mode == "live":
            scope += ":" + hashlib.sha256(identity.encode()).hexdigest()
        with self.store.db() as db:
            db.execute("BEGIN IMMEDIATE")
            active = db.execute(
                "SELECT job_id FROM vector_active WHERE scope=?", (scope,)
            ).fetchone()
            baseline = active[0] if active else None
            retired = db.execute(
                "SELECT id FROM vector_jobs WHERE scope=? AND state='deleted' "
                "ORDER BY updated_at DESC LIMIT 1",
                (scope,),
            ).fetchone()
            if baseline:
                current = db.execute(
                    "SELECT version_id,signature FROM vector_jobs WHERE id=?", (baseline,)
                ).fetchone()
                if tuple(current) == (version_id, signature):
                    return self.job(baseline)
            identifier = str(
                uuid5(
                    NAMESPACE_URL,
                    scope
                    + version_id
                    + signature
                    + (baseline or (retired[0] if retired else "initial")),
                )
            )
            db.execute(
                "INSERT INTO vector_jobs(id,scope,target,index_identity,document_id,"
                "version_id,signature,state,"
                "baseline_active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT DO NOTHING",
                (
                    identifier,
                    scope,
                    target.key(),
                    identity,
                    document_id,
                    version_id,
                    signature,
                    "pending",
                    baseline,
                    now(),
                    now(),
                ),
            )
            db.executemany(
                "INSERT INTO vector_items(job_id,ordinal,vector_id,chunk_id) VALUES(?,?,?,?) "
                "ON CONFLICT DO NOTHING",
                [
                    (
                        identifier,
                        i,
                        "pvl-" + str(uuid5(NAMESPACE_URL, identifier + c["chunk_id"])),
                        c["chunk_id"],
                    )
                    for i, c in enumerate(version["chunks"])
                ],
            )
        return self.job(identifier)

    def lease(self, scope):
        token = str(uuid4())
        with self.store.db() as db:
            db.execute("BEGIN IMMEDIATE")
            old = db.execute("SELECT expires FROM vector_leases WHERE scope=?", (scope,)).fetchone()
            if old and old[0] > time.time():
                raise VectorError("target_document_busy_retry_later", 409)
            db.execute(
                "INSERT INTO vector_leases VALUES(?,?,?) ON CONFLICT(scope) DO UPDATE "
                "SET token=excluded.token,expires=excluded.expires",
                (scope, token, time.time() + 180),
            )
        return token

    def assert_lease(self, db, scope, token):
        row = db.execute(
            "SELECT token,expires FROM vector_leases WHERE scope=?", (scope,)
        ).fetchone()
        if not row or row[0] != token or row[1] <= time.time():
            raise VectorError("lease_lost_resume_required", 409)
        db.execute(
            "UPDATE vector_leases SET expires=? WHERE scope=? AND token=?",
            (time.time() + 180, scope, token),
        )

    def retry(self, job, token, operation, cancel=None):
        for attempt in range(4):
            with self.store.db() as db:
                self.assert_lease(db, job["scope"], token)
            if cancel is not None and cancel.is_set():
                raise VectorError("operation_cancelled_resume_safe", 408)
            try:
                return operation()
            except VectorError as error:
                if not error.retryable or attempt == 3:
                    raise
                with self.store.db() as db:
                    db.execute(
                        "UPDATE vector_jobs SET retries=retries+1,error_code=? WHERE id=?",
                        (error.code, job["id"]),
                    )
                self.pause(0.25 * 2**attempt + random.uniform(0, 0.1))

    def verified(self, adapter, target, expected, absent=False):
        actual = {r["id"]: r for r in adapter.fetch(target, [r["id"] for r in expected])}
        for record in expected:
            found = actual.get(record["id"])
            if absent:
                if found:
                    raise VectorError("delete_not_yet_visible", 503, True)
            elif (
                not found
                or any(found["metadata"].get(k) != v for k, v in record["metadata"].items())
                or len(found["values"]) != 384
                or any(
                    abs(a - b) > 2e-5
                    for a, b in zip(found["values"], record["values"], strict=True)
                )
            ):
                raise VectorError("upsert_not_yet_verified", 503, True)
        return True

    def step(self, identifier, preview_token, cancel=None):
        job = self.job(identifier)
        if preview_token != job["preview_token"]:
            raise VectorError("preview_confirmation_mismatch", 409)
        if job["state"] in ("active", "superseded"):
            return job
        if job["state"] in ("deleting", "deleted"):
            raise VectorError("manifest_deletion_in_progress_or_complete", 409)
        target = Target(**job["target"])
        adapter = self.adapter(target)
        token = self.lease(job["scope"])
        try:
            version = self.store.version(job["document_id"], job["version_id"])
            if (
                version["state"] != "confirmed"
                or job["signature"] != self.embeddings.provider.signature
            ):
                raise VectorError("source_or_model_changed", 409)
            info = adapter.describe(target.index)
            if self.index_identity(info) != job["index_identity"]:
                raise VectorError("index_identity_changed_repreview_required", 409)
            if not info["compatible"]:
                raise VectorError("incompatible_index", 409)
            with self.store.db() as db:
                self.assert_lease(db, job["scope"], token)
                db.execute(
                    "UPDATE vector_jobs SET state='running',error_code=NULL,updated_at=? "
                    "WHERE id=?",
                    (now(), identifier),
                )
                offset = job["checkpoint"] if job["checkpoint"] < job["count"] else job["verified"]
                items = [
                    dict(row)
                    for row in db.execute(
                        "SELECT * FROM vector_items WHERE job_id=? "
                        "AND ordinal>=? ORDER BY ordinal LIMIT 8",
                        (identifier, offset),
                    )
                ]
            if job["checkpoint"] < job["count"]:
                if target.mode == "live":
                    adapter.authorization.check(
                        "upsert", target, [i["vector_id"] for i in items], info
                    )
                vectors = self.embeddings.chunks(
                    job["document_id"], job["version_id"], [i["chunk_id"] for i in items], cancel
                )
                source = self.store.get(job["document_id"])
                records = []
                for item, vector in zip(items, vectors, strict=True):
                    if (
                        vector["model_signature"] != job["signature"]
                        or vector["source_chunk_id"] != item["chunk_id"]
                    ):
                        raise VectorError("embedding_provenance_mismatch", 409)
                    record = dict(
                        id=item["vector_id"],
                        values=vector["values"],
                        metadata=dict(
                            owner_job=identifier,
                            document_id=job["document_id"],
                            version_id=job["version_id"],
                            chunk_id=item["chunk_id"],
                            page_start=vector["page_start"],
                            page_end=vector["page_end"],
                            model_signature=job["signature"],
                            model_revision=vector["model_revision"],
                            model_id=vector["model_id"],
                            embedding_mode=vector["mode"],
                            source_name=source["name"],
                        ),
                    )
                    records.append(record)
                records_checked(records)
                with self.store.db() as db:
                    self.assert_lease(db, job["scope"], token)
                    db.executemany(
                        "UPDATE vector_items SET record=? WHERE job_id=? AND ordinal=?",
                        [
                            (json.dumps(r, allow_nan=False), identifier, i["ordinal"])
                            for i, r in zip(items, records, strict=True)
                        ],
                    )
                self.retry(job, token, lambda: adapter.upsert(target, records), cancel)
                with self.store.db() as db:
                    self.assert_lease(db, job["scope"], token)
                    db.execute(
                        "UPDATE vector_jobs SET checkpoint=?,state='pending',updated_at=? "
                        "WHERE id=?",
                        (offset + len(items), now(), identifier),
                    )
            else:
                expected = [json.loads(i["record"]) for i in items]
                self.retry(job, token, lambda: self.verified(adapter, target, expected), cancel)
                with self.store.db() as db:
                    self.assert_lease(db, job["scope"], token)
                    db.execute(
                        "UPDATE vector_jobs SET verified=?,updated_at=? WHERE id=?",
                        (offset + len(items), now(), identifier),
                    )
                    if offset + len(items) == job["count"]:
                        active = db.execute(
                            "SELECT job_id FROM vector_active WHERE scope=?", (job["scope"],)
                        ).fetchone()
                        if (active[0] if active else None) != job["baseline_active"]:
                            raise VectorError("active_version_changed_repreview_required", 409)
                        row = db.execute(
                            "SELECT state FROM versions WHERE id=? AND document_id=?",
                            (job["version_id"], job["document_id"]),
                        ).fetchone()
                        if not row or row[0] != "confirmed":
                            raise VectorError("source_removed_before_activation", 409)
                        db.execute(
                            "UPDATE vector_jobs SET state='superseded' WHERE id IN "
                            "(SELECT job_id FROM vector_active WHERE scope=?)",
                            (job["scope"],),
                        )
                        db.execute(
                            "INSERT INTO vector_active VALUES(?,?) ON CONFLICT(scope) DO UPDATE "
                            "SET job_id=excluded.job_id",
                            (job["scope"], identifier),
                        )
                        db.execute(
                            "UPDATE vector_jobs SET state='active',error_code=NULL WHERE id=?",
                            (identifier,),
                        )
                    else:
                        db.execute(
                            "UPDATE vector_jobs SET state='pending' WHERE id=?", (identifier,)
                        )
        except DocumentError as error:
            with self.store.db() as db:
                lease = db.execute(
                    "SELECT token FROM vector_leases WHERE scope=?", (job["scope"],)
                ).fetchone()
                if lease and lease[0] == token:
                    db.execute(
                        "UPDATE vector_jobs SET state='failed',error_code=?,updated_at=? "
                        "WHERE id=?",
                        (getattr(error, "code", "embedding_or_source_error"), now(), identifier),
                    )
            raise
        finally:
            with self.store.db() as db:
                db.execute(
                    "DELETE FROM vector_leases WHERE scope=? AND token=?", (job["scope"], token)
                )
        return self.job(identifier)

    def delete_preview(self, identifier):
        job = self.job(identifier)
        deletion = str(uuid4())
        with self.store.db() as db:
            db.execute(
                "INSERT INTO vector_deletions(id,job_id,ids,created_at) VALUES(?,?,?,?)",
                (deletion, identifier, json.dumps(job["ids"]), now()),
            )
        return dict(
            id=deletion,
            job_id=identifier,
            target=job["target"],
            ids=job["ids"],
            count=job["count"],
            state="preview",
            checkpoint=0,
            notice="Exact manifest-owned IDs; some may be absent.",
        )

    def delete_step(self, deletion_id):
        with self.store.db() as db:
            row = db.execute("SELECT * FROM vector_deletions WHERE id=?", (deletion_id,)).fetchone()
            if not row:
                raise VectorError("delete_preview_not_found", 404)
            deletion = dict(row)
        job = self.job(deletion["job_id"])
        ids = json.loads(deletion["ids"])
        if ids != job["ids"]:
            raise VectorError("delete_preview_manifest_mismatch", 409)
        if deletion["state"] == "deleted":
            return dict(**deletion, target=job["target"], count=len(ids))
        target = Target(**job["target"])
        adapter = self.adapter(target)
        token = self.lease(job["scope"])
        try:
            selected = ids[deletion["checkpoint"] : deletion["checkpoint"] + 8]
            info = adapter.describe(target.index)
            if self.index_identity(info) != job["index_identity"]:
                raise VectorError("index_identity_changed_delete_forbidden", 409)
            if target.mode == "live":
                adapter.authorization.check("delete", target, selected, info)
            with self.store.db() as db:
                self.assert_lease(db, job["scope"], token)
                db.execute("UPDATE vector_jobs SET state='deleting' WHERE id=?", (job["id"],))
                db.execute(
                    "DELETE FROM vector_active WHERE scope=? AND job_id=?",
                    (job["scope"], job["id"]),
                )
            self.retry(job, token, lambda: adapter.delete(target, selected, job["id"]))
            expected = [dict(id=i) for i in selected]
            self.retry(job, token, lambda: self.verified(adapter, target, expected, absent=True))
            with self.store.db() as db:
                self.assert_lease(db, job["scope"], token)
                checkpoint = deletion["checkpoint"] + len(selected)
                state = "deleted" if checkpoint == len(ids) else "deleting"
                db.execute(
                    "UPDATE vector_deletions SET checkpoint=?,state=? WHERE id=?",
                    (checkpoint, state, deletion_id),
                )
                if state == "deleted":
                    db.execute("UPDATE vector_jobs SET state='deleted' WHERE id=?", (job["id"],))
            return dict(
                id=deletion_id,
                checkpoint=checkpoint,
                state=state,
                count=len(ids),
                target=job["target"],
            )
        finally:
            with self.store.db() as db:
                db.execute(
                    "DELETE FROM vector_leases WHERE scope=? AND token=?", (job["scope"], token)
                )
