# D05 — ACTIVE-manifest semantic search

`POST /api/search` powers `/search`. LOCAL DEMO is exact cosine over persisted SQLite vectors, using real local E5 queries in production. LIVE uses the pinned Pinecone SDK ANN operation, gated by owner opt-in and explicit read consent. **LIVE NOT VERIFIED — AWAITING USER AUTHORIZATION.** No cloud smoke was performed. Search itself has no LLM/Ollama dependency. [D06 optional RAG](rag.md) and [D07 Guided Demo](guided-demo.md) reuse this exact SearchService.

## Query contract

`search_contracts.py` defines SearchRequest, SearchFilters, SearchHit, SearchTrace and SearchResponse. TypeScript client: `apps/web/src/search-api.ts`. OpenAPI: `http://127.0.0.1:8000/docs` while the API is running.

```json
{
  "query": "Cơ sở dữ liệu vector tìm kiếm ngữ nghĩa như thế nào?",
  "top_k": 5,
  "target": {"mode": "local", "index": "local-e5", "namespace": "seminar"},
  "filters": {"source_name": "kiến-thức.pdf", "page_from": 2, "page_to": 2},
  "compare": false,
  "confirm_live_read": false,
  "confirm_live_compare": false
}
```

Top-K is a strict integer1–10; booleans/floats are rejected. Query is nonblank raw Unicode, ≤20,000 characters and ≤512 actual input tokens **including `query: ` and specials**. Already-prefixed query/passage input is rejected. Validation uses the same pinned tokenizer/provider identity as D03, even if there are no eligible vectors. With no candidates, inference is explicitly skipped (no fabricated vector), token count is still real, inference timing is null, and the trace says `skipped_no_candidates`. Model weights never download on startup/API/CI. Missing tokenizer/model returns truthful setup/error information; the UI disables generation when unavailable.

Extra fields, arbitrary SDK host, client vectors/API key and unknown filter operators are rejected; JSON errors omit private inputs. Search bodies have the existing1MiB preparse cap. Two search requests maximum may enter service work concurrently; the existing single CPU inference worker remains bounded (120 seconds, contention429). Search checks cancellation/deadline150 seconds, UI aborts at155 seconds. SDK requests have5-second attempt timeouts and no hidden retry; there is no background search or storage mutation.

## Filter grammar

All provided filters are ANDed before ranking:

| Field | Meaning |
| --- | --- |
| `document_id` | exact UUID; filenames are not unique IDs |
| `version_id` | optional exact confirmed-version UUID, still restricted to D04 ACTIVE |
| `source_name` | exact safe filename, case-sensitive Unicode **as stored**, ≤120 characters; no regex/wildcard/substring or Unicode folding |
| `page_from`, `page_to` | both strict integers,1 ≤ from ≤ to ≤200; same value selects one page |

Page intersection is `chunk.page_start <= page_to AND chunk.page_end >= page_from`. A chunk spanning pages1–2 matches page2. A range outside a document simply has no matching chunks. Source text remains D02 NFC/LF canonical content; filename storage semantics remain unchanged (decomposed/precomposed filenames are not silently renamed). SQL uses bound parameters, including literal `%`, `_` and apostrophes in filenames. No client expression becomes SQL or arbitrary Pinecone filter syntax.

## Candidate pipeline / correctness

1. Validate grammar, read authorization, tokenizer/model identity and input budget. LOCAL never constructs/calls the Pinecone client.
2. Read an explicit SQLite snapshot. Join `vector_active` → `vector_jobs` using **both pointer and scope**, then `vector_items`. Require exact canonical target/mode/index/namespace, current model signature, job state ACTIVE, checkpoint=verified=expected item count>0. A job marked ACTIVE without its pointer, or pending/failed/superseded/deleting/deleted/foreign-model job, is not eligible.
3. Join actual D02 versions/chunks/documents, requiring confirmed state and document/version/chunk ownership. Sources missing after explicit document deletion are omitted **before ranking**, with `source_missing_candidates_omitted`; no alternate source or invented snippet is used. D04 vector/manifests are retained for explicit cleanup.
4. Apply document/name/page filters in SQL, before any Top-K. LOCAL additionally joins actual `local_vectors` by index/namespace/vector ID/owner; D03 cached embeddings and evidence JSON are not a search store. Enforce snapshot metadata/model/page consistency; incoherent stored records are omitted before ranking with a warning. All values must be384 finite, nonzero, unit normalized. Query embedding identity/prefix/kind/token count must match source/model contracts.
5. Enforce configurable **`PVL_SEARCH_MAX_CANDIDATES=2000`**, range1–10000, after SQL filtering; each pass also has a **32MiB UTF-8 JSON input sum** bound checked with SQLite byte lengths before materialization. This is an input-size budget, not a claim of32MiB process RAM. Excess returns413 with a narrow-filter/configuration instruction; no prefix of the dataset is silently presented as exact. Compare may evaluate two separately bounded passes. Source data/metadata are validated before similarity.
6. Compute query once through D03 real E5 using `query: `,384D, masked mean pooling and L2. LOCAL computes cosine against **all eligible stored vectors**, ranks by descending score then ascending ID for exact deterministic ties, and selects Top-K. Identical/orthogonal/opposite and controlled persisted-vector ranking use independent mathematical fixtures, explicitly NOT E5.
7. LIVE sends a server-side correlated ACTIVE generation/chunk allowlist plus caller metadata constraints **before SDK Top-K** (details below). Keep provider cosine scores, with only ≤2e-5 boundary roundoff clamping; do not relabel ANN as LOCAL exact or probability.
8. Hydrate every hit with the actual confirmed chunk text, first360 characters as a literal snippet, source filename, document/version/chunk/page/model metadata. Source URL is relative and UUID-bound: `/documents?document=<uuid>&version=<uuid>&chunk=<uuid>&page=<page_start>`.
9. Before returning, reread the ACTIVE pointer/state/model set and every returned confirmed source. If activation/deletion/source change occurred while embedding or querying, fail409 and require an explicit retry; stale hits are not returned. This is snapshot/final-revalidation semantics, not a promise against a later change after the response.

Read-only search neither confirms/re-chunks nor creates index/namespace/manifest, upserts, deletes or changes active state. Status/catalog discovery reads actual local index rows; an empty installation directs the user to D04 ingestion. Schema3 remains unchanged.

## LIVE operation-family proof and bounded calls

Pinned SDK remains **pinecone10.3.0 / API2026-07**. The installed SDK's `pinecone._internal.legacy_index_translation.legacy_vector_schema` translates legacy dense384/cosine arguments into exactly `schema.fields._values`; its own source identifies that reserved field as the Vectors API representation. The unit contract compares D04's shape to that SDK translation. This shape uses **`Index.query(vector=..., namespace=..., filter=..., top_k=..., include_metadata=True, include_values=False)` → POST `/query`**. It is not an arbitrary document schema and does not use `documents.search`.

Actual SDK HTTP-transport tests assert API header2026-07, trusted SDK-described HTTPS host, namespace, vector width, Top-K, metadata filter and request count. DNS is blocked; vectors/responses are synthetic **NOT E5**, so this is serialization/operation-family evidence, **not Pinecone account verification**. Official references: [Vectors guide](https://sdk.pinecone.io/python/how-to/vectors/upsert-and-query.html), [Index query reference](https://sdk.pinecone.io/python/reference/sync-index.html), [v10 migration](https://sdk.pinecone.io/python/migration/v10-migration.html). Actual cloud compatibility still needs separately authorized smoke.

The new tests found an inherited D04 issue: SDK10.3 `Pinecone.index()` drops the parent's RetryConfig, and Index has no public retry argument. `pinecone_compat.py` is a narrow **version-guarded private transport shim** setting the actual Index retry transport to0 retries before any operation. It fails closed if SDK version/transport shape changes. Both SDK query negative tests and prior D04 adapter tests exercise it. This restores D04's documented bounded application retry policy and prevents hidden multiplication. This private API dependency must be revalidated before any SDK upgrade; no installed SDK files were modified.

LIVE candidate constraints are built only by the server. Per verified generation, correlate `owner_job`, document/version IDs and eligible `chunk_id $in [...]`, then AND model ID/revision/signature/mode and caller document/name/page intersection. Thus old, unknown generation IDs are not queried as candidates; do not query the namespace and then filter Top-K. Caps:512 eligible manifest IDs,32 jobs and32KiB encoded filter. Excess fails with a narrow-source instruction, not an approximate partial partition. These are application limits, not Pinecone plan/quota guarantees.

After SDK query, each ID and required metadata must match the known eligible manifest/source set; duplicate/unknown/incoherent IDs, namespace mismatch or nonfinite/out-of-range score fail closed409. Additional untrusted provider metadata is not returned to the browser. No post-Top-K predicate is used as a replacement for server prefiltering. An external writer can mutate cloud data after D04 activation, so use a dedicated namespace/exclusive owner; a provider inconsistency requires reconciliation, not invented recall or source text. ANN may differ from LOCAL exact; no universal bitwise/ranking parity claim is made. The cloud candidate count is **manifest eligible IDs**, not a provider-wide total.

### Authorization

Default `PVL_LIVE_SEARCH_ENABLED=0`. Before any LIVE search/catalog/namespace read, require separately approved operator opt-in (`1`), per-request true `confirm_live_read`, configured server key and allowed process (`PVL_DISABLE_CLOUD` not1). Compare additionally requires true `confirm_live_compare` because it adds an unfiltered query read. UI shows target, consent and LIVE NOT VERIFIED, never asks for an API key. The key stays in ignored server env. Mode switch, route load, reload and readiness/status do not call cloud.

No LIVE authorization was enabled or used during development. Tests locally clear the cloud-disable flag only while fake transport and blocked DNS are installed, using dummy credentials. No create/upsert/delete operation exists in Search. D04's separate write approval is still required for those endpoints. Before owner-approved LIVE smoke, disclose exact project/index/cloud/region/namespace, synthetic records, expected reads and current quota/cost risk; do not infer approval from an existing key. Project label is operator supplied as documented in D04, not independently attested.

## Source navigation / UI

Search form exposes raw question, Top-K1–10, LOCAL/LIVE, index/namespace, document/file/page filter, clear/reset and explicit compare. Controls clear stale results when inputs/target change. Model unavailable, invalid range, no eligible namespace, offline, service errors and loading/cancellation are explicit. No results persist or auto-run on reload; queries are not saved to server/browser storage.

Each result shows rank, signed raw cosine in[-1,+1], actual snippet/full text, index/namespace/adapter origin, source IDs/pages/revision and copy citation. Scores are not percentages. Returned hit count is not the total matching document count. Source deep links select exactly the requested retained confirmed version/chunk/page even if D02's newest confirmed pointer differs from D04 ACTIVE. Invalid/incomplete/mismatched links fail clearly, without choosing a fallback source. Documents workbench resets through a URL key, aborting stale loads, and retains all D02 behavior.

Trace stages use `perf_counter`: validation/token budget, active selection, SQL metadata prefilter, source lookup/provenance validation, query embedding, actual vector query/scoring, source mapping, active/source revalidation and response assembly. Compare adds separately named passes, reusing the embedding. SQL prefilter includes the source joins/read; source lookup decodes/reconciles those fetched chunks, not a second unmeasured database request. Total scope is the service handler excluding HTTP transfer/browser rendering/response serialization. No synthetic stage durations or internal Pinecone telemetry are invented. Full numeric timings remain in JSON; UI formatting can display `<0.01ms` for a tiny measured interval.

## Reproduction / evidence

Use D02–D04 upload → chunk → confirm → E5 → SQLite ACTIVE ingest. Open `http://127.0.0.1:5173/search`, select the ingested namespace, enter a question, optionally filter/compare, Search and Open exact source. No Ollama install is required. Commands are in README. Tests use isolated ignored data/temp and installed Edge; real cached E5 and offline NOT E5 fixture tracks are separate. [D05 report/logs/examples/screenshots](../evidence/d05/REPORT.md). D01–D04 evidence remains immutable.

Pending: authorized LIVE smoke, actual GitHub CI run, public/multi-user hosting/security, semantic relevance benchmarking and FTS/reranking. RAG and educational Slab simulation are separate D06/D07 features; neither changes the meaning of Search scores or supplies Pinecone telemetry.
