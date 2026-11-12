# D06 — optional local RAG and API contract

`POST /api/rag/chat` calls the **same `SearchService.search`** as `/api/search`. There is no second retriever, cached-answer path, alternate embedding or Pinecone write. Each turn does fresh query embedding, ACTIVE selection, pre-ranking filters, Top-K and source hydration. The service preserves D05's explicit LIVE-read authorization and candidate/model/namespace limits. Default LOCAL uses cached E5 and SQLite. RAG's `compare` and `confirm_live_compare` must be false: no hidden extra query.

```text
Vietnamese raw query + target/filters
  → D05 Search (verified ACTIVE / confirmed / model signature)
  → ordered bounded source prefixes + IDs S1..S5
  → system instructions + JSON untrusted-data envelope
  → opt-in loopback POST /api/chat (or search-only / unavailable)
  → exact-quote validation against only the supplied prefixes
  → ACTIVE pointer + source text/metadata revalidation
  → server-constructed excerpts, links, separate hits/context and measured trace
```

## Request and response

Example (an ACTIVE local collection must exist):

```json
{"query":"Tìm kiếm vector hoạt động như thế nào?","top_k":3,"target":{"mode":"local","index":"local-e5","namespace":"seminar"},"filters":{},"llm_enabled":true,"model":"qwen2.5:1.5b"}
```

Same strict D05 grammar: Top-K integer1–10; raw query1–20000 characters/backend E5≤512 input tokens with `query: ` and specials, no silent truncation. UI limits query to2000 characters additionally. UUID document/version, exact stored Unicode filename and intersecting 1-based page range filters. Unknown fields, endpoint/host/runtime parameters, model tags and history/system messages are rejected. Client memory holds at most4 turns, never sent/persisted; target/index/namespace/filter/model/LLM mode changes clear the session, leaving RAG tab clears history. Semantic Search form state is retained across tab switches.

Response fields (typed OpenAPI `/docs`, TypeScript `rag-api.ts`):

| Field | Meaning |
| --- | --- |
| `status`, `answer`, `no_answer_reason` | answered / insufficient_context / search_only / llm_unavailable / timeout / invalid_citations / stale_sources; no fake answer on failure |
| `retrieval_hits`, `search` | actual D05 results and complete nested Search response/trace |
| `used_sources` | source ID, original hit/provenance, exact text prefix assembled for the attempted LLM request, truncation and cited flag; empty when LLM off/disabled/no context |
| `assembled_context` | exact user JSON message (question + labels/text); search-only mode is a preview, `request_attempted=false` |
| `context_budget` | actual UTF-8 prompt bytes (system + user), caps, conservative estimate, warnings, request-attempt flag |
| `llm_model` | requested vs actual returned allowlisted tag, provider mode, provider usage only when returned; null actual model on no successful generation |
| `trace` | monotonic retrieval/context/Ollama/source-recheck stages and total server time; nested D05 timing is not added a second time |

`GET /api/rag/status` is passive configuration only. **Only an explicit `?probe=true`** with server opt-in makes a bounded `GET /api/tags`; no status call on tab mount. Inventory lists allowlisted downloaded artifacts only, not loaded status or successful inference. Errors are static codes, never raw response/exception bodies. Health advertises optional capability without any Ollama call. POST body cap1MiB before parsing. RAG concurrency2; LLM client max1 operation (fail-fast busy), timeout60s including response body. UI abort220s accommodates D05's existing search deadline + LLM. Disconnect signals D05's cancellation event and cancels/ closes the owned async HTTP stream. No retries, process kills, background daemon startup or model unload endpoint; `keep_alive=0` requests unload after generation.

## Context budget and conservative answer policy

Fixed `num_ctx=4096`, reply reserve512, additional chat-template/framing reserve512. Prompt content≤3072 **UTF-8 bytes**, counted after JSON escaping and including question, source labels and system instructions. This is a deliberately conservative **estimate**, not exact Qwen/E5 tokenization. At most5 sources, ≤1000 text bytes/source, Unicode-boundary binary search on visible prefixes; fewer than20 characters fitting excludes a source. Actual inclusion order follows D05 rank. Truncation/exclusion is reported. If query/instructions consume the budget, no model call. Actual `prompt_eval_count`/`eval_count` are shown only if returned; reject over-budget usage or incomplete/length-limited responses. Chat-template/tokenizer behavior still needs real-Ollama validation; no guarantee for arbitrary models, hence only two fixed tags.

The model must return JSON `{ "insufficient": false, "quotes": [{"source_id":"S1","quote":"verbatim excerpt"}] }`, or insufficient=true/empty quotes. Validate1–3 quotes of20–600 characters, allowed source ID, **exact substring of the text actually sent**, no `[S...]` markers inside quotes. Unknown IDs, unsupported prose, forged quotes or extra keys fail closed. Backend constructs the answer from these excerpts and `[S#]` markers and builds links exclusively from D05 provenance. No free-form paraphrase is accepted. This restrictive extractive policy is intentional for D06; it may refuse valid free-form model answers. It does not establish that an excerpt answers the question, that a source is true, or that a real LLM resists every injection.

The service re-joins the same verified ACTIVE manifest, item ownership, confirmed version, document, chunk text/page/name/model metadata after inference, with no second embedding or cloud call. Superseded/deleted/missing/changed sources clear the answer, context and source/hit lists with `stale_sources`. Snapshot revalidation describes return-time storage, not a perpetual guarantee after response delivery. Confirmed version deep links preserve historical sources.

## Trust boundary and safety

PDF/TXT, user question, model output and prior chat are untrusted. Sources are JSON-escaped data within a system/user role separation; no tool/function execution, URL fetch, shell, HTML or Markdown renderer. The model receives no server environment, credentials, absolute file paths or previous turns. React renders plain text and server-grounded internal source links. Injected commands remain data; tests establish deterministic contract behavior, **not** real-model immunity. Client copy is explicit. No chat/answer persistence, body logging or telemetry; do not enable HTTP debug/body logging with private documents. SQLite D02–D05 schema remains3 without transcript tables or destructive migrations.

`PVL_OLLAMA_ENABLED=0` by default. When explicitly approved and configured, `PVL_OLLAMA_URL` accepts only literal HTTP loopback IP/port (default127.0.0.1:11434), no DNS aliases, credentials, remote IP, path/query/fragment, redirects or environment proxies (`trust_env=False`). This protects remote SSRF; a deliberately configured unrelated loopback service is still an operator responsibility. No endpoint is request-controlled. Tags `qwen2.5:1.5b` and `qwen2.5:3b` only, temperature0,2 threads, streamfalse/JSON, no tools. Provider failures preserve retrieval; D05 Search has no Ollama dependency.

## Sources, licenses and verification limits

Read official [chat API](https://docs.ollama.com/api/chat), [tags API](https://docs.ollama.com/api/tags) and [Qwen2.5 library](https://ollama.com/library/qwen2.5) on2026-11-12. Tags1.5b≈986MB / Apache-2.0;3b≈1.9GB / **Qwen license, not Apache-2.0**. [Windows setup](https://docs.ollama.com/windows), [Ollama MIT source](https://github.com/ollama/ollama/blob/main/LICENSE). No dependency added: existing pinned httpx0.28.1 (BSD-3-Clause) implements the HTTP adapter; no Ollama SDK/binary/model redistributed. Ollama tag names are mutable; record actual inventory digest/size and installed runtime version before any authorized smoke. No digest or model performance is claimed here.

Offline tests use `httpx.MockTransport`, **MOCK OLLAMA / NOT REAL LLM** and deterministic **NOT E5**. Separate tests use verified cached real E5 + SQLite + Mock Ollama. `testsupport.rag_server` is an explicit browser-test entry, never selected in production by an environment fallback. CI disables real Ollama/cloud/downloads; no daemon needed. **REAL OLLAMA NOT VERIFIED — NEEDS USER INSTALL/APPROVAL**; no binary/model/startup/download/inference performed. LIVE remains unverified. These limitations are separate from local orchestration/contract gate results in [D06 report](../evidence/d06/REPORT.md).
