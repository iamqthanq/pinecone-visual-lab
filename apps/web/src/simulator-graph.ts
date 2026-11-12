import type { SimulationSnapshot, TraceStep } from './simulator'

export const components = [
  ['wal', 'Request log / WAL', 0, 0], ['memtable', 'Memtable', 300, 0], ['l0', 'Immutable L0 slabs', 600, 0],
  ['storage', 'Object storage', 900, 0], ['router', 'Query router', 0, 160], ['executor', 'Slab executors', 300, 160],
  ['candidates', 'Candidate results', 600, 160], ['merge', 'Candidate merge', 900, 160],
  ['top', 'Toy Top-K', 900, 320], ['compactor', 'Background compaction', 0, 320],
  ['l1', 'Immutable L1 slabs', 300, 320], ['l2', 'Immutable L2 slabs', 600, 320],
  ['cache', 'Executor SSD/RAM cache · conceptual', 300, 480],
] as const
const connections = [['wal', 'memtable'], ['memtable', 'l0'], ['l0', 'storage'], ['router', 'memtable'], ['router', 'executor'], ['storage', 'executor'], ['executor', 'candidates'], ['memtable', 'candidates'], ['candidates', 'merge'], ['merge', 'top'], ['l0', 'compactor'], ['compactor', 'l1'], ['l1', 'l2'], ['l2', 'storage'], ['cache', 'executor']]
export function diagram(s: SimulationSnapshot, step?: TraceStep) {
  return {
    nodes: components.map(([id, label, x, y]) => ({ id, type: 'simulation', position: { x, y }, data: { label, active: step?.active.includes(id) ?? false }, ariaLabel: `${label}, ${step?.active.includes(id) ? 'active simulation stage' : 'conceptual component'}` })),
    edges: connections.map(([source, target]) => ({ id: `${source}-${target}`, source, target, animated: false, style: { stroke: step?.active.includes(source) || step?.active.includes(target) ? '#7ce7cb' : '#53667f', strokeWidth: 2 } })),
    counts: { wal: s.wal.length, memtable: s.memtable.length, activeSlabs: s.slabs.filter(slab => !s.retired.includes(slab.id)).length },
  }
}
