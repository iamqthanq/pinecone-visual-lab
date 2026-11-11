export interface PageSource {
  page_number: number; extracted_text: string; text: string; character_count: number
  start_offset: number; end_offset: number; status: 'text' | 'empty'
}
export interface Chunk {
  chunk_id: string; document_id: string; index: number; text: string; token_count: number
  model_token_count: number; page_start: number; page_end: number; start_offset: number
  end_offset: number; overlap_text: string; overlap_token_count: number; tokenizer_mode: string
  tokenizer: string; tokenizer_revision: string; version: number
}
export interface VersionSummary {
  id: string; version: number; state: 'draft' | 'confirmed'; config: { size: number; overlap: number }
}
export interface ChunkVersion extends VersionSummary { chunks: Chunk[] }
export interface DocumentSummary {
  id: string; name: string; kind: string; size: number; page_count: number; created_at: string
  status: string; warnings: string[]; confirmed_id: string | null
}
export interface SourceDocument extends DocumentSummary {
  canonical_text: string; pages: PageSource[]; versions: VersionSummary[]; normalization: string
}
export interface TokenizerStatus {
  available: boolean; mode: string; id?: string; revision?: string; model_limit?: number
  max_chunk_size?: number; prefix_special_overhead?: number; message?: string
}

const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try { response = await fetch(`${base}/api${path}`, init) }
  catch { throw new Error('Cannot connect to the document API. Start the backend and retry.') }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(typeof body.detail === 'string' ? body.detail : `Request rejected (${response.status}). Check file and configuration.`)
  }
  return response.json() as Promise<T>
}

export const documentAPI = {
  list: () => request<{ documents: DocumentSummary[]; max_file_bytes: number }>('/documents'),
  tokenizer: () => request<TokenizerStatus>('/tokenizer'),
  get: (id: string, signal?: AbortSignal) => request<SourceDocument>(`/documents/${id}`, { signal }),
  upload: (file: File) => {
    const body = new FormData(); body.append('file', file)
    return request<SourceDocument>('/documents', { method: 'POST', body })
  },
  preview: (id: string, size: number, overlap: number) => request<ChunkVersion>(`/documents/${id}/preview`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ size, overlap }),
  }),
  confirm: (id: string, version: string) => request<ChunkVersion>(`/documents/${id}/versions/${version}/confirm`, { method: 'POST' }),
  version: (id: string, version: string, signal?: AbortSignal) => request<ChunkVersion>(`/documents/${id}/versions/${version}`, { signal }),
  remove: async (id: string) => {
    const response = await fetch(`${base}/api/documents/${id}?confirm=true`, { method: 'DELETE' })
    if (!response.ok) throw new Error('Delete failed. Your document is still selected; retry safely.')
  },
  exportURL: (id: string, version: string) => `${base}/api/documents/${id}/versions/${version}/export`,
}
