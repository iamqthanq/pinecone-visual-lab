import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { getHealth } from './api'

const health = {
  status: 'ok', service: 'pinecone-visual-lab-api', version: '0.1.0', phase: 'D01',
  timestamp: new Date().toISOString(), pinecone: 'not_configured', embedding: 'not_loaded',
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
    expect(screen.getByText('Pipeline processing is not available in D01.')).toBeInTheDocument()
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

  it('navigates from the overview to a clearly planned Documents Lab', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(health)))
    mount()
    fireEvent.click(screen.getByRole('link', { name: 'Documents Lab' }))
    expect(await screen.findByRole('heading', { name: 'Documents Lab' })).toBeInTheDocument()
    expect(screen.getByText(/No processing is available/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /upload/i })).not.toBeInTheDocument()
  })

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
