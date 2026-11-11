# D02 / Issue #3 implementation and verification

Local verification: **2026-11-11**, Windows PowerShell5.1, Git for Windows, Node22.20.0/npm10.9.3, Python3.13.7, installed Edge with Playwright. This report records implementation/tests; final commit, verified remote SHA and clean-tree outcome belong to the post-push handoff. **GitHub CI: PENDING, not claimed PASS.** No PR was created by the coding agent.

## Assignment and safe base

- Repo: `iamqthanq/pinecone-visual-lab`; [Issue #3](https://github.com/iamqthanq/pinecone-visual-lab/issues/3), directly re-read from GitHub. Title: `[D02] Document Upload, Extraction & Token-Aware Chunking Lab (Windows)`; open, updated `2026-11-11T08:49:52Z` at verification. Scope A–E matches the execution prompt/master plan.
- WORKDIR: `D:\Corel\HK1_NAM4\PR\Giữa kì\pinecone-visual-lab`.
- D01 PR #2 was verified merged and Issue #1 closed. Fetch confirmed main/base **`fd4060c8814ff82637d1de35d543eee59ceaea12`**. D02 branch was created from `origin/main`, not D01 branch.
- Feature: **`feature/issue-3-document-chunking`**. Active assignment/guard config: issue3, exact feature branch, exact workdir; `push.default=nothing`, `.githooks` enabled.
- Authentic workflow SHA-256 remains **`5CB214CB8CF499A83A480F1B244DA5C274DD66C8FCC211DB83ED246C82E20E78`**. Original workflow, supplied master plan and all D01 evidence are unchanged against base. [Precommit state/runtime log](precommit-state.txt).
- No clone/init/reset/clean/stash, main push, force, hook bypass, server-policy change, model weights, paid resource, Pinecone operation or D03 work.

## Requirement → code → test

| Group / requirement | Result and implementation | Actual verification |
| --- | --- | --- |
| A — active assignment and safeguards | DONE: `AGENTS.md`, `docs/BRANCH_POLICY.md`; existing `scripts/push_issue_branch.ps1`, `scripts/git_guard.py`, `.githooks/pre-push` preserved |9 Git guard tests +12 subtests, including Issue3 allowed / old Issue1 ref rejected; real Git-for-Windows hook and mocked safe PowerShell push, no unsafe remote push |
| A — upload/list/select/delete | DONE: `apps/api/app/document_api.py`, `documents.py`, typed `apps/web/src/documents-api.ts`, `DocumentsLab.tsx` | API upload/list/detail/explicit delete tests, browser PDF and TXT/BOM flows, cancel-delete preservation |
| A — safe files and limits | DONE: pre-multipart bounded ASGI body, streamed file cap, UUID storage, sanitized display names, default10MiB | Traversal/CON filename, MIME/signature/binary/empty/UTF8 rejection, corrupt/encrypted PDF, body/file caps,200-page/500k-char limits, failure leaves no uploaded file |
| B — page extraction and Unicode | DONE: pypdf7.0.1, TXT one logical page; raw and normalized text,1-based page metadata and canonical spans | One/multiple-page Vietnamese PDFs, mixed empty/text pages, UTF8 BOM, decomposed Unicode/newlines; page2 real-browser navigation |
| B — no fabricated OCR | DONE: empty/scan-image pages warning, full no-text status `needs_ocr`, chunk generation blocked | Actual image-only PDF and blank PDF tests; no content invented |
| C — actual E5 tokenizer and budget | DONE: `apps/api/app/tokenization.py`, `scripts/setup_tokenizer.py`; pinned official revision/hash, offline load, missing503 | [Asset report](tokenizer-assets.txt); separate actual E5 integration at size300/507 with overlap0/50, every content/input budget recomputed; no model weights |
| C — segmentation, coverage, overlap | DONE: `apps/api/app/chunking.py`; semantic cuts + token fallback, source token spans, safe Unicode groups, explicit actual overlap |12 offline fixture corpus/overlap cases and real E5 oracle: independent per-character coverage, exact source slices, ordering, budgets, page intersection and actual overlap; tiny/invalid settings rejected |
| D — SQLite and version isolation | DONE: Store schema1, document/page/version/chunk tables, draft/confirmed separation, serialized version allocation | Restart persistence, concurrent versions1/2/3, newer-schema preservation, earlier confirmed chunks unchanged by preview, version/document isolation; browser reload confirmed and draft |
| D — inspector/copy/export | DONE: selected full chunk, body/input tokens, page range, overlap highlight, version selector, explicit confirm/export | Edge Copy success; UTF8 JSONL download/line parse; API exact JSONL round-trip; draft export409; [synthetic sample](synthetic-confirmed.jsonl) |
| E — D01 design extension and truthful states | DONE: `DocumentsLab.tsx`, `documents.css`, existing shell/components; app phase/version0.2/D02; other labs planned |11 frontend tests; Edge5 routes/deep links, actual health and injected offline/recovery, keyboard skip link, reduced motion, responsive320/390/768/1024/1440; axe serious/critical zero |
| E — automated gates/CI/docs | DONE locally: check.ps1, locked deps, offline CI fixture path, README/architecture/tokenizer/design docs, evidence | Lint/typecheck/Ruff/tests/build/scan/diff PASS; npm audit0; local CI-equivalent fixture E2E6/6. GitHub CI itself PENDING until a run after ChatGPT opens PR |

## Commands, logs and exit codes

All commands below ran from the Windows WORKDIR. `scripts/run_logged.py` records command/output/exit and elapsed time in each linked log. Stored logs normalize line endings to LF and remove trailing blank whitespace only; result/error content is retained. `.venv/Scripts/python.exe` and `.venv\Scripts\python.exe` refer to the same native Windows Python; no WSL/Linux tool was used. [Complete changed-file inventory](CHANGED_FILES.txt).

| Command / purpose | Exit / outcome | Log |
| --- | --- | --- |
| `powershell -NoProfile -ExecutionPolicy RemoteSigned -File scripts/check.ps1` |0 / PASS: ESLint, strict TS, Vitest11, Ruff, Pytest50 (1 real marker deselected), production build, artifact/secret scan and diff checks |[Full gates](quality-gates.txt) |
| `.venv\Scripts\python.exe -m pytest -c apps/api/pyproject.toml -m real_tokenizer -v` |0 / PASS:1 real-E5 integration; no skip,50 other tests deselected |[Actual E5](real-tokenizer.txt) |
| `node node_modules/@playwright/test/cli.js test` (normal production API / actual cached E5) |0 / PASS:6 Edge E2E |[Real browser](browser-tests.txt) |
| Same command with `PVL_E2E_FIXTURE=1`, HF/Transformers offline flags |0 / PASS:6 Edge E2E with separate labeled byte fixture |[CI-equivalent local run](fixture-browser-tests.txt) |
| `.venv\Scripts\python.exe -m pytest -c apps/api/pyproject.toml tests/test_git_guard.py -v` |0 / PASS:9 tests,12 subtests |[Guard positive/negative](git-guard-tests.txt) |
| `npm.cmd audit --audit-level=moderate` |0 / PASS:0 vulnerabilities |[npm audit](dependency-audit.txt) |
| `scripts/setup_tokenizer.py --accept-download` |0 / verified cached asset, no repeat download |[Setup](tokenizer-setup.txt) |
| Runtime asset/hash/dependency metadata, `pip check`, Git/history/original-file integrity |0 / PASS |[Assets/licenses](tokenizer-assets.txt), [Git/runtime](precommit-state.txt) |

The npm audit retry succeeded after one temporary automatic approval-service usage-limit error; the rejected attempt did not execute. Earlier PDF fixture/import, page-selection race and inactive-nav contrast failures were corrected and rerun. `document-browser-tests.txt` retains an earlier failed diagnostic run; it is not the final result. Final real and fixture browser logs above are PASS. No test was removed/disabled to hide these failures.

## Real-browser evidence

Local normal URLs: web **http://127.0.0.1:5173/documents**, health **http://127.0.0.1:8000/api/health**. Automated E2E started owned isolated processes at **5174/8001**, then stopped them. These tests do not leave a persistent preview running.

- [Documents desktop1440](desktop-1440.png): real PDF page2, confirmed V1, selected second chunk,50 source overlap tokens, actual E5 counts and download.
- [Documents mobile390](mobile-390.png): restored confirmed V1, source page1, stacked responsive inspector; no horizontal page overflow.
- [Overview desktop](overview-desktop-1440.png) / [overview mobile](overview-mobile-390.png): D01 shell preserved and D02 state coherent.
- [Offline fault injection](offline-fault-injection.png): **explicitly intercepted health connection failure**, then recovery. This screenshot is not claimed as a physically stopped-backend test. D01's historical actual-stopped-server evidence remains unchanged.
- [Synthetic JSONL](synthetic-confirmed.jsonl): downloaded from the actual production API in real-E5 browser flow, per-line parsed, no user data. Fixture-mode runs never replace this file or the real screenshots.

Copy uses the secure-loopback browser clipboard. If denied by browser permissions, the UI reports an actionable fallback. PDF fixture bytes are generated under ignored `.cache/`; only screenshots and the synthetic JSONL are committed.

## Contracts and known limits

- [Tokenizer revision/hash/licenses/budget](../../tokenizer.md):512 total, conservative507 content cap, `passage: ` + specials overhead5, actual per-chunk re-tokenization. Source-stream overlap may be smaller at Unicode-safe boundaries and is labeled explicitly. Tokenizer cache has only the17.1MB JSON, no weights.
- [SQLite schema and normalization](../../architecture/documents.md): version1, NFC/newline rules, raw vs normalized text, **code-point** offsets and synthetic page separators, preview/confirmed semantics, request/page/text/decompression/chunk limits.
- Existing [Taste source-guided adaptation](../../design-foundation.md) is extended; no installer/upstream Taste gate, GSAP runtime or GSAP skill gate is claimed.
- PDF text-layer order can differ from visual reading order. Blank vs scanned PDF cannot always be distinguished from text extraction alone; OCR is unavailable. Strict parser may require a PDF re-export.
- Tiny chunks unable to hold a Unicode token group fail clearly rather than losing text. Body token counts and source-stream overlap counts are deliberately distinct. Large numbers of versions remain local until explicit document deletion.
- Local loopback demo has no multi-user authentication, backup/reconciliation service, PDF CPU/process sandbox or production deployment. Resource limits mitigate, but do not eliminate, pathological PDFs. Filesystem/SQLite crash boundaries can leave an orphan file; no silent background purge occurs.
- CI uses explicit non-E5 fixtures to stay offline; only the separate local real tests prove official tokenizer integration. **GitHub CI remains PENDING**; no run success is inferred from YAML/local results.
- No unresolved implementation/test failure at report preparation. Final readiness requires feature-only safe push and equality of local/remote SHA, verified in the handoff. No PR, merge, Issue close or D03 is authorized here.
