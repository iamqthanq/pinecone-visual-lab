import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SearchLab from './SearchLab'

const target = { mode: 'local', index: 'local-e5', namespace: '' }
const sourceURL = '/documents?document=11111111-1111-4111-8111-111111111111&version=22222222-2222-4222-8222-222222222222&chunk=33333333-3333-4333-8333-333333333333&page=2'
const hit = { id: 'pvl-one', rank: 1, score: 0.912345, document_id: 'doc-1', version_id: 'v-1', chunk_id: 'chunk-1', source_name: 'Tiếng Việt.pdf', page_start: 2, page_end: 3, text: 'Nội dung nguồn confirmed thật.', snippet: 'Nội dung nguồn confirmed thật.', source_url: sourceURL, metadata: {} }
const response = { target, top_k: 5, filters: {}, retrieval_mode: 'LOCAL EXACT COSINE', data_origin: 'SQLite local_vectors + confirmed chunks', embedding: { mode: 'test-fixture-not-e5', model_id: 'NOT E5', model_revision: 'fixture-v1', prefix: 'query: ', input_token_count: 25, inference_ms: 0.2 }, score_meaning: 'Raw cosine similarity [-1,+1], not probability or percentage', hits: [hit], comparison: null, empty_reason: null, trace: { total_ms: 5.2, stages: [{ name: 'source_lookup', ms: 0.42, status: 'measured' }], scope: 'Server handler', candidate_count: 1, manifest_count: 1, discarded_count: 0, warnings: [], candidate_count_kind: 'exact stored eligible count' } }
let fetchMock: ReturnType<typeof vi.fn>
let empty = false
let fail = false
let unavailable = false
beforeEach(() => {
  empty = false; fail = false; unavailable = false
  fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith('/api/documents')) return Response.json({ documents: [{ id: 'doc-1', name: 'Tiếng Việt.pdf' }] })
    if (url.endsWith('/status')) return Response.json({ model: { state: unavailable ? 'not_cached' : 'loaded', mode: 'test-fixture-not-e5', message: unavailable ? 'Run opt-in model setup.' : 'NOT E5' }, local_indexes: [{ name: 'local-e5', compatible: true }], live_enabled: false, live_key_configured: false, max_candidates: 2000 })
    if (url.endsWith('/api/search')) {
      if (fail) return Response.json({ detail: 'Synthetic search failure; no data changed.' }, { status: 503 })
      const input = JSON.parse(String(options?.body))
      return Response.json({ ...response, hits: empty ? [] : response.hits, comparison: input.compare ? [hit] : null })
    }
    return Response.json({ namespaces: [] })
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())
function mount() { render(<MemoryRouter><SearchLab /></MemoryRouter>) }
async function ready() {
  mount()
  await waitFor(() => expect(screen.getByLabelText('Search index')).toHaveValue('local-e5'))
  fireEvent.change(screen.getByLabelText('Question in Vietnamese or another language'), { target: { value: 'Tìm kiếm vector là gì?' } })
}

describe('D05 Search Lab', () => {
  it('sends explicit query/filter/top-k, shows real source, raw score, deep link and trace', async () => {
    await ready()
    fireEvent.change(screen.getByLabelText('Top-K'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Filter document'), { target: { value: 'doc-1' } })
    fireEvent.change(screen.getByLabelText('Page from'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Page to'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByLabelText('Rank 1 cosine')).toHaveTextContent('+0.912345')
    expect(screen.getByRole('link', { name: 'Open exact source' })).toHaveAttribute('href', sourceURL)
    expect(screen.getByRole('region', { name: 'Search Trace' })).toHaveTextContent('0.42 ms')
    expect(screen.getByRole('region', { name: 'Filtered results' })).toHaveTextContent('Nội dung nguồn confirmed thật.')
    const call = fetchMock.mock.calls.find(([url]) => url.endsWith('/api/search'))!
    expect(JSON.parse(String(call[1].body))).toMatchObject({ query: 'Tìm kiếm vector là gì?', top_k: 1, filters: { document_id: 'doc-1', page_from: 2, page_to: 3 } })
  })
  it('validates page ranges before search and Reset clears query/filters/results', async () => {
    await ready()
    fireEvent.change(screen.getByLabelText('Page from'), { target: { value: '3' } })
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid filter')
    fireEvent.click(screen.getByRole('button', { name: 'Reset query & filters' }))
    expect(screen.getByLabelText('Page from')).toHaveValue(null)
    expect(screen.getByLabelText('Question in Vietnamese or another language')).toHaveValue('')
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/api/search'))).toBe(false)
  })
  it('runs comparison only on request and clears stale results after namespace change', async () => {
    await ready()
    fireEvent.click(screen.getByLabelText('Compare with / without filters (same query embedding)'))
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByRole('region', { name: 'Without filters' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Filtered results' })).getByLabelText('Rank 1 cosine')).toHaveTextContent('+0.912345')
    fireEvent.change(screen.getByLabelText('Search namespace'), { target: { value: 'other' } })
    expect(screen.queryByRole('region', { name: 'Filtered results' })).not.toBeInTheDocument()
  })
  it('shows an empty result without invented text or scores', async () => {
    await ready(); empty = true
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByText('No matching chunks.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Rank 1 cosine')).not.toBeInTheDocument()
  })
  it('shows errors and model unavailable instead of a successful answer', async () => {
    await ready(); fail = true
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic search failure')
    unavailable = true
    fireEvent.click(screen.getByRole('button', { name: 'Refresh search status' }))
    expect(await screen.findByText('Run opt-in model setup.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
  })
  it('does not auto-discover or query LIVE on mode change', async () => {
    await ready()
    fireEvent.change(screen.getByLabelText('Retrieval mode'), { target: { value: 'live' } })
    expect(screen.getByText(/LIVE NOT VERIFIED/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load search indexes' })).toBeDisabled()
    expect(fetchMock.mock.calls.some(([, options]) => String(options?.body).includes('"mode":"live"'))).toBe(false)
  })
  it('reports network failure and keeps search disabled', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline')); mount()
    expect(await screen.findByRole('alert')).toHaveTextContent('Search API offline')
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
  })
})
