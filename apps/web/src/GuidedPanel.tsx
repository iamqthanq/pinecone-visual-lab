import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Panel, TextField } from './components'
import { guideSteps, useGuided } from './guided-context'
import type { GuidedAction } from './guided-api'
import type { ChunkVersion, SourceDocument } from './documents-api'
import type { EmbeddingRecord } from './embeddings-api'
import type { FetchedVectors, Manifest } from './vector-store-api'
import type { SearchResult } from './search-api'
import type { RagResult } from './rag-api'
import { VectorInspector } from './VectorInspector'
import { StoredVectorInspector } from './StoredVectorInspector'
import './guided.css'
import { useDataMotion } from './useDataMotion'

function Result({ value, action, notice }: { value: unknown; action: GuidedAction; notice: (v: string) => void }) {
  if (!value) return null
  if (action === 'embedding') return <VectorInspector title="Guided source embedding" record={(value as { records: EmbeddingRecord[] }).records[0]} onNotice={notice} />
  if (action === 'fetch') return <StoredVectorInspector fetched={value as FetchedVectors} onNotice={notice} />
  if (action === 'upload' || action === 'extract') {
    const doc = value as SourceDocument
    return <div className="guide-proof"><h3>Actual extracted source · {doc.name}</h3><p>{doc.page_count} logical page(s) · {doc.normalization}</p>{doc.pages.map(p => <details key={p.page_number} open><summary>Source page {p.page_number}</summary><pre>{p.text}</pre></details>)}</div>
  }
  if (action === 'preview' || action === 'confirm') {
    const version = value as ChunkVersion
    return <div className="guide-proof"><h3>Actual {version.state} version · {version.chunks.length} chunks</h3><p className="mono">{version.id}</p><ol>{version.chunks.map(c => <li key={c.chunk_id}><strong>Chunk {c.index + 1} · {c.token_count} actual tokenizer tokens · pages {c.page_start}–{c.page_end}</strong><details><summary>Inspect chunk / overlap {c.overlap_token_count} tokens</summary><pre>{c.text}</pre><p className="mono">{c.chunk_id}</p></details></li>)}</ol></div>
  }
  if (action === 'ingest_preview' || action === 'ingest_step') {
    const job = value as Manifest
    return <div className="guide-proof"><h3>Actual LOCAL manifest · {job.state}</h3><p>{job.checkpoint}/{job.count} checkpoint · {job.verified} verified · namespace {job.target.namespace}</p><details><summary>Owned vector IDs / manifest</summary><pre>{JSON.stringify(job, null, 2)}</pre></details></div>
  }
  if (action === 'search' || action === 'rag') {
    const rag = action === 'rag' ? value as RagResult : null
    const search = rag?.search ?? value as SearchResult
    return <div className="guide-proof"><h3>{rag ? `RAG outcome: ${rag.status}` : 'Actual D05 search results'}</h3><Badge>{search.embedding.mode === 'e5' ? 'REAL E5' : 'NOT E5'}</Badge>{rag && <><p>{rag.llm_model.mode === 'mock-ollama-not-real-llm' ? 'MOCK OLLAMA / NOT REAL LLM' : 'LOCAL OLLAMA — real smoke NOT VERIFIED'}</p><pre>{rag.answer ?? rag.no_answer_reason}</pre><p>{rag.used_sources.length} sources provided in attempted LLM request.</p></>}
      <ol>{search.hits.map(hit => <li key={hit.id}><strong>#{hit.rank} · cosine {hit.score.toFixed(6)} · {hit.source_name} · pp.{hit.page_start}–{hit.page_end}</strong><p>{hit.snippet}</p><Link to={hit.source_url}>Open guided result source →</Link></li>)}</ol>{!search.hits.length && <p>No eligible hit; this step is not marked complete.</p>}<details><summary>Measured trace / exact context response</summary><pre>{JSON.stringify(value, null, 2)}</pre></details></div>
  }
  return null
}

function StepActions() {
  const guide = useGuided()!
  const { session, memory, busy } = guide
  const [result, setResult] = useState<{ action: GuidedAction; value: unknown } | null>(null)
  const [size, setSize] = useState(300), [overlap, setOverlap] = useState(50)
  const [confirmed, setConfirmed] = useState(false)
  const [query, setQuery] = useState('Tìm kiếm vector sử dụng embedding và cosine như thế nào?')
  const [topK, setTopK] = useState(3), [page, setPage] = useState('')
  const [llm, setLLM] = useState(false)
  const [notice, setNotice] = useState('')
  const [job, setJob] = useState<Manifest | null>(null)
  if (!session || !memory) return <p role="status">Loading stored session; no real step is marked complete until backend verification.</p>
  const step = guideSteps[memory.step]
  const done = step.id === 'slab' ? memory.modes.length === 3 : session.completed[step.id]
  async function run(action: GuidedAction) {
    const value = await guide.act(action, { size, overlap, confirmed, query, top_k: topK, page: page ? Number(page) : null, llm_enabled: llm })
    if (value) { setResult({ action, value }); if (action === 'ingest_preview' || action === 'ingest_step') setJob(value as Manifest) }
  }
  const validConfig = Number.isInteger(size) && size >= 64 && size <= 400 && Number.isInteger(overlap) && overlap >= 0 && overlap < size
  const validPage = !page || Number.isInteger(Number(page)) && Number(page) >= 1 && Number(page) <= 200
  const source = session.document_id && session.version_id && session.chunk_id ? `/documents?document=${session.document_id}&version=${session.version_id}&chunk=${session.chunk_id}&page=1` : null
  return <>
    <div className="guide-step-heading"><div><span className="eyebrow">STEP {memory.step + 1} / 8</span><h2>{step.label}</h2></div><Badge tone={done ? 'green' : 'amber'}>{done ? step.id === 'slab' ? 'SIMULATION WALKTHROUGHS VIEWED' : 'BACKEND VERIFIED' : 'ACTION REQUIRED'}</Badge></div>
    <p>{step.explanation}</p><p className="guide-fact">{step.fact}</p>
    <fieldset disabled={Boolean(busy)} className="guide-actions"><legend className="sr-only">Guided {step.label} actions</legend>
      {step.id === 'upload' && <Button className="button-primary" onClick={() => void run('upload')}>Upload / verify project sample</Button>}
      {step.id === 'extract' && <Button className="button-primary" onClick={() => void run('extract')}>Inspect / verify extracted page</Button>}
      {step.id === 'chunks' && <><div className="guide-config"><TextField label="Guided chunk size" type="number" min={64} max={400} value={size} onChange={e => setSize(Number(e.target.value))} /><TextField label="Guided overlap" type="number" min={0} max={399} value={overlap} onChange={e => setOverlap(Number(e.target.value))} /></div><p>Guided sample budget:64–400 tokens/chunk, maximum16 chunks. Normal Documents Lab retains its full configuration range.</p><Button disabled={!validConfig} onClick={() => void run('preview')}>Preview guided chunks</Button><label className="search-checkbox"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I inspected this preview and confirm the demo version.</label><Button disabled={!confirmed || !session.draft_id || session.version_id === session.draft_id} onClick={() => void run('confirm')}>Confirm guided chunks</Button></>}
      {step.id === 'embedding' && <Button className="button-primary" onClick={() => void run('embedding')}>Generate guided embedding</Button>}
      {step.id === 'upsert' && <><p>Target: LOCAL DEMO / {session.target.index} / <code>{session.target.namespace}</code>. Explicit bounded batches only.</p><Button onClick={() => void run('ingest_preview')}>Preview guided LOCAL ingest</Button><label className="search-checkbox"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I confirm ingesting this confirmed sample into its LOCAL namespace.</label><Button disabled={!confirmed || !session.job_id || job?.state === 'active'} onClick={() => void run('ingest_step')}>Ingest next LOCAL batch</Button><Button disabled={!session.job_id} onClick={() => void run('fetch')}>Fetch / verify guided vector</Button><p className="config-hint">If reloading mid-ingest, preview again resumes the existing journal; completed batches remain.</p></>}
      {(step.id === 'search' || step.id === 'rag') && <><label htmlFor="guided-question">Guided Vietnamese question</label><textarea id="guided-question" maxLength={2000} value={query} onChange={e => setQuery(e.target.value)} rows={2} /><div className="guide-config"><label>Guided Top-K<select aria-label="Guided Top-K" value={topK} onChange={e => setTopK(Number(e.target.value))}>{Array.from({ length: 10 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label><TextField label="Guided page filter" type="number" min={1} max={200} value={page} onChange={e => setPage(e.target.value)} hint="Blank = all pages; TXT has one logical page. Document filter is fixed to this session’s owned source." /></div>{step.id === 'rag' && <label className="search-checkbox"><input type="checkbox" checked={llm} onChange={e => setLLM(e.target.checked)} />Use configured local LLM (requires prior operator approval; never installs/pulls).</label>}<Button disabled={!query.trim() || !validPage} className="button-primary" onClick={() => void run(step.id === 'search' ? 'search' : 'rag')}>{step.id === 'search' ? 'Run guided semantic search' : llm ? 'Run guided local RAG' : 'Run guided search-only RAG'}</Button>{step.id === 'rag' && <Button onClick={() => void run('skip_rag')}>Skip optional RAG</Button>}</>}
      {step.id === 'slab' && <p>Use the Architecture Lab below. Complete Write, Read and Compaction using Next/Play/Seek. Viewed: {memory.modes.join(', ') || 'none'}. These completion marks describe simulation only.</p>}
    </fieldset>
    {notice && <p role="status">{notice}</p>}{result && <Result action={result.action} value={result.value} notice={setNotice} />}
    <div className="guide-navigation"><Button disabled={memory.step === 0 || Boolean(busy)} onClick={() => guide.go(memory.step - 1)}>Previous guided step</Button><Button className="button-primary" disabled={!done || Boolean(busy) || memory.step === 7} onClick={() => guide.go(memory.step + 1)}>Next guided step</Button>{source && <Link to={source}>Inspect selected confirmed source →</Link>}</div>
    {step.id === 'slab' && done && <p role="status" className="doc-message success">Guided Demo complete. Real local pipeline and educational simulation remain distinct.</p>}
  </>
}

export default function GuidedPanel() {
  const guide = useGuided()
  const reveal = useRef<HTMLElement>(null)
  useDataMotion(reveal, guide?.memory ? `${guide.memory.step}:${JSON.stringify(guide.session?.completed)}` : null, { selector: '.guide-step-heading, .guide-fact' })
  if (!guide) return null
  if (!guide.memory) return guide.error ? <div className="doc-message error" role="alert">{guide.error}</div> : null
  const { memory, session } = guide
  return <Panel ref={reveal} className="guided-panel" label="Guided Demo"><div className="guide-header"><Badge>GUIDED DEMO · LOCAL ONLY</Badge><div><Button disabled={Boolean(guide.busy)} onClick={() => void guide.refresh()}>Refresh backend evidence</Button><Button disabled={Boolean(guide.busy)} onClick={() => void guide.act('reset')}>Reset tour / simulation only</Button><Button onClick={guide.cancel}>Cancel Guided Demo</Button></div></div><p className="config-hint">{session?.provenance ?? 'Restoring versioned session; no text or secrets in browser storage.'} · {session?.embedding_mode === 'e5' ? 'E5 selected; cache/load not assumed' : session ? 'SAMPLE FIXTURE — NOT E5' : 'Model not yet verified'}</p><p className="guide-namespace mono">Session {memory.id}<br />Namespace {session?.target.namespace ?? 'rechecking'}</p>
    <nav aria-label="Guided Demo steps"><ol className="guide-stepper">{guideSteps.map((s, i) => <li key={s.id}><button aria-current={memory.step === i ? 'step' : undefined} disabled={Boolean(guide.busy) || !session} onClick={() => guide.go(i)}><span>{i + 1}</span>{s.label}<small>{s.id === 'slab' ? `${memory.modes.length}/3 viewed` : s.id === 'rag' && session?.completed.rag ? session.rag_outcome?.startsWith('SKIPPED') ? 'SKIPPED' : session.rag_outcome === 'search_only' ? 'SEARCH ONLY' : 'VERIFIED' : session?.completed[s.id] ? 'VERIFIED' : 'pending'}</small></button></li>)}</ol></nav>
    {guide.error && <p className="doc-message error" role="alert">{guide.error}</p>}{session?.source_error && session.document_id && <p className="doc-warning" role="status">{session.source_error}</p>}{guide.busy && <div className="doc-message" role="status">{guide.busy}<Button onClick={guide.abort}>Cancel guided action</Button></div>}
    <StepActions key={`${memory.id}-${memory.step}`} /><details><summary>Backend receipt summary / safe reset policy</summary><pre className="guide-proof-json">{JSON.stringify(session, null, 2)}</pre><p>Reset clears only guide receipts and simulator progress. All sample and unrelated documents/vectors/indexes remain. No guided delete endpoint is provided.</p></details>
  </Panel>
}
