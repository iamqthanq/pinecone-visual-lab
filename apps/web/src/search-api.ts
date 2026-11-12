import type { IndexInfo, StoreTarget } from './vector-store-api'
import type { ModelStatus } from './embeddings-api'

export interface SearchFilters { document_id?: string | null; version_id?: string | null; source_name?: string | null; page_from?: number | null; page_to?: number | null }
export interface SearchInput {
  query: string; target: StoreTarget; top_k: number; filters: SearchFilters; compare: boolean
  confirm_live_read: boolean; confirm_live_compare: boolean
}
export interface SearchHit {
  id: string; rank: number; score: number; document_id: string; version_id: string; chunk_id: string
  source_name: string; page_start: number; page_end: number; text: string; snippet: string
  source_url: string; metadata: Record<string, string | number | boolean>
}
export interface SearchResult {
  target: StoreTarget; top_k: number; filters: SearchFilters; retrieval_mode: string; data_origin: string
  embedding: { mode: string; model_id: string; model_revision: string; model_signature: string; prefix: string; input_token_count: number | null; inference_ms: number | null }
  score_meaning: string; hits: SearchHit[]; comparison: SearchHit[] | null; empty_reason: string | null
  trace: { stages: { name: string; ms: number; status: string }[]; total_ms: number; scope: string; candidate_count: number; candidate_count_kind: string; manifest_count: number; discarded_count: number; warnings: string[] }
}
export interface SearchStatus {
  model: ModelStatus; local_indexes: IndexInfo[]; max_candidates: number; max_payload_bytes: number
  live_enabled: boolean; live_key_configured: boolean; live_verification: string
}
const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response
  try { response = await fetch(`${base}/api/search${path}`, {
    method: body === undefined ? 'GET' : 'POST', signal,
    headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  }) } catch { throw new Error(signal?.aborted ? 'Search cancelled or timed out. No storage was modified.' : 'Search API offline. Start the backend and retry.') }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(typeof error.detail === 'string' ? error.detail : `Search rejected (${response.status}); check query, target and filters.`)
  }
  return response.json() as Promise<T>
}
export const searchAPI = {
  status: () => request<SearchStatus>('/status'),
  indexes: (mode: StoreTarget['mode'], confirmed: boolean) => request<{ indexes: IndexInfo[] }>('/indexes', { mode, confirm_live_read: confirmed }),
  namespaces: (target: StoreTarget, confirmed: boolean) => request<{ namespaces: { namespace: string; count: number }[] }>('/namespaces', { target, confirm_live_read: confirmed }),
  search: (body: SearchInput, signal: AbortSignal) => request<SearchResult>('', body, signal),
}
