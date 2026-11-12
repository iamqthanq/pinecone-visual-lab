import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Database, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react'
import { Badge, Button, Panel, TextField } from './components'
import { documentAPI } from './documents-api'
import type { DocumentSummary, SourceDocument } from './documents-api'
import { vectorStoreAPI as api } from './vector-store-api'
import type { CreatePreview, Deletion, FetchedVectors, IndexInfo, Manifest, StorePage, StoreStatus, StoreTarget } from './vector-store-api'
import './vectors.css'
import './vector-store.css'

export function StoredVectorInspector({ fetched, onNotice }: { fetched: FetchedVectors; onNotice: (message: string) => void }) {
  const [table, setTable] = useState(false)
  const record = fetched.records[0]
  if (!record) return <Panel className="store-panel"><h2>Vector not found</h2><p>The adapter returned no record for this ID in the selected namespace.</p></Panel>
  const metadata = record.metadata
  return <Panel className="store-panel vector-inspector" label="Stored vector inspector">
    <div className="document-panel-heading"><h2>Fetched vector</h2><Badge tone="green">{record.values.length} DIMENSIONS</Badge></div>
    <p className="mono store-id">{record.id}</p><p className="config-hint">Actual {fetched.data_origin} · {fetched.target.index} / {fetched.target.namespace || '(default namespace)'}</p>
    {metadata.embedding_mode !== 'e5' && <p className="doc-warning">NOT E5 / unverified origin. Fixture vectors are not semantic embeddings.</p>}
    <div className="vector-metrics"><span><small>L2 NORM</small><strong>{Math.hypot(...record.values).toFixed(6)}</strong></span><span><small>MODEL</small><strong>{String(metadata.model_id ?? 'Not supplied')}</strong></span></div>
    <dl className="store-metadata">{Object.entries(metadata).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl>
    <div className="vector-view-controls"><div role="group" aria-label="Stored vector view"><Button aria-pressed={!table} onClick={() => setTable(false)}>Heatmap</Button><Button aria-pressed={table} onClick={() => setTable(true)}>Table</Button></div><Button onClick={() => {
      void navigator.clipboard.writeText(JSON.stringify({ ...record, target: fetched.target, data_origin: fetched.data_origin })).then(() => onNotice('Full stored vector JSON copied.')).catch(() => onNotice('Clipboard unavailable. Select values from the table.'))
    }}>Copy stored vector JSON</Button></div>
    {table ? <div className="vector-table-scroll" tabIndex={0} role="region" aria-label="Stored vector numeric values"><table><caption>All 384 dimensions · zero-based index</caption><thead><tr><th scope="col">Dimension</th><th scope="col">Value</th></tr></thead><tbody>{record.values.map((value, index) => <tr key={index}><th scope="row">{index}</th><td>{value.toPrecision(9)}</td></tr>)}</tbody></table></div>
      : <><div className="vector-heatmap" role="group" aria-label="Stored vector 384 dimensions">{record.values.map((value, index) => <span key={index} role="img" aria-label={`Dimension ${index}: ${value.toFixed(6)}`} title={`${index}: ${value}`} style={{ background: value >= 0 ? `rgba(124,231,203,${0.15 + Math.min(0.85, Math.abs(value) * 5)})` : `rgba(158,142,247,${0.15 + Math.min(0.85, Math.abs(value) * 5)})` }} />)}</div><p className="config-hint">Indices 0–383, row by row. Mint ≥ 0; violet &lt; 0. Color encodes magnitude. Table exposes every numeric value.</p></>}
    <p className="config-hint">A fetched record proves storage, not search quality. Cosine is geometry, not a probability. Top-k search comes in D05. <Link to="/documents">Inspect original documents</Link>.</p>
  </Panel>
}

export default function VectorStoreLab() {
  const [status, setStatus] = useState<StoreStatus | null>(null)
  const [mode, setMode] = useState<StoreTarget['mode']>('local')
  const [indexes, setIndexes] = useState<IndexInfo[]>([])
  const [index, setIndex] = useState('local-e5')
  const [namespace, setNamespace] = useState('')
  const [target, setTarget] = useState<StoreTarget | null>(null)
  const [namespaces, setNamespaces] = useState<{ namespace: string; count: number }[]>([])
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [doc, setDoc] = useState<SourceDocument | null>(null)
  const [version, setVersion] = useState('')
  const [jobs, setJobs] = useState<Manifest[]>([])
  const [job, setJob] = useState<Manifest | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [page, setPage] = useState<StorePage | null>(null)
  const [fetched, setFetched] = useState<FetchedVectors | null>(null)
  const [deletion, setDeletion] = useState<Deletion | null>(null)
  const [deleteConfirmed, setDeleteConfirmed] = useState(false)
  const [newName, setNewName] = useState('')
  const [cloud, setCloud] = useState('aws')
  const [region, setRegion] = useState('us-east-1')
  const [create, setCreate] = useState<CreatePreview | null>(null)
  const [createConfirmed, setCreateConfirmed] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const controller = useRef<AbortController | null>(null)
  useEffect(() => {
    let active = true
    Promise.all([api.status(), api.indexes('local'), documentAPI.list()]).then(([state, catalog, list]) => {
      if (active) { setStatus(state); setIndexes(catalog.indexes); setDocuments(list.documents) }
    }).catch(() => { if (active) setError('Cannot reach the vector API. Start the backend and refresh.') })
    return () => { active = false; controller.current?.abort() }
  }, [])
  async function run(label: string, operation: (signal: AbortSignal) => Promise<void>) {
    const current = new AbortController(); controller.current = current
    const timer = window.setTimeout(() => current.abort(), 600000)
    setBusy(label); setError(''); setNotice('')
    try { await operation(current.signal) } catch (failure) { setError((failure as Error).message) }
    finally { window.clearTimeout(timer); setBusy('') }
  }
  function clearTarget() {
    setTarget(null); setPage(null); setFetched(null); setNamespaces([]); setJobs([]); setJob(null)
    setDeletion(null); setConfirmed(false); setDeleteConfirmed(false); setCreate(null); setCreateConfirmed(false); setNotice(''); setError('')
  }
  async function load(selected: StoreTarget) {
    const [listed, history, spaces] = await Promise.all([api.list(selected), api.jobs(selected), api.namespaces(selected)])
    setTarget(selected); setPage(listed); setJobs(history.jobs); setNamespaces(spaces.namespaces); setFetched(null)
  }
  const info = indexes.find(item => item.name === index)
  const fixture = status?.embedding_mode !== 'e5'
  return <>
    <div className="page-meta"><Badge>D04 · VECTOR STORAGE</Badge><Link className="text-link" to="/vectors"><ArrowLeft size={14} />Embedding inspector</Link></div>
    <div className="documents-title"><div><span className="eyebrow accent">VECTORS LAB / VECTOR EXPLORER</span><h1>Follow vectors into storage.</h1><p>Confirmed chunks → bounded batches → verified storage. Every record keeps its source.</p></div><Database size={32} aria-hidden="true" /></div>
    <div className="store-safety"><ShieldCheck size={20} /><div><strong>{mode === 'local' ? 'LOCAL DEMO · SQLite on this device' : 'LIVE PINECONE · explicit cloud operations'}</strong><p>{mode === 'local' ? 'Persistent local vectors. No Pinecone traffic in this mode.' : 'LIVE NOT VERIFIED — AWAITING USER AUTHORIZATION. Backend-only key; separate exact-target server approval required for writes.'}</p></div></div>
    {fixture && status && <p className="doc-warning">TEST FIXTURE — NOT E5. This runtime cannot upload fixture vectors to LIVE.</p>}
    {error && <div className="doc-message error" role="alert">{error}</div>}
    {notice && <div className="doc-message success" role="status">{notice}</div>}
    {busy && <div className="doc-message" role="status"><LoaderCircle className="spin" size={16} />{busy}<Button onClick={() => controller.current?.abort()}>Pause operation</Button></div>}
    <fieldset disabled={Boolean(busy)} className="store-controls"><legend className="sr-only">Vector storage operations</legend>
      <Panel className="store-panel" label="Storage target"><div className="document-panel-heading"><h2>1. Choose a storage target</h2><Badge>{mode === 'local' ? 'LOCAL DEMO' : 'LIVE PINECONE'}</Badge></div>
        <div className="store-target-grid"><label>Storage mode<select aria-label="Storage mode" value={mode} onChange={event => { setMode(event.target.value as StoreTarget['mode']); setIndexes([]); setIndex(''); clearTarget() }}><option value="local">LOCAL DEMO · SQLite</option><option value="live">LIVE PINECONE · Cloud</option></select></label>
          <label>Index<select aria-label="Index" value={index} onChange={event => { setIndex(event.target.value); clearTarget() }}><option value="">Choose an index</option>{indexes.map(item => <option key={item.name} value={item.name}>{item.name} · {item.compatible ? '384D / cosine / Ready' : 'INCOMPATIBLE OR NOT READY'}</option>)}</select></label>
          <TextField label="Namespace" value={namespace} maxLength={64} pattern="[a-zA-Z0-9_.-]*" hint="Blank = default. Letters, digits, dot, dash, underscore." onChange={event => { setNamespace(event.target.value); clearTarget() }} />
        </div>
        <div className="store-actions"><Button onClick={() => void run(mode === 'live' ? 'Explicitly connecting to LIVE control plane…' : 'Loading local indexes…', async () => {
          const [catalog, state] = await Promise.all([api.indexes(mode), api.status()]); setIndexes(catalog.indexes); setStatus(state); setIndex(catalog.indexes.find(item => item.compatible)?.name ?? ''); clearTarget()
        })}><RefreshCw size={14} />{mode === 'live' ? 'Connect / list LIVE indexes' : 'Refresh local indexes'}</Button>
          <Button className="button-primary" disabled={!info?.compatible || !/^[a-zA-Z0-9_.-]{0,64}$/.test(namespace)} onClick={() => void run('Loading actual adapter records…', async () => { await load({ mode, index, namespace }) })}>Load namespace</Button></div>
        {info && <p className="config-hint">{info.dimension ?? 'Unknown'} dimensions · {info.metric ?? 'Unknown metric'} · {info.ready ? 'Ready' : 'Not Ready'} · {info.cloud}/{info.region} · {info.data_origin}</p>}
        {mode === 'live' && <p className="doc-warning">Key {status?.live_key_configured ? 'configured on server' : 'not configured'}. Project label: {status?.project || 'not configured'} (operator supplied; verify the API key project in Pinecone console). SDK {status?.sdk_version} / API {status?.api_version}. Changing mode alone makes no cloud request.</p>}
        {target && <><p className="store-current mono">Loaded: {target.mode.toUpperCase()} / {target.index} / {target.namespace || '(default)'}</p><p className="config-hint">Observed namespaces: {namespaces.length ? namespaces.map(item => `${item.namespace || '(default)'} (${item.count})`).join(' · ') : 'None with stored records. A namespace appears after its first successful upsert.'}</p></>}
        <details className="store-create"><summary>Create an index · preview first</summary><TextField label="New index name" value={newName} maxLength={45} onChange={event => { setNewName(event.target.value); setCreate(null); setCreateConfirmed(false) }} />
          {mode === 'live' && <div className="store-target-grid"><label>Cloud<select aria-label="Cloud" value={cloud} onChange={event => { setCloud(event.target.value); setCreate(null); setCreateConfirmed(false) }}><option value="aws">AWS</option><option value="gcp">GCP</option><option value="azure">Azure</option></select></label><TextField label="Region" value={region} onChange={event => { setRegion(event.target.value); setCreate(null); setCreateConfirmed(false) }} /></div>}
          <Button disabled={!/^[a-z0-9](?:[a-z0-9-]{0,43}[a-z0-9])?$/.test(newName)} onClick={() => void run('Previewing index configuration; no index is being created…', async () => { setCreate(await api.createPreview({ mode, index: newName, namespace: '' }, mode === 'local' ? 'local' : cloud, mode === 'local' ? 'this-device' : region)); setCreateConfirmed(false) })}>Preview new index</Button>
          {create && <div className="store-confirm"><p>{create.target.mode.toUpperCase()} / {create.project || '(project label missing)'} / {create.target.index} · {create.cloud}/{create.region} · {create.dimension}D / {create.metric}</p><p>{create.risk}</p><label><input type="checkbox" checked={createConfirmed} onChange={event => setCreateConfirmed(event.target.checked)} />I confirm this exact index configuration and have reviewed quota/cost.</label><Button disabled={!createConfirmed} onClick={() => void run('Creating the confirmed index…', async () => { const made = await api.createConfirm(create.preview_id); setCreate(null); setCreateConfirmed(false); setIndexes((await api.indexes(mode)).indexes); setIndex(made.name); clearTarget(); setNotice(made.ready ? 'Index created and Ready. Load a namespace to continue.' : 'Index submitted; not Ready yet. Refresh indexes later.') })}>Confirm create index</Button></div>}
        </details>
      </Panel>
      <div className="store-work-grid"><Panel className="store-panel" label="Ingest confirmed chunks"><h2>2. Preview a confirmed version</h2><p className="config-hint">Preview creates a local manifest only. Generate/upsert begins after explicit confirmation. Drafts are excluded.</p>
        <label>Source document<select aria-label="Source document" value={doc?.id ?? ''} onChange={event => { const id = event.target.value; setDoc(null); setVersion(''); setConfirmed(false); if (id) void run('Loading source metadata…', async () => { setDoc(await documentAPI.get(id)) }) }}><option value="">Choose a document</option>{documents.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {!documents.length && <p className="config-hint">No source documents. <Link to="/documents">Upload and confirm chunks first</Link>.</p>}
        <label>Confirmed source version<select aria-label="Confirmed source version" value={version} onChange={event => { setVersion(event.target.value); setConfirmed(false) }}><option value="">Choose a confirmed version</option>{doc?.versions.filter(item => item.state === 'confirmed').map(item => <option key={item.id} value={item.id}>Version {item.version} · {item.config.size}/{item.config.overlap}</option>)}</select></label>
        <Button disabled={!target || !doc || !version || mode === 'live' && fixture} onClick={() => { if (target && doc) void run('Creating a source-linked manifest…', async () => { const preview = await api.preview(target, doc.id, version); setJob(preview); setConfirmed(false); setDeletion(null); setJobs((await api.jobs(target)).jobs) }) }}>Preview ingest</Button>
      </Panel>
      <Panel className="store-panel" label="Manifest progress"><h2>3. Confirm, ingest and verify</h2>
        <label>Saved manifest<select aria-label="Saved manifest" value={job?.id ?? ''} onChange={event => { setJob(jobs.find(item => item.id === event.target.value) ?? null); setDeletion(null); setDeleteConfirmed(false); setConfirmed(false) }}><option value="">Choose a manifest</option>{jobs.map(item => <option key={item.id} value={item.id}>{item.id.slice(0, 8)} · {item.state} · {item.count} vectors</option>)}</select></label>
        {job ? <><p className="mono store-id">Manifest {job.id}<br />Document {job.document_id}<br />Version {job.version_id}</p><Badge tone={job.state === 'active' ? 'green' : 'muted'}>{job.state.toUpperCase()}</Badge><p className="config-hint">Exact target: {job.target.mode.toUpperCase()} / {job.target.index} / {job.target.namespace || '(default)'} · {job.count} owned IDs</p>
          <label htmlFor="ingest-progress">Upserted {job.checkpoint}/{job.count} · verified {job.verified}/{job.count} · retries {job.retries}</label><progress id="ingest-progress" max={job.count * 2 || 1} value={job.checkpoint + job.verified} />
          <p className="config-hint">Active changes only after every vector is fetched and verified. Earlier active versions remain available on failure.</p>
          {job.error_code && <p className="doc-warning">Last error: {job.error_code}. Refresh manifest and resume completed checkpoints.</p>}
          {!['active', 'superseded', 'deleted', 'deleting'].includes(job.state) && <><label className="store-checkbox"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I confirm this exact target, source version and {job.count} record IDs.</label><details><summary>Exact manifest IDs</summary><pre className="store-id-list">{job.ids.join('\n')}</pre></details><Button className="button-primary" disabled={!confirmed} onClick={() => void run('Generating / upserting bounded batches, then verifying…', async signal => {
            let current = await api.job(job.id); setJob(current)
            for (let step = 0; step < 1300 && !signal.aborted; step++) {
              if (['active', 'superseded'].includes(current.state)) { await load(current.target); setNotice(current.state === 'active' ? 'All records fetched and verified. Manifest ACTIVE.' : 'This manifest is historical / superseded.'); return }
              current = await api.step(current, signal); setJob(current)
            }
            throw new Error('Batch run paused at its safety limit. Refresh manifest and resume.')
          })}>Confirm / resume ingest</Button></>}
          <Button onClick={() => void run('Refreshing durable checkpoint…', async () => { setJob(await api.job(job.id)) })}>Refresh manifest</Button>
          {job.state !== 'deleted' && <Button onClick={() => void run('Previewing exact owned IDs; nothing is deleted…', async () => { setDeletion(await api.deletePreview(job.id)); setDeleteConfirmed(false) })}>Preview owned-vector deletion</Button>}
        </> : <p className="store-empty">Choose a confirmed source and preview ingest, or load a saved manifest. No vectors have been inferred from this view.</p>}
      </Panel></div>
      {deletion && <Panel className="store-panel store-delete" label="Exact deletion preview"><h2>Delete preview · exact owned vectors</h2><p className="mono">{deletion.target.mode.toUpperCase()} / {deletion.target.index} / {deletion.target.namespace || '(default)'}</p><p>{deletion.count} manifest IDs; some may be absent. Documents and other generations remain. An active manifest is retired as soon as deletion starts.</p><pre className="store-id-list">{deletion.ids?.join('\n')}</pre><label className="store-checkbox"><input type="checkbox" checked={deleteConfirmed} onChange={event => setDeleteConfirmed(event.target.checked)} />Delete only these exact owned IDs in the displayed target.</label><Button disabled={!deleteConfirmed || deletion.state === 'deleted'} onClick={() => void run('Deleting owned IDs and verifying their absence…', async signal => {
        for (let step = 0; step < 650 && !signal.aborted; step++) {
          const result = await api.deleteStep(deletion.id, signal); setDeletion({ ...deletion, ...result })
          if (result.state === 'deleted') { if (target) await load(target); if (job) setJob(await api.job(job.id)); setNotice('Owned vectors deleted and absence verified. Source documents preserved.'); return }
        }
        throw new Error('Deletion paused at its safety limit; resume the same preview.')
      })}>Confirm exact deletion</Button><p role="status">Deletion {deletion.state} · {deletion.checkpoint}/{deletion.count}</p></Panel>}
      <Panel className="store-panel" label="Adapter vector records"><div className="document-panel-heading"><h2>4. Explore stored records</h2><Badge>{page?.data_origin ?? 'NOT LOADED'}</Badge></div>
        <div className="store-actions"><Button disabled={!target} onClick={() => { if (target) void run('Refreshing adapter records…', async () => { await load(target) }) }}>Refresh records</Button><Button disabled={!target || !page?.next} onClick={() => { if (target && page?.next) void run('Loading next page…', async () => { setPage(await api.list(target, page.next)); setFetched(null) }) }}>Next page</Button></div>
        {!page?.ids.length ? <p className="store-empty">{target ? 'No vector IDs in this namespace. Ingest a confirmed version to populate it.' : 'Load a namespace to fetch actual adapter records.'}</p> : <ul className="store-records">{page.ids.map(id => <li key={id}><Button aria-label={`Fetch vector ${id}`} onClick={() => { if (target) void run('Fetching actual vector values and source metadata…', async () => { setFetched(await api.fetch(target, id)) }) }}><span className="mono">{id}</span><span>Fetch →</span></Button></li>)}</ul>}
      </Panel>
    </fieldset>
    {fetched && <StoredVectorInspector key={fetched.records[0]?.id ?? 'missing'} fetched={fetched} onNotice={setNotice} />}
  </>
}
