import type { Chunk } from './documents-api'

export interface ModelStatus {
  state: 'not_cached' | 'not_loaded' | 'loading' | 'loaded' | 'unavailable'
  mode: 'e5' | 'test-fixture-not-e5'; model_id: string; model_revision: string
  dimension: number; message: string; setup_command?: string; cache_state: string
}
export interface EmbeddingRecord {
  id: string; values: number[]; dimension: number; norm: number; normalized: boolean
  model_id: string; model_revision: string; model_signature: string; mode: string
  prefix: string; kind: 'query' | 'passage'; input_token_count: number; inference_ms: number
  load_ms: number; batch_size: number; timing_scope: string; cached: boolean
  source_document_id: string | null; source_version_id: string | null
  source_chunk_id: string | null; page_start: number | null; page_end: number | null
}
export interface EmbeddingBatch { records: EmbeddingRecord[]; wall_ms: number; inference_ms: number | null }
export interface Similarity { cosine: number; meaning: string; mode: string; compute_ms: number }
const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${base}/api/embeddings${path}`, {
    method: body ? 'POST' : 'GET', signal, headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `Embedding request rejected (${response.status}). Check inputs and retry.`)
  return data as T
}
export const embeddingAPI = {
  status: () => request<ModelStatus>('/status'),
  encode: (texts: string[], signal?: AbortSignal) => request<EmbeddingBatch>('/encode', { texts, kind: 'query' }, signal),
  chunks: (document: string, version: string, chunks: Chunk[], signal?: AbortSignal) => request<EmbeddingBatch>('/chunks', {
    document_id: document, version_id: version, chunk_ids: chunks.map(chunk => chunk.chunk_id),
  }, signal),
  compare: (left: EmbeddingRecord, right: EmbeddingRecord, signal?: AbortSignal) => request<Similarity>('/compare', { left, right }, signal),
}
