import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { getHealth } from './api'

const health = {
  status: 'ok', service: 'pinecone-visual-lab-api', version: '0.7.0', phase: 'D07', rag: 'optional_local', search: 'available', vector_store: 'local_available', documents: 'available',
  timestamp: new Date().toISOString(), pinecone: 'not_configured', embedding: 'not_loaded', embedding_mode: 'e5',
}

function mount(path = '/') {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>)
}

afterEach(() => vi.unstubAllGlobals())

describe('D01 foundation', () => {
  it('shows a pending state until the real API responds', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    mount()
    expect(screen.getByText('CHECKING')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Checking backend')
  })

  it('shows online only after a validated health response and keeps future modules explicit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(health)))
    mount()
    expect(await screen.findByText('ONLINE')).toBeInTheDocument()
    expect(screen.getByText('NOT CONFIGURED')).toBeInTheDocument()
    expect(screen.getByText('NOT LOADED')).toBeInTheDocument()
    expect(screen.getByText('Search and optional local RAG; LIVE awaits authorization.')).toBeInTheDocument()
  })

  it('shows disconnected help and can reconnect through the retry control', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Network error'))
      .mockImplementation(() => Promise.resolve(Response.json(health)))
    vi.stubGlobal('fetch', fetchMock)
    mount()
    expect(await screen.findByText('OFFLINE')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Check connection' }))
    expect(await screen.findByText('ONLINE')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('navigates to Documents, Vectors, Search and the implemented educational Architecture Lab', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => Promise.resolve(Response.json(
      url.includes('/documents') ? { documents: [], max_file_bytes: 10485760 }
        : url.includes('/api/search/status') ? { model: { state: 'not_cached', mode: 'e5', message: 'Explicit model setup required' }, local_indexes: [] }
        : url.includes('/tokenizer') ? { available: true, mode: 'e5' }
          : url.includes('/embeddings/status') ? { state: 'not_cached', mode: 'e5' } : health,
    ))))
    mount()
    fireEvent.click(screen.getByRole('link', { name: 'Documents Lab' }))
    expect(await screen.findByRole('heading', { name: 'Start with the source.' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Choose file' })).toBeEnabled()
    fireEvent.click(screen.getByRole('link', { name: 'Vectors Lab' }))
    expect(await screen.findByRole('heading', { name: 'Turn text into coordinates.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Search Lab' }))
    expect(await screen.findByRole('heading', { name: 'Find meaning. Follow the source.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Architecture Lab' }))
    // This route cold-loads React Flow/GSAP; wait for the actual heading, not a 1s import budget.
    expect(await screen.findByRole('heading', { name: 'Follow a write. Unpack a read.' }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByText('SIMULATION — EDUCATIONAL MODEL — NOT PINECONE TELEMETRY')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
  }, 10000)

  it('renders a meaningful unknown-route fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(health)))
    mount('/unknown')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Back to overview' })).toHaveAttribute('href', '/')
  })

  it('rejects successful HTTP responses from an unrelated or malformed server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(Response.json({ status: 'ok' }))))
    await expect(getHealth(new AbortController().signal)).rejects.toThrow('Unexpected health response')
  })

  it('handles HTTP errors rather than reporting the backend online', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 })))
    mount()
    expect(await screen.findByText('OFFLINE')).toBeInTheDocument()
  })
})
