# D08 Round 1 — visual reproducibility repair

Assignment: Issue #15, existing Draft PR #16, branch `feature/issue-15-taste-gsap-polish`. Reviewed source: `8625597393d1d467b90ae83630fd280177d5b590`. Dependency locks, historical evidence, branch guards and authentic workflow content are unchanged. The sole product change is a queued-resize lifecycle guard described below. No cloud, model download, or Ollama inference was performed.

## Finding and repair

Both original CI attempts of [run 43280051381](https://github.com/iamqthanq/pinecone-visual-lab/actions/runs/43280051381) failed the same Architecture Write image with exactly 101 differing pixels against a 100-pixel allowance. Their actual images are byte-identical. With identical fonts, application build, replay data, camera and final reducer state, changing only local Edge's GPU setting reproduces both CI images **byte for byte**. See [INVESTIGATION.md](INVESTIGATION.md), [original CI records](original-ci.json), [font/archive verification](ci-artifact-analysis.json) and [controlled renderer measurements](renderer-probe-counts.json).

The visual-only harness now selects software compositing (`--disable-gpu`) consistently, and asserts effective CDP `gpu_compositing` and `rasterization` status before screenshots. It records full Edge version, OS, graphics state, locale, scale, reduced motion, fonts, diagram state and actual PNG SHA-256 in retained artifacts. The workflow selects Windows 2025 explicitly. Normal functional E2E, application rendering and performance measurement continue using native Edge settings.

The first real E5 Edge rerun passed its 20 assertions but logged an unhandled `ResizeObserver` callback reading a cleared DOM ref on route unmount. This is distinct from the proven rasterization mismatch. `ArchitectureLab.tsx` now ignores that late callback; a new unit test delivers the callback after unmount and asserts disconnect/no exception. The original log is retained as `edge-real-e5-before-lifecycle.txt`; final regression is rerun after the guard. No diagram layout or camera rule changes.

The first post-guard full check stopped in the existing navigation test: its default one-second `findByRole` wait expired while cold-loading the Architecture route. All other 76 tests, including the new lifecycle test, passed. `App.test.tsx` now permits that heading up to five seconds (ten-second limit for the multi-route test), retaining every assertion and requiring the actual loaded heading. `full-check-lazy-timeout.txt` retains the failed run. This bounded asynchronous wait is unrelated to the unchanged screenshot pixel thresholds.

A later rerun encountered Windows sleep/resume during the test session: `full-check-clock-stall.txt` records 2,797.56 seconds elapsed and five timeout failures. [Windows event records](windows-sleep-events.json) preserve Kernel-Power IDs 42/107 near that session's start. Their recorded timestamps are retained verbatim; they are not used as a precise sleep-duration measurement. The gate is rerun on the active machine without enlarging those tests' budgets or removing failures.

Original references remain unchanged. The 64 software reference proposals are stored separately in [software-references/](software-references/). [reference-comparison.json](reference-comparison.json) provides old/new hashes, dimensions and raw pixel differences; [reference-diffs/](reference-diffs/) contains all comparison images. The Architecture Write 1440 proposal equals the two original CI actuals and the controlled software reproduction. Independent reviewer approval of these proposals remains pending; local/CI PASS does not itself grant visual approval.

Threshold **0.1**, allowance **100 pixels**, all 64 states, existing masks and the red-panel negative oracle are preserved. New config tests reject automatic snapshot-update aliases and proposal generation in CI. No diagram is hidden and no test is disabled.

## Requirement → implementation → verification

| Request | Implementation / evidence | Check |
| --- | --- | --- |
| Compare both attempts | `original-ci/`, `original-ci.json`, `ci-artifact-analysis.json` | Both artifact ZIP digests, expected/actual/diff, trace resources and all 48 font responses verified |
| Explain graphics/font/animation timing | `INVESTIGATION.md`, native/software renderer JSON, probe logs | Controlled GPU-only change produces exact original CI PNG; identical camera, final Write state, font assets |
| Reproducible runner capture | `tests/visual/rendering.ts`, `rendering.spec.ts`, `audit.spec.ts`, `playwright.visual.config.ts` | Effective software assertion; full browser/environment and per-image state retained even on failure |
| Preserve safeguards | `tests/visual/config.spec.ts`, `verify-repair.py` | No auto update, no tolerance increase, same 64 states and old assertions, original evidence protected |
| Regression | `scripts/check.ps1`, `tsconfig.visual.json`, `regression/` | Actual command logs below; only output destinations changed in 12 existing real/E2E test files |
| Safe publication | Existing guarded push script and hook | Same feature branch only; remote SHA and clean status verified at handoff |

## Local verification

Each linked log includes the actual command, complete output, exit code and elapsed time. Environment variables for real runs: `PVL_DISABLE_CLOUD=1`, `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`, `PVL_OLLAMA_ENABLED=0`; fixture runs additionally set `PVL_E2E_FIXTURE=1`. Visual verification sets `PVL_VISUAL_STAGE=verify`, `PVL_VISUAL_REPLAY=1` and fixture mode. All model inference uses the previously approved local E5 cache.

| Gate | Result | Actual log |
| --- | --- | --- |
| Full Windows quality script | PASS / exit 0: 77 frontend tests; 220 backend/API/Git guards; ESLint, app/visual strict TypeScript, Ruff, production build, secret/diff checks | [full-check.txt](full-check.txt) |
| Real tokenizer/E5 | PASS / exit 0: 6 tests, 220 deselected | [real-e5-tests.txt](real-e5-tests.txt) |
| Edge offline NOT E5 / Mock Ollama | PASS / exit 0: 20 tests | [edge-fixture.txt](edge-fixture.txt) |
| Edge real cached E5 / SQLite / Mock Ollama | PASS / exit 0: 20 tests; no unhandled resize exception in final log | [edge-real-e5.txt](edge-real-e5.txt) |
| Final software visual suite | PASS / exit 0: 9 cases, 64 image comparisons, negative color oracle, config guards, renderer, lifecycle/resilience | [visual-final.txt](visual-final.txt); [earlier run](visual-software.txt) |
| Current visual harness strict TypeScript | PASS / exit 0, after PNG-hash instrumentation | [harness-typecheck.txt](harness-typecheck.txt) |
| npm audit moderate | PASS / exit 0; zero vulnerabilities | [npm-audit.txt](npm-audit.txt) |
| pip check | PASS / exit 0 | [pip-check.txt](pip-check.txt) |
| Production asset inventory after lifecycle guard | PASS / exit 0: 24 JS/CSS assets; total JS 671,000 bytes versus original 670,979 (+21); no performance/FPS claim | [bundle-measurement.txt](bundle-measurement.txt), [asset hashes](bundle-after-lifecycle.json) |
| Independent evidence and preserved assertions | PASS / exit 0: real vectors/source/JSONL, 20 integration screenshots, all 64 original state names, original functional assertions and protected evidence | [verify-regression.txt](verify-regression.txt), [verify-repair.txt](verify-repair.txt) |

Both final Edge suites retain all 20 original tests. Only generated evidence destinations change in those files. The earlier real Edge log exposes the resize exception; the final fixture/real logs do not contain it. The backend/embedding implementation is byte-identical to the real six-test run, verified separately by the repair guard.

Final visual capture: 32 axe scans have zero serious/critical violations, all 16 states pass overflow checks at all five widths (including 320). [Actual per-image state/hash records](local-capture-states.json) and [effective renderer](local-rendering-environment.json) retain full evidence. 47/64 PNGs equal proposals byte for byte; the other 17 differ in only 10–54 raw RGB pixels, under the original allowance even before perceptual filtering. [Residual diagnostics](final-local-raster-diagnostics.json). All architecture captures, including the original failing Write 1440 case, are byte-identical to their software proposals. That Write image also equals both original CI actuals. Software compositing fixes the reported GPU mismatch; it does not claim to eliminate every subpixel rendering difference across the entire interface.

The initial strict harness run caught an unused `Page` type import; it was fixed, with both failure and successful rerun logs retained. The first software suite passed all original seven cases plus the renderer assertion. The final suite adds a ninth case checking config safety.

## Publication and CI

Not pushed yet. GitHub CI for this repair is **PENDING**, never inferred from local results. Original attempts failed as stated above. Actual run URL, tested SHA and results will be recorded after safe push and completion.

## Review boundaries / remaining limitations

- Software references are proposed for independent review, not silently substituted into the original golden directory. The reviewer has complete before/after/diff evidence and the exact original failing CI artifacts.
- The original CI trace records reduced browser major 157, not its full Edge patch or effective CDP GPU state. Those historical values are **NOT RECORDED**. Renderer causality is established by controlled byte-identical reproduction, not invented historical telemetry. The repair records full versions and effective state for future CI.
- Edge servicing can still change rasterization. Future changes must retain comparisons and require explicit reference review; neither CI nor `--update-snapshots` can regenerate references.
- Production asset hashes and sizes after the resize guard are retained separately; no route splitting, layout, animation policy or performance settings changed. This repair makes no new performance, FPS or latency claim.
- Fixture evidence is explicitly NOT E5 / MOCK OLLAMA. Real E5 evidence is separate. REAL OLLAMA and LIVE PINECONE remain NOT VERIFIED.
- No PR creation, merge, Issue closure or D09 work is part of this repair.
