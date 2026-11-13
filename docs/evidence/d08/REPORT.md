# D08 / Issue15 — Workbench polish, bounded motion and measured loading

**Round1 update:** the initial handoff below is historical at8625597. Independent review found reproducible CI visual failure on run43280051381 attempts1/2 (101/100 pixels). The repair, causal renderer experiment, separate software-reference proposal and new test/CI results are tracked in [R1 investigation](review-r1/INVESTIGATION.md) and [R1 report](review-r1/REPORT.md). Original hardware goldens and BEFORE/AFTER evidence are retained; no tolerance increase or automatic baseline approval.

Assignment: [Issue15, full A–F](https://github.com/iamqthanq/pinecone-visual-lab/issues/15). Existing Windows checkout `D:\Corel\HK1_NAM4\PR\Giữa kì\pinecone-visual-lab`; origin `https://github.com/iamqthanq/pinecone-visual-lab`; integration `main`; feature `feature/issue-15-taste-gsap-polish`.

Gate0 directly read the Issue, Master Plan Windows v2.1, AGENTS, authentic workflow, Branch Policy, frontend foundation/code/tests and D02–D07 architecture/evidence. PR14 MERGED / Issue13 CLOSED; fetched main contains D07 merge `24d56a9af81d0277224dc0f3b7eff5fd0f395bf3`. Initial worktree was clean and the feature was created from that fresh remote base. Active assignment/local guards now target Issue15. [GitHub read evidence](github-gate0.json), [Git audit](git-audit.txt). Branch metadata reported `protected:false`, rulesets `[]`; detailed protection API returned403 to the integration. No server settings changed.

No clone/init/reset/clean/stash/force/bypass/main push, PR/merge/Issue closure, D09 work, cloud call/resource, paid asset, global skill installer or AI download. Backend implementation/schema/requirements, pure simulator reducer, authentic workflow and D01–D07 evidence remain unchanged. Backend test/E2E changes redirect newly generated artifacts to D08; assertions are retained. Frontend0.8.0 deliberately retains backend0.7.0/D07 health protocol.

## Requirements → implementation → verification

| Group | Concrete result / source | Verification and evidence |
| --- | --- | --- |
| A — real baseline + source/design audit | Pinned Taste/GSAP README, skill/core/timeline/React/performance and licenses inspected; no installed skill assumed or installer executed. Per-screen hierarchy/type/grid/spacing/contrast/state/source/keyboard audit with priorities and acceptance. | [Audit and paired AFTER table](../../design/d08-visual-audit.md), [source/runtime/license manifest](dependency-license-manifest.json);128 original BEFORE PNGs, two separate actual modes, archived production build/hash. |
| B — shared system + all labs | `workbench.css`, shared `components.tsx`, App/shell, Documents, standalone384D inspectors, Search/RAG, VectorStore, Architecture and Guided panel: readable navy/mint system, responsive library/work areas, stronger provenance/status/score/citation hierarchy, native deletion dialog, result jumps, honest optional-step status. | Main and supplemental actual BEFORE/AFTER captures below; original source IDs/model/tokens/norm/score/namespace/actions retained. Native dialog Tab/Shift+Tab containment, Escape and focus return independently exercised. |
| C — motion follows data | `useDataMotion.ts` + scoped per-surface refs: actual version/record/job/hits/reply/guide receipt triggers; transform/opacity, finite8-target cap; no fake progress or GSAP-owned completion. Architecture reducer unchanged; mode-specific arrow presentation and responsive camera only. |6 new lifecycle unit tests +4 retained simulator tests; StrictMode/rapid replacement/deferred import disposal/tab/hidden/reduced/unmount cleanup. Actual GSAP browser settling/preference switch; [motion map](../../architecture/d08-performance.md). |
| D — substantial initial download reduction | Module-scope React.lazy/Suspense, LabBoundary recovery, separately lazy RAG/Guided, standalone memoized VectorValues/inspectors; Vite manifest. No warning-limit increase. | [Baseline build](bundle-before-build.txt), [final build in full gate](full-check.txt), [actual assets/hash/graph](bundle-after.json), [comparison](performance-comparison.json),5-run browser profiles before/after. Initial static JS including shared imports660,065→305,605 bytes (**−53.70%**). |
| E — preserve correctness + stronger QA | Existing D01–D07 tests remain;15 Git guard cases include D08 assignment/old-branch rejection. New route failure/slow loading/rapid navigation, guide cancellation, modal keyboard, actual motion and fixed-reference screenshot tests. CI separates actual API fixture E2E from recorded visual replay. | Full quality, real E5, actual Edge fixture/real regressions and visual matrix below. No production fake E5/LLM/cloud. CI code prepared; actual GitHub run PENDING. |
| F — documentation/evidence/safe publication | README Windows, design foundation, architecture overview, D08 design/performance docs, logs/JSON/PNG/diffs/hashes, inventory and read-only audits. Original workflow/hooks/safe-push implementation retained. | Exact feature only through `scripts/push_issue_branch.ps1`; publication SHA/equality/clean result supplied after actual push in handoff, avoiding a self-referential commit hash inside this file. |

## Actual test matrix

Commands run from the Windows checkout root. `scripts/run_logged.py <log> <command>…` records actual command/output/elapsed/exit. `scripts/run_pytest.py` creates a new ignored private temp/cache and disables AI downloads/cloud/Ollama; shared Windows Temp is untouched. Heavy browser/unit/model workloads run sequentially. Local outcomes are not GitHub CI results.

| Command inside logger | Actual result | Log |
| --- | --- | --- |
| `powershell -NoProfile -ExecutionPolicy RemoteSigned -File scripts/check.ps1` |PASS exit0: ESLint, strict TypeScript,76 Vitest, Ruff,220 Pytest/API/Git guards (6 real markers deselected), production build, secret/artifact scan0 findings, whitespace |[Full quality](full-check.txt) |
| `.venv/Scripts/python.exe scripts/run_pytest.py -m "real_tokenizer or real_model" -v -s` |6 PASS,220 deselected,0 skipped, exit0; real official cached E5 |[Real E5 integration](real-e5-tests.txt) |
| `$env:PVL_E2E_FIXTURE='1'; npm.cmd run test:e2e` |20 PASS,0 skipped, exit0; actual isolated backend/SQLite with NOT E5 + Mock Ollama |[Fixture Edge regression](edge-fixture.txt) |
| `npm.cmd run test:e2e` with fixture variable absent |20 PASS,0 skipped, exit0; real cached E5 + actual local API/SQLite + Mock Ollama/search-only |[Real E5 Edge regression](edge-real-e5.txt) |
| `$env:PVL_E2E_FIXTURE='1'; $env:PVL_VISUAL_STAGE='verify'; $env:PVL_VISUAL_REPLAY='1'; npm.cmd run test:visual` |7 PASS,0 skipped, exit0;64 active image comparisons, deliberate-color negative oracle, slow/failing routes, modal keyboard, GSAP/reduced motion, pending-guide cancellation |[Visual/production resilience](visual-regression.txt) |
| `$env:PVL_VISUAL_STAGE='before'; npx.cmd playwright test --config playwright.visual.config.ts` with fixture1 / absent |Fixture1 PASS; real2 PASS including the original baseline performance spec, exit0;128 original PNGs |[BEFORE fixture](visual-before-fixture.txt), [BEFORE real + profile](visual-before-real.txt) |
| `$env:PVL_VISUAL_STAGE='after'; npx.cmd playwright test --config playwright.visual.config.ts` with fixture1 / absent |1 PASS each, exit0;128 original AFTER PNGs, actual local APIs |[AFTER fixture](visual-after-fixture.txt), [AFTER real](visual-after-real-e5.txt) |
| Same capture with `$env:PVL_VISUAL_SUPPLEMENT='rag'`, before/after, fixture1 / absent |1 PASS in each of4 runs, exit0;16 additional paired PNGs, only visible time fields masked; original files untouched |[Before fixture](rag-supplement-before-fixture.txt), [after fixture](rag-supplement-after-fixture.txt), [before real](rag-supplement-before-real-e5.txt), [after real](rag-supplement-after-real-e5.txt) |
| `$env:PVL_VISUAL_STAGE='after'; npm.cmd run test:performance` (fixture/replay absent) |1 PASS, exit0;5 actual production Edge samples, no E5 inference timed |[AFTER browser profile](performance-after.txt) |
| `npm.cmd audit --audit-level=moderate` |0 vulnerabilities, exit0 |[npm audit](npm-audit.txt) |
| `.venv/Scripts/python.exe -m pip check` |No broken requirements, exit0 |[pip check](pip-check.txt) |
| `.venv/Scripts/python.exe docs/evidence/d08/verify-runtime.py` |Pinned cached weights/tokenizer assets verified, exit0; no download/daemon probe/inference by checker |[Runtime/model hashes](runtime-model-check.txt), [manifest](runtime-model-manifest.json) |
| `.venv/Scripts/python.exe docs/evidence/d08/verify-dependencies.py` |327 third-party lock records unchanged;9 pinned source copies hashed, exit0 |[License check](dependency-license-check.txt), [manifest](dependency-license-manifest.json) |
| `.venv/Scripts/python.exe docs/evidence/d08/compare-evidence.py` |68 intentional before/after fixture differences;64 active proposed reference hashes; exact initial bundle reduction53.70%, exit0 |[Comparison check](evidence-comparison.txt) |
| `.venv/Scripts/python.exe docs/evidence/d08/verify-artifacts.py` |42 emitted build files0 secret findings;4 real384D samples, JSONL3 lines, Search/RAG/guide provenance and toy oracles verified;20 unmasked regression PNGs, exit0 |[Artifact evidence](artifact-evidence-check.txt) |
| `.venv/Scripts/python.exe docs/evidence/d08/verify-visual.py` |272 actual paired captures +68 separate design-diff PNGs +20 regression PNGs =360 PNG dimensions/hashes;64 references and paired source IDs verified, exit0 |[Visual evidence](visual-evidence-check.txt), [PNG manifest](screenshot-manifest.json), [source fingerprints](frontend-source-manifest.json) |
| `.venv/Scripts/python.exe docs/evidence/d08/verify-staged.py` |500 exact reviewed D08 paths; all staged blobs0 findings,37 LF-normalized frontend source hashes match tested sources, protected history/backend/reducer unchanged, Issue15 guard/whitespace PASS, exit0 |[Staged review](staged-review.txt), [complete changed-file inventory](changed-files.txt) |
| `.venv/Scripts/python.exe scripts/verify_repository.py` |852 tracked/unignored paths,0 secret/artifact findings, exit0 |[Final secret scan](secret-scan.txt) |
| `powershell -NoProfile -ExecutionPolicy RemoteSigned -File docs/evidence/d08/git-audit.ps1` |Correct branch/origin/base ancestry/config/guard and authentic workflow hash; D01–D07 history/backend/reducer unchanged, exit0 |[Final Git audit](git-audit.txt) |

All listed outcomes are actual completed commands. GitHub CI is PENDING. Final publication audits and exact SHA equality/clean worktree are verified separately before handoff.

## Actual image provenance and visual review

The original128 BEFORE images were captured **before application UI edits**, using the D07 production build archived under ignored `.cache/d08-before-dist`, not reconstructed from the new UI.16 states ×1440/1024/768/390 ×2 labeled modes;320 adds explicit overflow checks. The same persisted owned sample IDs/version/chunk/namespace and query pair with128 AFTER images. Data roots `.cache/d08-audit/fixture` and `/real` are isolated from personal `.data`. The sample is bundled, project-authored CC0 Vietnamese seminar text. No PDF/user data is committed.

Original [fixture BEFORE manifest](before/fixture/manifest.json), [real BEFORE](before/real-e5/manifest.json), [fixture AFTER](after/fixture/manifest.json), [real AFTER](after/real-e5/manifest.json) contain browser/version, viewport, scroll, selection, model mode, seed/source IDs and axe results. `head` in pre-commit captures is the verified base; it does **not** claim uncommitted D08 UI is the D07 source. Emitted-build hashes identify the tested production artifacts.

The original RAG mask covered hidden native-details time boxes, causing stray rectangles outside the visible trace. Original files remain retained; separate8 BEFORE +8 AFTER **`rag-chat-visible-*`** supplements against the archived/new builds correct the capture mask to visible time numerals. Their own `supplement-rag.json` manifests preserve this explicit distinction. Active reference RAG uses those4 fixture AFTER supplements. Masks target duration readouts and the Overview backend clock line (which also includes its release text); unmasked E2E images/health JSON retain backend0.7.0. Document/version/chunk IDs, model provenance, vector values, score and citations are never masked/substituted; raw JSON retains actual times.

Representative paired real-E5 captures:

| Screen | BEFORE | AFTER |
| --- | --- | --- |
| Overview1440 /390 |[1440](before/real-e5/overview-1440.png) · [390](before/real-e5/overview-390.png) |[1440](after/real-e5/overview-1440.png) · [390](after/real-e5/overview-390.png) |
| Source1024 / chunks390 |[1024](before/real-e5/documents-source-1024.png) · [390](before/real-e5/chunks-versions-390.png) |[1024](after/real-e5/documents-source-1024.png) · [390](after/real-e5/chunks-versions-390.png) |
| Embedding768 / Explorer1440 |[768](before/real-e5/embeddings-768.png) · [1440](before/real-e5/vector-explorer-1440.png) |[768](after/real-e5/embeddings-768.png) · [1440](after/real-e5/vector-explorer-1440.png) |
| Search390 / RAG390 |[Search](before/real-e5/semantic-search-390.png) · [clean RAG](before/real-e5/rag-chat-visible-390.png) |[Search](after/real-e5/semantic-search-390.png) · [clean RAG](after/real-e5/rag-chat-visible-390.png) |
| Read1440 / Compaction390 |[Read](before/real-e5/architecture-read-1440.png) · [Compaction](before/real-e5/architecture-compaction-390.png) |[Read](after/real-e5/architecture-read-1440.png) · [Compaction](after/real-e5/architecture-compaction-390.png) |
| Guided1024 /390 |[1024](before/real-e5/guided-complete-1024.png) · [390](before/real-e5/guided-complete-390.png) |[1024](after/real-e5/guided-complete-1024.png) · [390](after/real-e5/guided-complete-390.png) |

[Per-screen QA decisions](../../design/d08-visual-audit.md) describe the intentional changed areas; [absolute pixel differences](design-diffs/manifest.json) are design comparisons, not a beauty score or regression threshold. Agent visually inspected representative actual desktop/tablet/mobile states across all labs; independent design approval remains with ChatGPT/owner.

Frozen visual comparison uses64 active fixture images, Playwright threshold0.1/max100 different pixels, fixed before verification. `updateSnapshots:none` and a CLI guard reject automatic snapshot updating. A deliberately red panel must be rejected by the same comparator. [Proposed reference SHA/dimensions](visual-reference-manifest.json) explicitly says **PROPOSED — independent visual approval pending**. CI cannot record/update candidates. On mismatch, expected/actual/diff/trace go under `test-results/d08-visual`, uploaded by CI; do not loosen thresholds to conceal rendering/logic differences.

Recorded `fixture-replay.json` is read-only **ACTUAL NOT-E5 API FIXTURE / MOCK OLLAMA NOT REAL LLM**, with exact synthetic source IDs. Canonical method/path/query/JSON-body matching rejects unknown requests; non-loopback traffic is blocked. This freezes UI inputs for image comparison on a fresh machine; it is **not backend or real-E5 integration evidence**. The separately run20-case fixture/real E2E suites use actual local backend/SQLite.

Axe serious/critical findings are0 in the main/supplement capture flows at1440/390; actual overflow checks include1440/1024/768/390/320. Keyboard skip/nav/tab/dialog, visible focus, source links, real GSAP cleanup/reduced preference, simulator controls and guide cancellation/reset are exercised separately. This is not full WCAG or assistive-technology certification. Diagram may pan/zoom; current-stage focus and complete linear alternative retain all13 concepts.

## Performance and tradeoffs

[Detailed dependency graph/method/motion map](../../architecture/d08-performance.md), [comparison JSON](performance-comparison.json), [BEFORE raw5 samples](performance-before.json), [AFTER raw5 samples](performance-after.json).

| Measure | BEFORE | AFTER |
| --- | ---: | ---: |
| Entry JS bytes |660,065 |292,494 |
| Initial JS including static shared imports |660,065 |305,605 (**−53.70%**) |
| Initial gzip estimate, same level9 method |207,628 |97,532 |
| Total emitted JS bytes |660,065 |670,979 (**+1.65%**) |
| Aggregate gzip estimates |207,628 |223,095 |
| Initial ready median, local5 samples |571.935ms |483.845ms |
| First Architecture navigation median |242.923ms |466.184ms |
| Long-task counts per sample |3,1,2,3,2 |0,1,0,0,1 |

All emitted JS chunks are below500kB; the warning threshold was not increased. First Architecture navigation is slower by223.261ms in this sample because its graph/runtime are deferred; the loading/recovery UX is real and tested. Initial ready includes automation/font readiness, **not LCP**. HTTP preview is uncompressed/cache-disabled, no artificial throttling, same Edge/machine; JSON records hardware and CDP task/script/layout/heap/resource/rAF observations. Long-task median0 does not mean every run had none. No FPS improvement claim. Filmstrip/raw DevTools trace file/CLS/LCP/real-user mobile/warm-route benchmark **NOT MEASURED**. No embedding or Pinecone performance is inferred from these frontend timings.

## Source, model and safety boundaries

Taste `design-taste-frontend` revision `f6b76575f949707b4e3c37cd86cb44b0b98643e8` (2.5.1, MIT) is a source-guided adaptation for this workbench. Marketing-kit/random palette/mandatory effect/photo/global-hook prescriptions conflict with the explicit product brief; no installer/dealer/upstream Taste gate ran, and no upstream PASS is claimed. GSAP skills revision `aed9cfd3277740755f6bfc1155c7aa645403b760` (MIT guidance) informs scoped lifecycle/performance. Runtime `gsap3.15.1` has its **separate standard no-charge license**, not MIT; React Flow12.12.1 MIT and local Manrope/IBM Plex Mono OFL-1.1 remain locked. No paid plugin/library/font or dependency upgrade.

Real E5: official `intfloat/multilingual-e5-small`, revision `614241f622f53c4eeff9890bdc4f31cfecc418b3`,384D; weights470,641,600 bytes SHA-256 `1a55775f53449dac10a2bcbc312469fac40b96d53198c407081a831f81c98477`; tokenizer SHA-256 `0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39`. Existing D03 approval/cache reused, no D08 downloads. Real tests verify prefix/budget/pooling/L2/finite384D/source/ACTIVE/filter/citation/reset contracts independently.

Fixture vectors are explicitly **NOT E5** and not semantically meaningful. All generated-answer evidence is **MOCK OLLAMA / NOT REAL LLM** or search-only. Slab is **TOY2D / EDUCATIONAL SIMULATION / NOT PINECONE TELEMETRY**, separate from both embedding modes. No model/daemon/cloud action is caused by page opening, CSS, lazy import or GSAP.

## Development failures and remaining limits

Failures were corrected rather than omitted: [initial frontend test](frontend-first-tests.txt) had an obsolete assumption that idle simulator motion creates extra contexts; the replacement asserts every actually created context is reverted exactly, retaining timer/StrictMode checks. [Initial full-check Ruff failure](full-check-initial-lint-failure.txt) found helper constructor style/one longer evidence path; corrected before full PASS. [Keyboard failure](visual-keyboard-initial-failure.txt) exposed Tab escaping the native modal's content; explicit forward/reverse cycling fixed it without weakening the test. [Interrupted capture teardown](visual-after-teardown-interrupted.txt) completed image capture but runner did not exit; only that verified owned process tree was stopped, its exit1 is not PASS, and an independent complete rerun exited0. [Initial staged whitespace check](staged-initial-whitespace-failure.txt) found an extra final blank line in three new evidence helper copies; trimmed without changing their logic. Time-mask supplement is a capture correction with originals retained, not snapshot approval.

- **GitHub CI PENDING** until an actual workflow run after ChatGPT creates the Draft PR; no agent PR was opened. Workflow runs Windows quality/advisory/pip checks, actual NOT-E5 backend E2E and read-only recorded visual regression without AI assets/Ollama/cloud credentials.
- **LIVE NOT VERIFIED — AWAITING USER AUTHORIZATION**; **REAL OLLAMA NOT VERIFIED — NEEDS USER INSTALL/APPROVAL**. No account discovery/query/upsert/delete or real Qwen/daemon operation ran.
- Visual references are proposed for independent design review, not automatically approved. OS/browser/font rendering changes may require reviewed new candidates; never auto-update or loosen thresholds. Recorded visual replay proves UI repeatability only; integration evidence is separate.
- Frontend profile is a local five-sample observation, not a universal UX/FPS/latency benchmark. Deferred first Architecture navigation cost is disclosed. D09 packaging/rehearsal/final seminar acceptance remain unimplemented.
- Existing local teaching-system limits (loopback API without multi-user auth, optional extractive RAG policy, simulator simplifications, retained demo data) remain in D02–D07 architecture/runbooks. No data cleanup/migration was introduced. Secret scan is focused pattern/artifact checking, not a comprehensive security audit.

Normal development URLs: `http://127.0.0.1:5173/`, API `http://127.0.0.1:8000/api/health`; start with README PowerShell commands. Tests actually use owned5174/8001 integration and5175/8002 production preview, stop their servers, and do not claim these test URLs remain running. Publication uses only the original safe script/hook on Issue15; exact final local/remote SHA and clean-worktree confirmation belong to the actual handoff.
