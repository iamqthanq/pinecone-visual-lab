import type { StoreTarget } from './vector-store-api'
export type GuidedStep = 'upload' | 'extract' | 'chunks' | 'embedding' | 'upsert' | 'search' | 'rag'
export type GuidedAction = 'reset' | 'upload' | 'extract' | 'preview' | 'confirm' | 'embedding' | 'ingest_preview' | 'ingest_step' | 'fetch' | 'search' | 'skip_rag' | 'rag'
export interface GuidedSession {
  id: string; created_at: string; target: StoreTarget; document_id: string | null; draft_id: string | null
  version_id: string | null; chunk_id: string | null; job_id: string | null; completed: Record<GuidedStep, boolean>
  source_error: string | null; embedding_mode: string; rag_outcome: string | null; provenance: string; reset_policy: string
}
export interface GuidedOptions { size?: number; overlap?: number; confirmed?: boolean; query?: string; top_k?: number; page?: number | null; llm_enabled?: boolean }
const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response
  try { response = await fetch(`${base}/api/guided${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal }) }
  catch { throw new Error(signal?.aborted ? 'Guided action cancelled. Existing data is retained; refresh evidence before retry.' : 'Guided backend offline. Your session is retained; retry or use labs manually.') }
  if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(typeof error.detail === 'string' ? error.detail : `Guided action rejected (${response.status}). No automatic cleanup.`) }
  return response.json() as Promise<T>
}
export const guidedAPI = {
  create: () => request<GuidedSession>('/sessions', {}),
  get: (id: string, signal?: AbortSignal) => request<GuidedSession>(`/sessions/${id}`, undefined, signal),
  action: (id: string, action: GuidedAction, options: GuidedOptions, signal: AbortSignal) => request<{ session: GuidedSession; result: unknown }>(`/sessions/${id}/actions`, { action, ...options }, signal),
}
