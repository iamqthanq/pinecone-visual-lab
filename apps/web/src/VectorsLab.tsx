import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Braces, Check, Copy, LoaderCircle, RefreshCw, X } from 'lucide-react'
import { Badge, Button, Panel } from './components'
import { documentAPI } from './documents-api'
import type { ChunkVersion, DocumentSummary, SourceDocument } from './documents-api'
import { embeddingAPI } from './embeddings-api'
import type { EmbeddingRecord, ModelStatus, Similarity } from './embeddings-api'
import './vectors.css'

export function VectorInspector({ record, title, onNotice }: { record: EmbeddingRecord; title: string; onNotice: (text: string) => void }) {
  const [view, setView] = useState('heatmap')
  return <Panel className="vector-inspector" label={title}>
    <div className="document-panel-heading"><h2><Braces size={18} />{title}</h2><Badge tone="green">{record.dimension} DIMENSIONS</Badge></div>
    <p className="vector-model mono">{record.model_id} · {record.model_revision}</p>
    {record.mode !== 'e5' && <p className="doc-warning">TEST FIXTURE — NOT E5. These vectors do not encode semantic meaning.</p>}
    <div className="vector-metrics"><span><small>INPUT</small><strong>{record.input_token_count} tokens</strong></span><span><small>L2 NORM</small><strong>{record.norm.toFixed(6)}</strong></span><span><small>INFERENCE · BATCH {record.batch_size}</small><strong>{record.inference_ms.toFixed(1)} ms{record.cached ? ' · cached' : ''}</strong></span><span><small>LOAD · THIS RECORD</small><strong>{record.load_ms.toFixed(1)} ms</strong></span></div>
    <p className="config-hint">Prefix <code>{record.prefix}</code> · L2 normalized · CPU / float32 · min {Math.min(...record.values).toFixed(5)} / max {Math.max(...record.values).toFixed(5)}</p>
    {record.source_chunk_id && <p className="vector-provenance mono">Document {record.source_document_id}<br />Version {record.source_version_id}<br />Chunk {record.source_chunk_id} · pages {record.page_start}–{record.page_end}</p>}
    <div className="vector-view-controls"><div role="group" aria-label={`${title} view`}><Button aria-pressed={view === 'heatmap'} onClick={() => setView('heatmap')}>Heatmap</Button><Button aria-pressed={view === 'table'} onClick={() => setView('table')}>Table</Button></div><Button aria-label={`Copy ${title}`} onClick={() => {
      void navigator.clipboard.writeText(JSON.stringify(record)).then(() => onNotice('Full 384D vector JSON copied.')).catch(() => onNotice('Clipboard unavailable. Use the vector table to select values.'))
    }}><Copy size={15} />Copy vector JSON</Button></div>
    {view === 'heatmap' ? <><div className="vector-heatmap" role="group" aria-label={`${title} 384 dimensions`}>{record.values.map((value, index) => <span role="img" key={index} title={`Dimension ${index}: ${value}`} aria-label={`Dimension ${index}: ${value.toFixed(6)}`} style={{ background: value >= 0 ? `rgba(124,231,203,${0.15+Math.min(0.85, Math.abs(value)*5)})` : `rgba(158,142,247,${0.15+Math.min(0.85, Math.abs(value)*5)})` }} />)}</div><p className="config-hint">Indices 0–383, row by row. Mint ≥ 0 · violet &lt; 0. Color strength is magnitude. This is the full vector, not a 2D projection; use Table for every value.</p></>
      : <div className="vector-table-scroll" tabIndex={0} role="region" aria-label={`${title} numeric values`}><table><caption>All 384 dimensions · zero-based index</caption><thead><tr><th scope="col">Dimension</th><th scope="col">Value</th></tr></thead><tbody>{record.values.map((value, index) => <tr key={index}><th scope="row">{index}</th><td>{value.toPrecision(9)}</td></tr>)}</tbody></table></div>}
    <p className="config-hint">Whole-batch inference timing; no invented per-item latencies. Cached records retain their original measurement.</p>
  </Panel>
}

export default function VectorsLab() {
  const [status, setStatus] = useState<ModelStatus | null>(null)
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [doc, setDoc] = useState<SourceDocument | null>(null)
  const [version, setVersion] = useState<ChunkVersion | null>(null)
  const [chunkId, setChunkId] = useState('')
  const [passage, setPassage] = useState<EmbeddingRecord | null>(null)
  const [query, setQuery] = useState('Cơ sở dữ liệu vector hoạt động như thế nào?')
  const [queryRecord, setQueryRecord] = useState<EmbeddingRecord | null>(null)
  const [sentenceA, setSentenceA] = useState('Tôi đang học về cơ sở dữ liệu vector.')
  const [sentenceB, setSentenceB] = useState('Tôi tìm hiểu cách lưu trữ và tìm kiếm vector.')
  const [score, setScore] = useState<Similarity | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const controller = useRef<AbortController | null>(null)
  useEffect(() => {
    let active = true
    Promise.all([embeddingAPI.status(), documentAPI.list()]).then(([model, list]) => {
      if (active) { setStatus(model); setDocuments(list.documents) }
    }).catch(() => { if (active) setError('Cannot reach the local API. Start the backend and refresh.') })
    return () => { active = false; controller.current?.abort() }
  }, [])
  useEffect(() => {
    if (!busy) return
    const timer = window.setInterval(() => { void embeddingAPI.status().then(setStatus).catch(() => {}) }, 1000)
    return () => window.clearInterval(timer)
  }, [busy])
  const canRun = status && !['not_cached', 'unavailable'].includes(status.state) && !busy
  async function run(label: string, operation: (signal: AbortSignal) => Promise<void>) {
    controller.current?.abort(); const request = new AbortController(); controller.current = request
    const timeout = window.setTimeout(() => request.abort(), 130000)
    setBusy(label); setError(''); setNotice('')
    try { await operation(request.signal) }
    catch (failure) { setError(request.signal.aborted ? 'Operation cancelled or timed out. Refresh model status and retry.' : (failure as Error).message) }
    finally { window.clearTimeout(timeout); setBusy(''); void embeddingAPI.status().then(setStatus).catch(() => {}) }
  }
  async function selectDocument(id: string) {
    setDoc(null); setVersion(null); setChunkId(''); setPassage(null); setScore(null)
    if (id) await run('Loading confirmed source…', async () => { setDoc(await documentAPI.get(id)) })
  }
  async function selectVersion(id: string) {
    setVersion(null); setChunkId(''); setPassage(null); setScore(null)
    if (doc && id) await run('Loading confirmed chunks…', async () => { setVersion(await documentAPI.version(doc.id, id)) })
  }
  const chunk = version?.chunks.find(item => item.chunk_id === chunkId)
  return <>
    <div className="page-meta"><Badge>D03 · LOCAL EMBEDDINGS</Badge><Link className="text-link" to="/vectors/store">Open Vector Explorer →</Link></div>
    <div className="documents-title"><div><span className="eyebrow accent">VECTORS LAB</span><h1>Turn text into coordinates.</h1><p>Run E5 on this computer. Inspect the numbers before any vector database.</p></div><Button disabled={Boolean(busy)} onClick={() => { void run('Refreshing local status…', async () => { const [model, list] = await Promise.all([embeddingAPI.status(), documentAPI.list()]); setStatus(model); setDocuments(list.documents) }) }}><RefreshCw size={15} />Refresh status</Button></div>
    {error && <div className="doc-message error" role="alert">{error}<Button aria-label="Dismiss error" onClick={() => setError('')}><X size={15} /></Button></div>}
    {notice && <div className="doc-message success" role="status"><Check size={16} />{notice}</div>}
    {busy && <div className="doc-message" role="status"><LoaderCircle size={16} className="spin" />{busy} {status?.state === 'loading' && 'Initializing verified model…'}<Button onClick={() => controller.current?.abort()}>Cancel operation</Button></div>}
    <Panel className="model-panel"><div className="document-panel-heading"><h2>Local model</h2><Badge tone={status?.state === 'loaded' ? 'green' : 'muted'}>{status?.mode === 'test-fixture-not-e5' ? 'TEST FIXTURE — NOT E5' : status?.state.replace(/_/g, ' ').toUpperCase() ?? 'CHECKING'}</Badge></div><p className="vector-model mono">{status?.model_id ?? 'intfloat/multilingual-e5-small'} · {status?.model_revision ?? 'Checking revision…'}</p><p>{status?.message ?? 'Checking local cache without loading weights…'}</p>
      {status?.setup_command && status.state !== 'loaded' && <p className="config-hint">Explicit setup, once approved: <code>{status.setup_command}</code> · ~471 MB weights; this page never downloads them.</p>}
      <p className="config-hint">CPU · 384 dimensions · masked mean + L2 · max 512 input tokens · one bounded worker. Cached does not mean loaded.</p></Panel>
    <div className="embedding-input-grid">
      <Panel className="embedding-source"><div className="document-panel-heading"><h2>1. Embed a confirmed chunk</h2><Badge>passage:</Badge></div>
        <label>Document<select aria-label="Embedding document" disabled={Boolean(busy)} value={doc?.id ?? ''} onChange={event => void selectDocument(event.target.value)}><option value="">Choose a document</option>{documents.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {!documents.length && <p className="config-hint">No local documents. <Link to="/documents">Upload and confirm chunks in Documents Lab.</Link></p>}
        {doc && <label>Confirmed version<select aria-label="Embedding confirmed version" disabled={Boolean(busy)} value={version?.id ?? ''} onChange={event => void selectVersion(event.target.value)}><option value="">Choose a confirmed version</option>{doc.versions.filter(item => item.state === 'confirmed').map(item => <option key={item.id} value={item.id}>Version {item.version} · {item.config.size}/{item.config.overlap}</option>)}</select></label>}
        {doc && !doc.versions.some(item => item.state === 'confirmed') && <p className="doc-warning">No confirmed chunks. Confirm a preview in Documents Lab first; drafts are never stored embeddings.</p>}
        {version && <label>Source chunk<select aria-label="Embedding source chunk" disabled={Boolean(busy)} value={chunkId} onChange={event => { setChunkId(event.target.value); setPassage(null); setScore(null) }}><option value="">Choose a chunk</option>{version.chunks.map(item => <option key={item.chunk_id} value={item.chunk_id}>Chunk {item.index+1} · pages {item.page_start}–{item.page_end} · {item.token_count} tokens</option>)}</select></label>}
        {chunk && <pre className="embedding-source-text" tabIndex={0} aria-label="Embedding source text">{chunk.text}</pre>}
        <Button className="button-primary" disabled={!canRun || !chunk || !doc || !version} onClick={() => { if (doc && version && chunk) void run('Loading model / running passage inference…', async signal => { const result = await embeddingAPI.chunks(doc.id, version.id, [chunk], signal); setPassage(result.records[0]); setNotice('Confirmed source embedding ready. No Pinecone upsert performed.') }) }}>Generate Embedding<Braces size={16} /></Button>
      </Panel>
      <Panel className="embedding-query"><div className="document-panel-heading"><h2>2. Embed a query</h2><Badge>query:</Badge></div><label htmlFor="embedding-query">Vietnamese or multilingual query</label><textarea id="embedding-query" value={query} maxLength={20000} disabled={Boolean(busy)} onChange={event => { setQuery(event.target.value); setQueryRecord(null); setScore(null) }} />
        <p className="config-hint">Enter raw text. The API adds query: once and counts special tokens. Oversized input is rejected, never silently truncated. Queries are not saved.</p>
        <Button className="button-primary" disabled={!canRun || !query.trim()} onClick={() => void run('Running query inference…', async signal => { const result = await embeddingAPI.encode([query], signal); setQueryRecord(result.records[0]); setNotice('Query embedding ready; not persisted.') })}>Generate query embedding</Button>
        <Button disabled={!canRun || !passage || !queryRecord} onClick={() => { if (passage && queryRecord) void run('Comparing query and chunk…', async signal => { setScore(await embeddingAPI.compare(queryRecord, passage, signal)) }) }}>Compare query with chunk</Button>
        <p className="config-hint">passage: represents document content. query: represents the information need. Both share the model/revision; prefixes are different.</p>
      </Panel>
    </div>
    {(passage || queryRecord) && <div className="vector-results">{passage && <VectorInspector record={passage} title="Passage vector" onNotice={setNotice} />}{queryRecord && <VectorInspector record={queryRecord} title="Query vector" onNotice={setNotice} />}</div>}
    <Panel className="cosine-lab"><div className="document-panel-heading"><h2>3. Similar words. Measured geometry.</h2><Badge>COSINE MINI-LAB</Badge></div><p>Compare two query-prefixed sentences. This observed experiment is not a universal ranking guarantee.</p>
      <div className="cosine-presets"><Button disabled={Boolean(busy)} onClick={() => { setSentenceB('Tôi tìm hiểu cách lưu trữ và tìm kiếm vector.'); setScore(null) }}>Related pair</Button><Button disabled={Boolean(busy)} onClick={() => { setSentenceB('Tôi nướng bánh mì cho bữa sáng.'); setScore(null) }}>Unrelated pair</Button></div>
      <div className="sentence-grid"><label>Sentence A<textarea aria-label="Sentence A" maxLength={20000} disabled={Boolean(busy)} value={sentenceA} onChange={event => { setSentenceA(event.target.value); setScore(null) }} /></label><label>Sentence B<textarea aria-label="Sentence B" maxLength={20000} disabled={Boolean(busy)} value={sentenceB} onChange={event => { setSentenceB(event.target.value); setScore(null) }} /></label></div>
      <Button className="button-primary" disabled={!canRun || !sentenceA.trim() || !sentenceB.trim()} onClick={() => void run('Embedding sentence batch / computing cosine…', async signal => { const result = await embeddingAPI.encode([sentenceA, sentenceB], signal); setScore(await embeddingAPI.compare(result.records[0], result.records[1], signal)) })}>Compare sentences</Button>
      {score && <div className="cosine-result" role="status"><span>RAW COSINE · {score.mode === 'e5' ? 'LOCAL E5' : 'TEST FIXTURE — NOT E5'}</span><output aria-label="Cosine similarity">{score.cosine.toFixed(6)}</output><p>{score.meaning}</p></div>}
      <p className="config-hint">Embedding = a 384D representation. Cosine = a geometric comparison in [-1,+1], not probability. D04 Vector Explorer stores and fetches confirmed vectors. Top-k search comes in D05. No Pinecone operation occurs in this embedding view.</p>
    </Panel>
  </>
}
