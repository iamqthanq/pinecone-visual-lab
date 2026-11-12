import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RagChat from './RagChat'
import SearchLab from './SearchLab'

const text = 'Nguồn tiếng Việt về tìm kiếm ngữ nghĩa. <img src=x onerror=alert(1)>'
const hit = { id: 'pvl-one', rank: 1, score: 0.9, document_id: 'd1', version_id: 'v1', chunk_id: 'c1', source_name: 'Nguồn.txt', page_start: 1, page_end: 1, text, snippet: text, source_url: '/documents?document=d1&version=v1&chunk=c1&page=1', metadata: {} }
const result = {
  status: 'answered', answer: `${text} [S1]`, no_answer_reason: null,
  used_sources: [{ source_id: 'S1', hit, text, truncated: false, cited: true }], retrieval_hits: [hit], assembled_context: JSON.stringify({ text }),
  context_budget: { max_prompt_bytes: 3072, prompt_bytes: 1600, num_ctx: 4096, reply_token_reserve: 512, estimate_kind: 'Byte estimate; NOT exact LLM/E5 tokens', request_attempted: true, warnings: [] },
  llm_model: { requested_model: 'qwen2.5:1.5b', actual_model: 'qwen2.5:1.5b', mode: 'mock-ollama-not-real-llm', usage: {} },
  search: { embedding: { mode: 'test-fixture-not-e5', prefix: 'query: ' }, trace: { stages: [{ name: 'query_embedding', ms: 0.1 }], warnings: [] } },
  trace: { total_ms: 5, stages: [{ name: 'd05_retrieval', ms: 2 }, { name: 'ollama_request', ms: 1 }], warnings: [], scope: 'Measured server work' }, grounding_policy: 'Verified verbatim excerpts, not independently verified truth or relevance.',
}
let fetchMock: ReturnType<typeof vi.fn>
let state = 'answered'
let fail = false
let pending = false
beforeEach(() => {
  state = 'answered'; fail = false; pending = false
  fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith('/api/search/status')) return Response.json({ model: { mode: 'test-fixture-not-e5', state: 'loaded', message: 'NOT E5' }, local_indexes: [{ name: 'local-e5', compatible: true }], live_enabled: false, live_key_configured: false })
    if (url.endsWith('/api/documents')) return Response.json({ documents: [{ id: 'd1', name: 'Nguồn.txt' }] })
    if (url.includes('/api/rag/status')) return Response.json({ mode: 'mock-ollama-not-real-llm', state: 'available', enabled: true, models: [{ name: 'qwen2.5:1.5b', size: 986000000, digest: 'a'.repeat(64) }], message: 'Downloaded does not mean loaded.' })
    if (url.endsWith('/api/rag/chat')) {
      if (pending) return new Promise<Response>((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))
      if (fail) return Response.json({ detail: 'Synthetic RAG error' }, { status: 503 })
      const off = JSON.parse(String(options?.body)).llm_enabled === false
      return Response.json({ ...result, status: off ? 'search_only' : state, answer: state === 'answered' && !off ? result.answer : null, used_sources: off ? [] : result.used_sources, no_answer_reason: off ? 'LLM is off; retrieval preserved.' : 'Insufficient context or invalid citations.' })
    }
    return Response.json({})
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())
async function mount() {
  render(<MemoryRouter><RagChat /></MemoryRouter>)
  await waitFor(() => expect(screen.getByLabelText('RAG index')).toHaveValue('local-e5'))
  fireEvent.change(screen.getByLabelText('RAG question in Vietnamese'), { target: { value: 'Tìm kiếm vector là gì?' } })
}
async function send() { fireEvent.click(screen.getByRole('button', { name: 'Send RAG question' })); await screen.findByRole('region', { name: 'Evidence answer' }) }

describe('D06 RAG Chat', () => {
  it('uses explicit actions only; validates tabs and preserves Semantic Search state', async () => {
    render(<MemoryRouter><SearchLab /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('Question in Vietnamese or another language'), { target: { value: 'keep query' } })
    fireEvent.click(screen.getByRole('tab', { name: 'RAG Chat' }))
    await waitFor(() => expect(screen.getByLabelText('RAG index')).toHaveValue('local-e5'))
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/api/rag'))).toBe(false)
    fireEvent.keyDown(screen.getByRole('tab', { name: 'RAG Chat' }), { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: 'Semantic Search' })).toHaveFocus()
    expect(screen.getByLabelText('Question in Vietnamese or another language')).toHaveValue('keep query')
  })
  it('renders verified sources, plaintext/XSS-safe answer, separate retrieval and measured traces', async () => {
    await mount(); await send()
    expect(screen.getByText(`${text} [S1]`)).toBeInTheDocument()
    expect(document.querySelector('.rag-answer img')).toBeNull()
    expect(screen.getByRole('link', { name: /\[S1\]/ })).toHaveAttribute('href', hit.source_url)
    expect(screen.getByRole('region', { name: 'RAG Trace' })).toHaveTextContent('5.00 ms total')
    expect(screen.getByText(/Retrieved hits · 1/)).toBeInTheDocument()
    expect(screen.getByText(/NOT REAL LLM/)).toBeInTheDocument()
    const body = JSON.parse(fetchMock.mock.calls.find(([url]) => url.endsWith('/api/rag/chat'))![1].body)
    expect(body.query).toBe('Tìm kiếm vector là gì?'); expect(body.history).toBeUndefined(); expect(body.compare).toBe(false)
  })
  it('keeps history bounded, resets on namespace/filter/model changes and clears explicitly', async () => {
    await mount()
    for (let i = 0; i < 6; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Send RAG question' }))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Send RAG question' })).toBeEnabled())
    }
    expect(screen.getAllByRole('article', { name: 'RAG response' })).toHaveLength(4)
    fireEvent.change(screen.getByLabelText('RAG namespace'), { target: { value: 'other' } })
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    await send(); fireEvent.click(screen.getByRole('button', { name: 'Clear conversation' }))
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/api/rag/chat'))).toHaveLength(7)
  })
  it('LLM-off keeps real retrieval; no invented answer or context sources', async () => {
    await mount(); fireEvent.click(screen.getByLabelText('LLM enabled')); await send()
    expect(screen.getByText('LLM is off; retrieval preserved.')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Context sources' })).toHaveTextContent('No sources were sent')
    expect(screen.queryByRole('link', { name: /\[S1\]/ })).not.toBeInTheDocument()
  })
  it.each(['insufficient_context', 'invalid_citations', 'stale_sources', 'llm_unavailable', 'timeout'])('shows honest %s without an answer', async status => {
    state = status; await mount(); await send()
    expect(screen.getByRole('region', { name: 'Evidence answer' })).toHaveTextContent(status.replace(/_/g, ' ').toUpperCase())
    expect(document.querySelector('.rag-answer')).toBeNull()
  })
  it('validates filters, blocks automatic LIVE access, checks readiness only on click', async () => {
    await mount()
    fireEvent.change(screen.getByLabelText('RAG page from'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('RAG page to'), { target: { value: '2' } })
    expect(screen.getByRole('button', { name: 'Send RAG question' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('RAG retrieval mode'), { target: { value: 'live' } })
    expect(screen.getByRole('button', { name: 'Load RAG LIVE indexes' })).toBeDisabled()
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/api/rag'))).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh Ollama readiness' }))
    expect(await screen.findByText('Downloaded does not mean loaded.')).toBeInTheDocument()
  })
  it('cancels a request without appending fake success and recovers from errors', async () => {
    await mount(); pending = true
    fireEvent.click(screen.getByRole('button', { name: 'Send RAG question' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel RAG' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('RAG cancelled')
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    pending = false; fail = true
    fireEvent.click(screen.getByRole('button', { name: 'Send RAG question' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Synthetic RAG error'))
    expect(within(screen.getByRole('region', { name: 'Ollama readiness' })).getByRole('button')).toBeEnabled()
  })
})
