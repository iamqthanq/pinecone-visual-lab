import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VectorStoreLab, { StoredVectorInspector } from './VectorStoreLab'

const target = { mode: 'local', index: 'local-e5', namespace: '' }
const manifest = { id: 'job-1', target, document_id: 'doc-1', version_id: 'version-1', signature: 'fixture',
  state: 'pending', count: 1, ids: ['pvl-one'], checkpoint: 0, verified: 0, retries: 0, error_code: null, preview_token: 'a'.repeat(64) }
const index = { name: 'local-e5', dimension: 384, metric: 'cosine', ready: true, compatible: true, cloud: 'local', region: 'this-device', data_origin: 'SQLite' }
let active = false
let deleted = false
let failStep = false
let fetchMock: ReturnType<typeof vi.fn>
function mount() { return render(<MemoryRouter><VectorStoreLab /></MemoryRouter>) }

beforeEach(() => {
  active = false; deleted = false; failStep = false
  fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    const body = options?.body ? JSON.parse(String(options.body)) : {}
    let value: unknown = {}
    if (url.endsWith('/status')) value = { embedding_mode: 'test-fixture-not-e5', live_key_configured: false, sdk_version: '10.3.0', api_version: '2026-07' }
    else if (url.endsWith('/indexes/list')) value = { indexes: body.mode === 'local' ? [index] : [] }
    else if (url.endsWith('/documents')) value = { documents: [{ id: 'doc-1', name: 'source.txt' }] }
    else if (url.endsWith('/documents/doc-1')) value = { id: 'doc-1', versions: [{ id: 'version-1', version: 1, state: 'confirmed', config: { size: 300, overlap: 50 } }] }
    else if (url.endsWith('/records/list')) value = { ids: active && !deleted ? ['pvl-one'] : [], next: null, data_origin: 'SQLite' }
    else if (url.endsWith('/records/fetch')) value = { target, data_origin: 'SQLite adapter fetch', mode_label: 'LOCAL DEMO', records: [{ id: 'pvl-one', values: [1, ...Array(383).fill(0)], metadata: { embedding_mode: 'test-fixture-not-e5', source_name: 'source.txt' } }] }
    else if (url.includes('/jobs?')) value = { jobs: active ? [{ ...manifest, state: deleted ? 'deleted' : 'active', checkpoint: 1, verified: 1 }] : [] }
    else if (url.endsWith('/namespaces')) value = { namespaces: [] }
    else if (url.endsWith('/ingest/preview') || url.endsWith('/jobs/job-1')) value = { ...manifest, state: deleted ? 'deleted' : active ? 'active' : 'pending' }
    else if (url.endsWith('/jobs/job-1/step')) {
      if (failStep) return Response.json({ detail: 'Synthetic timeout; resume safe.' }, { status: 504 })
      active = true; value = { ...manifest, state: 'active', checkpoint: 1, verified: 1 }
    } else if (url.endsWith('/delete-preview')) value = { id: 'delete-1', target, ids: ['pvl-one'], count: 1, checkpoint: 0, state: 'preview' }
    else if (url.endsWith('/deletions/delete-1/step')) { deleted = true; value = { id: 'delete-1', target, count: 1, checkpoint: 1, state: 'deleted' } }
    return Response.json(value)
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

async function preview() {
  mount()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Load namespace' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Load namespace' }))
  await screen.findByText('Loaded: LOCAL / local-e5 / (default)')
  fireEvent.change(screen.getByLabelText('Source document'), { target: { value: 'doc-1' } })
  await screen.findByRole('option', { name: 'Version 1 · 300/50' })
  fireEvent.change(screen.getByLabelText('Confirmed source version'), { target: { value: 'version-1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Preview ingest' }))
  await screen.findByText('PENDING', { exact: true })
}

describe('D04 Vector Explorer', () => {
  it('defaults to local and switching to LIVE alone never discovers cloud', async () => {
    mount()
    await screen.findByText('TEST FIXTURE — NOT E5. This runtime cannot upload fixture vectors to LIVE.')
    fireEvent.change(screen.getByLabelText('Storage mode'), { target: { value: 'live' } })
    expect(screen.getByText(/LIVE NOT VERIFIED/)).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([, options]) => String(options?.body).includes('"mode":"live"'))).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Connect / list LIVE indexes' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([, options]) => String(options?.body).includes('"confirm_live_read":true'))).toBe(true))
  })
  it('requires exact confirmation, ingests, fetches from adapter and deletes only owned IDs', async () => {
    await preview()
    const ingest = screen.getByRole('button', { name: 'Confirm / resume ingest' })
    expect(ingest).toBeDisabled()
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/job-1/step'))).toBe(false)
    fireEvent.click(screen.getByLabelText(/I confirm this exact target/))
    fireEvent.click(ingest)
    await screen.findByText('All records fetched and verified. Manifest ACTIVE.')
    fireEvent.click(screen.getByRole('button', { name: 'Fetch vector pvl-one' }))
    await screen.findByRole('heading', { name: 'Fetched vector' })
    expect(screen.getByRole('group', { name: 'Stored vector 384 dimensions' }).children).toHaveLength(384)
    fireEvent.click(within(screen.getByRole('group', { name: 'Stored vector view' })).getByRole('button', { name: 'Table' }))
    expect(within(screen.getByRole('region', { name: 'Stored vector numeric values' })).getAllByRole('row')).toHaveLength(385)
    fireEvent.click(screen.getByRole('button', { name: 'Preview owned-vector deletion' }))
    await screen.findByRole('heading', { name: 'Delete preview · exact owned vectors' })
    expect(screen.getByRole('button', { name: 'Confirm exact deletion' })).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Delete only these exact owned IDs in the displayed target.'))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm exact deletion' }))
    await screen.findByText('Owned vectors deleted and absence verified. Source documents preserved.')
    expect(screen.queryByRole('button', { name: 'Fetch vector pvl-one' })).not.toBeInTheDocument()
  }, 15000)
  it('clears stale fetched state on a namespace change', async () => {
    active = true; mount()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Load namespace' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Load namespace' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Fetch vector pvl-one' }))
    await screen.findByRole('heading', { name: 'Fetched vector' })
    fireEvent.change(screen.getByLabelText('Namespace'), { target: { value: 'other' } })
    expect(screen.queryByRole('heading', { name: 'Fetched vector' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh records' })).toBeDisabled()
  })
  it('retains the manifest after an ingest failure for safe resume', async () => {
    await preview(); failStep = true
    fireEvent.click(screen.getByLabelText(/I confirm this exact target/))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm / resume ingest' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic timeout; resume safe.')
    expect(screen.getByRole('button', { name: 'Refresh manifest' })).toBeEnabled()
  })
  it('reports backend offline without inventing records', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline')); mount()
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the vector API')
    expect(screen.getByRole('button', { name: 'Load namespace' })).toBeDisabled()
  })
  it('shows missing adapter results as missing, not an embedding-cache fallback', () => {
    render(<MemoryRouter><StoredVectorInspector fetched={{ target: { mode: 'local', index: 'local-e5', namespace: '' }, mode_label: 'LOCAL DEMO', data_origin: 'SQLite adapter fetch', records: [] }} onNotice={() => {}} /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Vector not found' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Stored vector 384 dimensions' })).not.toBeInTheDocument()
  })
})
