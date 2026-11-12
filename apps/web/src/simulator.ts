/** Educational in-memory toy, NOT Pinecone internals/telemetry or E5. No IO or clock. */
export type Mode = 'write' | 'read' | 'compaction'
export type Vec2 = readonly [number, number]
export interface VectorRecord { id: string; namespace: string; seq: number; values: Vec2 | null }
export interface Slab { id: string; level: number; namespace: string; records: VectorRecord[] }
export interface Candidate { id: string; seq: number; score: number; executor: string }
export interface SimulationSnapshot {
  wal: VectorRecord[]; acknowledged: number[]; applied: number[]; pending: VectorRecord | null
  memtable: VectorRecord[]; slabs: Slab[]; retired: string[]
  plan: { ids: string[]; output: string; level: number } | null
  query: Vec2 | null; candidates: Candidate[]; merged: Candidate[]; top: Candidate[]
}
export type Event =
  | { type: 'log'; id: string; namespace: string; values: Vec2 | null }
  | { type: 'ack' | 'apply' | 'query' | 'fanout' | 'merge' | 'top' }
  | { type: 'flush'; id: string }
  | { type: 'plan'; ids: string[]; output: string; level: number }
  | { type: 'publish' }
export interface TraceStep { event: Event; title: string; detail: string; active: string[]; concept: 'documented concept' | 'toy simulation rule' }
export interface SimulatorState { mode: Mode; seed: number; cursor: number; playing: boolean; speed: number }
export type Control = { type: 'next' | 'back' | 'play' | 'pause' | 'reset' | 'replay' }
  | { type: 'seek'; cursor: number } | { type: 'mode'; mode: Mode } | { type: 'speed'; speed: number }

export const SIMULATION_LABEL = 'SIMULATION — EDUCATIONAL MODEL — NOT PINECONE TELEMETRY'
export const key = (r: VectorRecord) => `${r.namespace}/${r.id}`
export function latest(records: readonly VectorRecord[]): VectorRecord[] {
  const result = new Map<string, VectorRecord>()
  for (const record of records) if (!result.has(key(record)) || result.get(key(record))!.seq < record.seq) result.set(key(record), record)
  return [...result.values()].sort((a, b) => key(a).localeCompare(key(b), 'en'))
}
export function visible(snapshot: SimulationSnapshot, namespace = 'lesson') {
  return latest([...snapshot.memtable, ...snapshot.slabs.filter(s => !snapshot.retired.includes(s.id)).flatMap(s => s.records)])
    .filter(r => r.namespace === namespace && r.values !== null)
}
export function toyCosine(a: Vec2, b: Vec2): number {
  const norm = Math.hypot(...a) * Math.hypot(...b)
  if (!norm || ![...a, ...b, norm].every(Number.isFinite)) throw new Error('Finite nonzero toy vectors required')
  return Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / norm))
}
function blank(): SimulationSnapshot { return { wal: [], acknowledged: [], applied: [], pending: null, memtable: [], slabs: [], retired: [], plan: null, query: null, candidates: [], merged: [], top: [] } }
export function transition(previous: SimulationSnapshot, event: Event): SimulationSnapshot {
  const s = structuredClone(previous)
  switch (event.type) {
    case 'log': {
      if (s.pending || s.wal.length >= 12 || !event.id || !event.namespace) throw new Error('Bounded sequential toy writes only')
      if (event.values) toyCosine(event.values, [1, 0])
      s.pending = { id: event.id, namespace: event.namespace, values: event.values, seq: s.wal.length + 1 }
      s.wal.push(s.pending); break
    }
    case 'ack':
      if (!s.pending || !s.wal.some(r => r.seq === s.pending!.seq) || s.acknowledged.includes(s.pending.seq)) throw new Error('Acknowledge only after WAL')
      s.acknowledged.push(s.pending.seq); break
    case 'apply':
      if (!s.pending || !s.acknowledged.includes(s.pending.seq)) throw new Error('Apply requires acknowledged log')
      s.memtable = latest([...s.memtable, s.pending]); s.applied.push(s.pending.seq); s.pending = null; break
    case 'flush': {
      const records = s.memtable.filter(r => r.namespace === 'lesson')
      if (s.pending || !records.length || s.slabs.some(s => s.id === event.id)) throw new Error('Flush nonempty memtable to a new immutable slab')
      s.slabs.push({ id: event.id, level: 0, namespace: 'lesson', records }); s.memtable = s.memtable.filter(r => r.namespace !== 'lesson'); break
    }
    case 'plan': {
      const inputs = s.slabs.filter(slab => event.ids.includes(slab.id) && !s.retired.includes(slab.id))
      if (s.plan || event.ids.length < 2 || new Set(event.ids).size !== event.ids.length || inputs.length !== event.ids.length || inputs.some(s => s.namespace !== 'lesson' || s.level + 1 !== event.level) || s.slabs.some(s => s.id === event.output)) throw new Error('Compact distinct live slabs of one level into a new next-level slab')
      s.plan = { ids: event.ids, output: event.output, level: event.level }; break
    }
    case 'publish': {
      if (!s.plan) throw new Error('Select inputs before publishing')
      const inputs = s.slabs.filter(slab => s.plan!.ids.includes(slab.id))
      // Retain latest tombstones even in partial compaction: never resurrect external old versions.
      const records = latest(inputs.flatMap(slab => slab.records))
      s.slabs.push({ id: s.plan.output, level: s.plan.level, namespace: 'lesson', records })
      s.retired.push(...s.plan.ids); s.plan = null; break
    }
    case 'query': s.query = [1, 0]; s.candidates = []; s.merged = []; s.top = []; break
    case 'fanout': {
      if (!s.query) throw new Error('A query is required')
      const current = new Map(visible(s).map(r => [key(r), r.seq]))
      const groups = [{ id: 'memtable', records: s.memtable }, ...s.slabs.filter(slab => !s.retired.includes(slab.id))]
      s.candidates = groups.flatMap(group => group.records.filter(r => r.values && current.get(key(r)) === r.seq).map(r => ({ id: r.id, seq: r.seq, executor: group.id, score: toyCosine(s.query!, r.values!) })))
      break
    }
    case 'merge':
      if (!s.query) throw new Error('A query is required')
      s.merged = [...new Map(s.candidates.map(r => [r.id, r])).values()].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id, 'en')); break
    case 'top':
      if (!s.query) throw new Error('A query is required')
      s.top = s.merged.slice(0, 2); break
    default: throw new Error('Unknown simulation event')
  }
  return s
}
function writeSteps(seed: number): TraceStep[] {
  const steps: TraceStep[] = []
  function write(id: string, values: Vec2 | null, namespace = 'lesson') {
    const name = `${id}-${seed}`
    steps.push({ event: { type: 'log', id: name, namespace, values }, title: `Log ${name}`, detail: 'Toy WAL records the operation before acknowledgment. This is in-memory sequencing, not real disk durability.', active: ['wal'], concept: 'documented concept' },
      { event: { type: 'ack' }, title: `Acknowledge ${name}`, detail: 'The toy client can acknowledge only a logged write. Published architecture describes durable acknowledgment; no real WAL is written here.', active: ['wal'], concept: 'documented concept' },
      { event: { type: 'apply' }, title: `Stage ${name}`, detail: 'Latest version becomes visible in this namespace’s toy memtable; old immutable files stay unchanged.', active: ['memtable'], concept: 'toy simulation rule' })
  }
  write('a', [1, 0]); write('b', [0, 1])
  steps.push({ event: { type: 'flush', id: 'L0-1' }, title: 'Flush → L0-1', detail: 'Create a new immutable slab in conceptual object storage. Two records here are a teaching choice, not a Pinecone threshold.', active: ['l0', 'storage'], concept: 'documented concept' })
  write('a', [0, 1]); write('c', [1, 1])
  steps.push({ event: { type: 'flush', id: 'L0-2' }, title: 'Flush → L0-2', detail: 'A new slab holds the update; L0-1 bytes are unchanged. Readers must choose the latest sequence.', active: ['l0', 'storage'], concept: 'documented concept' })
  write('foreign', [1, 0], 'other')
  return steps
}
function baseline(mode: Mode, seed: number): SimulationSnapshot {
  let state = blank()
  if (mode === 'write') return state
  for (const step of writeSteps(seed)) state = transition(state, step.event)
  function add(id: string, values: Vec2 | null) {
    for (const event of [{ type: 'log', id: `${id}-${seed}`, namespace: 'lesson', values }, { type: 'ack' }, { type: 'apply' }] as Event[]) state = transition(state, event)
  }
  add('b', null)
  if (mode === 'compaction') {
    state = transition(state, { type: 'flush', id: 'L0-3' }); add('d', [-1, 0]); state = transition(state, { type: 'flush', id: 'L0-4' }); add('c', [0, -1])
  }
  return state
}
export function program(mode: Mode, seed: number): TraceStep[] {
  if (!['write', 'read', 'compaction'].includes(mode) || !Number.isInteger(seed) || seed < 1 || seed > 9999) throw new Error('Invalid bounded preset')
  if (mode === 'write') return writeSteps(seed)
  if (mode === 'read') return [
    { event: { type: 'query' }, title: 'Route toy query [1, 0]', detail: 'Query router receives an explicit 2D toy vector. It is unrelated to E5 384D.', active: ['router'], concept: 'toy simulation rule' },
    { event: { type: 'fanout' }, title: 'Fan out / collect candidates', detail: 'Exact 2D cosine here replaces production ANN. Global latest-sequence/tombstone and namespace masks run before local candidates: old a and deleted b cannot win Top-K.', active: ['memtable', 'executor', 'candidates', 'cache'], concept: 'toy simulation rule' },
    { event: { type: 'merge' }, title: 'Merge candidates', detail: 'Merge actual toy candidate lists, descending cosine; equal scores tie-break by record ID.', active: ['merge'], concept: 'toy simulation rule' },
    { event: { type: 'top' }, title: 'Return toy Top-2', detail: 'c = 1/√2, a = 0. Deleted b and namespace other are excluded. These are calculated toy scores, not Pinecone scores.', active: ['top'], concept: 'toy simulation rule' },
  ]
  return [
    { event: { type: 'plan', ids: ['L0-1', 'L0-2'], output: 'L1-1', level: 1 }, title: 'Select first two L0 slabs', detail: 'Partial compaction: select immutable inputs. Fresh memtable updates and other L0 files remain visible.', active: ['l0', 'compactor'], concept: 'toy simulation rule' },
    { event: { type: 'publish' }, title: 'Publish L1-1 atomically', detail: 'Create a new slab and retire only selected inputs. Tombstone in L0-3 still masks old b; memtable c remains newest.', active: ['l1', 'storage'], concept: 'toy simulation rule' },
    { event: { type: 'plan', ids: ['L0-3', 'L0-4'], output: 'L1-2', level: 1 }, title: 'Select remaining L0 slabs', detail: 'Keep the delete marker while consolidating; never mutate old slab records.', active: ['l0', 'compactor'], concept: 'toy simulation rule' },
    { event: { type: 'publish' }, title: 'Publish L1-2', detail: 'The delete marker is retained in the new immutable slab, not garbage-collected early.', active: ['l1', 'storage'], concept: 'toy simulation rule' },
    { event: { type: 'plan', ids: ['L1-1', 'L1-2'], output: 'L2-1', level: 2 }, title: 'Consolidate L1 → L2', detail: 'Two inputs here are a toy preset, not a production threshold or scheduler.', active: ['l1', 'compactor'], concept: 'toy simulation rule' },
    { event: { type: 'publish' }, title: 'Publish L2-1 / preserve latest data', detail: 'Live records before and after are identical. Tombstones stay; retired file snapshots remain inspectable. No real object-storage deletion happens.', active: ['l2', 'storage'], concept: 'toy simulation rule' },
  ]
}
export function snapshot(state: SimulatorState): SimulationSnapshot {
  const steps = program(state.mode, state.seed)
  if (!Number.isInteger(state.cursor) || state.cursor < 0 || state.cursor > steps.length) throw new Error('Invalid seek')
  return steps.slice(0, state.cursor).reduce((s, step) => transition(s, step.event), baseline(state.mode, state.seed))
}
export function initialSimulator(mode: Mode = 'write', seed = 7): SimulatorState {
  program(mode, seed)
  return { mode, seed, cursor: 0, playing: false, speed: 1 }
}
export function simulatorReducer(state: SimulatorState, event: Control): SimulatorState {
  const max = program(state.mode, state.seed).length
  switch (event.type) {
    case 'next': return { ...state, cursor: Math.min(max, state.cursor + 1), playing: state.playing && state.cursor + 1 < max }
    case 'back': return { ...state, cursor: Math.max(0, state.cursor - 1), playing: false }
    case 'play': return { ...state, playing: state.cursor < max }
    case 'pause': return { ...state, playing: false }
    case 'reset': return { ...state, cursor: 0, playing: false }
    case 'replay': return { ...state, cursor: 0, playing: true }
    case 'mode': return { ...initialSimulator(event.mode, state.seed), speed: state.speed }
    case 'seek': if (!Number.isInteger(event.cursor) || event.cursor < 0 || event.cursor > max) throw new Error('Invalid seek'); return { ...state, cursor: event.cursor, playing: false }
    case 'speed': if (![0.5, 1, 2].includes(event.speed)) throw new Error('Invalid speed'); return { ...state, speed: event.speed }
    default: throw new Error('Unknown control')
  }
}
