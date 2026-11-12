# Current architecture — D04

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

Health keeps D01 behavior and declares `version: 0.4.0`, `phase: D04`, `documents: available`, `vector_store: local_available`, `pinecone: not_configured | configured_not_verified` and actual `embedding`/`embedding_mode`. Key configured is not proof of connectivity or permissions. Frontend validates this shape before ONLINE; errors/5-second timeout produce OFFLINE. Refresh every 15 seconds/on demand. CORS permits explicit local origins.

[Documents](documents.md), [tokenizer](../tokenizer.md) and [E5](embeddings.md) retain source/version/token budget and approved cache contracts. Only explicit setup CLIs download assets. Production has no fixture fallback. [Vector storage](vector-store.md) describes forward schema3 migration, actual adapter fetch, deterministic IDs, leases, bounded retries, checkpoints, CAS activation after verification and exact owned delete. Source deletion never implicitly becomes a cloud write/delete.

LOCAL DEMO is operational with real E5. The LIVE adapter is implemented against SDK10.3/API2026-07 and tested with offline HTTP transport, but **LIVE NOT VERIFIED — AWAITING USER AUTHORIZATION**. No account telemetry is fabricated. Project label comes from server configuration and must be checked against the key's project in Pinecone console. The UI never receives credentials or accepts arbitrary SDK hosts. Index writes/deletes require separate specific owner approval and explicit confirmations.

## Planned D05–D09

Semantic/top-k search, RAG, simulator, advanced animation, tour and deployment remain planned. Embedding/cosine and stored-vector inspection are not a Pinecone top-k search. SLAB SIMULATOR will remain an educational model separate from actual telemetry. No D05 endpoint/UI has been implemented.

## Verification boundaries

Offline tests use isolated SQLite and explicit **NOT E5** providers, plus actual SDK serialization with fake HTTP transport and DNS blocked. Real-E5 tests separately verify cached checksums, masked pooling, prefixes, budget, persistence and Edge flows. CI installs locked packages/browser, then tests without AI assets/cloud keys; it never runs setup/download. Local fixture success is not GitHub CI success. [D04 evidence](../evidence/d04/REPORT.md) records actual commands/exits and 1440/390 captures; D01–D03 evidence remains historical and unchanged.
