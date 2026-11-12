# Current architecture — D07

```text
React / TypeScript / Tailwind + D01 shell
  └─ typed /api → Vite proxy :5173 → FastAPI :8000 (loopback)
       ├─ health → timestamp / actual cache status / key readiness (no cloud call)
       ├─ PDF/TXT → validation → pages → cached tokenizer → draft/confirmed → JSONL
       ├─ confirmed chunks / queries → owned CPU E5 worker → 384D + cosine
       │    └─ D03 source embeddings → SQLite (queries do not persist)
       └─ explicit confirmed ingest → version manifest → bounded batch + fetch verification
            ├─ LOCAL DEMO → persistent SQLite values + metadata, scoped by index/namespace
            └─ LIVE PINECONE → backend SDK / key / exact authorization (not verified)
```

Health keeps D01 behavior and declares `version: 0.7.0`, `phase: D07`, `rag: optional_local`, `documents: available`, `vector_store: local_available`, `search: available`, `pinecone: not_configured | configured_not_verified` and actual `embedding`/`embedding_mode`. Key configured is not proof of connectivity or permissions. Frontend validates this shape before ONLINE; errors/5-second timeout produce OFFLINE. Refresh every 15 seconds/on demand. CORS permits explicit local origins.

[Documents](documents.md), [tokenizer](../tokenizer.md) and [E5](embeddings.md) retain source/version/token budget and approved cache contracts. Only explicit setup CLIs download assets. Production has no fixture fallback. [Vector storage](vector-store.md) describes forward schema3 migration, actual adapter fetch, deterministic IDs, leases, bounded retries, checkpoints, CAS activation after verification and exact owned delete. Source deletion never implicitly becomes a cloud write/delete.

LOCAL DEMO is operational with real E5. The LIVE adapter is implemented against SDK10.3/API2026-07 and tested with offline HTTP transport, but **LIVE NOT VERIFIED — AWAITING USER AUTHORIZATION**. No account telemetry is fabricated. Project label comes from server configuration and must be checked against the key's project in Pinecone console. The UI never receives credentials or accepts arbitrary SDK hosts. Index writes/deletes require separate specific owner approval and explicit confirmations.

## Simulator and Guided Demo (D07); planned D08–D09

LOCAL exact semantic Top-K/filter/trace is implemented in D05 through verified ACTIVE vectors and original confirmed sources; LIVE query has SDK contract tests but no authorized account smoke. D06 optional local RAG reuses D05 Search, with bounded context, verified verbatim citations and post-generation ACTIVE checks. Real Ollama awaits approval/setup. [RAG API/trust boundaries](rag.md) describe the active Search Lab tab.

D07 adds a pure typed [Slab simulator](slab-simulator.md), snapshot/reducer → React Flow graph → scoped finite GSAP presentation. It uses explicit2D toy records, no API/telemetry. The opt-in [Guided Demo](guided-demo.md) invokes the existing Store/EmbeddingService/VectorService/SearchService/RagService through explicit local actions, with a separate schema1 receipt journal and fixed owned LOCAL namespace. Backend data credit is recomputed; browser state stores only navigation/simulation pointers. Reset/cancel never deletes stored data. [Vietnamese seminar script](../demo/d07-seminar.md). D08 overall polish and D09 packaging remain planned.

## Verification boundaries

Offline tests use isolated SQLite and explicit **NOT E5** providers, plus actual SDK serialization with fake HTTP transport and DNS blocked. Real-E5 tests separately verify cached checksums, masked pooling, prefixes, budget, persistence and Edge flows. CI installs locked packages/browser, then tests without AI assets/cloud keys; it never runs setup/download. Local fixture success is not GitHub CI success. [D07 evidence](../evidence/d07/REPORT.md) records actual commands/exits and1440/390 captures; D01–D06 evidence remains historical and unchanged.

## Search read path (D05)

[Search architecture/API](search.md): validated query → ACTIVE pointer/verified manifest → SQL prefilter + confirmed source → real E5 `query: ` → exact LOCAL cosine or consent-gated SDK ANN → Top-K → source hydration/revalidation → measured trace. Search does not write storage or run LLMs. LIVE is disabled unless explicitly opted in and confirmed; no cloud startup/status/reload behavior.
