import { createContext, useContext } from 'react'
import type { GuidedAction, GuidedOptions, GuidedSession, GuidedStep } from './guided-api'
import type { GuideMemory } from './guided-state'
import type { SimulatorState } from './simulator'

export const guideSteps: { id: GuidedStep | 'slab'; label: string; path: string; explanation: string; fact: string }[] = [
  { id: 'upload', label: 'Upload', path: '/documents', explanation: 'Explicitly upload our CC0 Vietnamese sample through the actual D02 source service. No personal file or cloud upload.', fact: 'Input: authored UTF-8 TXT. Output: real local document ID; not simulation.' },
  { id: 'extract', label: 'Extract', path: '/documents', explanation: 'Inspect and verify extracted source text. TXT has one logical page; PDF extraction remains available in Documents Lab.', fact: 'Pages are extracted backend data. Scan PDFs have no invented OCR.' },
  { id: 'chunks', label: 'Chunks', path: '/documents', explanation: 'Preview token-aware chunks and inspect them before explicitly confirming this version.', fact: 'Real tokenizer tokens, source spans and immutable confirmed version; no upsert yet.' },
  { id: 'embedding', label: 'Embedding', path: '/vectors', explanation: 'Generate one confirmed chunk embedding with cached E5 and inspect all384 dimensions. Missing cache is an honest error, never a fake vector.', fact: 'Real E5 uses passage: and ≤512 input tokens. Test fixture is labeled NOT E5.' },
  { id: 'upsert', label: 'Local ingest', path: '/vectors/store', explanation: 'Preview and confirm bounded LOCAL batches, then fetch a real stored vector. Completion requires verified ACTIVE storage and fetch.', fact: 'SQLite LocalDemoAdapter, dedicated namespace; no Pinecone call.' },
  { id: 'search', label: 'Search', path: '/search', explanation: 'Ask in Vietnamese, choose Top-K and optional page filter. Follow a result to the exact confirmed source.', fact: 'D05 real query embedding and raw cosine; filtering precedes Top-K. Score is not probability.' },
  { id: 'rag', label: 'RAG optional', path: '/search', explanation: 'Use search-only or explicitly request a configured local LLM. Skip when Ollama is unavailable. No installation or model pull.', fact: 'D06 verifies context excerpts/citations; MOCK OLLAMA is never presented as a real LLM.' },
  { id: 'slab', label: 'Slab simulation', path: '/architecture', explanation: 'Inspect the three walkthroughs to their final steps. This is a separate deterministic educational model, not the source vectors or Pinecone telemetry.', fact: 'Toy 2D cosine and immutable slab rules; no latency/QPS or real deployment thresholds.' },
]
export function guidePath(step: number, session: GuidedSession) {
  const params = new URLSearchParams()
  if (session.document_id) params.set('demoDocument', session.document_id)
  if (session.version_id) params.set('demoVersion', session.version_id)
  if (session.chunk_id) params.set('demoChunk', session.chunk_id)
  params.set('demoNamespace', session.target.namespace)
  if (step === 6) params.set('tab', 'rag')
  return `${guideSteps[step].path}?${params}`
}
interface GuideContextValue {
  memory: GuideMemory | null; session: GuidedSession | null; error: string; busy: string
  start: () => Promise<void>; go: (step: number) => void; cancel: () => void; abort: () => void
  refresh: () => Promise<void>; act: (action: GuidedAction, options?: GuidedOptions) => Promise<unknown>
  simulator: (value: SimulatorState) => void
}
export const Context = createContext<GuideContextValue | null>(null)
export function useGuided() { return useContext(Context) }
