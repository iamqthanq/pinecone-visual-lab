# D06 / Issue #11 — local RAG handoff evidence

Implementation: optional Ollama adapter and Search Lab RAG tab, reusing D05's exact ACTIVE-manifest Semantic Search. Answers use a deliberately conservative **server-verified verbatim excerpt** policy. No free-form unsupported model prose, fabricated citation, private-data transcript storage, model download or automatic daemon/cloud call.

**REAL OLLAMA NOT VERIFIED — NEEDS USER INSTALL/APPROVAL.** All LLM evidence below is **MOCK OLLAMA / NOT REAL LLM**. Real E5 embedding/retrieval is independently verified; it must not be confused with a real Qwen inference. **LIVE PINECONE NOT VERIFIED — AWAITING USER AUTHORIZATION. GitHub CI PENDING** until ChatGPT opens the Draft PR and an actual Actions run completes.

## Gate 0 and repository

- Windows checkout: `D:\Corel\HK1_NAM4\PR\Giữa kì\pinecone-visual-lab`; PowerShell/Git for Windows, existing `.git`. Worktree was clean on D05 branch before any D06 edit.
- Origin: `https://github.com/iamqthanq/pinecone-visual-lab`; base `origin/main` at `4619ca17688f6667b28e4f68ec35d29badb0c909`.
- Direct GitHub connector reads verified [Issue #11](https://github.com/iamqthanq/pinecone-visual-lab/issues/11) open with full A–F scope, [PR #10](https://github.com/iamqthanq/pinecone-visual-lab/pull/10) merged at that SHA and [Issue #9](https://github.com/iamqthanq/pinecone-visual-lab/issues/9) closed/completed.
- Read workflow/policy/master D06 and D02–D05 source architecture/evidence. Fetch succeeded; merge ancestry verified. `git switch -c feature/issue-11-local-rag-chat origin/main`; no old feature branch base.
- Active assignment/checkout-local guard: Issue11, `feature/issue-11-local-rag-chat`, correct Windows workdir, `.githooks`, `push.default=nothing`. Guard implementation and immutable workflow unchanged; original SHA-256 `5CB214CB8CF499A83A480F1B244DA5C274DD66C8FCC211DB83ED246C82E20E78`.
- [Read-only Git audit](git-audit.txt) verifies D01–D05 historical evidence, master reference, authentic workflow and guard implementation unchanged. No clone/init/reset/clean/stash/force/bypass, main write/push, PR creation/merge, Issue closure or D07 implementation.

## Requirement → code → test / evidence

Paths below are repository-relative. All implementation files are included in [changed-files.txt](changed-files.txt).

| Requirement | Code / documentation | Verification |
| --- | --- | --- |
| A1 local-only provider / SSRF / no proxy / redirects | `apps/api/app/ollama_local.py`, `LLMProvider` protocol | `test_ollama.py`: literal loopback whitelist; external/DNS/credentials/path/query/fragment/port rejection; single-request redirects blocked; proxy environment does not redirect mock transport |
| A2 tags/chat contracts and resource caps | same provider, `rag_api.py` | MockTransport GET `/api/tags`, POST `/api/chat`; streamfalse/JSON/keep_alive0,4096/512/2threads; bounded body/timeout/concurrency; cancellation cleanup |
| A3 model inventory / missing or invalid model/errors | fixed allowlist1.5b/3b; passive status and explicit probe | HTTP404/429/500/403, malformed inventory/chat/usage, incomplete response, model mismatch; no raw exception/body reflected; invalid endpoint disables only optional adapter |
| A4 setup/license/permission | README optional Windows runbook, `.env.example`, `docs/architecture/rag.md` | [inventory](ollama-inventory.txt), [runtime manifest](runtime-model-manifest.json); no install/pull/start/generation done |
| B1 exact D05 retrieval / no alternate engine | `RagService.chat` calls `SearchService.search`; typed `RagRequest` inherits D05 contracts | `test_rag.py`, `test_real_rag.py`, all D05 search tests: ACTIVE, version, namespace/filter/model, true E5 query prefix and budget |
| B2 typed response and honest modes | `rag_contracts.py`, `rag_api.py`, web `rag-api.ts` | API tests validate answer/status/reasons, hits vs used sources, context budget, requested/actual model, usage, nested trace; no client endpoint/history/runtime injection |
| B3 bounded context / source selection / Unicode | `assemble`, max5 prefixes,1000bytes/source,3072 total prompt bytes | independent UTF-8/JSON byte calculation, truncation/exclusion and exhausted budget; UI inspector exposes exact sent prefix and warnings |
| B4–B5 evidence-only prompt / verified citations | system/user JSON separation, `verified_answer` | reject invented S99, unsupported prose, fabricated quotes, invalid JSON/schema and markers inside quotes; exact substring oracle; server-only links from D05 source metadata |
| B6 stale provenance / missing context | post-generation same verified ACTIVE/source SQL joins | change manifest state/delete document during mock generation; clear answer/context/hits/sources; old confirmed version excluded; no-hit never calls LLM |
| B7 history | `RagChat.tsx`: max4 ephemeral turns, no server history field | React bounded-history test, target/filter/model/LLM/tab resets; each request has no history; no transcript SQLite table |
| B8 trace / cancellation | monotonic retrieval/context/HTTP/recheck measurements; `run_chat` disconnect event | timings finite/nonnegative/total≥stages; real async HTTP mock cancellation, timeout, resource release; D05 trace reported separately, no double-counting |
| C fallback / safety | LLM off/disabled/error/timeout preserves actual retrieval | `test_rag.py`: off/empty/disabled/busy/provider errors; pre-send busy reports no context sent; independent `/api/search` still succeeds |
| C injection / no unsafe output execution | JSON-escaped untrusted source, no tools/browser/filesystem, React plaintext | malicious-source fixture/no environment secret in prompt; fake citation refusal; React malicious HTML remains text; Edge actual backend rejects forged marker |
| D Search/RAG tabs and controls | `SearchLab.tsx`, `RagChat.tsx`, `rag.css`; existing design system | 11 new React tests plus29 regressions: explicit Send/Refresh only, keyboard tabs, source links, clear/cancel/errors, filters/target and readiness; inherited Semantic Search state/function retained |
| D context/hits/copy/usage / responsive | evidence answer + cited links, context sources vs retrieved list, inspector, trace | Edge exact source click/reload, LLM off/no hit/error/cancel, axe serious/critical checks;1440/390 screenshots; no overflow1024/768/390/320 |
| E offline vs real / full regression | `testsupport/ollama_mock.py`, explicit `rag_server.py`, test files, CI | full local checks; separate real-E5 and fixture tracks below; no production mock fallback, model install or daemon needed by CI |
| F docs/evidence/Git | README, RAG architecture/API, current overview, `.env.example`, this bundle, branch policy | logs include actual commands/exits; audit/scan; only safe push after all mandatory gates pass, exact publication SHA attested in final handoff |

## Actual Windows command matrix

All commands run from the official workdir. `scripts/run_logged.py` records the actual command, output, elapsed time and exit code. Pytest uses new ignored `.cache/pytest/<uuid>` temp/cache directories, never shared user Temp. Exit codes are not inferred from source inspection.

| Actual command (inside log wrapper) | Result | Log |
| --- | --- | --- |
| `powershell -NoProfile -ExecutionPolicy RemoteSigned -File scripts/check.ps1` | PASS / exit0:203 backend/Git tests,40 frontend tests; ESLint, strict TypeScript, Ruff, build, repository scan, both diff checks | [full-check.txt](full-check.txt) |
| `.venv/Scripts/python.exe scripts/run_pytest.py apps/api/tests/test_ollama.py apps/api/tests/test_rag.py` | PASS / exit0:54 focused offline tests (NOT E5 + MOCK OLLAMA) | [group-ab-tests.txt](group-ab-tests.txt) |
| `.venv/Scripts/python.exe scripts/run_pytest.py -m "real_tokenizer or real_model" -v -s` | PASS / exit0:5 real tokenizer/E5 integrations,0 skipped; D02–D05 numerical/source regressions + D06 orchestration | [real-e5.txt](real-e5.txt) |
| `.venv/Scripts/python.exe scripts/run_pytest.py -m real_model apps/api/tests/test_real_rag.py -v` | PASS / exit0: final real-E5 RAG recheck,1 test; LLM still mocked | [real-rag-final.txt](real-rag-final.txt) |
| `$env:PVL_E2E_FIXTURE='1'; npm.cmd run test:e2e` | PASS / exit0:17 Edge tests, NOT E5 + MOCK OLLAMA; no AI assets/daemon/cloud | [edge-fixture.txt](edge-fixture.txt) |
| `Remove-Item Env:PVL_E2E_FIXTURE; npm.cmd run test:e2e` | PASS / exit0:17 Edge tests, real cached E5 + SQLite + MOCK OLLAMA; includes actual-backend forged-citation rejection | [edge-real-e5.txt](edge-real-e5.txt) |
| `npm.cmd audit --audit-level=moderate` | PASS / exit0:0 vulnerabilities; registry access authorized, workspace npm cache | [npm-audit.txt](npm-audit.txt) |
| `.venv/Scripts/python.exe -m pip check` | PASS / exit0: no broken requirements | [pip-check.txt](pip-check.txt) |
| `.venv/Scripts/python.exe docs/evidence/d06/verify-runtime.py` | PASS / exit0: actual pinned E5 asset/tokenizer SHA, package metadata/licenses, resources | [runtime-verification.txt](runtime-verification.txt) |
| `powershell -NoProfile -ExecutionPolicy RemoteSigned -File docs/evidence/d06/ollama-inventory.ps1` | PASS / exit0: read-only PATH/process/default binary observations; no daemon/model probe | [ollama-inventory.txt](ollama-inventory.txt) |
| `.venv/Scripts/python.exe docs/evidence/d06/verify-artifacts.py` | PASS / exit0: build secret scan + real vectors384D/unit, JSONL parsing, search/RAG context/mode/budget/trace samples | [artifact-verification.txt](artifact-verification.txt) |
| `powershell -NoProfile -ExecutionPolicy RemoteSigned -File docs/evidence/d06/git-audit.ps1` | PASS / exit0: correct repo/assignment/ancestry/hooks, immutable historical evidence | [git-audit.txt](git-audit.txt) |

203 default Python tests include13 Git guard tests and54 new provider/RAG tests. Five real-marker tests intentionally excluded from the default/CI run, then explicitly run with real cached assets. Offline and real counts are separate. Initial full-check failure was the newly added guard test expecting a short branch name instead of the guard's full `refs/heads/...` result; [initial failure](initial-check-failure.txt) is retained, assertion corrected and full suite rerun. No guard implementation, old assertion or test was removed to obtain PASS. Early fixture setup and React lint findings were fixed before the recorded final successful runs. Audit initially lacked sandbox registry access; rerun with registry permission succeeded.

## Evidence and reproduction

- [Desktop1440](rag-desktop-1440.png), [mobile390](rag-mobile-390.png): real cached E5 + actual SQLite + **MOCK OLLAMA**, visible in UI. Human visual inspection found readable text/source links and no important overflow. Axe checks serious/critical violations, not a claim of exhaustive accessibility certification.
- [Browser RAG request/response](browser-rag-example.json), [real-E5 service example + fallback](real-e5-mock-ollama-example.json), [offline fixture](fixture-rag-example.json): Vietnamese question, exact context, source document/version/chunk/page, answer excerpts, measured trace. Source1 cites the uploaded synthetic vector-search TXT; quote equals actual confirmed text.
- [Real-E5 malicious-source refusal](real-e5-invalid-citation.json), [NOT-E5 refusal](fixture-invalid-citation.json): adversarial text is deliberately synthetic test input, not agent instructions. Unknown marker is rejected, answer=null, no source claimed cited.
- D01–D05 regression screenshots, JSONL, vectors and search examples were regenerated **under d06**, preserving historical evidence byte-for-byte. All PDFs/DB/model/cache artifacts remain ignored; committed examples contain synthetic material only.
- Default dev addresses: web `http://127.0.0.1:5173`, API `http://127.0.0.1:8000/docs`; test browser used5174/API8001 with isolated `.cache/e2e-d06/<pid>` and stopped its owned servers. No user dataset was reset. To reproduce, use README setup/check commands and the test-only Playwright entry; normal `app.main:app` never selects fixture fallback.

## Model / dependency / schema boundaries

E5 `intfloat/multilingual-e5-small`, revision `614241f622f53c4eeff9890bdc4f31cfecc418b3`, dimension384; weights470641600bytes/SHA `1a55775f53449dac10a2bcbc312469fac40b96d53198c407081a831f81c98477`; tokenizer SHA `0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39`. [Manifest](runtime-model-manifest.json) records actual checksum verification and lock hashes. Existing D03 download/inference approval reused, no D06 weights/runtime installation. Existing httpx0.28.1/BSD-3-Clause HTTP client reused; no new package dependency or Ollama SDK/binary/model redistributed.

Ollama not in PATH, no visible Ollama-named process and no default per-user binary found. These observations do not rule out installation elsewhere. No real installed version/digest/model availability asserted; inventory fields remain null. Planned official Qwen2.5:1.5b≈986MB/Apache-2.0;3b≈1.9GB/Qwen license. Review resources/actual tag digest and license before separately authorized setup/smoke. [Official API, Windows and license references](../../architecture/rag.md) are documented. Memory/disk snapshot is an observation during tests, not a guarantee for future inference. Schema remains3: no chat/history table, destructive migration or retrieval-engine rewrite.

## Remaining limitations / acceptance boundaries

1. **REAL OLLAMA NOT VERIFIED**; no real LLM smoke, latency, memory, Vietnamese answer quality, cancellation/unload behavior or injection resistance has been claimed. This is explicitly non-blocking for code/offline/E5 review under Issue #11. Owner approval/setup is required before install/pull/load; no request for keys in chat.
2. Extractive policy can reject useful paraphrases and the model can select an irrelevant or false source excerpt. Exact quotation/citation validity proves provenance, not truth/relevance. No RAG hallucination-elimination claim. Prompt tokens are conservatively estimated from UTF-8 bytes; real Ollama template/token handling needs conditional smoke. Provider usage is accepted only when returned and within configured bounds.
3. Only fixed Qwen tags, local loopback and nonstreaming JSON supported. No tool use, cloud LLM, remote endpoint, transcript persistence or conversational factual memory. Closing the HTTP stream requests cancellation; no promise that every daemon/runtime version immediately releases compute, and unrelated processes are never killed.
4. LIVE Pinecone remains unverified and explicit server opt-in/per-request read confirmation is still required. No new cloud read/write/create/delete smoke, paid resource or telemetry. D07–D09 remain planned.
5. The API is a local single-user seminar service, not authenticated production hosting. Repository/build scans are focused checks, not a comprehensive security audit. Installed Qwen/Ollama tag versions are not pinned because none were installed/queried; record their actual version/digest before authorized use.
6. GitHub Actions CI is **PENDING**; local offline success does not imply GitHub CI PASS. Agent does not open the PR or merge.

## Publication

Only after all code/offline/real-E5/browser/scan gates pass: inspect exact changed files and stage list, commit D06/Refs #11, run `scripts/push_issue_branch.ps1` (no arguments, hook enabled), then verify `HEAD = origin/feature/issue-11-local-rag-chat = git ls-remote` and clean worktree. Final publication SHA is supplied in the handoff because this report cannot contain the hash of its own commit. Pre-publication audit intentionally reports the then-current HEAD. ChatGPT independently reviews source/CI and opens one Draft PR; only the owner decides merge.
