import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
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

it('loads actual source text, rejects invalid settings before generating, and requires confirmation for delete', async () => {
  render(<DocumentsLab />)
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
  render(<DocumentsLab />)
  fireEvent.click(await screen.findByRole('button', { name: /Vietnamese.txt/ }))
  await screen.findByLabelText('Page 1 text')
  expect(screen.getByText('Run tokenizer-only setup.')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Generate preview' })).toBeDisabled()
})

it('shows actionable upload errors without reporting extraction success', async () => {
  vi.mocked(documentAPI.upload).mockRejectedValue(new Error('Encrypted PDFs are not supported.'))
  render(<DocumentsLab />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Choose file' })).toBeEnabled())
  fireEvent.change(screen.getByLabelText('Choose document file'), { target: { files: [new File(['PDF'], 'encrypted.pdf', { type: 'application/pdf' })] } })
  expect(await screen.findByRole('alert')).toHaveTextContent('Encrypted PDFs are not supported.')
  expect(screen.queryByText(/Extracted 1 page/)).not.toBeInTheDocument()
})
