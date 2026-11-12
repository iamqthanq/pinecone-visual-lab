import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import DocumentsLab from './DocumentsLab'
import { documentAPI } from './documents-api'

vi.mock('./documents-api', () => ({ documentAPI: {
  list: vi.fn(), tokenizer: vi.fn(), get: vi.fn(), upload: vi.fn(), preview: vi.fn(),
  confirm: vi.fn(), version: vi.fn(), remove: vi.fn(), exportURL: () => '/export.jsonl',
} }))

const source = {
  id: 'doc-1', name: 'Vietnamese.txt', kind: 'txt', size: 100, page_count: 1,
  created_at: '', status: 'extracted', warnings: [], confirmed_id: null, versions: [],
  canonical_text: 'Tiếng Việt.', normalization: 'NFC',
  pages: [{ page_number: 1, extracted_text: 'Tiếng Việt.', text: 'Tiếng Việt.', character_count: 11,
    start_offset: 0, end_offset: 11, status: 'text' as const }],
}

beforeEach(() => {
  vi.mocked(documentAPI.list).mockResolvedValue({ documents: [source], max_file_bytes: 10485760 })
  vi.mocked(documentAPI.tokenizer).mockResolvedValue({ available: true, mode: 'e5', max_chunk_size: 507, prefix_special_overhead: 5 })
  vi.mocked(documentAPI.get).mockResolvedValue(source)
})

it('rejects malformed source links without selecting another document', async () => {
  vi.mocked(documentAPI.get).mockClear()
  render(<MemoryRouter initialEntries={['/documents?document=bad&version=bad&chunk=bad&page=1']}><DocumentsLab /></MemoryRouter>)
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid source link')
  expect(documentAPI.get).not.toHaveBeenCalled()
  expect(screen.queryByLabelText('Full chunk text')).not.toBeInTheDocument()
})

it('loads the exact retained confirmed version from a search link instead of the newest pointer', async () => {
  const doc = '11111111-1111-4111-8111-111111111111'
  const version = '22222222-2222-4222-8222-222222222222'
  const chunk = '33333333-3333-4333-8333-333333333333'
  const current = '44444444-4444-4444-8444-444444444444'
  const config = { size: 300, overlap: 50 }
  vi.mocked(documentAPI.get).mockResolvedValue({ ...source, id: doc, confirmed_id: current,
    versions: [{ id: version, version: 1, state: 'confirmed', config }, { id: current, version: 2, state: 'confirmed', config }] })
  vi.mocked(documentAPI.version).mockResolvedValue({ id: version, version: 1, state: 'confirmed', config,
    chunks: [{ chunk_id: chunk, document_id: doc, index: 0, text: 'Tiếng Việt.', token_count: 8, model_token_count: 12, page_start: 1, page_end: 1, start_offset: 0, end_offset: 11, overlap_text: '', overlap_token_count: 0, tokenizer_mode: 'e5', tokenizer: 'pinned', tokenizer_revision: 'revision', version: 1 }] })
  render(<MemoryRouter initialEntries={[`/documents?document=${doc}&version=${version}&chunk=${chunk}&page=1`]}><DocumentsLab /></MemoryRouter>)
  expect(await screen.findByLabelText('Full chunk text')).toHaveTextContent('Tiếng Việt.')
  expect(documentAPI.version).toHaveBeenCalledWith(doc, version, expect.any(AbortSignal))
  expect(screen.getByLabelText('Saved versions')).toHaveValue(version)
})

it('loads actual source text, rejects invalid settings before generating, and requires confirmation for delete', async () => {
  render(<MemoryRouter><DocumentsLab /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: /Vietnamese.txt/ }))
  expect(await screen.findByLabelText('Page 1 text')).toHaveTextContent('Tiếng Việt.')
  fireEvent.change(screen.getByLabelText('Chunk size (tokens)'), { target: { value: '0' } })
  expect(screen.getByRole('button', { name: 'Generate preview' })).toBeDisabled()
  expect(documentAPI.preview).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Delete selected document' }))
  expect(screen.getByRole('button', { name: 'Confirm delete' })).toBeVisible()
  expect(documentAPI.remove).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('button', { name: 'Confirm delete' })).not.toBeInTheDocument()
})

it('discloses a missing tokenizer and disables generation without silently replacing it', async () => {
  vi.mocked(documentAPI.tokenizer).mockResolvedValue({ available: false, mode: 'unavailable', message: 'Run tokenizer-only setup.' })
  render(<MemoryRouter><DocumentsLab /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: /Vietnamese.txt/ }))
  await screen.findByLabelText('Page 1 text')
  expect(screen.getByText('Run tokenizer-only setup.')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Generate preview' })).toBeDisabled()
})

it('shows actionable upload errors without reporting extraction success', async () => {
  vi.mocked(documentAPI.upload).mockRejectedValue(new Error('Encrypted PDFs are not supported.'))
  render(<MemoryRouter><DocumentsLab /></MemoryRouter>)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Choose file' })).toBeEnabled())
  fireEvent.change(screen.getByLabelText('Choose document file'), { target: { files: [new File(['PDF'], 'encrypted.pdf', { type: 'application/pdf' })] } })
  expect(await screen.findByRole('alert')).toHaveTextContent('Encrypted PDFs are not supported.')
  expect(screen.queryByText(/Extracted 1 page/)).not.toBeInTheDocument()
})
