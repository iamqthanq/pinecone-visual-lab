import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GuidedProvider } from './GuidedContext'
import { useGuided } from './guided-context'
import GuidedPanel from './GuidedPanel'
import { GUIDE_KEY, newGuide } from './guided-state'
import type { GuidedSession } from './guided-api'

const id = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
function session(sid = id): GuidedSession {
  return { id: sid, created_at: '', target: { mode: 'local', index: 'local-e5', namespace: `pvl-demo-${sid.replaceAll('-', '')}` }, document_id: null, draft_id: null, version_id: null, chunk_id: null, job_id: null, completed: { upload: false, extract: false, chunks: false, embedding: false, upsert: false, search: false, rag: false }, source_error: null, embedding_mode: 'test-fixture-not-e5', rag_outcome: null, provenance: 'Project authored CC0', reset_policy: 'Metadata only' }
}
function Harness() {
  const guide = useGuided()!
  const location = useLocation()
  return <><button onClick={() => void guide.start()}>Start test guide</button><output data-testid="route">{location.pathname}</output><GuidedPanel /></>
}
function mount() { return render(<MemoryRouter><GuidedProvider><Harness /></GuidedProvider></MemoryRouter>) }
let fetchMock: ReturnType<typeof vi.fn>
let current: GuidedSession
beforeEach(() => {
  sessionStorage.clear(); current = session()
  fetchMock = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST' && !String(_url).endsWith('/actions')) return Response.json(current, { status: 201 })
    if (options?.method === 'POST') {
      const body = JSON.parse(String(options.body))
      if (body.action === 'upload') current = { ...current, document_id: other, completed: { ...current.completed, upload: true } }
      if (body.action === 'reset') current = session()
      return Response.json({ session: current, result: null })
    }
    return Response.json(current)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { sessionStorage.clear(); vi.unstubAllGlobals() })

describe('opt-in cross-route guide with backend-authoritative completion', () => {
  it('has no guide/backend traffic when off; route visits cannot complete steps', async () => {
    mount(); expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Start test guide' }))
    expect(await screen.findByRole('region', { name: 'Guided Demo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next guided step' })).toBeDisabled()
    const steps = within(screen.getByRole('navigation', { name: 'Guided Demo steps' })).getAllByRole('button')
    fireEvent.click(steps[3])
    expect(screen.getByTestId('route')).toHaveTextContent('/vectors')
    expect(screen.getByRole('button', { name: 'Next guided step' })).toBeDisabled()
    expect(fetchMock.mock.calls.some(([, options]) => String(options?.body).includes('embedding'))).toBe(false)
    expect(sessionStorage.getItem(GUIDE_KEY)).toContain('"step":3')
  })
  it('restores step/reduced simulation state but discards forged completion; explicit real receipt enables Next', async () => {
    const memory = { ...newGuide(id), completed: { embedding: true } }
    sessionStorage.setItem(GUIDE_KEY, JSON.stringify(memory))
    mount()
    await screen.findByRole('button', { name: 'Upload / verify project sample' })
    expect(screen.getByRole('button', { name: 'Next guided step' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Upload / verify project sample' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next guided step' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Next guided step' }))
    expect(sessionStorage.getItem(GUIDE_KEY)).toContain('"step":1')
    expect(sessionStorage.getItem(GUIDE_KEY)).not.toContain('completed')
  })
  it('reset sends metadata-only action; cancel removes UI storage and never DELETEs any data', async () => {
    sessionStorage.setItem(GUIDE_KEY, JSON.stringify({ ...newGuide(id), step: 7, modes: ['write'] }))
    mount()
    await screen.findByText('Slab simulation', { selector: 'h2' })
    fireEvent.click(screen.getByRole('button', { name: 'Reset tour / simulation only' }))
    await screen.findByRole('button', { name: 'Upload / verify project sample' })
    expect(sessionStorage.getItem(GUIDE_KEY)).toContain('"modes":[]')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Guided Demo' }))
    expect(screen.queryByRole('region', { name: 'Guided Demo' })).not.toBeInTheDocument()
    expect(sessionStorage.getItem(GUIDE_KEY)).toBeNull()
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false)
  })
  it('ignores late action results after cancellation rather than resurrecting a prior session', async () => {
    sessionStorage.setItem(GUIDE_KEY, JSON.stringify(newGuide(id)))
    let finish: (value: Response) => void = () => {}
    fetchMock.mockImplementation(async (_url: string) => {
      if (String(_url).endsWith('/actions')) return new Promise<Response>(resolve => { finish = resolve })
      return Response.json(current)
    })
    mount(); await screen.findByRole('button', { name: 'Upload / verify project sample' })
    fireEvent.click(screen.getByRole('button', { name: 'Upload / verify project sample' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Guided Demo' }))
    await act(async () => { finish(Response.json({ session: { ...current, completed: { ...current.completed, upload: true } }, result: null })); await Promise.resolve() })
    expect(screen.queryByRole('region', { name: 'Guided Demo' })).not.toBeInTheDocument()
    expect(sessionStorage.getItem(GUIDE_KEY)).toBeNull()
  })
  it('shows backend offline without inventing progress; malformed storage starts inactive', async () => {
    sessionStorage.setItem(GUIDE_KEY, '{invalid')
    fetchMock.mockRejectedValue(new TypeError('Network down'))
    mount(); expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Start test guide' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Guided backend offline')
    expect(screen.queryByRole('region', { name: 'Guided Demo' })).not.toBeInTheDocument()
  })
})
