# Current architecture — D02

```text
React / TypeScript / Tailwind + D01 shell
  └─ typed /api → Vite proxy :5173 → FastAPI :8000 (loopback)
       ├─ health → UTC timestamp / declared capabilities
       ├─ PDF/TXT → capped body → validation → page extraction
       │    └─ ignored .data/ : original UUID files + SQLite
       └─ cached E5 tokenizer → preview → confirmed version → JSONL
```

`GET /api/health` retains D01 fields, now declaring `version: 0.2.0`, `phase: D02`, `documents: available`, `pinecone: not_configured`, `embedding: not_loaded`. Frontend validates before ONLINE. Network/HTTP/schema failure or a 5-second timeout produces OFFLINE. Refresh is every 15 seconds/on demand. CORS permits explicit local origins. Tokenizer availability is separate: missing assets do not disable extraction or falsely imply an embedding model is loaded.

[Document architecture](documents.md) defines canonical source, offsets, schema1, versions and limits. [Tokenizer contract](../tokenizer.md) defines pinned offline loading/budgets. No OCR, cloud upload, vector upsert or model weights. Only the explicit tokenizer CLI downloads assets. The fixture server is a separate test entry point, conspicuously labeled; production has no automatic fallback.

## Planned D03–D09

Confirmed chunks → multilingual-e5-small embeddings (planned384D) → vector store → semantic search → optional local RAG. Guided demo and educational Slab simulator follow. These stages remain unimplemented.

- **LIVE PINECONE:** planned real cloud API/index/namespace/scores with server credentials.
- **LOCAL DEMO:** planned local retrieval with any fixtures labeled.
- **SLAB SIMULATOR:** planned educational state machine, separate from telemetry.

D03 must match tokenizer/prefix/model and preserve document/page/version provenance. No automatic cloud action or model download is introduced.

## Verification boundaries

API tests use temporary SQLite and synthetic PDF/TXT. Default tests use deterministic offline tokenizer fixtures; a separate real-E5 check validates Unicode/budgets/coverage with cached official assets. Local Edge E2E uses the production API and real tokenizer. CI explicitly selects the separate fixture server, never fetches AI assets, and does not claim real-E5 coverage. Health/offline/navigation/Git guard regression remain. [D02 evidence](../evidence/d02/REPORT.md) records commands/status; [D01 evidence](../evidence/d01/REPORT.md) remains historical and unchanged.
