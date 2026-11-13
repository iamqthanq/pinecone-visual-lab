import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowUpRight, Clock3, Copy, Filter, LoaderCircle, RefreshCw, Search } from 'lucide-react'
import { Badge, Button, Panel, TextField } from './components'
import { documentAPI } from './documents-api'
import type { DocumentSummary } from './documents-api'
import { searchAPI } from './search-api'
import type { SearchFilters, SearchHit, SearchResult, SearchStatus } from './search-api'
import type { IndexInfo, StoreTarget } from './vector-store-api'
import { defaultLocalIndex } from './vector-store-api'
import './search.css'
import LabBoundary from './LabBoundary'
import { MotionActive, useDataMotion } from './useDataMotion'
import { demoSelection } from './guided-state'

const RagChat = lazy(() => import('./RagChat'))

const timeLabel = (ms: number) => ms > 0 && ms < 0.01 ? '<0.01' : ms.toFixed(2)

function HitList({ title, hits, result, onNotice }: { title: string; hits: SearchHit[]; result: SearchResult; onNotice: (text: string) => void }) {
  const reveal = useRef<HTMLElement>(null)
  useDataMotion(reveal, result, { selector: '.search-hit' })
  return <Panel ref={reveal} className="search-panel" label={title}><div className="document-panel-heading"><h2>{title}</h2><Badge>{hits.length} RETURNED</Badge></div>
    <p className="config-hint">{result.target.index} / {result.target.namespace || '(default namespace)'} · {result.data_origin}</p>
    {!hits.length && <div className="search-empty"><Search size={24} /><strong>No matching chunks.</strong><p>Check ACTIVE ingestion, namespace and filters. A returned hit count is not the total number of matching documents.</p><Link to="/vectors/store">Open Vector Explorer →</Link></div>}
    <ol className="search-hits">{hits.map(hit => <li key={hit.id} className="search-hit">
      <div className="search-hit-heading"><span className="search-rank mono">#{hit.rank}</span><h3>{hit.source_name}</h3><div className="search-score"><small>RAW COSINE</small><output aria-label={`Rank ${hit.rank} cosine`}>{hit.score >= 0 ? '+' : ''}{hit.score.toFixed(6)}</output></div></div>
      <p className="search-snippet">{hit.snippet}{hit.text.length > hit.snippet.length && '…'}</p>
      <div className="search-source-summary"><Badge>Pages {hit.page_start}–{hit.page_end}</Badge><span className="mono">{result.embedding.mode === 'e5' ? 'E5' : 'NOT E5'} · {hit.id}</span></div>
      <dl className="search-source-metadata"><div><dt>Document</dt><dd>{hit.document_id}</dd></div><div><dt>Confirmed version</dt><dd>{hit.version_id}</dd></div><div><dt>Chunk</dt><dd>{hit.chunk_id}</dd></div><div><dt>Model revision</dt><dd>{result.embedding.model_revision}</dd></div></dl>
      <details><summary>Full confirmed chunk text</summary><pre className="search-full-text">{hit.text}</pre></details>
      <div className="search-hit-actions">{hit.source_url.startsWith('/documents?') && <Link className="button" to={hit.source_url}>Open exact source<ArrowUpRight size={14} /></Link>}<Button aria-label={`Copy citation rank ${hit.rank} ${title}`} onClick={() => {
        void navigator.clipboard.writeText(JSON.stringify({ ...hit, target: result.target, retrieval_mode: result.retrieval_mode }, null, 2)).then(() => onNotice('Source text and citation copied.')).catch(() => onNotice('Clipboard unavailable. Select the full chunk text.'))
      }}><Copy size={14} />Copy text / citation</Button></div>
    </li>)}</ol>
  </Panel>
}

export default function SearchLab() {
  const location = useLocation()
  const [tab, setTab] = useState(new URLSearchParams(location.search).get('tab') === 'rag' ? 'rag' : 'semantic')
  return <><div className="rag-tabs" role="tablist" aria-label="Search Lab views">{[
    ['semantic', 'Semantic Search'], ['rag', 'RAG Chat'],
  ].map(([id, label]) => <button key={id} id={`tab-${id}`} role="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={event => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'semantic' : event.key === 'End' ? 'rag' : tab === 'semantic' ? 'rag' : 'semantic'; setTab(next); document.getElementById(`tab-${next}`)?.focus() }
  }}>{label}</button>)}</div><div id="panel-semantic" role="tabpanel" aria-labelledby="tab-semantic" hidden={tab !== 'semantic'}><MotionActive.Provider value={tab === 'semantic'}><SemanticSearch /></MotionActive.Provider></div><div id="panel-rag" role="tabpanel" aria-labelledby="tab-rag" hidden={tab !== 'rag'}>{tab === 'rag' && <LabBoundary label="RAG Chat"><Suspense fallback={<p role="status" className="lab-loading">Opening RAG Chat…</p>}><RagChat /></Suspense></LabBoundary>}</div></>
}

function SemanticSearch() {
  const selection = demoSelection(useLocation().search)
  const [status, setStatus] = useState<SearchStatus | null>(null)
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [indexes, setIndexes] = useState<IndexInfo[]>([])
  const [mode, setMode] = useState<StoreTarget['mode']>('local')
  const [index, setIndex] = useState('')
  const [namespace, setNamespace] = useState(selection.namespace)
  const [namespaces, setNamespaces] = useState<{ namespace: string; count: number }[]>([])
  const [query, setQuery] = useState('')
  const [topK, setTopK] = useState(5)
  const [documentId, setDocumentId] = useState(selection.document)
  const [filename, setFilename] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [compare, setCompare] = useState(false)
  const [liveRead, setLiveRead] = useState(false)
  const [liveCompare, setLiveCompare] = useState(false)
  const [result, setResult] = useState<SearchResult | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const controller = useRef<AbortController | null>(null)
  useEffect(() => {
    let active = true
    Promise.all([searchAPI.status(), documentAPI.list()]).then(([state, list]) => {
      if (active) { setStatus(state); setIndexes(state.local_indexes); setIndex(defaultLocalIndex(state.local_indexes)); setDocuments(list.documents) }
    }).catch(() => { if (active) setError('Search API offline. Start the backend and refresh status.') })
    return () => { active = false; controller.current?.abort() }
  }, [])
  function invalidate() { setResult(null); setNotice(''); setError('') }
  function clearFilters() { setDocumentId(''); setFilename(''); setFrom(''); setTo(''); invalidate() }
  async function run(label: string, operation: (signal: AbortSignal) => Promise<void>) {
    const current = new AbortController(); controller.current = current
    const timer = window.setTimeout(() => current.abort(), 155000)
    setBusy(label); setError(''); setNotice('')
    try { await operation(current.signal) } catch (failure) { setError((failure as Error).message) }
    finally { window.clearTimeout(timer); setBusy('') }
  }
  const pageInvalid = Boolean(from || to) && (!from || !to || !Number.isInteger(Number(from)) || !Number.isInteger(Number(to)) || Number(from) < 1 || Number(from) > Number(to) || Number(to) > 200)
  const fileInvalid = Boolean(filename) && (!filename.trim() || /[/\\:*?"<>|\x00-\x1f]/.test(filename) || filename.length > 120) // eslint-disable-line no-control-regex
  const modelUnavailable = !status || ['not_cached', 'unavailable'].includes(status.model.state)
  const liveAllowed = mode === 'local' || Boolean(status?.live_enabled && status.live_key_configured && liveRead && (!compare || liveCompare))
  const selectedIndex = indexes.find(item => item.name === index)
  const filters: SearchFilters = { ...(documentId ? { document_id: documentId } : {}), ...(filename ? { source_name: filename } : {}), ...(from && to ? { page_from: Number(from), page_to: Number(to) } : {}) }
  return <>
    <div className="page-meta"><Badge>D05 · SEMANTIC SEARCH</Badge><span className="mono">QUESTION → ACTIVE VECTORS → ORIGINAL SOURCE</span></div>
    <div className="documents-title"><div><span className="eyebrow accent">SEARCH LAB</span><h1>Find meaning. Follow the source.</h1><p>Ask in Vietnamese. Inspect ranked chunks, raw cosine and every measured stage. No LLM required.</p></div><Button disabled={Boolean(busy)} onClick={() => void run('Refreshing local readiness…', async () => { const [state, list] = await Promise.all([searchAPI.status(), documentAPI.list()]); setStatus(state); setDocuments(list.documents); if (mode === 'local') { setIndexes(state.local_indexes); if (!index) setIndex(defaultLocalIndex(state.local_indexes)) } })}><RefreshCw size={14} />Refresh search status</Button></div>
    {result && <a className="result-jump" href="#search-results">Jump to {result.hits.length} results and source evidence ↓</a>}
    <div className="search-mode-strip"><Badge tone={mode === 'local' ? 'green' : 'amber'}>{mode === 'local' ? 'LOCAL DEMO' : 'LIVE PINECONE'}</Badge><p>{mode === 'local' ? 'Exact cosine over persisted SQLite vectors in verified ACTIVE manifests. Filters run before Top-K.' : 'LIVE NOT VERIFIED — AWAITING USER AUTHORIZATION. ANN ranking; no automatic cloud reads.'}</p><Badge>RAG · OPTIONAL LOCAL</Badge></div>
    {status?.model.mode === 'test-fixture-not-e5' && <p className="doc-warning">TEST FIXTURE — NOT E5. Deterministic test vectors have no semantic relevance claim.</p>}
    {status && <div className="search-readiness"><Badge>{status.model.state.replace(/_/g, ' ').toUpperCase()}</Badge><span>{status.model.message}</span>{status.model.setup_command && modelUnavailable && <code>{status.model.setup_command}</code>}</div>}
    {error && <div className="doc-message error" role="alert">{error}</div>}
    {notice && <div className="doc-message success" role="status">{notice}</div>}
    {busy && <div className="doc-message" role="status"><LoaderCircle className="spin" size={16} />{busy}<Button onClick={() => controller.current?.abort()}>Cancel search operation</Button></div>}
    <form onSubmit={event => { event.preventDefault(); if (modelUnavailable || !query.trim() || !liveAllowed || !selectedIndex?.compatible || pageInvalid || fileInvalid || busy) return; invalidate(); void run('Embedding query / filtering ACTIVE vectors / retrieving sources…', async signal => { const output = await searchAPI.search({ query, top_k: topK, target: { mode, index, namespace }, filters, compare, confirm_live_read: liveRead, confirm_live_compare: liveCompare }, signal); setResult(output); setStatus(await searchAPI.status()) }) }}>
      <fieldset className="search-form" disabled={Boolean(busy)}><legend className="sr-only">Semantic search controls</legend>
        <Panel className="search-panel"><div className="document-panel-heading"><h2><Search size={18} />Search a verified collection</h2><Badge>query:</Badge></div>
          <label htmlFor="search-query">Question in Vietnamese or another language</label><textarea id="search-query" value={query} maxLength={20000} rows={3} placeholder="Cơ sở dữ liệu vector tìm kiếm theo ngữ nghĩa như thế nào?" onChange={event => { setQuery(event.target.value); invalidate() }} />
          <p className="config-hint">Raw text only; the backend adds query: once. Maximum512 input tokens including prefix/special tokens, with no silent truncation.</p>
          <div className="search-target-grid"><label>Retrieval mode<select aria-label="Retrieval mode" value={mode} onChange={event => { const next = event.target.value as StoreTarget['mode']; setMode(next); setIndexes(next === 'local' ? status?.local_indexes ?? [] : []); setIndex(next === 'local' ? defaultLocalIndex(status?.local_indexes) : ''); setNamespace(''); setNamespaces([]); setLiveRead(false); setLiveCompare(false); setCompare(false); invalidate() }}><option value="local">LOCAL DEMO · exact cosine</option><option value="live">LIVE PINECONE · ANN</option></select></label>
            <label>Search index<select aria-label="Search index" value={index} onChange={event => { setIndex(event.target.value); setNamespaces([]); invalidate() }}><option value="">Choose an index</option>{indexes.map(item => <option key={item.name} value={item.name}>{item.name} · {item.compatible ? '384D/cosine/Ready' : 'INCOMPATIBLE'}</option>)}</select></label>
            <TextField label="Search namespace" value={namespace} maxLength={64} pattern="[a-zA-Z0-9_.-]*" hint="Blank = default namespace. Existing stored vectors only." list="search-namespaces" onChange={event => { setNamespace(event.target.value); invalidate() }} />
            <label>Top-K<select aria-label="Top-K" value={topK} onChange={event => { setTopK(Number(event.target.value)); invalidate() }}>{Array.from({ length: 10 }, (_, i) => <option value={i + 1} key={i}>{i + 1}</option>)}</select></label></div>
          <datalist id="search-namespaces">{namespaces.map(item => <option key={item.namespace} value={item.namespace}>{item.count} stored vectors</option>)}</datalist>
          {mode === 'live' && <div className="search-live-consent"><p>Server opt-in: {status?.live_enabled ? 'enabled by operator' : 'NOT ENABLED'} · key {status?.live_key_configured ? 'configured, not verified' : 'NOT CONFIGURED'}. Verify the project, target and quota before explicit reads; no API key belongs in this page or chat.</p><label className="search-checkbox"><input type="checkbox" checked={liveRead} onChange={event => { setLiveRead(event.target.checked); invalidate() }} />I confirm explicit LIVE discovery/search reads for the selected target.</label></div>}
          <div className="search-actions"><Button type="button" disabled={mode === 'live' && !(liveRead && status?.live_enabled && status.live_key_configured)} onClick={() => void run('Reading index catalog on explicit request…', async () => { const catalog = await searchAPI.indexes(mode, liveRead); setIndexes(catalog.indexes); setIndex(catalog.indexes.find(item => item.compatible)?.name ?? ''); invalidate() })}>Load search indexes</Button><Button type="button" disabled={!index || mode === 'live' && !(liveRead && status?.live_enabled && status.live_key_configured)} onClick={() => void run('Reading observed namespaces…', async () => { setNamespaces((await searchAPI.namespaces({ mode, index, namespace }, liveRead)).namespaces) })}>Read namespace stats</Button></div>
          {!indexes.length && <p className="config-hint">No compatible index loaded. <Link to="/vectors/store">Ingest a confirmed version in Vector Explorer</Link>, then refresh local search status. LIVE discovery is explicit.</p>}
          {!!namespaces.length && <p className="config-hint">Observed namespaces: {namespaces.map(item => `${item.namespace || '(default)'} (${item.count})`).join(' · ')}</p>}
        </Panel>
        <Panel className="search-panel"><div className="document-panel-heading"><h2><Filter size={18} />Filter before ranking</h2><Button type="button" onClick={clearFilters}>Clear filters</Button></div>
          <div className="search-filter-grid"><label>Filter document<select aria-label="Filter document" value={documentId} onChange={event => { setDocumentId(event.target.value); invalidate() }}><option value="">All ACTIVE documents</option>{documents.map(doc => <option key={doc.id} value={doc.id}>{doc.name} · {doc.id.slice(0, 8)}</option>)}</select></label><TextField label="Exact source filename" value={filename} maxLength={120} hint="Unicode as stored, case-sensitive exact match; filenames need not be unique." onChange={event => { setFilename(event.target.value); invalidate() }} /><TextField label="Page from" type="number" min={1} max={200} step={1} value={from} onChange={event => { setFrom(event.target.value); invalidate() }} /><TextField label="Page to" type="number" min={1} max={200} step={1} value={to} onChange={event => { setTo(event.target.value); invalidate() }} /></div>
          <p className="config-hint">Supply both page endpoints (use the same number for one page). Cross-page chunks match any intersection. Local exact search cap: {status?.max_candidates ?? 'checking'} eligible records /32MiB; narrow filters if exceeded.</p>
          {(pageInvalid || fileInvalid) && <p className="doc-warning" role="alert">Invalid filter: use an exact safe filename and both integer page endpoints, 1 ≤ from ≤ to ≤200.</p>}
          <label className="search-checkbox"><input type="checkbox" checked={compare} onChange={event => { setCompare(event.target.checked); setLiveCompare(false); invalidate() }} />Compare with / without filters (same query embedding)</label>
          {mode === 'live' && compare && <label className="search-checkbox"><input type="checkbox" checked={liveCompare} onChange={event => { setLiveCompare(event.target.checked); invalidate() }} />I separately confirm the additional unfiltered LIVE query read.</label>}
          <div className="search-actions"><Button type="submit" className="button-primary" disabled={Boolean(busy) || !query.trim() || modelUnavailable || !selectedIndex?.compatible || !liveAllowed || pageInvalid || fileInvalid}>Search<ArrowUpRight size={15} /></Button><Button type="button" onClick={() => { setQuery(''); setTopK(5); setCompare(false); setLiveCompare(false); clearFilters() }}>Reset query & filters</Button></div>
        </Panel>
      </fieldset>
    </form>
    {result ? <>
      <div id="search-results" tabIndex={-1} className="search-result-heading"><Badge tone="green">{result.retrieval_mode}</Badge><span>{result.score_meaning}</span></div>
      <div className={result.comparison ? 'search-compare-grid' : ''}><HitList title="Filtered results" hits={result.hits} result={result} onNotice={setNotice} />{result.comparison && <HitList title="Without filters" hits={result.comparison} result={result} onNotice={setNotice} />}</div>
      <Panel className="search-panel search-trace" label="Search Trace"><div className="document-panel-heading"><h2><Clock3 size={18} />Search Trace</h2><strong>{timeLabel(result.trace.total_ms)} ms total</strong></div><p>{result.trace.scope}. These are observed process timings, not Pinecone internal telemetry.</p>
        <p className="config-hint">Model {result.embedding.model_id} · {result.embedding.model_revision}<br />Prefix <code>{result.embedding.prefix}</code> · {result.embedding.input_token_count ?? 'not run'} input tokens · {result.embedding.mode === 'e5' ? 'REAL E5' : 'NOT E5'}</p>
        <ol>{result.trace.stages.map((stage, i) => <li key={`${stage.name}-${i}`}><span>{stage.name.replace(/_/g, ' ')}</span><span className="mono">{timeLabel(stage.ms)} ms{stage.status === 'skipped_no_candidates' ? ' · skipped (no candidates)' : ''}</span></li>)}</ol><p className="config-hint">{result.trace.candidate_count} eligible IDs ({result.trace.candidate_count_kind}) · {result.trace.manifest_count} verified ACTIVE manifests · {result.trace.discarded_count} omitted checks. Returned hits are not total matching documents.</p>
        {result.trace.warnings.map(warning => <p className="doc-warning" key={warning}>{warning.replace(/_/g, ' ')}</p>)}
      </Panel>
    </> : <Panel className="search-panel search-empty"><Search size={28} /><h2>Start with an ACTIVE collection.</h2><p>Ingest confirmed chunks in Vector Explorer, then search this namespace. Results and timings appear only after an explicit Search.</p><Link to="/vectors/store">Open Vector Explorer →</Link></Panel>}
  </>
}
