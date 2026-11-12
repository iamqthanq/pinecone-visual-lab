# D03 / Issue #5 — local E5 implementation and evidence

Verification date:2026-11-11, Windows10/PowerShell5.1/Git for Windows, Node22.20.0/npm10.9.3, Python3.13.7, installed Edge. Implementation scope: entire [Issue #5](https://github.com/iamqthanq/pinecone-visual-lab/issues/5), groups A–E. Final local/remote commit SHA and clean-tree verification are supplied in the post-push handoff; this file alone does not prove a push. **GitHub CI: PENDING until an actual PR run.** No PR/merge/Issue close/D04 by the coding agent.

## Verified baseline and approval

- WORKDIR: `D:\Corel\HK1_NAM4\PR\Giữa kì\pinecone-visual-lab`, remote `https://github.com/iamqthanq/pinecone-visual-lab`.
- Directly read Issue #5 and required project/master-plan/D02 documents. PR #4 verified merged at `855006e0ab41e6bb28e62cd3dcc37e35ac3ed882`; Issue #3 closed. Safe fetch confirmed latest main contained that merge; clean checkout, feature created from `origin/main`, not D02 feature.
- Active branch **`feature/issue-5-local-embeddings`**, local guard issue5/exact branch/workdir, hook and no-default-push preserved. Governance updated only for the assigned phase. Original workflow/master plan and D01/D02 evidence unchanged.
- User explicitly approved the one-time official ~471MB safetensors + runtime download after source/size/checksum, disk/RAM disclosure. [Actual setup log](model-setup.txt), [verified manifest](model-manifest.json), [runtime/hash/license report](model-runtime.txt). No model binaries, private files, database or credentials are committed.

## Requirement → implementation → test

| Group | Code / result | Tests and evidence |
| --- | --- | --- |
| A — D02 confirmed provenance | DONE: `app/embeddings.py` resolves exact document/version/chunk, rejects drafts/wrong owners; source IDs/pages/revision accompany vectors | API ownership404, draft409, source token metadata checks, ordered chunk batch; real Edge selects confirmed source |
| A — schema/persistence | DONE: `app/documents.py` forward schema1→2 adds `embeddings`; FK cascade, unique(chunk_id,model_signature), stable UUID5/idempotence; queries not saved | Migration preserves Document/Page/confirmed version/chunks; future schema rejection; repeated same source avoids inference; delete cascade; all D02 persistence/export regression |
| B — assets/load/resource safety | DONE: `embedding_assets.py`, `setup_embedding_model.py`, `embedding_provider.py`; pinned allowlist/hash/size, opt-in, local-only safetensors, one CPU worker | Actual470641600 weight bytes verified; missing/corrupt assets, no-surprise-network fixture, owned worker cancellation/timeout; cheap status does not load weights |
| B — real E5 behavior | DONE: actual verified BERT-config E5 with matching XLM-R tokenizer, CPU float32/eval/inference_mode, mask-aware mean + L2 | Separate real-model integration against official local AutoModel + independent NumPy float64 pooling oracle, tolerance2e-5; norm tolerance1e-5; repeated/batch/prefix behavior; real max-budget inference and over-budget rejection |
| C — typed API/batch/prefix/budget | DONE: `embedding_contracts.py`, `embedding_api.py`, `embeddings.py`;1–8 inputs, raw query/passage prefix once,≤512 total, vectors384 finite;1MiB JSON cap | Exact prepared IDs/prefix test;512 boundary fixture/real; invalid/blank/already-prefixed inputs; batch order; missing503; bad dimension/norm; NaN/Inf422 without input echo; oversized413 |
| C — cosine | DONE: `embedding_math.py`, compare endpoint, signature/revision/mode parity, stable norms | Decimal dot oracle plus identical1/orthogonal0/opposite−1, huge finite values, zero/nonfinite/wrong dimension rejection; observed Vietnamese near/far experiment, not probability/Pinecone score |
| D — inspector and mini-lab | DONE: `VectorsLab.tsx`, `embeddings-api.ts`, `vectors.css`; source selectors,384 values heatmap/table, copy, provenance/tokens/norm/timing, query and sentence comparison | React14 total tests; Edge all384 nodes/table385 rows, Copy success, query→chunk cosine and sentence batch; desktop1440/mobile390,320/768/1024 overflow, axe serious/critical0 |
| D — honest model and future state | DONE: cache/load status, cancellation/error/retry, empty library/no confirmed chunks, explicit fixture NOT E5; Overview health updated D03 | Unavailable API/provider/unit/browser-intercept scenarios; no vectors shown on failure; health/navigation/offline/reduced-motion preserved; Search/Architecture/D04 DB features remain planned |
| E — offline vs real separation | DONE: separate `testsupport/embedding_fixture.py` entry/provider and test markers; CI never runs setup/fetches weights | Full real Edge8/8; full offline fixture Edge8/8; default Pytest70; separate real tokenizer+model2; source/resource/fixture identity checks |
| E — docs/build/governance | DONE: Windows commands, README/env/schema/model/license docs, lockfile, Git guard Issue5 tests, evidence | Full quality log, npm audit0, artifact/secret scan, original-file integrity, staged diff checks; safe feature push checked in final handoff |

## Executed commands and results

All commands ran from the Windows WORKDIR. Logs record real command/output/exit/elapsed time with LF and trailing whitespace normalization only. Where a temporary inspection helper was used, its full source is appended to the log for reproduction. `.venv/Scripts/python.exe` is native Windows Python. No WSL, Docker, CUDA inference or cloud API was used. [Complete changed-file inventory](CHANGED_FILES.txt).

| Command / track | Outcome | Log |
| --- | --- | --- |
| `powershell -NoProfile -ExecutionPolicy RemoteSigned -File scripts/check.ps1` |0 / PASS: ESLint, strict TS, Vitest14, Ruff, Pytest70, build, secret/artifact scan and diff checks |[Quality gates](quality-gates.txt) |
| `.venv\Scripts\python.exe scripts/run_pytest.py` |0 / PASS70,2 external-real markers deselected; includes10 Git guards and D01/D02 regressions |[Backend](backend-tests.txt) |
| `scripts/run_pytest.py -m "real_model or real_tokenizer" -v -s` |0 / PASS2, no skip; official cached tokenizer + weights |[Real integration](real-model-tests.txt) |
| `node node_modules/@playwright/test/cli.js test` |0 / PASS8, production API + actual E5 weights |[Real Edge](real-browser-tests.txt) |
| Same command with `PVL_E2E_FIXTURE=1`, HF offline flags |0 / PASS8, deterministic **NOT E5** provider only |[Fixture Edge](fixture-browser-tests.txt) |
| `npm.cmd audit --audit-level=moderate` |0 / PASS,0 vulnerabilities |[Dependency audit](dependency-audit.txt) |
| `setup_embedding_model.py --accept-download` |0 / actual approved download and all asset hashes verified |[Setup](model-setup.txt) |
| Local manifest/config/runtime/license verification |0 / exact snapshot and D02 tokenizer match; Torch CUDA build=null |[Manifest/runtime](model-runtime.txt) |

Final source-prefix regression also verifies that confirmed text containing literal query:/passage: words is preserved; ad hoc API inputs still reject pre-applied prefixes. Both fixture and real browser source flows cover a literal prefix in the uploaded text.

Early diagnostics found a missing parent directory in the new isolated Pytest helper, an omitted test import, ambiguous E2E selectors and prohibited `aria-label` on generic heatmap spans. All were corrected; focused and integrated suites rerun. ARIA semantics were fixed in the UI, not suppressed in axe. The helper never modified/deleted shared Windows Temp; every run uses a new ignored directory. No old D01/D02 test was deleted to manufacture PASS. D02 expected-phase/planned-Vectors assertions were updated to the implemented behavior while keeping future-lab/offline/navigation coverage.

## Real samples, screenshots and observations

- [Real vector sample + observed Vietnamese cosine](real-vector-sample.json): synthetic input, actual384D official model; query vectors are not persisted to application SQLite.
- [Browser source vector/API sample](browser-vector-sample.json): synthetic confirmed source, correct chunk/version/page IDs,384 values and measured timing; cache-hit metadata is explicit.
- [Vectors desktop1440](vectors-desktop-1440.png) / [mobile390](vectors-mobile-390.png): actual Edge/E5, confirmed source, passage/query heatmaps and cosine. All values are available in the table and full JSON copy. No image generation was used.
- [Documents desktop](desktop-1440.png) / [Documents mobile](mobile-390.png): unchanged D02 upload/extract/chunk/confirm/export flow, now captured under D03 evidence. [Synthetic real-tokenizer JSONL](synthetic-confirmed.jsonl).
- [Overview desktop](overview-desktop-1440.png) / [mobile](overview-mobile-390.png), [offline fault injection](offline-fault-injection.png): D01 health/navigation regression; the offline screenshot uses explicitly intercepted failure, not a claim that the server was physically stopped.

Measured real integration on this8-logical-CPU Windows machine: initial3-item short-query CPU batch **2596.15ms**, initialization/import/hash/model load **23994.03ms** in the recorded run. Maximum-budget single-input inference **731.67ms**; owned worker peak working set **1,020,862,464 bytes** (~0.95GiB). These are observations under local load, not guaranteed performance or total system RAM. Browser timings differ and are shown as measured. Raw Vietnamese query/query cosine: near **0.94721046**, unrelated **0.84034064**. The model's similarity range is not calibrated probability; near/far order is an example, not a general theorem.

Normal URLs: web `http://127.0.0.1:5173/vectors`, API health `http://127.0.0.1:8000/api/health`, schema `/docs`. E2E owns isolated ports5174/8001 and ignored synthetic data; owned servers/workers are stopped afterward. No persistent preview is left running by tests.

## Limits and handoff boundary

- [Embedding architecture](../../architecture/embeddings.md) documents assets/license/precision, exact prefix/pooling, schema2, cancellation/timing semantics and reproduction. D02 source normalization/page offsets remain unchanged.
- Weights are verified on setup and worker load; cheap status reports file presence/size as `present_unverified`, never pretends a health probe cryptographically verified/loaded the model. First inference may take tens of seconds. A single API process owns one model worker; use default one Uvicorn worker. Busy requests return429; timeout/cancellation can stop the owned worker and require reload on retry.
- Inference measurements describe the entire batch, not per-item estimates; cache hits retain historical inference metadata and return no new inference duration. Query text is not persisted/logged by default. Synthetic evidence is deliberately exported separately.
- Fixture vectors use deterministic hash/L2, explicitly **NOT E5**, and do not prove semantics. CI installs runtime packages but never AI weights/assets. Real and fixture screenshots/samples are separated. **GitHub CI remains PENDING** until ChatGPT opens a Draft PR and a run completes.
- No Pinecone connection/upsert/index/namespace, top-k ranking, RAG/OCR, arbitrary cloud action, production multi-user auth or D04 is included. PDF limits/reading-order caveats from D02 still apply.
- Original workflow SHA-256 remains `5CB214CB8CF499A83A480F1B244DA5C274DD66C8FCC211DB83ED246C82E20E78`. Historical D01/D02 evidence is unchanged. Final readiness additionally requires the safe feature push, verified remote/local SHA equality and clean working tree in the handoff. No independent external PR review is claimed by these implementation tests.
