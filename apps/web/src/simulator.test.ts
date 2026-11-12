import { describe, expect, it } from 'vitest'
import { initialSimulator, latest, program, simulatorReducer as reduce, snapshot, toyCosine, transition, visible } from './simulator'
import type { Mode, SimulatorState } from './simulator'

describe('pure educational state machine, independent of React/GSAP/clocks', () => {
  it.each(['write', 'read', 'compaction'] as Mode[])('%s: seeded replay, backward/forward and every seek equal the saved snapshots', mode => {
    let s = initialSimulator(mode, 42)
    const saved = [snapshot(s)]
    for (let i = 0; i < program(mode, s.seed).length; i++) { s = reduce(s, { type: 'next' }); saved.push(snapshot(s)) }
    for (let cursor = saved.length - 1; cursor >= 0; cursor--) expect(snapshot(reduce(s, { type: 'seek', cursor }))).toEqual(saved[cursor])
    expect(snapshot(reduce(reduce(s, { type: 'back' }), { type: 'next' }))).toEqual(saved.at(-1))
    expect(snapshot(reduce(s, { type: 'reset' }))).toEqual(saved[0])
    expect(snapshot(reduce(s, { type: 'replay' }))).toEqual(saved[0])
    expect(snapshot({ ...s, speed: 2, playing: true })).toEqual(snapshot({ ...s, speed: 0.5, playing: false }))
  })
  it('write acknowledgment follows WAL; immutable flushes do not mutate earlier snapshots', () => {
    let s = initialSimulator()
    const empty = snapshot(s)
    expect(() => transition(empty, { type: 'ack' })).toThrow()
    expect(() => transition(empty, { type: 'apply' })).toThrow()
    const images = []
    for (const step of program('write', 7)) {
      const before = snapshot(s)
      s = reduce(s, { type: 'next' }); const after = snapshot(s)
      expect(after.acknowledged.every(seq => after.wal.some(r => r.seq === seq))).toBe(true)
      expect(after.applied.every(seq => after.acknowledged.includes(seq))).toBe(true)
      for (const slab of before.slabs) expect(after.slabs.find(r => r.id === slab.id)).toEqual(slab)
      if (step.event.type === 'flush') images.push(after)
    }
    expect(empty.wal).toEqual([])
    expect(images[0].slabs[0].records.find(r => r.id === 'a-7')?.values).toEqual([1, 0])
    expect(visible(snapshot(s)).find(r => r.id === 'a-7')?.values).toEqual([0, 1])
    expect(visible(snapshot(s), 'other')).toHaveLength(1)
  })
  it('partial compaction and L2 preserve latest live records, tombstones and all old immutable files', () => {
    let s = initialSimulator('compaction')
    const initial = snapshot(s)
    // Independent oracle: fold applied WAL, including namespace and delete records.
    const expected = new Map<string, typeof initial.wal[number]>()
    for (const r of initial.wal.filter(r => initial.applied.includes(r.seq))) expected.set(`${r.namespace}/${r.id}`, r)
    const oracle = [...expected.values()].filter(r => r.namespace === 'lesson' && r.values !== null).sort((a, b) => a.id < b.id ? -1 : 1)
    for (let i = 0; i < program('compaction', 7).length; i++) {
      s = reduce(s, { type: 'next' }); const current = snapshot(s)
      expect(visible(current)).toEqual(oracle)
      for (const slab of initial.slabs) expect(current.slabs.find(r => r.id === slab.id)).toEqual(slab)
      expect(new Set(current.slabs.map(r => r.id)).size).toBe(current.slabs.length)
    }
    const final = snapshot(s)
    expect(final.slabs.filter(r => !final.retired.includes(r.id)).map(r => r.id)).toEqual(['L2-1'])
    expect(final.slabs.at(-1)?.records.find(r => r.id === 'b-7')?.values).toBeNull()
    expect(visible(final).map(r => r.id)).not.toContain('b-7')
    expect(visible(final).find(r => r.id === 'c-7')?.values).toEqual([0, -1])
    expect(() => transition(final, { type: 'publish' })).toThrow()
  })
  it('computed toy Top-K matches scalar arithmetic; old high-scoring versions/deletes/foreign namespaces excluded before ranking', () => {
    expect(toyCosine([1, 0], [1, 0])).toBe(1)
    expect(toyCosine([1, 0], [0, 1])).toBe(0)
    expect(toyCosine([1, 0], [-1, 0])).toBe(-1)
    const state: SimulatorState = { ...initialSimulator('read'), cursor: program('read', 7).length }
    const result = snapshot(state)
    expect(result.top.map(r => r.id)).toEqual(['c-7', 'a-7'])
    expect(result.top.map(r => r.score)).toEqual([1 / Math.sqrt(2), 0])
    expect(result.candidates.some(r => r.id === 'b-7' || r.id === 'foreign-7')).toBe(false)
    expect(result.candidates.find(r => r.id === 'a-7')?.seq).toBe(3)
  })
  it('latest key includes namespace; deterministic ties and invalid events cannot corrupt state', () => {
    expect(latest([{ id: 'a', namespace: 'x', seq: 1, values: [1, 0] }, { id: 'a', namespace: 'y', seq: 2, values: [0, 1] }])).toHaveLength(2)
    const s = initialSimulator('read'); const before = snapshot(s)
    expect(() => reduce(s, { type: 'seek', cursor: 1000 })).toThrow()
    expect(() => reduce(s, { type: 'speed', speed: 100 })).toThrow()
    expect(() => initialSimulator('write', NaN)).toThrow()
    expect(() => toyCosine([0, 0], [1, 0])).toThrow()
    expect(() => transition(before, { type: 'plan', ids: ['L0-1', 'L0-1'], output: 'bad', level: 1 })).toThrow()
    const tied = transition({ ...before, query: [1, 0], candidates: [{ id: 'b', seq: 1, score: 1, executor: 'x' }, { id: 'a', seq: 2, score: 1, executor: 'y' }] }, { type: 'merge' })
    expect(tied.merged.map(r => r.id)).toEqual(['a', 'b'])
    expect(snapshot(s)).toEqual(before)
  })
})
