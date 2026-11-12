# Current architecture — D03

```text
React / TypeScript / Tailwind + D01 shell
  └─ typed /api → Vite proxy :5173 → FastAPI :8000 (loopback)
       ├─ health → UTC timestamp / declared capabilities
       ├─ PDF/TXT → capped body → validation → page extraction
       │    └─ ignored .data/ : original UUID files + SQLite
       ├─ cached E5 tokenizer → preview → confirmed version → JSONL
       └─ confirmed chunks / queries → owned CPU E5 worker → 384D + cosine
            └─ source vectors → schema2 SQLite records (no vector DB upsert)
```

`GET /api/health` retains D01 fields, now declaring `version: 0.3.0`, `phase: D03`, `documents: available`, `pinecone: not_configured`, `embedding: <actual cache/load state>` and `embedding_mode: e5 | test-fixture-not-e5`. Frontend validates before ONLINE. Network/HTTP/schema failure or a 5-second timeout produces OFFLINE. Refresh is every 15 seconds/on demand. CORS permits explicit local origins. Tokenizer availability is separate: missing assets do not disable extraction or falsely imply an embedding model is loaded.

[Document architecture](documents.md) defines canonical source, offsets, schema1, versions and limits. [Tokenizer contract](../tokenizer.md) defines pinned offline loading/budgets. D03 adds real local384D embedding inference with approved cached weights, masked mean pooling and L2 normalization; no OCR/cloud upload/vector upsert. Only explicit tokenizer/model setup CLIs download assets. The fixture server is a separate test entry point, conspicuously labeled; production has no automatic fallback.

## Planned D04–D09

Confirmed chunks → real local E5 embeddings (384D) are implemented. Vector store → semantic search → optional local RAG remain planned. Guided demo and educational Slab simulator follow. These stages remain unimplemented.

- **LIVE PINECONE:** planned real cloud API/index/namespace/scores with server credentials.
- **LOCAL DEMO:** planned local retrieval with any fixtures labeled.
- **SLAB SIMULATOR:** planned educational state machine, separate from telemetry.

D03 matches tokenizer/prefix/model and preserves document/page/version provenance; D04 should reuse EmbeddingService. No automatic cloud action or model download is introduced.

## Verification boundaries

API tests use temporary SQLite and synthetic PDF/TXT. Default tests use deterministic offline tokenizer fixtures; a separate real-E5 check validates Unicode/budgets/coverage with cached official assets. Local Edge E2E uses the production API and real tokenizer. CI explicitly selects the separate fixture server, never fetches AI assets, and does not claim real-E5 coverage. Health/offline/navigation/Git guard regression remain. [D03 embedding design/schema2](embeddings.md) and [D03 evidence](../evidence/d03/REPORT.md) record current contracts/status. Historical D02 evidence remains unchanged; [D01 evidence](../evidence/d01/REPORT.md) remains historical and unchanged.
