# D01 architecture

```text
Browser (React / TypeScript / Tailwind, local fonts)
  └─ typed fetch /api/health → Vite local proxy :5173
                               └─ FastAPI :8000 (loopback)
                                    └─ fresh health timestamp + declared D01 capabilities
```

The client validates the health contract before showing ONLINE. Network failure, HTTP error, invalid JSON/schema, and the 5-second timeout produce an actionable OFFLINE state. Requests are aborted on cleanup; status refreshes every 15 seconds or on demand. CORS allows only configured explicit local origins. Neither API nor UI connects to Pinecone or loads AI models.

`GET /api/health` returns `status: ok`, `service: pinecone-visual-lab-api`, version, `phase: D01`, UTC timestamp, `pinecone: not_configured`, `embedding: not_loaded`. There are no fabricated storage counts. Future lab pages have navigable explanations and PLANNED labels, without upload/search controls that pretend to work.

## Planned pipeline (D02–D09)

PDF/TXT → page extraction → token-aware chunks → local multilingual-e5-small embeddings (384D) → vector store → top-k semantic search → optional Ollama RAG. SQLite will hold metadata/version/manifest records; local files will hold uploads. Guided Demo and a separate educational Slab state machine follow. No data store or processing implementation is shipped in D01.

- **LIVE PINECONE:** real API/index/namespace/scores; server-only credentials.
- **LOCAL DEMO:** local adapter and actual similarity, or explicitly labeled sample fixtures.
- **SLAB SIMULATOR:** educational simulation with its own state machine, not Pinecone telemetry.

Later contracts must preserve document/page/chunk provenance, stable vector IDs, safe active-version switching, and model/index compatibility. No automatic deletion, model download, or cloud action is introduced by the foundation.

## Verification boundaries

API unit tests use FastAPI TestClient. Browser tests connect to the running local API, then separately test intercepted network failure. A standalone stopped-backend smoke is recorded in the evidence directory. Git safeguards use actual Git for Windows hooks and isolated local repos. Browser testing uses installed Edge with Playwright, independently of unavailable in-chat preview infrastructure. GitHub CI is reported separately from local PASS results.
