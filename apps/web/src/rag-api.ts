import type { SearchHit, SearchInput, SearchResult } from './search-api'

export interface OllamaStatus {
  mode: string; state: string; enabled: boolean; message: string; allowed_models: string[]
  models: { name: string; size: number; digest: string }[]
}
export interface ContextSource { source_id: string; hit: SearchHit; text: string; truncated: boolean; cited: boolean }
export interface RagResult {
  status: 'answered' | 'insufficient_context' | 'search_only' | 'llm_unavailable' | 'timeout' | 'invalid_citations' | 'stale_sources'
  answer: string | null; no_answer_reason: string | null; used_sources: ContextSource[]; retrieval_hits: SearchHit[]
  assembled_context: string; context_budget: { max_prompt_bytes: number; prompt_bytes: number; num_ctx: number; reply_token_reserve: number; framing_token_reserve: number; conservative_prompt_token_estimate: number; estimate_kind: string; request_attempted: boolean; warnings: string[] }
  llm_model: { requested_model: string; actual_model: string | null; mode: string; usage: Record<string, number> | null }
  search: SearchResult; grounding_policy: string
  trace: { total_ms: number; stages: { name: string; ms: number }[]; warnings: string[]; scope: string }
}
const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${base}/api/rag${path}`, { method: body === undefined ? 'GET' : 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch { throw new Error(signal?.aborted ? 'RAG cancelled or timed out. No transcript was saved.' : 'RAG API offline. Semantic Search remains independent; start the backend and retry.') }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(typeof error.detail === 'string' ? error.detail : `RAG rejected (${response.status}); check question and filters.`)
  }
  return response.json() as Promise<T>
}
export const ragAPI = {
  status: () => request<OllamaStatus>('/status?probe=true'),
  chat: (body: SearchInput & { llm_enabled: boolean; model: string }, signal: AbortSignal) => request<RagResult>('/chat', body, signal),
}
