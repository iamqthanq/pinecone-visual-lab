# D05 / Issue #9 — Semantic Search handoff evidence

Date:2026-11-12; Windows10/11, PowerShell5.1, Git for Windows, Python3.13.7, Node22.20.0/npm10.9.3, installed Microsoft Edge.

Repository: `iamqthanq/pinecone-visual-lab`; WORKDIR `D:\Corel\HK1_NAM4\PR\Giữa kì\pinecone-visual-lab`. [Issue #9](https://github.com/iamqthanq/pinecone-visual-lab/issues/9) was read completely and directly verified OPEN with A–F. [PR #8](https://github.com/iamqthanq/pinecone-visual-lab/pull/8) was directly verified MERGED at **`5b1ef8122d45a8a5704f6c4258b7a759a8adb2ec`**; Issue #7 directly verified CLOSED. A clean existing checkout was fetched, D04 ancestry verified, and **`feature/issue-9-semantic-search`** created from that `origin/main`, not the old D04 feature branch. Guard config is Issue9/exact feature/workdir; hooks and original workflow remain unchanged.

**LIVE NOT VERIFIED — AWAITING USER AUTHORIZATION.** No real Pinecone account discovery/search/write/delete/create was performed. No key was requested, pasted, logged or committed. LOCAL E5/SQLite is the primary verified product path; actual SDK serialization is tested offline, not falsely claimed as real LIVE. GitHub CI remains **PENDING / NOT VERIFIED BY THIS AGENT until an actual run**. Agent will not open a PR, merge, close Issue9 or begin D06.

Final local gates: **148 backend/API/Git-guard tests PASS** (including12 Git guards), **29 frontend tests PASS**, **4 real tokenizer/E5 tests PASS**, **14 Edge real-E5 +14 Edge NOT E5 fixture tests PASS**. ESLint/TypeScript/Ruff/build/scans PASS; npm audit0 vulnerabilities, pip check consistent. Final gate commands exited0. Safe publication/SHA/clean-tree verification is supplied in the final handoff after push.

## Requirements → code → verification

| Requirement | Implementation | Test/evidence |
| --- | --- | --- |
| Gate0 Issue/merge/clean checkout/base/guard | `AGENTS.md`, `docs/BRANCH_POLICY.md`, existing safe push/hook and local config | Direct Issue9/Issue7/PR8 metadata; `git-audit.txt`; new Issue9 positive/prior-ref negatives plus all existing Git guard tests |
| A1 typed request/filter/hit/trace/response and bounded API | `search_contracts.py`, `search_api.py`, `search-api.ts`, existing upload middleware cap | Strict Top-K1/10/0/11/nonint/bool; unknown operators/host/vectors/UUID/range/filename; safe input errors; explicit resource caps |
| A2 real query E5, prefix/budget/model/384D | Reused D03 EmbeddingService; Search independently reconciles prefix/kind/token count/source signature and unit values | Query-prefix tokenizer oracle, over-budget/missing-model tests, three query identity mismatch cases, real E5 search and retained D03 independent pooling/token tests |
| A3 only verified ACTIVE pointer + correct target/model/source | `search_service.py` SQL joins active pointer AND scope + verified job/item count + confirmed version/source; final revalidation | Pending/running/failed/superseded/deleting/deleted, absent pointer, unverified job, wrong metadata/model, namespace/index isolation, active race fail-closed |
| A4 metadata grammar and overlapping pages | Bound SQL document/version/name equality and `page_start <= to AND page_end >= from` | Actual two-page Unicode PDF cross-page chunk matches page2; NFD filename as stored, SQL-injection text literal/no match, bad ranges/operators rejected |
| A5 prefilter before Top-K | SQL predicates before scoring; LIVE correlated ACTIVE/job/chunk/model filter before SDK Top-K | Independent stored-axis vectors: unfiltered Top1 has score1; filtering to another document returns its score0 record, proving filter-first recall; explicit compare reuses one encode |
| A6 raw cosine, exact ties vs ANN | Stable `hypot`/`fsum` cosine from D03; sort(-score,ID); LIVE preserves provider score | Identical1/orthogonal0/opposite-1 independent oracle; persisted vector edits prove no D03 cache substitution; raw signed UI/no percentage; ANN caveat |
| B1 actual persisted vectors, not samples/cache | SQL `local_vectors` index/namespace/vector ID/owner join | D04 persistence/restart/concurrency regression; independent local search vector-vs-cache check; actual real E5 ingestion and search |
| B2 source ownership, missing-source semantics | Confirmed Document/Version/Chunk joins; required metadata reconciliation; original text/snippet; final source check | Removed source omitted with warning; source vector remains for explicit cleanup; incoherent owner/version/chunk/model removed before rank; exact source mapping |
| B3 finite caps and concurrency | Default2000 candidates (config1–10000),32MiB UTF-8 candidate JSON before materialization;2 slots + bounded D03 worker | Cap returns413 without ranking a prefix; narrowing SQL filters succeeds; busy429; cancellation/deadline paths; no storage mutation assertion |
| B4 offline/read-only | Search never calls local index creation/manifest activation/upsert/delete; LOCAL never touches SDK | Unchanged persisted vector rows after search; no ACTIVE namespace yields truthful empty/skipped inference; no implicit LIVE traffic |
| C1–C2 current SDK operation family | `PineconeLiveAdapter.query`, SDK10.3/API2026-07; reserved `_values` translation test | Actual SDK HTTPTransport + DNS denied: POST `/query`, namespace/384D/Top-K/filter/includeMetadata/API header; 401/403/404/429/500/504 sanitized |
| C3 server ACTIVE allowlist + user filters | Correlated per-generation owner/document/version/chunk allowlist AND model and page predicates; max512 IDs/32 jobs/32KiB | `live_filter` correlation/page/cap unit tests; actual SDK filter serialization; no namespace-wide query followed by post-filter Top-K |
| C4 explicit approved LIVE reads only | Default-disabled `PVL_LIVE_SEARCH_ENABLED`, strict true read consent; separate compare consent; E2E zero key + cloud disabled | Default/no confirmation/fixture LIVE rejected; mode/reload produce no query/discovery; LIVE account smoke **NOT RUN / NOT VERIFIED** |
| C5 provider provenance fails closed, no writes | Recheck ID/metadata/score/duplicate/namespace; response metadata from confirmed source whitelist | Unknown ID, foreign version, NaN, duplicate and untrusted-extra metadata tests; extras not returned; no create/upsert/delete Search operation |
| D1 full Search Lab + exact deep link | `SearchLab.tsx`, `search.css`, retained shell; `document-link.ts`, keyed Documents workbench | Form/filters/clear/reset/compare/top-k; link selects retained ACTIVE source even when latest confirmed pointer is newer; malformed links fail with no fallback |
| D2 source cards/copy/raw score | Rank, literal snippet/full text, source/model/pages/IDs, signed cosine, relative source link | React source/score/link/trace assertions; Edge citation copy/full source text/version/page/reload; real browser JSON |
| D3 measured trace, not fake telemetry | perf_counter stages, token validation, SQL/filter/source, one query inference, query/scoring, hydration/revalidation/response | Actual monotonic finite nonnegative durations and stage-sum<=total assertions; real and fixture samples separate; scope excludes network/browser/serialization |
| D4 operational states/a11y/responsiveness | Model readiness, offline, empty, invalid filter, errors/cancel; clears stale results; keyboard; restrained existing theme | React unavailable/error/no match/stale namespace/consent/offline; Edge axe serious/critical0, overflow320–1440, actual1440/390 captures |
| D5 no LLM requirement | RAG badge PLANNED D06; no RAG endpoint/dependency | Health regression retains `/api/rag`404; all Search runs without Ollama |
| E1–E2 correctness/API/SDK/identity | `test_search.py`, `test_search_live.py`; all D01–D04 tests retained | Actual full quality log plus real track; no tests removed/suppressed for green status |
| E3 offline fixture CI | Fixture provider remains NOT E5; locked dependencies, cloud/HF offline, no weights/key in CI | Local Edge fixture suite; Actions uploads current fixture samples/screens/traces, not a fabricated real integration result |
| E4 actual real E5 PDF/TXT | `test_real_search.py`; production Edge API + cached official model | Known-relevant Vietnamese example, page filter/compare/original source; observation, not universal relevance theorem |
| E5 lint/types/tests/build/audit/scan | Existing `scripts/check.ps1`, bounded Vitest workers; separate model/Edge tracks | Actual commands/exits below; npm audit0 vulnerabilities; pip check consistent; build/source/artifact scans |
| F1–F2 architecture/runbook/evidence | README, `.env.example`, `docs/architecture/search.md`, overview/design/vector-store note; this directory | Requirement mapping, raw JSON requests/responses, logs, screenshots, version manifest and limitations |
| F3–F4 safe handoff | Existing safe script/hooks, exact Issue9 branch; no agent PR/merge/close/D06 | Reviewed changed-file inventory; final handoff must attest local=remote SHA and clean tree after safe push. A commit cannot include its own SHA, so publication verification is supplied separately |

## Actual execution commands / logs

Every final log is recorded through `scripts/run_logged.py` with the actual command, output, exit code and elapsed time. Final counts are taken from logs rather than assumed from D04. Intermediate failures below are retained and superseded by reruns.

| Command from Windows repository root | Evidence / boundary |
| --- | --- |
| `powershell -NoProfile -ExecutionPolicy RemoteSigned -File scripts/check.ps1` | `quality-gates.txt`: exit0; ESLint/strict TS/29 Vitest, Ruff/148 Pytest/Git guards, production build, secret/artifact and diff checks |
| `.\.venv\Scripts\python.exe scripts/run_pytest.py -m "real_tokenizer or real_model" -s` | `real-e5.txt`: **4 PASS**, no skips — real tokenizer, independent pooling/prefix/budget, actual storage, actual PDF/TXT Search |
| `.\.venv\Scripts\python.exe scripts/run_pytest.py apps/api/tests/test_real_search.py -m real_model -s` | `real-search.txt`: first targeted real E5 semantic search PASS; superseded by full real track |
| `.\.venv\Scripts\python.exe scripts/run_pytest.py apps/api/tests/test_search.py apps/api/tests/test_search_live.py` | `search-correctness.txt`: targeted correctness/actual SDK contract development checkpoint; final suite includes subsequent provider-result tests |
| `npm.cmd run test:e2e` | `edge-real-e5.txt`: **14 PASS** including all prior12 Edge tests plus Search/source navigation/filters/trace. Production API, actual cached E5; synthetic private test store |
| `$env:PVL_E2E_FIXTURE='1'; npm.cmd run test:e2e` | `edge-fixture.txt`: **14 PASS**, explicit NOT E5, actual SQLite/HTTP/UI with fake model and cloud blocked; local CI-runtime reproduction, not GitHub CI status |
| `npm.cmd audit --audit-level=moderate` | `npm-audit.txt`: exit0,0 vulnerabilities; public dependency advisory metadata only |
| `.\.venv\Scripts\python.exe -m pip check` | `pip-check.txt`: exit0, no broken requirements |
| Existing verified model/tokenizer manifest inspection | `asset-verification.txt`, `sdk-model-manifest.json`: actual SHA/size verification, no new weights downloaded |
| `.\.venv\Scripts\python.exe docs/evidence/d05/verify-artifacts.py` | `build-and-evidence-scan.txt`: production bundle secrets check,4 real vector files, JSONL parse/budget,2 real Search samples +1 NOT E5 sample and timing/score identities |
| `powershell -NoProfile -ExecutionPolicy RemoteSigned -File docs/evidence/d05/git-audit.ps1` | `git-audit.txt`: exact branch/config/ancestry/origin, guard, original workflow hash and D01–D04 evidence/reference/guard implementation unchanged |

Only owned Edge/API/web/model processes are started/stopped. Tests use ignored `.cache/e2e-d05/<pid>` and fresh `.cache/pytest/<uuid>` temp/cache; no shared Temp cleanup or user dataset reset. Test web/API ports are5174/8001; interactive runbook uses5173/8000. Playwright stops its own servers after tests; no service/autostart was installed.

### Corrections made during development

- Regression found health default still D04 after its literal annotation moved to D05; actual default and validated frontend contract now agree on D05/search available. `backend-initial-failure.txt` and `edge-fixture-initial-failure.txt` retain the failures; all assertions were retained and rerun.
- New SDK status tests revealed hidden Index retries despite parent RetryConfig0. `pinecone_compat.py` is version-pinned/fail-closed and actual request-count tests now prove one SDK request per attempt; D04 bounded application retry remains in control. No installed dependency code or cloud configuration was modified.
- A prior384D React rendering test timed out at5 seconds under excessive concurrent workers. `maxWorkers:2` reduces resource contention; existing test budget/assertions remain unchanged and the complete frontend suite reran. Source deep-link state resets via keyed workbench rather than synchronous state-setting effects; lint is preserved.
- The full real/fixture distinction remains explicit. Controlled math-oracle vectors and fake SDK vectors are NOT E5 unit fixtures, never production fallback or evidence of live cloud success.

## Search examples / actual captures

- `real-search-example.json`: real cached CPU E5 on synthetic Vietnamese **kiến-thức.pdf** and **nấu-ăn.txt**, requests/results for semantic Top-K and cross-page filtered comparison. The known-relevant example ranks the vector-database source over cooking text; no universal score/relevance threshold is claimed.
- `browser-search-example.json`: real Edge PDF/TXT upload→confirm→E5→ACTIVE→query/page/file/document filters/compare; D02 newest confirmed pointer deliberately differs from D04 ACTIVE. The exact source link/reload still opens the correct historical version/chunk/page. All snippets come from the saved confirmed chunk.
- `fixture-search-example.json`: separate **test-fixture-not-e5**, same real SQLite/API/UI plumbing, no semantic ranking claim. CI uses this track, never downloads HF assets or calls Pinecone.
- [Search desktop1440](search-desktop-1440.png), [mobile390](search-mobile-390.png): actual real-E5 browser images, visually inspected for readable controls/source/trace; axe serious/critical0 and no horizontal overflow320/390/768/1024/1440. Prior Overview/Documents/Embedding/Vector Explorer flow screenshots are regenerated only into D05; historical directories remain untouched.
- Real model `intfloat/multilingual-e5-small`, revision `614241f622f53c4eeff9890bdc4f31cfecc418b3`,384D, weight SHA `1a55775f53449dac10a2bcbc312469fac40b96d53198c407081a831f81c98477`. D03 owner-approved cache reused; model/pooling/tokenizer checks are actual, not presence-only availability. Exact dependency/asset/license details: `sdk-model-manifest.json` and retained D03/D04 architecture.

## Limits / pending verification

1. **LIVE NOT VERIFIED — AWAITING USER AUTHORIZATION**. Need separately approved dedicated target/project/key-project check, namespace/records/reads/quota/cost disclosure and smoke. No cloud key or opt-in was supplied/enabled here; code/SDK contracts do not attest real Pinecone account behavior. SDK ANN can differ from exact LOCAL; external metadata mutation fails closed rather than inventing recall/source.
2. SDK10.3 requires a private transport retry shim because its public Index factory drops retry config. Version and transport shape are checked; upgrading requires new wire/count tests. Existing model/SDK dependency pins did not change in D05.
3. Seminar-scale exact search only: configurable candidate cap and32MiB encoded-input budget per pass; compare can use two bounded passes. No pagination beyond requested Top-K, no lexical/FTS/reranker, no public multi-user authentication, no semantic quality benchmark or universal threshold. Returned count is not total matching documents; LIVE count is known eligible manifest IDs, not a provider count.
4. Source text remains D02 NFC/LF; filenames match exactly as stored. Missing source is omitted with a warning; retained D04 vectors still need explicit cleanup. Current ACTIVE/source is rechecked before response, but later changes are outside that snapshot.
5. GitHub CI remains pending until actually observed; final feature push/SHA/clean-tree attestation is in the handoff. No PR, merge, Issue closure or D06 work by this agent. Full [API/filter/cap/trace/security runbook](../../architecture/search.md) and changed paths in `CHANGED_FILES.txt`.
