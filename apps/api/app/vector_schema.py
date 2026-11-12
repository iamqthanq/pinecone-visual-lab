"""Forward schema2→3; vector/manifests are not automatically deleted with source documents."""

SCHEMA = """
BEGIN IMMEDIATE;
CREATE TABLE IF NOT EXISTS vector_indexes (
 name TEXT PRIMARY KEY, data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS local_vectors (
 index_name TEXT NOT NULL, namespace TEXT NOT NULL, id TEXT NOT NULL,
 owner_job TEXT NOT NULL, data TEXT NOT NULL,
 PRIMARY KEY(index_name,namespace,id)
);
CREATE TABLE IF NOT EXISTS vector_jobs (
 id TEXT PRIMARY KEY, scope TEXT NOT NULL, target TEXT NOT NULL, index_identity TEXT NOT NULL,
 document_id TEXT NOT NULL, version_id TEXT NOT NULL, signature TEXT NOT NULL,
 state TEXT NOT NULL, baseline_active TEXT, checkpoint INTEGER NOT NULL DEFAULT 0,
 retries INTEGER NOT NULL DEFAULT 0, verified INTEGER NOT NULL DEFAULT 0, error_code TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vector_items (
 job_id TEXT NOT NULL REFERENCES vector_jobs(id), ordinal INTEGER NOT NULL,
 vector_id TEXT NOT NULL, chunk_id TEXT NOT NULL, record TEXT,
 PRIMARY KEY(job_id,ordinal), UNIQUE(job_id,vector_id)
);
CREATE TABLE IF NOT EXISTS vector_active (
 scope TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES vector_jobs(id)
);
CREATE TABLE IF NOT EXISTS vector_leases (
 scope TEXT PRIMARY KEY, token TEXT NOT NULL, expires REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS vector_deletions (
 id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES vector_jobs(id),
 ids TEXT NOT NULL, checkpoint INTEGER NOT NULL DEFAULT 0,
 state TEXT NOT NULL DEFAULT 'preview', created_at TEXT NOT NULL
);
PRAGMA user_version=3;
COMMIT;
"""
