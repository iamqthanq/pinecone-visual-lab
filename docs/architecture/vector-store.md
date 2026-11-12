# D04 vector storage

D05 adds the [read-only Search layer](search.md) without changing schema3 or source/manifest data. It also corrects SDK10.3 Index retry inheritance through a pinned compatibility shim; D04 evidence below remains historical.

LOCAL DEMO is a persistent SQLite vector store. LIVE PINECONE is an official SDK adapter whose account integration is **LIVE NOT VERIFIED — AWAITING USER AUTHORIZATION**. No actual cloud read, create, upsert or delete was performed for this delivery. Subsequent phases add [D05 Search/Top-K](search.md), [D06 optional RAG](rag.md) and [D07 educational Slab simulation](slab-simulator.md); they reuse this storage contract without presenting simulation as real vectors.

## Contracts and boundaries

`app.vector_contracts.VectorStore` defines indexes/describe/create, namespace stats, bounded upsert/fetch/list IDs and owned-ID delete. `Target` permits only mode, index name and namespace: no API key, URL or arbitrary host is accepted. Production local inference reuses D03 `EmbeddingService` and its verified CPU E5 provider. There is no production vector/tokenizer fixture fallback.

`LocalDemoAdapter` uses actual `local_vectors` rows, not the D03 embeddings cache, to list/fetch/delete. Index `local-e5` is a logical on-device index; additional local indexes require preview/confirm. The adapter validates 384 finite unit-normalized values, nonzero norm and flat provenance. Namespace is part of the primary key. Empty string means default namespace; other names permit 1–64 ASCII letters/digits/underscore/dot/dash. A namespace exists only after stored records; stats are observed counts, never invented provisioning results. Local cosine is a numeric utility; D04 exposes no search API/UI.

Vectors are local data under ignored `.data/documents.sqlite3`, or an explicitly configured private `PVL_DATA_DIR`. Runtime data, credentials, approvals, weights and PDFs must stay ignored. Back up the database before upgrades. This is a loopback, single-owner workbench, not an authenticated public service.

## SQLite schema 3

Forward migration in `vector_schema.py` runs transactionally after D02 schema1 → D03 schema2. Document/Page/Chunk/version/embedding tables and rows are preserved; unknown newer schemas fail safely. Migration tests reconstruct schema2 and retain an actual embedding and confirmed document. Existing schema1 migration remains covered by D03 regression.

| Table | Key / purpose |
| --- | --- |
| `vector_indexes` | name → actual local index configuration |
| `local_vectors` | `(index_name, namespace, id)` → owner job and JSON values/provenance |
| `vector_jobs` | manifest UUID, scope, target, pinned index identity, document/version/model signature, state, baseline active, checkpoints/retries/errors/timestamps |
| `vector_items` | `(job_id, ordinal)`, unique `(job_id, vector_id)`, chunk ID and exact attempted record snapshot |
| `vector_active` | scope → active manifest |
| `vector_leases` | scope → process token + 180-second renewable expiry |
| `vector_deletions` | preview UUID → job, exact ordered IDs, deletion checkpoint/state |

Jobs/vectors intentionally have no source-document cascade. Deleting a document must never silently become a cloud delete. Retained manifest IDs allow explicit cleanup after source deletion; new ingest/activation is refused if its confirmed source disappears. Original source text can no longer be inspected after document deletion, while retained metadata identifies its former source. Manifest tables are a durable audit journal; they are not garbage collected automatically.

Each stored record contains `id`, all 384 `values`, and flat metadata: `owner_job`, document/version/chunk IDs, page start/end, source filename, model ID/revision/signature and embedding mode. D03 preserves tokenizer revision and full input token budget separately. No secrets or fabricated timing are added to fetched records.

## Manifest / activation / recovery

1. **Preview** validates a nonempty confirmed version, model mode and compatible target; it creates a local job/ordered IDs only, with no inference or vector write. A LIVE preview performs a user-triggered describe read. The preview token binds manifest ID and its exact IDs; `confirmed: true` and that token are mandatory to start/resume.
2. Scope includes adapter/index/namespace/document and, for LIVE, a digest of SDK-derived host plus configured project/cloud/region/dimension/metric. These are also pinned in `index_identity`; resume and delete refuse a changed identity, including a recreated index host. Project is an operator label, not independent account attestation (see below).
3. UUID5 job IDs derive from scope/version/model/baseline generation. Vector IDs derive from job + source chunk. Repeated preview/retries reuse IDs; different versions/generations never share IDs. Re-ingest after completed deletion starts a new generation. All IDs can be inspected before confirmation.
4. Each explicit HTTP step handles at most **8 records / 128 KiB JSON**, metadata ≤8 KiB per record. Confirmed E5 embeddings missing from the D03 cache are generated only during this explicit ingest. Every input still obeys D03 prefix/special-token 512-token budget; no re-chunking or reconfirmation occurs. The UI sends one step at a time (no request flood).
5. A renewable lease serializes a target/document's steps; stale owners must check their token before writes/checkpoints. A worker crash leaves a lease for at most 180 seconds. It is safe to wait and resume. SDK writes are not transactional; a timed-out batch may have partly succeeded. The checkpoint advances only after successful return. Same IDs and record snapshots make retry idempotent; a conflicting existing record is refused rather than overwritten.
6. There are at most **4 attempts per operation**, with backoff 0.25/0.5/1 second plus 0–0.1-second jitter for retryable 408/429/5xx/network errors. SDK automatic retries are disabled. Authentication, incompatible target, authorization, ownership and validation errors do not retry. Counters and safe error codes persist. Application process cancellation pauses at a durable boundary; completed batches remain.
7. After all upserts, separate bounded fetch steps verify **every expected ID**, metadata and all values (float32 tolerance 2e-5). Eventual visibility gets the same bounded retry. A transaction uses compare-and-swap against the preview's baseline active job and checks the source is still confirmed. Only then does the new job become active and the old one superseded. Failure keeps the old active pointer. This is application manifest activation, not an atomic Pinecone namespace transaction or search filter guarantee.
8. Preview deletion records the exact target, owned IDs and count (including IDs that may already be absent). A separate true confirmation is mandatory. Delete only those IDs, in batches of 8; verify absence before advancing each durable deletion checkpoint. No index delete, namespace delete-all, filter delete or arbitrary-ID delete endpoint exists. Starting deletion retires that job's active pointer; other versions/documents/namespaces are untouched. A failed delete stays resumable. After reload, repeating delete preview safely reconciles already absent IDs; API clients retaining the deletion UUID can resume its original checkpoint.

In the UI, **ACTIVE** means the completed manifest was verified at activation time. It does not promise that an external operator cannot later mutate cloud records. Fetch always shows the adapter's current result; missing records stay missing. Collision checks before cloud writes are defensive, not an atomic cloud compare-and-swap against an external writer; use a dedicated namespace and exclusive owner for LIVE demos.

## Pinecone SDK / current API

Pinned `pinecone==10.3.0` (Apache-2.0), API **2026-07**; exact transitive versions are in `requirements.lock`. Verified with installed SDK source and an actual SDK HTTP-transport contract test, with DNS blocked. SDK 10 uses `pc.indexes` and `pc.index(host=...)`; older `pc.Index`/`create_index` examples are unsuitable. The Vectors API BYOV shape is reserved `_values` → dense_vector / 384 / cosine, managed cloud deployment. Arbitrary document schema or integrated semantic-text indexes are rejected. The original plan's 2025-04 API link is historical; it is not mixed with current wire types.

`PineconeLiveAdapter` lazily constructs the client only on explicit LIVE operations with a server key. Timeout is 5 seconds per SDK request and retry count zero. Index creation uses SDK `timeout=-1` (no hidden polling), then the API does at most three 250ms-spaced readiness describes. A not-ready result stays not Ready; refresh discovery later. Index catalogs/namespaces are capped at 100, ID pages at 100 (UI uses 25), fetch at 8. Live pagination uses the opaque SDK cursor; local uses a stable lexical keyset.

Only SDK-described HTTPS `*.svc[.*].pinecone.io` hosts are accepted; credentials, paths, non-443 ports, query strings, fragments and other domains are refused. Every data operation rechecks Ready/dense-BYOV/384/cosine and cloud/region. Metadata model ID/revision/signature must match actual pinned E5 before LIVE upsert. All fixture modes are blocked. Fetch uses actual Pinecone SDK values/metadata, never the D03 cache. Errors expose only safe status codes; key/provider response bodies are not returned.

`PVL_PINECONE_PROJECT` is a **server operator label**. The project-scoped key's project cannot be independently attested with the SDK index-describe response used here. The UI/documentation explicitly require checking that key's project in Pinecone console before approval; there is no fabricated “project verified” result. Manifest host binding and exact approval matching provide additional target protection.

Public sources reviewed:

- [SDK v10 migration](https://sdk.pinecone.io/python/migration/v10-migration.html)
- [BYOV Vectors API create](https://docs.pinecone.io/guides/legacy/vectors-api/create-a-vector-index)
- [Python Vectors upsert/query guide](https://sdk.pinecone.io/python/how-to/vectors/upsert-and-query.html)
- [Sync Index API](https://sdk.pinecone.io/python/reference/sync-index.html)
- [Pinned SDK package](https://pypi.org/project/pinecone/10.3.0/)

No price/free-tier quota is hardcoded: confirm current project plan, region availability, storage, write/read units and cost in the console.

## LIVE authorization (not granted/run in this delivery)

Keep the key in an ignored server environment/secret only. Backend reads process environment; it does not load `.env` automatically. Never use `VITE_` secrets or paste the key into chat. `PVL_DISABLE_CLOUD=1` blocks client construction, including tests and local-only demonstrations. No startup, health check, page load, mode switch or CI run does cloud discovery/writes. The explicit **Connect / list LIVE indexes** control performs read discovery; a read-only key can browse without authorizing writes.

Before any real create/upsert/delete, separately obtain owner approval describing exact project/index/cloud/region/namespace/1–3 synthetic IDs/request estimate/quota risk. Delete requires its own action approval; no automatic cleanup is authorized by upsert. Do not upload personal documents. This delivery did not request or perform LIVE smoke because the assignment explicitly permits a local/offline handoff.

After that external owner approval only, an operator may create an ignored JSON file and set `PVL_LIVE_AUTHORIZATION_FILE` to it. The application never generates approvals. Required fields (all placeholders below; **this is not an approval**):

```json
{
  "project": "OWNER-VERIFIED-PROJECT-LABEL",
  "index": "owner-approved-index",
  "namespace": "owner-approved-demo",
  "cloud": "aws",
  "region": "OWNER-APPROVED-REGION",
  "index_host": "https://SDK-DESCRIBED-HOST.svc.pinecone.io",
  "record_ids": ["EXACT-MANIFEST-ID-1"],
  "actions": ["upsert"],
  "plan_quota_acknowledged": true,
  "expires_at": "OWNER-APPROVED-FUTURE-ISO8601-WITH-TIMEZONE"
}
```

The project label must match `PVL_PINECONE_PROJECT`; index/namespace/cloud/region/SDK host and each ID must match exactly. Expiry and true quota acknowledgment are mandatory. `delete` must be explicitly added under separate authorization. Index creation requires `create_index` approval for namespace `""` (no namespace exists at creation); no record IDs/host are needed until the created index is described. Preview also needs its separate user click/confirmation. This policy file is an owner-operated local safety control, not a multi-user cryptographic authorization service.

## API / UI

All routes use `/api/vector-store`. OpenAPI is at `/docs` on the API process. Typed client is `apps/web/src/vector-store-api.ts`; strict request schemas reject extra fields, and fetched values use a finite-384 response contract.

| Route | Behavior |
| --- | --- |
| `GET /status` | key-configured boolean, configured project label, mode, SDK/API, LIVE verification boundary; no cloud call |
| `POST /indexes/list`, `/indexes/describe`, `/namespaces` | actual adapter discovery, LIVE read confirmation required |
| `POST /indexes/create/preview`, `/indexes/create/confirm` | bounded in-memory 5-minute preview, explicit confirmation and server authorization for LIVE |
| `POST /ingest/preview` | confirmed-version manifest only |
| `GET /jobs`, `/jobs/{uuid}` | local durable job/progress history; up to 100 latest per target |
| `POST /jobs/{uuid}/step` | explicit confirmed bounded ingest/verification step |
| `POST /jobs/{uuid}/delete-preview` | local exact owned target/IDs/count |
| `POST /deletions/{uuid}/step` | explicit confirmed bounded delete/absence verification |
| `POST /records/list`, `/records/fetch` | actual adapter IDs/values/metadata and data-origin label |

Vector Explorer: `/vectors/store`, linked from retained D03 `/vectors`. Target changes clear stale results. Controls expose default vs named namespace, Ready/compatibility, manifest state/checkpoints/retry/owned IDs, confirmation, resume and guarded deletion. Heatmap/table exposes all 384 dimensions and actual source/model metadata; copy includes target/origin. No fabricated Pinecone stats, inference latency or similarity scores appear in fetched records.

## Validation boundaries

Offline tests use deterministic **NOT E5** fixtures and fake SDK HTTP transport with network/DNS denied. They test actual SDK serialization and sanitized errors without an account. Real integration separately loads approved cached E5 weights with exact SHA/revision, uses actual SQLite and Edge, and preserves D01–D03 regression. GitHub CI is pending until an actual run; local fixture results are not GitHub CI results. Screenshots and command/exit logs live in [D04 evidence](../evidence/d04/REPORT.md).

Remaining limitations: LIVE account integration/permissions/quota/region/eventual consistency still need authorized smoke. No public deployment/authentication, account project lookup, automatic journal GC, cloud-wide transaction or external-writer lock is provided. API/UI are for a trusted local operator; keep loopback binding. Heavy database/job volumes are outside seminar scale. Raw source deletion retains explicit cleanup obligations rather than issuing implicit cloud writes.
