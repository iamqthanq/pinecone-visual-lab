import { MarkerType } from '@xyflow/react'
import type { Mode, SimulationSnapshot, TraceStep } from './simulator'

export const components = [
  ['wal', 'Request log / WAL', 0, 0], ['memtable', 'Memtable', 270, 0], ['l0', 'Immutable L0 slabs', 540, 0],
  ['storage', 'Object storage', 1080, 0], ['router', 'Query router', 0, 200], ['executor', 'Slab executors', 270, 200],
  ['candidates', 'Candidate results', 540, 200], ['merge', 'Candidate merge', 810, 200],
  ['top', 'Toy Top-K', 1080, 200], ['compactor', 'Background compaction', 540, 400],
  ['l1', 'Immutable L1 slabs', 810, 400], ['l2', 'Immutable L2 slabs', 1080, 400],
  ['cache', 'Executor SSD/RAM cache · conceptual', 270, 400],
] as const
const connections = [['wal', 'memtable'], ['memtable', 'l0'], ['l0', 'storage'], ['router', 'memtable'], ['router', 'executor'], ['storage', 'executor'], ['executor', 'candidates'], ['memtable', 'candidates'], ['candidates', 'merge'], ['merge', 'top'], ['l0', 'compactor'], ['compactor', 'l1'], ['l1', 'l2'], ['l2', 'storage'], ['cache', 'executor']]
const paths: Record<Mode, string[]> = {
  write: ['wal-memtable', 'memtable-l0', 'l0-storage'],
  read: ['router-memtable', 'router-executor', 'storage-executor', 'executor-candidates', 'memtable-candidates', 'candidates-merge', 'merge-top', 'cache-executor'],
  compaction: ['l0-compactor', 'compactor-l1', 'l1-l2', 'l2-storage'],
}
export function diagram(s: SimulationSnapshot, step?: TraceStep, mode: Mode = 'write') {
  const relevant = new Set(paths[mode].flatMap(id => id.split('-')))
  return {
    nodes: components.map(([id, label, x, y]) => ({ id, type: 'simulation' as const, position: { x, y }, data: { label, active: step?.active.includes(id) ?? false, relevant: relevant.has(id) }, ariaLabel: `${label}, ${step?.active.includes(id) ? 'active simulation stage' : 'conceptual component'}` })),
    edges: connections.map(([source, target]) => ({ id: `${source}-${target}`, source, target, type: 'smoothstep', hidden: !paths[mode].includes(`${source}-${target}`), animated: false,
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: '#85c9c7' },
      style: { stroke: step?.active.includes(source) || step?.active.includes(target) ? '#7ce7cb' : '#6b91ad', strokeWidth: 2 } })),
    counts: { wal: s.wal.length, memtable: s.memtable.length, activeSlabs: s.slabs.filter(slab => !s.retired.includes(slab.id)).length },
  }
}
