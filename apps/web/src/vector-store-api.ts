export interface StoreTarget { mode: 'local' | 'live'; index: string; namespace: string }
export interface StoreStatus {
  local_available: boolean; live_key_configured: boolean; live_disabled: boolean
  sdk_version: string; api_version: string; project: string; embedding_mode: string; live_verification: string
}
export interface IndexInfo {
  name: string; dimension: number | null; metric: string | null; ready: boolean; compatible: boolean
  cloud: string; region: string; project: string; mode: string; data_origin: string
}
export interface Manifest {
  id: string; target: StoreTarget; document_id: string; version_id: string; signature: string
  state: string; count: number; ids: string[]; checkpoint: number; verified: number; retries: number
  error_code: string | null; preview_token: string; created_at: string
}
export interface StoredVector { id: string; values: number[]; metadata: Record<string, string | number | boolean> }
export interface FetchedVectors { target: StoreTarget; mode_label: string; data_origin: string; records: StoredVector[] }
export interface StorePage { ids: string[]; next: string | null; data_origin: string }
export interface Deletion { id: string; job_id?: string; target: StoreTarget; ids?: string[]; count: number; checkpoint: number; state: string }
export interface CreatePreview { preview_id: string; target: StoreTarget; cloud: string; region: string; project: string; dimension: number; metric: string; risk: string }

const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response
  try { response = await fetch(`${base}/api/vector-store${path}`, {
    method: body === undefined ? 'GET' : 'POST', signal,
    headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  }) } catch { throw new Error(signal?.aborted ? 'Operation paused. Completed batches remain in the journal; refresh and resume.' : 'Vector API unavailable. Start the backend and retry.') }
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}))
    throw new Error(typeof failure.detail === 'string' ? failure.detail : `Vector request rejected (${response.status}). Check the target and confirmation.`)
  }
  return response.json() as Promise<T>
}
const browse = (target: StoreTarget) => ({ target, confirm_live_read: target.mode === 'live' })
export const vectorStoreAPI = {
  status: () => request<StoreStatus>('/status'),
  indexes: (mode: StoreTarget['mode']) => request<{ indexes: IndexInfo[] }>('/indexes/list', { mode, confirm_live_read: mode === 'live' }),
  namespaces: (target: StoreTarget) => request<{ namespaces: { namespace: string; count: number }[] }>('/namespaces', browse(target)),
  jobs: (target: StoreTarget) => request<{ jobs: Manifest[] }>(`/jobs?${new URLSearchParams({ ...target })}`),
  job: (id: string) => request<Manifest>(`/jobs/${id}`),
  preview: (target: StoreTarget, document_id: string, version_id: string) => request<Manifest>('/ingest/preview', { ...browse(target), document_id, version_id }),
  step: (job: Manifest, signal: AbortSignal) => request<Manifest>(`/jobs/${job.id}/step`, { confirmed: true, preview_token: job.preview_token }, signal),
  list: (target: StoreTarget, cursor: string | null = null) => request<StorePage>('/records/list', { ...browse(target), cursor, limit: 25 }),
  fetch: (target: StoreTarget, id: string) => request<FetchedVectors>('/records/fetch', { ...browse(target), ids: [id] }),
  deletePreview: (id: string) => request<Deletion>(`/jobs/${id}/delete-preview`, {}),
  deleteStep: (id: string, signal: AbortSignal) => request<Deletion>(`/deletions/${id}/step`, { confirmed: true }, signal),
  createPreview: (target: StoreTarget, cloud: string, region: string) => request<CreatePreview>('/indexes/create/preview', { ...browse(target), cloud, region }),
  createConfirm: (preview_id: string) => request<IndexInfo>('/indexes/create/confirm', { preview_id, confirmed: true }),
}
