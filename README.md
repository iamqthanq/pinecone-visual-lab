# Pinecone Visual Lab

A local workbench for a vector database seminar. **D02 implements Documents Lab:** PDF/TXT upload, real page extraction, E5-tokenizer chunks, overlap inspection, confirmed versions and UTF-8 JSONL. D01 health, navigation, design system and Git safeguards remain. Embeddings, Pinecone operations, retrieval, RAG and Slab simulation remain **PLANNED (D03–D09)**. This project is independent of Pinecone's console.

![D02 Documents Lab](docs/evidence/d02/desktop-1440.png)

## Windows setup

Tested: PowerShell 5.1, Git for Windows, Node **22.20.0** / npm **10.9.3**, Python **3.13.7**, installed Microsoft Edge. Node minimum 22.13. Use this existing checkout; create the virtual environment only if absent.

```powershell
Set-Location -LiteralPath 'D:\Corel\HK1_NAM4\PR\Giữa kì\pinecone-visual-lab'
npm.cmd ci
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r 'apps\api\requirements.lock'
```

For real chunking, explicitly opt in to **one tokenizer JSON: 17,082,730 bytes (about 17.1 MB)**:

```powershell
.\.venv\Scripts\python.exe scripts/setup_tokenizer.py --accept-download
```

The allowlisted, SHA-256 verified asset is pinned to revision `614241f622f53c4eeff9890bdc4f31cfecc418b3` of `intfloat/multilingual-e5-small`, cached under ignored `.cache/tokenizer/`. **No embedding weights** are downloaded. Without assets, upload/extraction work but chunking is disabled with instructions. Startup and requests never download or silently substitute a tokenizer. [Budget, revision and licenses](docs/tokenizer.md).

Start API in one PowerShell terminal at the root:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir apps/api --host 127.0.0.1 --port 8000
```

Start web in another terminal:

```powershell
npm.cmd run dev:web
```

Open **http://127.0.0.1:5173/documents**. Health: **http://127.0.0.1:8000/api/health**; schema: http://127.0.0.1:8000/docs. Stop owned processes with Ctrl+C; no services are installed. Health refreshes every 15 seconds/on demand with a 5-second timeout. Stop API and click **Check connection** to see OFFLINE. Pinecone stays NOT CONFIGURED and embedding model NOT LOADED even when the tokenizer is cached.

## Documents Lab

1. Choose/drop PDF or UTF-8 TXT (BOM supported). Default cap **10 MiB**, maximum **200 PDF pages / 500,000 extracted characters**. Unsupported, binary, corrupt, encrypted, empty and oversized inputs receive errors. Image-only/blank pages show **OCR NOT AVAILABLE**; no OCR runs.
2. Inspect 1-based pages, character counts and raw extracted text. TXT is one logical page. Canonical text uses NFC, CRLF/CR to LF, no whitespace trim/collapse, two LF between pages.
3. Generate preview with default **300/50**. Size 1–507, overlap 0 ≤ overlap < size. Full `passage: ` + text + special tokens is independently checked against **512 tokens**. Very small sizes may not fit a Unicode token group; increase size when prompted.
4. Inspect chunks, real content/input tokens and page ranges. Highlighted overlap uses the full source token stream; Unicode-safe cuts can reduce requested overlap, which is explicitly reported.
5. **Confirm / Save** before download. Each preview persists a separate draft/version. Input changes preserve displayed/confirmed results. Reload selects confirmed or newest draft if none confirmed. Earlier versions remain selectable. Copy text or download one UTF-8 JSON object per chunk. Deletion requires explicit confirmation and removes the file/pages/versions.

Original UUID-named files and SQLite stay in ignored **`.data/`**. Back up local data yourself before upgrades. The [JSONL sample](docs/evidence/d02/synthetic-confirmed.jsonl) contains only synthetic E2E data. [Schema, provenance and limits](docs/architecture/documents.md).

## Configuration

`.env.example` lists placeholders. No credentials are needed. Backend reads **process environment**, not `.env` automatically: e.g. `$env:PVL_MAX_UPLOAD_BYTES='10485760'` (allowed 1 byte–50 MiB). `PVL_DATA_DIR` changes the storage root; keep custom locations out of Git. `PVL_TOKENIZER_DIR` may point to the exact verified `tokenizer.json` directory; leave unset for default cache.

Vite proxies `/api` to port 8000; `PVL_API_PROXY_TARGET` changes that dev proxy. For separate hosting, optional `VITE_API_BASE_URL` goes in `apps/web/.env.local`. Set explicit `PVL_CORS_ORIGINS` in the backend terminal if needed; wildcard origins are rejected. Never put secrets in `VITE_*`. Production output is `apps/web/dist/`; `npm.cmd run preview --workspace apps/web` serves port4173 with API still required. This is a local preview.

## Checks and browser tests

```powershell
powershell -NoProfile -ExecutionPolicy RemoteSigned -File scripts/check.ps1
.\.venv\Scripts\python.exe -m pytest -c apps/api/pyproject.toml -m real_tokenizer -v
npm.cmd run test:e2e
npm.cmd audit --audit-level=moderate
```

`RemoteSigned` applies only to that PowerShell process, preserving persistent policy/hooks. `check.ps1` fails on any required ESLint, strict typecheck, Vitest, Ruff, Pytest/API/Git guards, build, artifact/secret scan or whitespace check failure. The separate real-tokenizer test requires cached assets (otherwise explicitly SKIPPED); no download occurs.

Playwright uses installed **Edge**, starts isolated web/API on **5174/8001**, stores synthetic data under ignored `.cache/e2e-d02/` and stops its owned servers. Occupied ports cause failure instead of server reuse. Local default E2E uses actual E5 assets. Fixtures use installed Windows Arial for Vietnamese PDFs (font not redistributed). Tests cover upload → pages → generate → inspect/overlap/copy → confirm → export → reload, draft recovery, delete confirmation, axe serious/critical checks, navigation, reduced motion, responsive widths and injected network failure/recovery. Actual screenshots go to `docs/evidence/d02/`; historical D01 evidence is unchanged.

Reproduce CI's **explicit fixture mode**, which requires no AI assets:

```powershell
$env:HF_HUB_OFFLINE='1'
$env:TRANSFORMERS_OFFLINE='1'
$env:PVL_E2E_FIXTURE='1'
npm.cmd run test:e2e
Remove-Item Env:PVL_E2E_FIXTURE
```

The separate **test-only** server declares `test-fixture-not-e5` in API/UI/JSONL. These counts are never claimed as E5. Fixture screenshots go to `test-results/fixture-screenshots/`. Normal `app.main:app` never selects this fixture based on that variable. Package/browser installation uses network; runtime CI tests require no HF/cloud resources and never call tokenizer setup. GitHub CI status remains PENDING until a real run.

Individual commands: `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd test`, `.\.venv\Scripts\python.exe -m ruff check apps/api scripts tests`, `.\.venv\Scripts\python.exe -m pytest -c apps/api/pyproject.toml`, `npm.cmd run build`, `.\.venv\Scripts\python.exe scripts/verify_repository.py`.

## Git workflow

Read [authentic workflow](GITHUB_COLLAB_WORKFLOW_STANDARD.md), [branch policy](docs/BRANCH_POLICY.md), [AGENTS.md](AGENTS.md). Original workflow SHA-256: `5CB214CB8CF499A83A480F1B244DA5C274DD66C8FCC211DB83ED246C82E20E78`. Original workflow/master-plan whitespace is preserved by `.gitattributes` exceptions.

Active: **[Issue #3](https://github.com/iamqthanq/pinecone-visual-lab/issues/3)**, **`feature/issue-3-document-chunking`**, base **`main`** after D01 PR #2 merge. Configure checkout guards per policy. After review/tests/commit:

```powershell
powershell -NoProfile -ExecutionPolicy RemoteSigned -File scripts/push_issue_branch.ps1
```

The no-argument script validates checkout/active Issue/branch/remote/HEAD and pushes one matching explicit refspec. Tests use disposable Git fixtures, never rejected pushes to GitHub. Agent implements/tests/pushes; ChatGPT opens Draft PR and independently reviews; user decides merge. No main push, force, bypass, automatic Issue closing or next-phase work.

## Architecture and evidence

- [Current architecture/health](docs/architecture/overview.md), [D02 schema/provenance](docs/architecture/documents.md), [tokenizer/licenses](docs/tokenizer.md)
- [Free-first ADR](docs/decisions/0001-free-first-stack.md), [Taste source/design](docs/design-foundation.md)
- [D02 requirement/test report](docs/evidence/d02/REPORT.md), [desktop](docs/evidence/d02/desktop-1440.png), [mobile](docs/evidence/d02/mobile-390.png)
- [Historical D01 report](docs/evidence/d01/REPORT.md)

Future LIVE PINECONE, LOCAL DEMO retrieval and SLAB SIMULATOR remain planned. No embeddings, upserts, OCR or production hosting ship in D02. PDF reading order follows the text layer and may differ from visual layout. API is for loopback/local use without multi-user authentication. Resource caps do not constitute a hostile-PDF execution sandbox. Repository scan is focused, not a comprehensive security audit.
