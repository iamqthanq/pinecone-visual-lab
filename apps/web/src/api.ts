export interface Health {
  status: 'ok'
  service: 'pinecone-visual-lab-api'
  version: string
  phase: 'D06'
  rag: 'optional_local'
  search: 'available'
  documents: 'available'
  timestamp: string
  pinecone: 'not_configured' | 'configured_not_verified'
  vector_store: 'local_available'
  embedding: 'not_cached' | 'not_loaded' | 'loading' | 'loaded' | 'unavailable'
  embedding_mode: 'e5' | 'test-fixture-not-e5'
}

const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export async function getHealth(signal: AbortSignal): Promise<Health> {
  const response = await fetch(`${base}/api/health`, {
    signal, headers: { Accept: 'application/json' }, cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Health request failed (${response.status})`)
  const body: unknown = await response.json()
  if (!body || typeof body !== 'object') throw new Error('Invalid health response')
  const health = body as Partial<Health>
  if (health.status !== 'ok' || health.service !== 'pinecone-visual-lab-api'
    || health.phase !== 'D06' || health.search !== 'available' || health.documents !== 'available' || !['not_configured', 'configured_not_verified'].includes(health.pinecone ?? '')
    || health.vector_store !== 'local_available' || health.rag !== 'optional_local'
    || !['not_cached', 'not_loaded', 'loading', 'loaded', 'unavailable'].includes(health.embedding ?? '')
    || !['e5', 'test-fixture-not-e5'].includes(health.embedding_mode ?? '') || typeof health.version !== 'string'
    || typeof health.timestamp !== 'string' || !Number.isFinite(Date.parse(health.timestamp))) {
    throw new Error('Unexpected health response')
  }
  return health as Health
}
