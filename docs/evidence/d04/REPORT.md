# D04 / Issue #7 — implementation and verification

Date: 2026-11-12, Windows / PowerShell. Repository: `iamqthanq/pinecone-visual-lab`. Workdir: `D:\Corel\HK1_NAM4\PR\Giữa kì\pinecone-visual-lab`.

Assignment: [actual Issue #7](https://github.com/iamqthanq/pinecone-visual-lab/issues/7), read completely and verified OPEN with A–F. D03 [PR #6](https://github.com/iamqthanq/pinecone-visual-lab/pull/6) was verified MERGED at **`ada6c0afa4a7c1a17834497498ab27f0ccf316c4`**. This feature branch was created from fetched `origin/main` at that commit, after verifying a clean checkout, correct origin/ancestry/hooks. No D03 branch was used as base. Active branch/configuration: **`feature/issue-7-pinecone-vector-store`**, Issue **7**. Authentic workflow and all D01–D03 evidence/reference files are preserved unchanged.

**LIVE NOT VERIFIED — AWAITING USER AUTHORIZATION.** No real account read/create/upsert/delete was run, no Pinecone key was requested, and no cloud resource was provisioned. Code, actual LOCAL SQLite/E5 and offline SDK contracts are the review scope. The assignment expressly permits this handoff with pending authorized LIVE smoke. GitHub CI is **PENDING / NOT RUN for this feature until a real workflow run**; local fixture tests do not imply CI success.

Final local results: **103 backend/Git-guard tests PASS** (including11 Git guard tests), **20 frontend tests PASS**, **3 real-tokenizer/E5 tests PASS**, **12 Edge real-E5 E2E PASS**, **12 Edge NOT E5 fixture E2E PASS**. ESLint/strict TypeScript/Ruff/production build/secret and artifact checks PASS; npm audit reports0 vulnerabilities and pip check reports no broken requirements. Every final matrix command exited0. A–E and documentation/evidence F are complete locally; feature publication is attested separately in the final handoff.

## Requirements → implementation → tests

| Group / requirement | Implementation | Verification / status |
| --- | --- | --- |
| Gate0 actual Issue, verified main, exact feature, guard assignment | `AGENTS.md`, `docs/BRANCH_POLICY.md`, existing hooks/script; local `pinecone.issue=7` and exact branch/workdir | Git audit; `tests/test_git_guard.py` D04 positive/prior-assignment negative; full existing main/remote/ref/tag/deletion/multi-ref/force ancestry/detached/hook/PowerShell regression |
| A1 typed adapter contract and true origin | `apps/api/app/vector_contracts.py`, `vector_local.py`, `vector_live.py`, `vector_api.py`; typed TS client | Local and actual SDK HTTP-transport contract tests; actual fetched values independent of D03 cache |
| A2 backend-only key, no arbitrary hosts or raw error leak | `vector_live.py`, `.env.example`, API schemas | Missing-key/disabled constructor, SSRF host variants, extra-field rejection, sanitized statuses, no key echo |
| A3 384/cosine/Ready/dense BYOV/cloud/region/type validation | SDK `schema.fields._values`, project label + SDK host pinned in manifest | Incompatible dimension/metric/readiness/integrated/document fields rejected. Project label explicitly NOT independent account attestation |
| A4 index create confirmation and bounded readiness | API preview/confirm, expiring server `LiveAuthorization`, SDK no-poll `timeout=-1`, bounded API readiness poll | Actual SDK wire shape/no implicit poll test, duplicate local index, false confirmation; UI Edge create confirmation. LIVE create NOT RUN |
| A5 namespace stats/limits/errors | Scoped composite PKs, actual SDK stats, explicit default namespace, opaque live pagination | Restart/keyset paging/isolation, 401/403/404/408/409/429/5xx, partial/visibility tests; no empty namespace provisioning claim |
| A6 package/API pin and license | `requirements.in/lock`: pinecone10.3.0, API2026-07, Apache-2.0 | `sdk-model-manifest.json`, actual SDK request header assertion, current official sources in architecture document |
| B1 schema forward migration and provenance | Schema3 in `vector_schema.py`, retained D02/D03 Store; source/version/model/page metadata | Schema2 migration retains confirmed document + embedding; schema1 upgrade remains D03 regression; unknown versions fail safely |
| B2 real local persistence / scoped operations | SQLite local vectors, bounded idempotent upsert, actual adapter list/fetch/delete, backend cosine utility | Restart via fresh Store/adapter, concurrency, collision, cross-namespace + exact owned deletion; source deletion never cascades vectors |
| B3 production E5 vs fixture isolation | Reused D03 `EmbeddingService`, no production fallback; LIVE refuses fixture or model-signature mismatch | Separate real E5 integration/Edge vs offline NOT E5 fixtures, mode in metadata/UI |
| C1 deterministic manifest / source/model binding | `vector_service.py`: source/version/signature, host/project identity snapshot, UUID5 generation IDs/items/journal | Stable retry IDs, generation isolation, re-ingest after delete, source-deleted and identity-changed rejection |
| C2 confirmed only and bounded input | D03 service generation is explicit on ingest; source ownership and model signature checked; record/payload validation | Existing D03 draft/ownership/budget/dimension/nonfinite tests; D04 wrong-version/fixture/migration checks |
| C3 bounded retry / partial failure / durable resume | 8 records/128KiB per step, at most4 attempts, exponential backoff+jitter; durable checkpoint/retry/errors; leases | Synthetic response loss after partial upsert, failure keeps old active, same IDs resume; SQLite concurrent idempotence |
| C4 full fetch verification then CAS activation | Separate verification phase for every expected ID/metadata/value, 180-second token lease; baseline CAS + confirmed-source recheck | Eventual visibility retry, stale activation rejection, lease-busy/lost-token, source disappearance |
| C5 exact delete preview/confirm/reconcile | Durable exact-ID delete journal, owner checks, bounded delete+absence verification, immediate retirement of selected active pointer | False confirmation rejected, foreign ownership refused, partial-delete resume without touching other namespace/source |
| D1 API and frontend modes/status/jobs | `vector_api.py`, `vector-store-api.ts`, `VectorStoreLab.tsx` at `/vectors/store`; D03 `/vectors` retained | Typed fetch contract, React controls, API confirmations/validation, Edge entire ingest/fetch/delete |
| D2 actual SDK / no startup cloud | Lazy client, explicit LIVE read confirmation, expiring exact-target server write approval; tests disable cloud | Actual SDK10 transport exercises discovery/upsert/fetch/list/stats/delete/create with DNS blocked; no account success claimed |
| D3 actual adapter 384D explorer, source, copy, responsive | Mode badges, target/Ready, manifest progress/history/resume, actual ID pagination/fetch, all384 heatmap/table/metadata | React NOT E5/confirmation/failure/stale-target tests; Edge copy, 385 table rows, reload/isolation, axe and 320–1440 widths |
| D4 future phases excluded | Search/RAG/Slab remain planned; overview/health/version updated to D04 | Existing health/offline/navigation/build regression; no search/top-k implementation |
| E1–E4 full regression and real vs fixture | Pytest, Vitest, Ruff, ESLint, TS, build, audit, scans; isolated Windows cache/temp; cloud/HF offline env | Actual commands/exits below; screenshot visual inspection; no shared Temp modifications |
| E5–E6 LIVE smoke | Separate target-specific owner approval is still absent | **LIVE NOT VERIFIED — AWAITING USER AUTHORIZATION**; no account/quota/eventual-consistency result fabricated |
| F1–F2 docs/evidence | README, `.env.example`, architecture/vector-store, updated overview/docs/design, manifest/sample JSON/screenshots/logs | This mapping, recorded commands, all D01–D03 evidence preserved |
| F3 safe publication | Existing no-argument safe PowerShell script + retained Git for Windows hook | Final handoff must verify exact branch remote SHA=local HEAD and clean worktree. Publication attestation/SHA belongs in the final handoff, since a commit cannot contain its own SHA |

## Commands and evidence matrix

Every `.txt` log records the executed command, captured actual output, `EXIT_CODE` and elapsed time through `scripts/run_logged.py`. Intermediate logs are not substituted for final gates.

| Command (repository root / PowerShell) | Result / evidence |
| --- | --- |
| `powershell -NoProfile -ExecutionPolicy RemoteSigned -File scripts/check.ps1` | `quality-gates.txt`: exit0; ESLint, strict TS,20 frontend tests, Ruff,103 backend/Git guard tests, production build, secret/artifact + unstaged/staged diff checks |
| `.\.venv\Scripts\python.exe scripts/run_pytest.py -m "real_tokenizer or real_model" -s` | `real-e5.txt`: **3 PASS**, no skips; real tokenizer coverage/budget, independent NumPy pooling oracle, prefixes/384D/L2, actual SQLite persistence/namespace/owned delete |
| `.\.venv\Scripts\python.exe scripts/run_pytest.py apps/api/tests/test_vector_adapters.py` | `sdk-contract-final.txt`: actual SDK HTTP transport + DNS blocked, no account traffic; included again in final full gate |
| `npm.cmd run test:e2e` | `edge-real-e5.txt`: installed Windows Edge, production API and verified real E5; isolated ports5174/8001/data; includes full PDF/TXT paths and all D01–D03 flows |
| `$env:PVL_E2E_FIXTURE='1'; npm.cmd run test:e2e` | `edge-fixture.txt`: explicit **NOT E5**, API/SQLite actual, deterministic test provider, HF/cloud disabled; local reproduction of CI runtime |
| `npm.cmd audit --audit-level=moderate` | `npm-audit.txt`: exit0, **0 vulnerabilities**; public registry query needed normal network after sandbox network failure; no dependency change was made by audit |
| `.\.venv\Scripts\python.exe -m pip check` | `pip-check.txt`: exit0, no broken requirements |
| Existing-cache asset verification | `asset-verification.txt`, `sdk-model-manifest.json`: actual sizes/SHA verified, no model download; D03 approved cache reused |
| Git/config/history/guard/secret/diff audit | `git-audit.txt` and final handoff; original workflow hash preserved, historical evidence/reference diff empty |
| `.\.venv\Scripts\python.exe docs/evidence/d04/verify-artifacts.py` | `build-and-evidence-scan.txt`: production bundle scanned without printing credential values; four real vector samples have384 finite normalized values; JSONL parses within token budget |
| `.\.venv\Scripts\python.exe scripts/verify_repository.py` | `repository-scan.txt`: tracked/unignored private artifacts and secret patterns checked,0 findings |

Intermediate `backend-offline.txt` and `storage-targeted.txt` record earlier development checkpoints, superseded by final `quality-gates.txt`. `frontend.txt` records the first20-test success. `quality-initial-failure.txt` retains a real 5-second React flow timeout while concurrent CPU/E2E work was running; the individual multi-action test has a15-second budget with every assertion retained. Subsequent full gate passed. `edge-fixture-initial-failure.txt` retains a PDF-test expectation that fetched only8 of17 fixture chunks; the corrected test fetches all records in batches of8. `edge-fixture-selector-failure.txt` retains an ambiguous source filename selector; it is now scoped to the actual stored-vector inspector. These test defects were corrected, not skipped or suppressed.

## Model / sample / visual evidence

- Pinned official model `intfloat/multilingual-e5-small`, revision **`614241f622f53c4eeff9890bdc4f31cfecc418b3`**,384D. Weight SHA-256 **`1a55775f53449dac10a2bcbc312469fac40b96d53198c407081a831f81c98477`**. Exact tokenizer/assets/licenses/runtime are in `sdk-model-manifest.json` and retained [D03 architecture](../../architecture/embeddings.md).
- `real-local-stored-vector.json`: actual CPU E5 → confirmed source → durable manifest → SQLite adapter fetch; includes input tokens and measured inference (not cloud latency).
- `browser-stored-vector.json`: actual Edge E5 manifest and SQLite fetch. `browser-vector-sample.json` and `real-vector-sample.json` preserve D03 regression measurements from this run, not historical files.
- `synthetic-confirmed.jsonl`: real-tokenizer JSONL from synthetic Vietnamese PDF only. No user PDFs, database or model weights are tracked.
- [Vector Explorer desktop1440](vector-store-desktop-1440.png), [mobile390](vector-store-mobile-390.png): real browser captures, visually inspected. Full384D and metadata are visible, with no horizontal overflow. Edge checks widths320/390/768/1024/1440 and axe serious/critical violations. D01 overview, Documents Lab and D03 inspector captures are also present for regression.
- Test URLs while owned servers run: web **http://127.0.0.1:5174/vectors/store**, health **http://127.0.0.1:8001/api/health**. Playwright stops only its own servers afterwards. Normal interactive commands/ports5173/8000 are in README; no long-running service was installed.

## Known boundaries / pending work

1. **LIVE NOT VERIFIED — AWAITING USER AUTHORIZATION**. Needs a separately approved dedicated synthetic smoke: exact project/key-project check, index/cloud/region/namespace,1–3 IDs, request/quota/cost disclosure and separately approved ID cleanup. No claim of cloud permissions, quota, region or real eventual-consistency behavior.
2. Configured project is an operator label, not an SDK account lookup. SDK-described host and exact expiring server approval are pinned; external writers require a dedicated namespace/exclusive ownership. Pinecone is not a multi-record transactional database; application ACTIVE records a completed verified generation, not immunity to later external mutation.
3. Trusted loopback seminar app, no public/multi-user authentication or cloud authorization service. Retained manifest/vector records require explicit cleanup if original documents are deleted. No automatic index/namespace deletion or journal garbage collection. Catalog/history caps and180-second crash-lease expiry are documented in [architecture](../../architecture/vector-store.md).
4. CI on GitHub remains pending until an actual workflow run. Feature publication is performed only through the safe script; the final response supplies verified SHA and clean-tree attestation. Agent does not open PR/merge/close Issue/start D05.

Changed paths are enumerated in `CHANGED_FILES.txt`; final command logs are authoritative for counts/exits.
