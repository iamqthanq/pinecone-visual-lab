import { describe, expect, it } from 'vitest'
import { GUIDE_KEY, demoSelection, newGuide, readGuide } from './guided-state'
import { initialSimulator } from './simulator'

const id = '11111111-1111-4111-8111-111111111111'
describe('versioned bounded guide memory', () => {
  it('roundtrips only ID/progress/simulation, restores paused, never text/secret', () => {
    const state = { ...newGuide(id), step: 5, simulator: { ...initialSimulator('read'), cursor: 2, playing: true } }
    expect(readGuide(JSON.stringify(state))).toEqual({ ...state, simulator: { ...state.simulator, playing: false } })
    expect(GUIDE_KEY).toBe('pvl-guided-v1')
  })
  it.each([null, '', 'bad json', '{}', JSON.stringify({ schema: 99 }), JSON.stringify({ ...newGuide(id), step: 999 }), JSON.stringify({ ...newGuide(id), modes: ['write', 'write'] }), JSON.stringify({ ...newGuide(id), simulator: { ...initialSimulator(), cursor: 999 } }), 'x'.repeat(2049)])('rejects malformed/unbounded or old session %s', value => {
    expect(readGuide(value)).toBeNull()
  })
  it('URL source selection validates IDs and never introduces LIVE mode or arbitrary host', () => {
    expect(demoSelection('?demoDocument=bad&demoNamespace=../unsafe')).toEqual({ document: '', version: '', chunk: '', namespace: '' })
    expect(demoSelection(`?demoDocument=${id}&demoNamespace=pvl-demo-test&mode=live&host=evil`).document).toBe(id)
  })
})
