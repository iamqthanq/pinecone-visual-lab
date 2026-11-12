# Cross-Lab Guided Demo — D07

Start explicitly from Overview. The tour wraps the existing Documents, E5, Local Vector Store, Search, optional RAG and Architecture labs; ordinary use remains available with the tour off. Opening a route never marks a data step complete and never runs embedding, ingestion, search, cloud discovery or Ollama.

## Data and evidence authority

The backend creates an opaque UUID session and fixes its target to `LOCAL DEMO / local-e5 / pvl-demo-<session UUID without hyphens>`. Requests cannot override mode, index, namespace, host or source IDs. A project-authored Vietnamese TXT is uploaded through the real D02 Store; the tour cannot adopt/delete an arbitrary personal document. The sample has an explicit **CC0-1.0** notice in `apps/api/app/demo_sample.txt` and contains synthetic Vector Database/seminar prose, not copied Pinecone article text or personal data.

The original D02–D06 `documents.sqlite3` remains schema3. A separate ignored `guided-sessions.sqlite3` uses schema1:

```sql
CREATE TABLE sessions(id TEXT PRIMARY KEY, data TEXT NOT NULL);
PRAGMA user_version=1;
```

The JSON row contains session/creation IDs, fixed target, document/source hash, draft/version/chunk/job IDs and action receipts. It does **not** store query, answer or source text. Maximum128 sessions,16KiB per receipt row; no automatic expiry/deletion. Unknown journal schemas or unexpected existing tables are refused without migration/deletion. Sixteen bounded nonblocking lock stripes reject concurrent actions with429. Keep the local API on loopback; this is not multi-user authentication.

Browser `sessionStorage` key `pvl-guided-v1` contains schema1, session UUID, current step, simulator seed/mode/cursor/speed and inspected final modes. Parsing is capped at2048 JavaScript code units and validates every retained field (the retained payload is ASCII, below2KiB). It stores no source text/vector or completion truth. Reload restores the route-independent session, pauses the simulator and GETs fresh backend evidence. Response generation tokens and AbortControllers prevent canceled/older actions from restoring a canceled tour. Storage-disabled browsers can use the in-memory tour but cannot retain it across reload.

On GET/action responses, the server recomputes completion from actual files/DB:

| Tour step | Evidence required |
| --- | --- |
| Upload | Explicit upload receipt plus owned UUID TXT and unchanged SHA-256/size/type |
| Extract | Explicit page inspection receipt plus actual nonempty 1-based page text |
| Confirm chunks | Confirmed nonempty pinned version, produced by preview/explicit confirmation |
| Embedding | Current provider signature, original confirmed source/hash/version/chunk and finite unit384D cached vector |
| Upsert and fetch | Exact target/version/model, verified ACTIVE manifest/pointer/checkpoint and actual adapter fetch of owned vector/provenance |
| Search | A nonempty D05 result receipt tied to the same ACTIVE job/version/model; empty searches clear credit |
| Optional RAG | Answered/search-only result with retrieval sources, or explicit Skip after successful search |
| Simulator | Browser records inspection of all three deterministic final snapshots; explicitly **simulation**, not backend data evidence |

Deleting/changing the source, losing vectors/ACTIVE state, changing model signature or reconfirming another version invalidates relevant credit. Confirming the same draft again is idempotent and preserves downstream receipts. Starting a new preview does not overwrite a confirmed version or active manifest. Source links pin document/version/chunk/page; validated URL parameters preselect existing workbenches without auto-running work. `local-e5` is preferred over alphabetically earlier unrelated indexes in normal Search/RAG defaults.

## API and explicit operations

- `POST /api/guided/sessions` →201 session; no model or cloud action.
- `GET /api/guided/sessions/{UUID}` → recomputed session state; no inference or cloud traffic.
- `POST /api/guided/sessions/{UUID}/actions` → `{session, result}`. Unknown fields/actions rejected. Body capped at1MiB.

Action names: `upload`, `extract`, `preview`, `confirm`, `embedding`, `ingest_preview`, `ingest_step`, `fetch`, `search`, `rag`, `skip_rag`, `reset`. Preview defaults300/50, constrained size64–400 and overlap<size, at most16 chunks; tokenizer/input budget still enforced by D02/D03. Confirm and each ingest step require `confirmed:true`. The existing bounded D04 job can be resumed after reload, then verified by explicit Fetch. Search accepts raw question, Top-K1–10 and optional page; the backend fixes its document filter and namespace. Search reuses the **same D05 SearchService**, not a parallel retrieval algorithm. RAG reuses D06 RagService and defaults `llm_enabled:false`.

Existing model/ingest/retrieval resource limits and cancellation propagate through disconnect-aware runners. The UI has a220-second action abort and explicit Cancel current action. Cancellation may occur after an already committed upload/version/batch; refresh actual evidence and resume rather than assume rollback. Start/refresh operations perform only local journal/data reads or create metadata.

The UI shows pages, draft/confirmed chunks, real384D vector inspector, actual fetched adapter records, search source links/trace and RAG context/sources. Back/Next change tour location; Next requires current server credit. The stepper may inspect any step without granting credit. RAG can be skipped; enabling LLM explicitly requires prior operator approval, as in D06. No daemon call happens on opening/swapping tabs. E2E uses **MOCK OLLAMA / NOT REAL LLM**; real Ollama remains unverified.

## Reset, cancel and retention

**Reset tour / simulation only** clears guide receipts/source-version selection and resets simulated state. It preserves documents, pages, drafts, confirmed versions, embeddings, vector jobs, indexes and namespaces. A valid existing owned sample is reused by an explicit Upload action after reset. If that sample is missing/changed, reset detaches the invalid ID in metadata; it does not remove or repair the file. Cancel removes browser tour state and stops the owned request; it does not delete server receipts/data. There is no guided DELETE endpoint or data-cleanup button.

Documented limitations: the receipt journal and document Store use separate transactions; a crash between sample upload and journal save can leave an unreferenced synthetic sample. Metadata reset can leave previous owned versions/jobs intact, intentionally. Session128 limit requires manual owner inspection rather than automatic cleanup. Restore reconstructs completion and IDs, not prior ephemeral result cards; use explicit Inspect/Fetch/Search again. These tradeoffs preserve user data. Backend file/SQLite corruption and cross-process/multi-user access are outside the local teaching scope.

## Reproduction and mode labels

Use normal Windows startup/check commands in README. Real E5 uses only the previously approved verified cache, never import/startup download. Offline CI explicitly starts a test-only **NOT E5** provider and Mock Ollama; production has no fixture fallback. All guide storage is isolated under the configured ignored data root. No LIVE target exists in the guide, and reset cannot affect LIVE data.

See [seminar script](../demo/d07-seminar.md), [Slab rules](slab-simulator.md) and [evidence](../evidence/d07/REPORT.md). Planned D08 polish and D09 packaging are not part of D07.
