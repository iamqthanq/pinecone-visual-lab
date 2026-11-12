import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, BookOpen, Copy, LoaderCircle, MessageSquare, RefreshCw, X } from 'lucide-react'
import { Badge, Button, Panel, TextField } from './components'
import { documentAPI } from './documents-api'
import type { DocumentSummary } from './documents-api'
import { searchAPI } from './search-api'
import type { SearchStatus } from './search-api'
import type { IndexInfo, StoreTarget } from './vector-store-api'
import { ragAPI } from './rag-api'
import type { OllamaStatus, RagResult } from './rag-api'
import './rag.css'

interface Turn { question: string; response: RagResult }
const models = ['qwen2.5:1.5b', 'qwen2.5:3b']
const ms = (value: number) => value > 0 && value < 0.01 ? '<0.01' : value.toFixed(2)

function Reply({ turn, onNotice }: { turn: Turn; onNotice: (text: string) => void }) {
  const r = turn.response
  const included = new Set(r.used_sources.map(s => s.hit.id))
  return <article className="rag-turn" aria-label="RAG response">
    <div className="rag-question"><MessageSquare size={16} aria-hidden="true" /><p>{turn.question}</p></div>
    <Panel className="search-panel" label="Evidence answer"><div className="document-panel-heading"><h2>Evidence answer</h2><Badge tone={r.status === 'answered' ? 'green' : 'amber'}>{r.status.replace(/_/g, ' ').toUpperCase()}</Badge></div>
      <p className="config-hint">{r.grounding_policy} Each turn retrieves fresh evidence; prior messages are not sent to the model.</p>
      {r.answer ? <><pre className="rag-answer">{r.answer}</pre><div className="rag-citations" aria-label="Verified citations">{r.used_sources.filter(s => s.cited && s.hit.source_url.startsWith('/documents?')).map(s => <Link className="button" key={s.source_id} to={s.hit.source_url}>[{s.source_id}] {s.hit.source_name} · pp. {s.hit.page_start}–{s.hit.page_end}<ArrowUpRight size={14} /></Link>)}</div></> : <p className="doc-warning" role="status">{r.no_answer_reason}</p>}
      <p className="config-hint">{r.llm_model.mode === 'mock-ollama-not-real-llm' ? 'MOCK OLLAMA / NOT REAL LLM' : 'LOCAL OLLAMA'} · {r.llm_model.actual_model ?? 'No verified generation'} · requested {r.llm_model.requested_model}</p>
    </Panel>
    <Panel className="search-panel" label="Context sources"><div className="document-panel-heading"><h2><BookOpen size={17} />Context sources</h2><Badge>{r.used_sources.length} PROVIDED IN REQUEST</Badge></div><p className="config-hint">Sources actually assembled for the attempted LLM request; availability does not prove the daemon processed them. Cited sources are marked separately.</p>
      {!r.used_sources.length && <p>No sources were sent to the LLM. Search-only context below is a preview.</p>}
      {r.used_sources.map(s => <details className="rag-source" key={s.source_id}><summary>[{s.source_id}] {s.hit.source_name} · pp. {s.hit.page_start}–{s.hit.page_end} · {s.cited ? 'CITED' : 'CONTEXT ONLY'}{s.truncated ? ' · TRUNCATED' : ''}</summary><pre>{s.text}</pre><p className="mono">Document {s.hit.document_id}<br />Version {s.hit.version_id}<br />Chunk {s.hit.chunk_id}</p>{s.hit.source_url.startsWith('/documents?') && <Link to={s.hit.source_url}>Inspect exact source →</Link>}<Button onClick={() => { void navigator.clipboard.writeText(JSON.stringify(s, null, 2)).then(() => onNotice('Verified source metadata copied.')).catch(() => onNotice('Clipboard unavailable; select context text.')) }}><Copy size={14} />Copy {s.source_id}</Button></details>)}
      <details><summary>Retrieved hits · {r.retrieval_hits.length} (separate from context)</summary><ol className="rag-retrieved">{r.retrieval_hits.map(h => <li key={h.id}><strong>#{h.rank} {h.source_name}</strong><span> · cosine {h.score.toFixed(6)} · {included.has(h.id) ? 'included in attempted request' : 'not sent'} · pp. {h.page_start}–{h.page_end}</span><p>{h.snippet}</p>{h.source_url.startsWith('/documents?') && <Link to={h.source_url}>Open retrieved source →</Link>}</li>)}</ol></details>
      <details><summary>Context inspector · {r.context_budget.prompt_bytes} prompt bytes</summary><p>{r.context_budget.estimate_kind}. Configured context {r.context_budget.num_ctx} / reply reserve {r.context_budget.reply_token_reserve}. Prompt byte cap {r.context_budget.max_prompt_bytes}; includes question, instructions, JSON labels and escaped text.</p><pre className="rag-context">{r.assembled_context || 'Context withheld because sources became stale.'}</pre>{r.context_budget.warnings.map(w => <p className="doc-warning" key={w}>{w.replace(/_/g, ' ')}</p>)}</details>
    </Panel>
    <Panel className="search-panel search-trace" label="RAG Trace"><div className="document-panel-heading"><h2>RAG Trace</h2><strong>{ms(r.trace.total_ms)} ms total</strong></div><p className="config-hint">{r.trace.scope}. No invented model tokens or latency. {r.search.embedding.mode === 'e5' ? 'REAL E5' : 'NOT E5'} · prefix {r.search.embedding.prefix}</p><ol>{r.trace.stages.map(s => <li key={s.name}><span>{s.name.replace(/_/g, ' ')}</span><span className="mono">{ms(s.ms)} ms</span></li>)}</ol><details><summary>Nested D05 Search Trace</summary><ol>{r.search.trace.stages.map((s, i) => <li key={`${s.name}-${i}`}><span>{s.name.replace(/_/g, ' ')}</span><span>{ms(s.ms)} ms</span></li>)}</ol></details>{r.llm_model.usage && Object.keys(r.llm_model.usage).length > 0 && <details><summary>Actual provider usage (duration fields in nanoseconds)</summary><pre>{JSON.stringify(r.llm_model.usage, null, 2)}</pre></details>}{[...r.search.trace.warnings, ...r.trace.warnings].map((w, i) => <p className="doc-warning" key={`${w}-${i}`}>{w.replace(/_/g, ' ')}</p>)}</Panel>
  </article>
}

export default function RagChat() {
  const [readiness, setReadiness] = useState<SearchStatus | null>(null)
  const [ollama, setOllama] = useState<OllamaStatus | null>(null)
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [indexes, setIndexes] = useState<IndexInfo[]>([])
  const [mode, setMode] = useState<StoreTarget['mode']>('local')
  const [index, setIndex] = useState('')
  const [namespace, setNamespace] = useState('')
  const [documentId, setDocumentId] = useState('')
  const [filename, setFilename] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [topK, setTopK] = useState(3)
  const [live, setLive] = useState(false)
  const [model, setModel] = useState(models[0])
  const [enabled, setEnabled] = useState(true)
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const controller = useRef<AbortController | null>(null)
  const operation = useRef(0)
  useEffect(() => {
    let active = true
    Promise.all([searchAPI.status(), documentAPI.list()]).then(([state, list]) => { if (active) { setReadiness(state); setIndexes(state.local_indexes); setIndex(state.local_indexes.find(i => i.compatible)?.name ?? ''); setDocuments(list.documents) } }).catch(() => { if (active) setError('Backend offline. Start FastAPI and reopen this tab.') })
    return () => { active = false; controller.current?.abort() }
  }, [])
  function clear() { setTurns([]); setNotice(''); setError('') }
  const invalidPage = Boolean(from || to) && (!from || !to || !Number.isInteger(Number(from)) || !Number.isInteger(Number(to)) || Number(from) < 1 || Number(to) > 200 || Number(from) > Number(to))
  const invalidFile = Boolean(filename) && (!filename.trim() || /[/\\:*?"<>|\x00-\x1f]/.test(filename)) // eslint-disable-line no-control-regex
  const liveAllowed = mode === 'local' || Boolean(live && readiness?.live_enabled && readiness.live_key_configured)
  const canSend = Boolean(question.trim() && indexes.find(i => i.name === index)?.compatible && !invalidPage && !invalidFile && liveAllowed && !busy)
  async function send() {
    if (!canSend) return
    const token = ++operation.current
    const current = new AbortController(); controller.current = current
    const timer = window.setTimeout(() => current.abort(), 220000)
    setBusy('Retrieving ACTIVE sources, assembling context and requesting the selected local model…'); setError(''); setNotice('')
    try {
      const response = await ragAPI.chat({ query: question, top_k: topK, target: { mode, index, namespace }, filters: { ...(documentId ? { document_id: documentId } : {}), ...(filename ? { source_name: filename } : {}), ...(from && to ? { page_from: Number(from), page_to: Number(to) } : {}) }, compare: false, confirm_live_read: live, confirm_live_compare: false, model, llm_enabled: enabled }, current.signal)
      if (operation.current === token && !current.signal.aborted) setTurns(old => [...old, { question, response }].slice(-4))
    } catch (failure) { if (operation.current === token) setError((failure as Error).message) }
    finally { window.clearTimeout(timer); if (operation.current === token) setBusy('') }
  }
  return <>
    <div className="page-meta"><Badge>D06 · OPTIONAL LOCAL RAG</Badge><span className="mono">RETRIEVE → INSPECT CONTEXT → VERIFY EXCERPTS</span></div>
    <div className="documents-title"><div><span className="eyebrow accent">SEARCH LAB / RAG CHAT</span><h1>Answers with evidence in view.</h1><p>Ask in Vietnamese. Follow exact excerpts back to confirmed chunks. Search remains available when Ollama is off.</p></div><MessageSquare size={30} aria-hidden="true" /></div>
    <div className="search-mode-strip"><Badge tone={mode === 'local' ? 'green' : 'amber'}>{mode === 'local' ? 'LOCAL DEMO' : 'LIVE PINECONE · NOT VERIFIED'}</Badge><p>LLM runs only on an explicit Send. No model installation, pull, auto-start or daemon probe on tab load.</p></div>
    {readiness?.model.mode === 'test-fixture-not-e5' && <p className="doc-warning">TEST FIXTURE — NOT E5.</p>}
    <Panel className="search-panel" label="Ollama readiness"><div className="document-panel-heading"><h2>Local model readiness</h2><Badge>{ollama?.state.replace(/_/g, ' ').toUpperCase() ?? 'NOT CHECKED'}</Badge></div><p>{ollama?.message ?? 'Explicit refresh checks local inventory only after operator opt-in. Downloaded does not mean loaded.'}</p>{ollama?.mode === 'mock-ollama-not-real-llm' && <p className="doc-warning">MOCK OLLAMA / NOT REAL LLM</p>}<Button disabled={Boolean(busy)} onClick={() => { clear(); setBusy('Checking local inventory…'); void ragAPI.status().then(state => { setOllama(state); if (state.models.length) setModel(state.models[0].name) }).catch(failure => setError((failure as Error).message)).finally(() => setBusy('')) }}><RefreshCw size={14} />Refresh Ollama readiness</Button><details><summary>Optional model setup and resource approval</summary><p>REAL OLLAMA NOT VERIFIED. Ask the project owner before installing Ollama, pulling or loading a model. Default qwen2.5:1.5b ≈986MB (Apache-2.0); 3b ≈1.9GB uses the Qwen license. Allow extra RAM/runtime overhead. Follow the Windows README after approval; no API key belongs here.</p></details></Panel>
    {error && <div role="alert" className="doc-message error">{error}</div>}{notice && <p role="status" className="doc-message success">{notice}</p>}
    {busy && <div className="doc-message" role="status"><LoaderCircle className="spin" size={16} />{busy}{busy.startsWith('Retrieving') && <Button onClick={() => controller.current?.abort()}><X size={14} />Cancel RAG</Button>}</div>}
    <form onSubmit={event => { event.preventDefault(); void send() }}><fieldset className="rag-controls" disabled={Boolean(busy)}><legend className="sr-only">RAG Chat controls</legend><Panel className="search-panel"><div className="document-panel-heading"><h2>Ask the source collection</h2><label className="search-checkbox"><input type="checkbox" checked={enabled} onChange={event => { setEnabled(event.target.checked); clear() }} />LLM enabled</label></div>
      <label htmlFor="rag-question">RAG question in Vietnamese</label><textarea id="rag-question" rows={3} maxLength={2000} value={question} onChange={event => setQuestion(event.target.value)} placeholder="Tìm kiếm vector khác tìm kiếm từ khóa như thế nào?" /><p className="config-hint">Fresh D05 retrieval each turn; E5 limit 512 input tokens. Responses are verified verbatim excerpts, not unrestricted model prose.</p>
      <div className="search-target-grid"><label>RAG retrieval mode<select value={mode} onChange={event => { const next = event.target.value as StoreTarget['mode']; setMode(next); setIndexes(next === 'local' ? readiness?.local_indexes ?? [] : []); setIndex(next === 'local' ? readiness?.local_indexes.find(i => i.compatible)?.name ?? '' : ''); setNamespace(''); setLive(false); clear() }}><option value="local">LOCAL DEMO</option><option value="live">LIVE PINECONE · requires authorization</option></select></label><label>RAG index<select value={index} onChange={event => { setIndex(event.target.value); clear() }}><option value="">Select an ACTIVE index</option>{indexes.map(i => <option key={i.name} value={i.name} disabled={!i.compatible}>{i.name}</option>)}</select></label><TextField label="RAG namespace" value={namespace} maxLength={64} pattern="[a-zA-Z0-9_.-]*" onChange={event => { setNamespace(event.target.value); clear() }} /><label>RAG Top-K<select value={topK} onChange={event => { setTopK(Number(event.target.value)); clear() }}>{Array.from({ length: 10 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label></div>
      {mode === 'live' && <><p className="doc-warning">LIVE NOT VERIFIED — AWAITING USER AUTHORIZATION. No automatic discovery.</p><label className="search-checkbox"><input type="checkbox" checked={live} onChange={event => { setLive(event.target.checked); clear() }} />I confirm authorized LIVE reads for this target.</label><Button type="button" disabled={!liveAllowed || Boolean(busy)} onClick={() => { setBusy('Explicit LIVE catalog read…'); void searchAPI.indexes('live', true).then(state => { setIndexes(state.indexes); setIndex(state.indexes.find(i => i.compatible)?.name ?? '') }).catch(failure => setError((failure as Error).message)).finally(() => setBusy('')) }}>Load RAG LIVE indexes</Button></>}
      <div className="search-filter-grid"><label>RAG document filter<select value={documentId} onChange={event => { setDocumentId(event.target.value); clear() }}><option value="">All ACTIVE documents</option>{documents.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label><TextField label="RAG exact filename" maxLength={120} value={filename} onChange={event => { setFilename(event.target.value); clear() }} /><TextField label="RAG page from" type="number" min={1} max={200} value={from} onChange={event => { setFrom(event.target.value); clear() }} /><TextField label="RAG page to" type="number" min={1} max={200} value={to} onChange={event => { setTo(event.target.value); clear() }} /></div>
      {(invalidPage || invalidFile) && <p className="doc-warning" role="alert">Invalid filter: safe filename and both integer page endpoints, 1 ≤ from ≤ to ≤200.</p>}
      <div className="rag-model-row"><label>Local LLM model<select value={model} disabled={!enabled} onChange={event => { setModel(event.target.value); clear() }}>{models.map(name => <option value={name} key={name} disabled={Boolean(ollama?.state === 'available' && !ollama.models.some(m => m.name === name))}>{name}{ollama?.models.some(m => m.name === name) ? ' · downloaded (load not verified)' : ' · availability not verified'}</option>)}</select></label><Button type="submit" className="button-primary" disabled={!canSend}>Send RAG question<ArrowUpRight size={14} /></Button><Button type="button" onClick={clear}>Clear conversation</Button></div><p className="config-hint">Last 4 turns in memory only. Leaving the tab clears them; changing target, filters, model or LLM mode starts a new session. History is never sent or persisted.</p>
    </Panel></fieldset></form>
    {!turns.length && <Panel className="search-panel search-empty"><BookOpen size={26} /><h2>Your evidence starts here.</h2><p>Choose an ingested ACTIVE collection and send a question. No generated answer appears until evidence and citations pass validation.</p><Link to="/vectors/store">Open Vector Explorer →</Link></Panel>}
    <div className="rag-history" aria-label="Temporary conversation">{turns.map((turn, i) => <Reply key={i} turn={turn} onNotice={setNotice} />)}</div>
  </>
}
