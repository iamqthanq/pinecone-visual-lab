import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import VectorsLab, { VectorInspector } from './VectorsLab'
import { documentAPI } from './documents-api'
import { embeddingAPI } from './embeddings-api'
import type { EmbeddingRecord } from './embeddings-api'

vi.mock('./documents-api', () => ({ documentAPI: { list: vi.fn() } }))
vi.mock('./embeddings-api', () => ({ embeddingAPI: { status: vi.fn(), encode: vi.fn() } }))
beforeEach(() => {
  vi.mocked(documentAPI.list).mockResolvedValue({ documents: [], max_file_bytes: 10485760 })
  vi.mocked(embeddingAPI.status).mockResolvedValue({ state: 'not_cached', mode: 'e5', model_id: 'intfloat/multilingual-e5-small', model_revision: 'revision', dimension: 384, message: 'Model not cached. Run explicit setup.', setup_command: 'setup_embedding_model.py --accept-download', cache_state: 'missing' })
})
it('shows truthful unavailable setup and disables generation without fake vectors', async () => {
  render(<MemoryRouter><VectorsLab /></MemoryRouter>)
  expect(await screen.findByText('NOT CACHED')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Generate query embedding' })).toBeDisabled()
  expect(screen.getByRole('link', { name: /Upload and confirm/ })).toHaveAttribute('href', '/documents')
  expect(screen.queryByRole('group', { name: 'Query vector 384 dimensions' })).not.toBeInTheDocument()
})
it('shows every vector value and marks incompatible test fixtures explicitly', () => {
  const record = { id: 'fixture', values: Array(384).fill(1/Math.sqrt(384)), dimension: 384, norm: 1,
    normalized: true, model_id: 'NOT E5', model_revision: 'fixture-v1', model_signature: 'fixture',
    mode: 'test-fixture-not-e5', prefix: 'query: ', kind: 'query', input_token_count: 20,
    inference_ms: 2, load_ms: 0, batch_size: 1, timing_scope: 'whole_batch', cached: false,
    source_document_id: null, source_version_id: null, source_chunk_id: null, page_start: null, page_end: null,
  } satisfies EmbeddingRecord
  render(<VectorInspector record={record} title="Query vector" onNotice={() => {}} />)
  expect(screen.getByText(/TEST FIXTURE — NOT E5/)).toBeVisible()
  expect(screen.getByRole('group', { name: 'Query vector 384 dimensions' }).children).toHaveLength(384)
  fireEvent.click(screen.getByRole('button', { name: 'Table' }))
  expect(screen.getAllByRole('row')).toHaveLength(385)
  expect(screen.getByRole('rowheader', { name: '383' })).toBeVisible()
})
it('reports token-budget failures and never shows a vector success', async () => {
  vi.mocked(embeddingAPI.status).mockResolvedValue({ state: 'loaded', mode: 'test-fixture-not-e5', model_id: 'NOT E5', model_revision: 'fixture-v1', dimension: 384, message: 'Test only', cache_state: 'fixture' })
  vi.mocked(embeddingAPI.encode).mockRejectedValue(new Error('Input exceeds 512 tokens.'))
  render(<MemoryRouter><VectorsLab /></MemoryRouter>)
  await screen.findByText('TEST FIXTURE — NOT E5')
  fireEvent.click(screen.getByRole('button', { name: 'Generate query embedding' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('512 tokens')
  expect(screen.queryByRole('group', { name: 'Query vector 384 dimensions' })).not.toBeInTheDocument()
})
