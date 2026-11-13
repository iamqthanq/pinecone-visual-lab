# D08 frontend loading, motion and measured performance

R1 note: [CI raster investigation](../evidence/d08/review-r1/INVESTIGATION.md) adds a software compositor only to visual proposal/verification. Historical native-rendered performance measurements below remain unchanged; normal application/E2E/performance paths retain native rendering. Controlled renderer probes used the byte-identical original D08 build. A subsequent queued-resize null guard changes emitted JS hashes; R1 records those assets separately and makes no new product performance claim.

The D07 production entry imported every lab, including React Flow/GSAP, and the eager Guided panel imported inspectors from full lab modules. The reproduced baseline is `index-BHBSqUm6.js`,660,065 bytes; Vite reported660.06kB /210.61kB gzip and a500kB warning. This was a warning, not a failed D07 build. [Original build](../evidence/d08/bundle-before-build.txt), [asset hashes](../evidence/d08/bundle-before.json).

## Dependency boundaries

`App.tsx` now declares module-scope React.lazy imports for Documents, Vectors, Vector Store, Search, Architecture and the opt-in Guided panel. Search defers RAG until its tab is selected. Shared shell/status/navigation stay available during loading/failure. `LabBoundary` offers reload at the same URL and Overview recovery; the guide can still be cancelled while its panel loads/fails. Route changes focus main; asset completion cannot resurrect an abandoned route. Existing source deep links and guide receipts remain intact.

Inspectors moved into their own modules; Guided no longer imports complete lab controllers. `VectorValues`/inspectors are memoized, retaining all384 dimensions, precision, table, Copy, model/tokens/norm/measured timing/source fields. No virtualization truncates evidence. `useDataMotion` dynamically imports the one GSAP core chunk only after actual data/state; Architecture imports that same runtime within its lazy graph. No heavy runtime comes through the shared layout/barrel.

Vite's manifest and actual browser network confirm these boundaries. The initial graph includes entry **and its shared components chunk**; entry alone is not the whole initial cost. All sizes below use decimal bytes. Gzip estimates consistently use Python `gzip.compress` default level9, not Vite's different compressor settings; the local HTTP preview is deliberately uncompressed. [Before/after build and browser comparison](../evidence/d08/performance-comparison.json), [full AFTER manifest/assets](../evidence/d08/bundle-after.json).

| Production measure | D07 BEFORE | D08 AFTER |
| --- | ---: | ---: |
| Entry JS bytes |660,065 |292,494 |
| Initial static JS including shared imports |660,065 |305,605 |
| Initial static JS gzip estimate |207,628 |97,532 |
| Total emitted JS across all routes |660,065 |670,979 |
| Sum of all JS gzip estimates |207,628 |223,095 |
| Source maps emitted |0 |0 |

Initial JS decreases **53.70%**. Total JS increases10,914 bytes (about1.65%); aggregate gzip grows because independently compressed chunks lose cross-route compression and D08 adds actual UI/motion/recovery code. This is deferred work, not removal of all code. Architecture is approximately195.84kB, GSAP69.99kB, Search18.59kB, RAG16.41kB, Documents16.45kB; the complete exact distribution/hashes are in the manifest. No emitted JS chunk exceeds500kB, and `chunkSizeWarningLimit` is unchanged. One GSAP runtime and one Architecture/React Flow chunk are observed; shared modules are recorded explicitly rather than counted once per importing route.

## Actual browser observations and tradeoffs

Same Windows machine, Edge157.0.4341.42; hardware/RAM/OS are in the raw profiles. Five fresh contexts per stage,1440×900, CDP browser cache disabled; same local fonts, production loopback HTTP, no compression/network/CPU throttling, no competing test workload. Baseline ran after its real-E5 visual audit; AFTER explicitly warms the same approved synthetic E5/SQLite collection **outside timing** to match loaded backend status. No embedding inference is included in frontend timing.

`initialReadyMs` is automation-observed heading + font readiness after navigation; it is **not LCP**. `routeReadyMs` measures clicking Architecture from Overview until13 React Flow nodes mount, including dynamic imports. A finite2.2-second Read Play observation collects rAF gaps, Long Tasks and cumulative CDP task/script/layout/heap counters. Pause is explicit. [Raw BEFORE](../evidence/d08/performance-before.json), [raw AFTER](../evidence/d08/performance-after.json), [profile test](../../tests/performance/production.spec.ts).

| Five-sample observation | BEFORE | AFTER |
| --- | ---: | ---: |
| Initial ready median |571.935ms |483.845ms |
| First Architecture navigation median |242.923ms |466.184ms |
| Initial decoded JS, every sample |660,065 bytes |305,605 bytes |
| Long-task counts per sample |3,1,2,3,2 |0,1,0,0,1 |
| Long-task total median |120ms |0ms |
| Cumulative final CDP TaskDuration median |0.991s |0.828s |
| Median rAF gap, each sample |16.7ms |16.7ms |

The first Architecture navigation is **slower by223.261ms in this local sample**, because its code/CSS now arrive on demand. That cost is visible through an accessible loading state. Initial ready decreased88.090ms in this sample; this does not establish a universal latency or device guarantee. A zero median long-task total does not mean every run had zero long tasks. rAF gaps are observations, **not a claimed FPS improvement**. Filmstrip, raw DevTools trace file, CLS, LCP, real-user mobile metrics and warm-route timing: **NOT MEASURED**. Raw CDP counters/resource entries are present; no trace/filmstrip capture is invented.

## Motion policy and verification

React/backend/reducer own every result, source, rank, progress value and completion. Motion has no API call/state completion callback. Ordinary entrances use transform/opacity240ms + at most140ms stagger, at most8 scoped elements; vector surfaces use300ms + bounded stagger. Simulator inner-label motion is200ms divided by explicitly selected playback speed; it never animates React Flow positioning transforms or decides a step.

| Surface | Actual trigger | Presentation / cleanup |
| --- | --- | --- |
| Overview pipeline | Backend guide receipt object | Scoped cards; no fake completed state |
| Documents | Persisted preview/confirmed version ID | First8 chunk/list/detail targets |
| Passage/fetched vectors | Actual returned record | Whole heatmap/metrics; never384 tweens |
| Manifest | Actual returned job/checkpoint | Badge/native progress surface only; native value untouched |
| Search/filter | Actual response/hits | Ranked cards; no score/rank mutation |
| RAG | Validated response | Answer/citations/source surfaces |
| Guided step | Navigation + backend completed receipt signature | Heading/facts; no data credit from movement |
| Simulator | Reducer cursor/mode | Current inner labels only; finite playback |

Contexts revert on replacement, unmount, hidden tab, reduced-motion change and inactive Semantic tab. Async import disposal prevents detached-node timelines; StrictMode remount and rapid replacement are tested. Failed optional motion imports leave content visible. Timers/listeners/ResizeObserver/route-focus rAF are owned and cleaned up. No infinite GSAP timeline or paid plugin. Actual browser reduced-motion/keyboard/route-failure tests supplement unit context mocks.

## Reproduction and limits

Run the normal Windows quality/build and both real/fixture E2E commands in README. For the AFTER profile, first create/reuse the isolated real visual sample (`PVL_VISUAL_STAGE=after`, fixture/replay absent; `npx.cmd playwright test --config playwright.visual.config.ts`), then `npm.cmd run test:performance` with that same stage. No AI setup/download runs. Run `scripts/measure_bundle.py after apps/web/dist` and `docs/evidence/d08/compare-evidence.py` for asset/profile summaries and intentional-design differences. BEFORE capture/profile refuses overwrite; its archived dist is an ignored local artifact reproducible from the verified D07 commit, not shipped application code.

Recorded visual replay is a separate read-only **NOT E5 / MOCK OLLAMA** UI regression test, not a performance or backend integration claim. Browser/OS/font rendering changes require independent image review; thresholds are not loosened or snapshots auto-approved. GitHub CI remains PENDING until actually executed. D09 deployment/packaging and seminar acceptance are outside this phase.
