# D08 Round 1 — reproducible Windows visual rasterization

Review: [5880290833 on Draft PR16](https://github.com/iamqthanq/pinecone-visual-lab/pull/16#pullrequestreview-5880290833). Repair base `8625597393d1d467b90ae83630fd280177d5b590`; same Issue15 / feature branch. The review was read in full. No application/backend/reducer/model/dependency change is required for this repair.

## Both original CI attempts inspected

Run [43280051381](https://github.com/iamqthanq/pinecone-visual-lab/actions/runs/43280051381): attempt1 job131398613752, attempt2 job131410437368. Both Windows quality/build/security, advisory/pip and20 fixture Edge integrations passed; both visual suites had6 pass /1 fail, at `architecture-write-1440.png`,101 pixels against100, threshold0.1. Actual logs retain the stable-screenshot/font-ready wait; this was not dismissed as a timing fluke.

[Review/run/job metadata](original-ci.json), [artifact/font/trace analysis](ci-artifact-analysis.json), [attempt1 log](original-ci/attempt-1.log), [attempt2 log](original-ci/attempt-2.log). Connector downloaded both ZIPs; local SHA-256 matches their GitHub digest:

| Attempt | GitHub artifact | ZIP SHA-256 |
| --- | --- | --- |
|1 |[13974080022](https://github.com/iamqthanq/pinecone-visual-lab/actions/runs/43280051381/artifacts/13974080022) |`087723671c43a395ffd50f5613954e86206bd24fd2246736e08790fc5ab30ece` |
|2 |[13972899285](https://github.com/iamqthanq/pinecone-visual-lab/actions/runs/43280051381/artifacts/13972899285) |`d0c2ec4d17d951c7d80bc5254ff27896c04ce9dfede0498a9f9ed24418fb16be` |

Each attempt's extracted [expected](original-ci/attempt-1-expected.png), [actual](original-ci/attempt-1-actual.png), [Playwright diff](original-ci/attempt-1-diff.png) is preserved separately, including [attempt2 actual](original-ci/attempt-2-actual.png) and [diff](original-ci/attempt-2-diff.png). Complete trace ZIPs remain in those original artifacts; their hashes are recorded, rather than duplicating two21MB traces in Git.

The two actual PNGs are **byte-identical**, SHA-256 `c3ba27ba2c8dd973db35eb9d4ebe1b4e9de76b3e4c4f8e56de36949bd910ca51`. Both expected PNGs match the original golden, SHA-256 `3ce06f24506c47f4b73d5a8bdaebdedcf86fea407436c112b52b9ba1055aace4`. Dimensions are1440×4544. The101 comparator pixels are concentrated at SVG/React Flow handle/arrow edges and disabled-control text, with scattered sidebar icon pixels; page content/geometry and toy final state agree.

## Controlled diagnosis, not a tolerance adjustment

Both runners used Windows Server2025, image `windows-2025-vs2026`, version `20261103.298.1`, Playwright1.65.0. The original trace records Edge/Chromium major157 in its reduced User-Agent; **the old job did not record the full Edge patch version or CDP GPU feature status**. Those historical values are not invented. All48 font responses across both traces are byte-identical to the local production WOFF2 assets (six unique Latin/extended/Vietnamese Manrope/IBM Plex Mono files). Font-file drift is excluded.

Local controlled experiments used the same Edge **157.0.4341.42**, fixture/CSS/source,1440×900, deviceScaleFactor1, en-US, reduced motion, ready fonts and final Write17/17. Default local CDP reports Intel UHD620 / D3D11, GPU compositing/rasterization enabled. Changing only `--disable-gpu` reports both as `disabled_software` and reproduces the complete CI actual PNG **byte for byte**. The viewport transform remains `translate(75px, 67.4038px) scale(0.730769)` and font remains15px/22.5px Manrope Variable. This isolates the raster/compositing pipeline rather than a late font, changed model data, camera position, reducer step or GSAP frame.

Diagnostic counts below use the installed Playwright comparator at threshold0.1 with a stricter zero-difference diagnostic budget; they do not change the100-pixel acceptance budget. [Capture log](renderer-probes-capture.txt), [comparison log](renderer-probes-comparison.txt), [counts](renderer-probe-counts.json), [native CDP](native-renderer.json), [software CDP](software-renderer.json).

| Local launch setting | Different pixels vs original hardware golden | vs original CI actual |
| --- | ---: | ---: |
| Default |0 |101 |
| `--disable-gpu` |101 |0 |
| `--use-angle=swiftshader` |33 |135 |
| `--use-angle=d3d11` |0 |101 |
| `--disable-features=UseSkiaRenderer` |0 |101 |
| `--disable-lcd-text` |37,570 |37,215 |

[Controlled software reproduction](software-controlled-reproduction.png) has exactly the same SHA as both CI actuals. Historical CI renderer configuration is inferred from that exact output, not claimed as previously measured. The repaired job now measures and asserts its effective CDP software state directly.

## Minimal repair and reference proposal

`playwright.visual.config.ts` uses one explicit **visual-only** profile: Edge on Windows, `--disable-gpu`, en-US, deviceScaleFactor1, reduced motion. `tests/visual/rendering.ts` records full browser/product version, OS release, effective GPU/raster states and client settings before capture; diagnostics survive a failure. `rendering.spec.ts` asserts the actual effective state. Per-capture artifacts record font readiness/faces, graph font/transform/node count/mode/step and active CSS animations. Fonts-ready, two rAF waits and Playwright's stable-screenshot comparison remain; no arbitrary delay substitutes for diagnosis.

CI is pinned to the existing Windows2025 runner family. Product code and normal browser/E2E execution remain native; historical `before`/`after` capture and the performance config still use native rendering. No performance/FPS improvement is claimed by disabling GPU in a test browser. `tsconfig.visual.json`/`typecheck:visual` add strict checking of the visual harness to the existing quality gate.

A software-rendered image necessarily differs from the hardware reference by101 pixels in the reported case, so keeping that hardware-only reference under the new uniform profile would still fail. The64 software candidates are therefore stored **separately** under [software-references](software-references/manifest.json), not written over originals. Every original active golden is checked against its blob at8625597. Same fixture IDs, viewport dimensions, content and mask selectors; no diagram/data/source region is hidden. [64 paired RGB differences and hashes](reference-comparison.json), [difference images](reference-diffs/architecture-write-1440.png). Raw RGB counts are diagnostic, not a beauty score or acceptance threshold.

**Proposal status: independent baseline review/approval pending.** Selecting this explicit pipeline/reference proposal for regression verification does not declare aesthetic or owner approval. The original hardware candidates and all original BEFORE/AFTER evidence remain traceable. No `--update-snapshots` was invoked. CI cannot capture proposals; both long and short update aliases are rejected before test execution and covered by a non-executing `--list` negative test. `updateSnapshots:none`, `maxDiffPixels=100`, `threshold=0.1`, all64 states, the red-panel mutation negative oracle and all original functional tests remain.

New generated regression evidence is redirected only to `review-r1/regression`; test assertions remain intact and old D08 samples/screenshots are retained. LIVE/real Ollama are still NOT VERIFIED; only cached approved E5 and Mock Ollama/search-only are used for local integration.

Follow-up during regression: the first real Edge run exposed a late `ResizeObserver` callback after route unmount (20 tests passed, but the Vite server reported an exception). The original log is retained. A minimal DOM-ref null guard plus a new unmount regression test fixes that lifecycle race. This is separate from the proven GPU raster mismatch: all controlled renderer experiments above used the original byte-identical D08 build. The final rebuilt application is checked against the already captured software proposals without regenerating them.

Playwright documents that hardware/OS/browser differences affect rendering and recommends matching capture environments: [visual comparisons](https://playwright.dev/docs/test-snapshots). The [launch API](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-option-args) cautions that custom flags require care; this flag is scoped to the investigated visual pipeline and independently checked, not applied to the application/performance path. Effective state is obtained through the [CDP SystemInfo API](https://chromedevtools.github.io/devtools-protocol/tot/SystemInfo/#method-getInfo).

## Verification record

`software-proposal.txt`:1 PASS, exit0; explicit local fixture-replay capture into a new non-overwriting proposal directory. `visual-software.txt`:8 PASS, exit0 before the additional update-alias guard test; all64 software image comparisons plus the existing negative/resilience checks passed. Subsequent complete9-case visual and full regression/real E5/CI results are recorded in [the round report](REPORT.md) only after execution. The full prior reviewer-confirmed success matrix remains historical at8625597; it is not used to override the original CI failures.
