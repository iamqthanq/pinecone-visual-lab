import { act, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ArchitectureLab from './ArchitectureLab'
import { SIMULATION_LABEL, initialSimulator, program, snapshot } from './simulator'
import { diagram, components } from './simulator-graph'

const mocks = vi.hoisted(() => ({ created: vi.fn(), revert: vi.fn(), tween: vi.fn() }))
vi.mock('gsap', () => ({ gsap: { context: (action: () => void) => { mocks.created(); action(); return { revert: mocks.revert } }, timeline: () => ({ fromTo: mocks.tween }) } }))
vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ nodes, children }: { nodes: { id: string; data: { label: string; active: boolean } }[]; children: React.ReactNode }) => <div aria-label="Test diagram mapping">{nodes.map(n => <div key={n.id} className={n.data.active ? 'sim-active' : ''}><span className="sim-node-content">{n.data.label}</span></div>)}{children}</div>,
  Controls: () => null, Background: () => null, Handle: () => null, Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' }, MarkerType: { ArrowClosed: 'arrowclosed' },
}))
beforeEach(() => {
  mocks.created.mockClear(); mocks.revert.mockClear(); mocks.tween.mockClear()
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('Architecture simulator rendering/controller (real diagram is separately browser-tested)', () => {
  it('maps all conceptual nodes and edges, banner and accessible linear steps', () => {
    const s = initialSimulator('read')
    const graph = diagram(snapshot(s), program('read', 7)[0])
    expect(graph.nodes).toHaveLength(components.length)
    expect(graph.edges.some(e => e.source === 'wal' && e.target === 'memtable')).toBe(true)
    expect(graph.nodes.find(n => n.id === 'router')?.data.active).toBe(true)
    render(<ArchitectureLab />)
    expect(screen.getByText(SIMULATION_LABEL)).toBeVisible()
    expect(screen.getByRole('region', { name: 'Linear simulation event log' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
    expect(screen.getByRole('link', { name: /Pinecone: Write Path/ })).toHaveAttribute('href', 'https://www.pinecone.io/learn/slab-architecture/')
  })
  it('next/back/seek/reset and mode are reducer-driven; speed cannot alter snapshot', () => {
    render(<ArchitectureLab />)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { name: 'Log a-7' })).toBeVisible()
    const before = screen.getByTestId('simulation-snapshot').textContent
    fireEvent.change(screen.getByLabelText('Speed'), { target: { value: '2' } })
    expect(screen.getByTestId('simulation-snapshot').textContent).toBe(before)
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('heading', { name: 'Ready to explore' })).toBeVisible()
    fireEvent.change(screen.getByLabelText('Walkthrough'), { target: { value: 'read' } })
    fireEvent.change(screen.getByLabelText('Seek simulation step'), { target: { value: '4' } })
    expect(screen.getByRole('region', { name: 'Toy query results' })).toHaveTextContent('c-7: 0.707107')
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.getByLabelText('Seek simulation step')).toHaveValue('0')
  })
  it('finite play/pause/replay, StrictMode and unmount cancel all owned timers/timelines', () => {
    vi.useFakeTimers()
    const { unmount } = render(<StrictMode><ArchitectureLab initial={initialSimulator('read')} /></StrictMode>)
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByLabelText('Seek simulation step')).toHaveValue('1')
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.getByLabelText('Seek simulation step')).toHaveValue('1')
    fireEvent.click(screen.getByRole('button', { name: 'Replay' }))
    expect(screen.getByLabelText('Seek simulation step')).toHaveValue('0')
    expect(mocks.revert).toHaveBeenCalled()
    unmount()
    expect(vi.getTimerCount()).toBe(0)
    // D08 skips idle/zero-step motion; every created context must still be reverted.
    expect(mocks.created.mock.calls.length).toBeGreaterThan(0)
    expect(mocks.revert).toHaveBeenCalledTimes(mocks.created.mock.calls.length)
  })
  it('reduced motion removes animation but keeps steps; hidden tabs pause', () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    render(<ArchitectureLab initial={initialSimulator('read')} />)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText(/REDUCED MOTION/)).toBeVisible()
    expect(mocks.tween).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    fireEvent(document, new Event('visibilitychange'))
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled()
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
  })
})
