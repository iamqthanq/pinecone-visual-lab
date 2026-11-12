# Slab Architecture Simulator — D07

**SIMULATION — EDUCATIONAL MODEL — NOT PINECONE TELEMETRY**

This lab is a deterministic, local, two-dimensional teaching model. It does not inspect Pinecone, estimate its performance or reproduce proprietary internals. LOCAL DEMO stores actual E5 vectors in SQLite; this simulator uses small invented vectors explicitly labeled as simulation. They never enter Documents, embedding storage or a vector adapter.

## Sources and interpretation

Reviewed on 2026-11-12:

- [Pinecone: Slab architecture](https://www.pinecone.io/learn/slab-architecture/), especially high-level architecture, write path, storage/compaction and read path.
- [Pinecone: How Pinecone works](https://www.pinecone.io/how-pinecone-works/), especially write path, compaction, read path and system components.

| Publicly documented concept | Rule implemented for education |
| --- | --- |
| Durable request log/WAL precedes acknowledgment | An explicit log → acknowledge → apply sequence. This is an in-memory event log, **not actual durable storage**. |
| Memtables and immutable L0 slabs backed by object storage | Small arrays and named immutable snapshots; a Flush step creates a simulated object. No object-store request occurs. |
| Router fans out to memtable/slab executors; candidates merge into Top-K | Exact cosine over toy 2D vectors, deterministic ID tie-break and Top-2. Production ANN/index algorithms are not modeled. |
| Updates, deletes and tombstones participate in version resolution | Highest sequence per `(namespace, ID)` wins; tombstones mask older copies before scoring. Sequence numbers are explicit lesson inputs. |
| Compaction merges smaller slabs into higher levels | Two selected L0s become one L1; two L1s become L2. New output is published before inputs are retired. Tombstones are retained, including in partial compaction. |
| Namespaces and executor caching | An isolated foreign-namespace example and a conceptual cache node. No cache hit rate, eviction policy or real account namespace discovery is simulated. |

The two pages differ in wording about thresholds, index algorithms and freshness. The lesson deliberately specifies no production size threshold, algorithm selection rule, latency, freshness guarantee, QPS, cache-hit percentage or real slab count. Counts shown are counts of the **toy records/slabs in the current snapshot**.

## Deterministic engine

`apps/web/src/simulator.ts` is independent of React, GSAP, networking, clocks and storage. It defines typed records, slabs, events, snapshots, control actions and a reducer. A seed in `1…9999` namespaces the lesson IDs; vector values and event order are explicit. Replaying a mode with the same seed yields structurally equal snapshots.

`transition(snapshot, event)` returns a new snapshot. `snapshot(mode, seed, cursor)` reconstructs a prefix of the event program from its baseline. Back/Next/Seek select prefixes instead of attempting lossy inverse mutations. Reset returns cursor0, paused; Replay returns cursor0 and starts finite playback. Mode changes reset the cursor. Speed changes only playback scheduling, never data. End-of-program pauses automatically.

Snapshots include WAL, acknowledged/applied sequences, pending records, memtable, slabs, retired slab IDs, compaction plan, query, candidates, merged candidates and Top-K. The UI exposes both a linear event log and complete JSON snapshot. Old inputs remain available in earlier snapshots; publishing compaction does not mutate them.

### Independent worked example (seed7)

Write/Flush stores `a-7=[1,0]`, `b-7=[0,1]`, then updates `a-7=[0,1]` and inserts `c-7=[1,1]` in a second slab. A foreign namespace has a vector `[1,0]`. Read adds a tombstone for `b-7` in the memtable.

For query `[1,0]`, the valid latest visible records give:

| Record | Calculation | Cosine |
| --- | --- | --- |
| `c-7` | `1 / sqrt(2)` | approximately0.70710678 |
| latest `a-7` | `0 / 1` | 0 |
| stale `a-7=[1,0]`, deleted `b-7`, foreign vector | Excluded before scoring | No result |

Compaction starts with four L0s, including the delete and an opposite vector `d-7=[-1,0]`, plus a fresher `c-7=[0,-1]` in memtable. Three plan/publish pairs yield two L1s and then one L2. Latest live lesson records remain unchanged throughout; the tombstone is retained so a partially merged older `b-7` cannot resurrect. Retired input files remain visible as retired simulation objects.

`simulator.test.ts` independently folds the WAL to check live-record preservation and verifies immutable snapshots, replay/seek, tombstones/overwrites, namespace isolation and the mathematical cosine example. This is a correctness oracle for the teaching rules, not validation of Pinecone internals.

## Diagram, animation and accessibility

`simulator-graph.ts` maps snapshots to 13 React Flow nodes and their edges: WAL, memtable, L0, object storage, router, executors, candidates, merge, Top-K, compactor, L1, L2 and conceptual cache. The graph is pan/zoomable. Captions, tables, event buttons and JSON provide a linear alternative to the graph, including on narrow screens.

Pinned runtime: `@xyflow/react@12.12.1` (MIT) and `gsap@3.15.1` ([standard no-charge license](https://gsap.com/community/standard-license/), **not MIT**). No commercial/Club plugins, animation-authoring builder or paid service is used. Transitive package/integrity metadata is recorded with D07 evidence.

Written GSAP guidance was reviewed from [greensock/gsap-skills](https://github.com/greensock/gsap-skills/tree/aed9cfd3277740755f6bfc1155c7aa645403b760), pinned revision `aed9cfd3277740755f6bfc1155c7aa645403b760`: core, timeline, React integration and performance skills. That repository's MIT license is separate from the runtime license. No third-party installer or skill scripts were executed.

`ArchitectureLab.tsx` schedules a finite Next timeout from reducer state. GSAP animates only inner label transforms/opacity within a scoped context; it never chooses the next state or modifies React Flow's positioned outer transforms. Every effect reverts its context and clears its timer. Pause, mode change, unmount and hidden tabs stop playback/animation. `prefers-reduced-motion` disables GSAP movement; keyboard Next/Back/Seek and finite timed logical playback still work. No infinite timeline exists.

Unit tests exercise cleanup under StrictMode and reduced motion. Edge checks the actual graph, controls, keyboard seek, three walkthrough finals, serious/critical axe findings and overflow at1440/1024/768/390/320. These checks do not constitute an FPS benchmark or complete WCAG certification. D08 visual/performance polish remains separate.
