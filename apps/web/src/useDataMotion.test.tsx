import { useRef } from 'react'
import { StrictMode } from 'react'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MotionActive, useDataMotion } from './useDataMotion'

const records = vi.hoisted(() => ({ scopes: [] as { revert: ReturnType<typeof vi.fn> }[], tween: vi.fn(), targets: [] as HTMLElement[][] }))
vi.mock('gsap', () => ({ gsap: {
  context: (callback: () => void) => { const value = { revert: vi.fn() }; records.scopes.push(value); callback(); return value },
  timeline: () => ({ fromTo: (targets: HTMLElement[], ...args: unknown[]) => { records.targets.push(targets); records.tween(targets, ...args) } }),
} }))
let reduced = false
let change: (() => void) | undefined
const remove = vi.fn()
beforeEach(() => {
  records.scopes.length = 0; records.targets.length = 0; records.tween.mockClear(); remove.mockClear(); reduced = false; change = undefined
  vi.stubGlobal('matchMedia', vi.fn(() => ({ get matches() { return reduced }, addEventListener: (_event: string, callback: () => void) => { change = callback }, removeEventListener: remove })))
})
afterEach(() => vi.unstubAllGlobals())
function Demo({ token, active = true }: { token: string | null; active?: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  useDataMotion(root, token)
  return <MotionActive.Provider value={active}><div ref={root}>{Array.from({ length: 20 }, (_, i) => <p key={i} data-reveal>Actual record{i}</p>)}</div></MotionActive.Provider>
}
function Scoped({ token }: { token: string }) {
  const root = useRef<HTMLDivElement>(null); useDataMotion(root, token)
  return <div ref={root}><p data-reveal>Backend result</p></div>
}
const flush = async () => { await act(async () => { await import('gsap'); await Promise.resolve() }) }
it('does not load/run motion without data; finite entrance is scoped and caps targets at8', async () => {
  const view = render(<Demo token={null} />); await flush(); expect(records.tween).not.toHaveBeenCalled()
  view.rerender(<Demo token="actual-result" />); await flush()
  expect(records.targets[0]).toHaveLength(8)
  expect(records.tween.mock.calls[0][2]).toMatchObject({ duration: 0.24, clearProps: 'transform,opacity' })
  expect(records.tween.mock.calls[0][2]).not.toHaveProperty('onComplete')
  view.unmount(); expect(records.scopes.every(s => s.revert.mock.calls.length === 1)).toBe(true)
})
it('StrictMode, rapid result replacement and unmount leave every owned context reverted', async () => {
  const view = render(<StrictMode><Scoped token="one" /></StrictMode>); await flush()
  view.rerender(<StrictMode><Scoped token="two" /></StrictMode>); await flush()
  view.rerender(<StrictMode><Scoped token="three" /></StrictMode>); view.unmount(); await flush()
  expect(records.scopes.length).toBeGreaterThan(0)
  expect(records.scopes.every(s => s.revert.mock.calls.length === 1)).toBe(true)
  expect(remove).toHaveBeenCalled()
})
it('reduced motion keeps all actual content visible and creates no animation', async () => {
  reduced = true
  const view = render(<Scoped token="real-data" />); await flush()
  expect(view.getByText('Backend result')).toBeVisible(); expect(records.tween).not.toHaveBeenCalled()
})
it('preference changes and hidden tabs cancel owned animations without state callbacks', async () => {
  const view = render(<Scoped token="one" />); await flush()
  reduced = true; act(() => change?.()); expect(records.scopes[0].revert).toHaveBeenCalledOnce()
  view.unmount(); expect(records.scopes[0].revert).toHaveBeenCalledOnce()
  reduced = false
  const second = render(<Scoped token="two" />); await flush()
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(records.scopes.at(-1)?.revert).toHaveBeenCalledOnce(); second.unmount(); hidden.mockRestore()
})
it('a hidden semantic tab cancels motion while retaining its result DOM/state', async () => {
  const view = render(<MotionActive.Provider value={true}><Scoped token="retained" /></MotionActive.Provider>); await flush()
  view.rerender(<MotionActive.Provider value={false}><Scoped token="retained" /></MotionActive.Provider>); await flush()
  expect(records.scopes[0].revert).toHaveBeenCalledOnce()
  expect(records.scopes).toHaveLength(1); expect(view.getByText('Backend result')).toBeInTheDocument()
})
it('unmount before the deferred runtime arrives cannot create a detached-node timeline', async () => {
  const view = render(<Scoped token="one" />); view.unmount(); await flush()
  expect(records.tween).not.toHaveBeenCalled()
})
