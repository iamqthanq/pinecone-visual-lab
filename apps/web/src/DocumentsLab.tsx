import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Check, ChevronLeft, ChevronRight, Copy, Download, FileText, LoaderCircle, RefreshCw, Split, Trash2, Upload, X } from 'lucide-react'
import { Badge, Button, Panel, TextField } from './components'
import { documentAPI } from './documents-api'
import type { ChunkVersion, DocumentSummary, SourceDocument, TokenizerStatus } from './documents-api'
import './documents.css'
import { parseDocumentLink } from './document-link'
import { demoSelection } from './guided-state'
import { useDataMotion } from './useDataMotion'

export default function DocumentsLab() {
  const location = useLocation()
  return <DocumentWorkbench key={location.search} search={location.search} />
}

function DocumentWorkbench({ search }: { search: string }) {
  const deepLink = useMemo(() => parseDocumentLink(search), [search])
  const guidedSource = useMemo(() => demoSelection(search), [search])
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [selected, setSelected] = useState(deepLink.source?.document ?? demoSelection(search).document)
  const [doc, setDoc] = useState<SourceDocument | null>(null)
  const [tokenizer, setTokenizer] = useState<TokenizerStatus | null>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState(deepLink.error ?? '')
  const [pageIndex, setPageIndex] = useState(0)
  const [raw, setRaw] = useState(false)
  const [size, setSize] = useState(300)
  const [overlap, setOverlap] = useState(50)
  const [version, setVersion] = useState<ChunkVersion | null>(null)
  const [chunkIndex, setChunkIndex] = useState(0)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [drag, setDrag] = useState(false)
  const [cap, setCap] = useState(10 * 1024 * 1024)
  const chooser = useRef<HTMLInputElement>(null)
  const confirmation = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (!deleteOpen || !confirmation.current) return
    const dialog = confirmation.current
    const prior = document.activeElement as HTMLElement | null
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
    dialog.querySelector<HTMLButtonElement>('[data-cancel]')?.focus()
    return () => {
      if (dialog.open && typeof dialog.close === 'function') dialog.close()
      if (prior?.isConnected) prior.focus()
    }
  }, [deleteOpen])
  const content = useRef<HTMLDivElement>(null)
  useDataMotion(content, version?.id, { selector: '.chunk-list > button, .chunk-detail' })
  const generation = useRef(0)

  const reload = useCallback(async () => {
    try {
      const [list, status] = await Promise.all([documentAPI.list(), documentAPI.tokenizer()])
      setDocuments(list.documents); setCap(list.max_file_bytes); setTokenizer(status); setReady(true)
      setError('')
    } catch (failure) { setError((failure as Error).message); setReady(false) }
  }, [])
  useEffect(() => {
    let active = true
    Promise.all([documentAPI.list(), documentAPI.tokenizer()]).then(([list, status]) => {
      if (active) { setDocuments(list.documents); setCap(list.max_file_bytes); setTokenizer(status); setReady(true) }
    }).catch(failure => { if (active) { setError((failure as Error).message); setReady(false) } })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!selected) return
    const controller = new AbortController()
    const current = ++generation.current
    documentAPI.get(selected, controller.signal).then(async source => {
      let saved: ChunkVersion | null = null
      const linked = deepLink.source?.document === selected ? deepLink.source : undefined
      const guidedVersion = guidedSource.document === selected ? guidedSource.version : ''
      const savedId = linked?.version ?? (guidedVersion || source.confirmed_id || source.versions[0]?.id)
      if (savedId) saved = await documentAPI.version(source.id, savedId, controller.signal)
      const linkedIndex = linked ? saved?.chunks.findIndex(item => item.chunk_id === linked.chunk) ?? -1 : 0
      if (linked && (!saved || saved.state !== 'confirmed' || linkedIndex < 0
        || linked.page > source.page_count || linked.page < saved.chunks[linkedIndex].page_start
        || linked.page > saved.chunks[linkedIndex].page_end)) {
        throw new Error('Source link does not match a confirmed chunk/page. No alternate source was selected.')
      }
      if (current !== generation.current || controller.signal.aborted) return
      setDoc(source); setPageIndex(linked ? linked.page - 1 : 0); setRaw(false); setVersion(saved); setChunkIndex(linkedIndex)
      setSize(saved?.config.size ?? 300); setOverlap(saved?.config.overlap ?? 50)
    }).catch(failure => { if (!controller.signal.aborted) setError((failure as Error).message) })
    return () => controller.abort()
  }, [selected, deepLink, guidedSource])

  async function upload(file?: File) {
    if (!file || busy || !ready) return
    setError(''); setNotice('')
    if (!/\.(pdf|txt)$/i.test(file.name)) { setError('Choose a PDF or UTF-8 TXT file.'); return }
    if (!file.size || file.size > cap) { setError(`Choose a non-empty file under ${Math.round(cap / 1024 / 1024)} MiB.`); return }
    setBusy('Uploading and extracting pages…')
    try {
      const source = await documentAPI.upload(file)
      await reload(); setDoc(null); setVersion(null); generation.current++; setSelected(source.id)
      setNotice(`Extracted ${source.page_count} ${source.page_count === 1 ? 'page' : 'pages'} from ${source.name}.`)
    } catch (failure) { setError((failure as Error).message) }
    finally { setBusy(''); if (chooser.current) chooser.current.value = '' }
  }
  const maxSize = tokenizer?.max_chunk_size ?? 507
  const configValid = Number.isInteger(size) && size > 0 && size <= maxSize
    && Number.isInteger(overlap) && overlap >= 0 && overlap < size
  const stale = Boolean(version && (version.config.size !== size || version.config.overlap !== overlap))
  async function generate() {
    if (!doc || !configValid) return
    setBusy('Generating source-linked chunks…'); setError(''); setNotice('')
    try {
      const draft = await documentAPI.preview(doc.id, size, overlap)
      setVersion(draft); setChunkIndex(0); setDoc(await documentAPI.get(doc.id))
      setNotice(`Preview version ${draft.version}: ${draft.chunks.length} chunks. Confirm to save this configuration.`)
    } catch (failure) { setError((failure as Error).message) }
    finally { setBusy('') }
  }
  async function confirm() {
    if (!doc || !version || stale) return
    setBusy('Confirming this version…'); setError('')
    try {
      setVersion(await documentAPI.confirm(doc.id, version.id)); setDoc(await documentAPI.get(doc.id))
      setNotice('Version confirmed. Export is ready. Earlier confirmed versions are preserved.')
    } catch (failure) { setError((failure as Error).message) }
    finally { setBusy('') }
  }
  async function remove() {
    if (!doc) return
    setBusy('Deleting selected document…'); setError('')
    try {
      await documentAPI.remove(doc.id); setSelected(''); setDoc(null); setVersion(null)
      setDeleteOpen(false); await reload(); setNotice('Document and its local versions deleted.')
    } catch (failure) { setError((failure as Error).message) }
    finally { setBusy('') }
  }
  async function chooseVersion(id: string) {
    if (!doc || !id) return
    setBusy('Loading saved version…'); setError('')
    try {
      const saved = await documentAPI.version(doc.id, id)
      setVersion(saved); setSize(saved.config.size); setOverlap(saved.config.overlap); setChunkIndex(0)
    } catch (failure) { setError((failure as Error).message) }
    finally { setBusy('') }
  }
  const page = doc?.pages[pageIndex]
  const chunk = version?.chunks[chunkIndex]
  return <>
    <div className="page-meta"><Badge tone={ready ? 'green' : 'muted'}>{ready ? 'AVAILABLE · D02' : error ? 'UNAVAILABLE · D02' : 'CONNECTING · D02'}</Badge><span className="mono">DOCUMENTS → SOURCE → CHUNKS</span></div>
    <div className="documents-title"><div><span className="eyebrow accent">DOCUMENTS LAB</span><h1>Start with the source.</h1><p>Upload a document, read its pages, and inspect every chunk.</p></div><Button onClick={() => void reload()} disabled={Boolean(busy)}><RefreshCw size={15} />Refresh library</Button></div>
    {error && <div className="doc-message error" role="alert">{error}<Button aria-label="Dismiss error" onClick={() => setError('')}><X size={15} /></Button></div>}
    {notice && <div className="doc-message success" role="status"><Check size={17} />{notice}</div>}
    {busy && <div className="doc-message" role="status"><LoaderCircle size={17} className="spin" />{busy}</div>}
    <div className="document-workbench" aria-busy={Boolean(busy)}>
      <Panel className="document-library" label="Document library">
        <div className="document-panel-heading"><h2><FileText size={17} />Your documents</h2><span className="mono">{documents.length} LOCAL</span></div>
        <div className={`drop-zone ${drag ? 'dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
          onDrop={event => { event.preventDefault(); setDrag(false); void upload(event.dataTransfer.files[0]) }}>
          <Upload size={23} /><strong>Drop a PDF or TXT</strong><span>UTF-8 text · up to {Math.round(cap / 1024 / 1024)} MiB</span>
          <input ref={chooser} type="file" accept=".pdf,.txt,application/pdf,text/plain" aria-label="Choose document file" className="file-chooser"
            disabled={!ready || Boolean(busy)} onChange={event => void upload(event.target.files?.[0])} />
          <Button className="button-primary" disabled={!ready || Boolean(busy)} onClick={() => chooser.current?.click()}>Choose file</Button>
        </div>
        {!ready && <p role="status">{error ? 'Library unavailable. Check the API connection and retry.' : 'Loading local library…'}</p>}
        {ready && !documents.length && <div className="library-empty"><FileText size={26} /><strong>Your library starts here.</strong><p>Files stay on this computer. Nothing is sent to Pinecone.</p></div>}
        <div className="document-list" role="group" aria-label="Stored documents">{documents.map(source => <button type="button" key={source.id} className={`document-item ${selected === source.id ? 'selected' : ''}`}
          disabled={Boolean(busy)} aria-pressed={selected === source.id} onClick={() => { if (selected !== source.id) { generation.current++; setDoc(null); setVersion(null); setSelected(source.id) }; setError(''); setNotice(''); setDeleteOpen(false) }}>
          <FileText size={19} /><span><strong>{source.name}</strong><small>{source.kind.toUpperCase()} · {source.page_count} pages · {(source.size / 1024).toFixed(1)} KiB</small></span><ChevronRight size={15} />
        </button>)}</div>
        <div className="library-foot"><span className="status-dot online" />Local files + SQLite persistence</div>
      </Panel>
      <div ref={content} className="document-content">
        {!doc ? <Panel className="document-welcome"><span className="lab-icon large"><Split size={30} /></span><h2>Give every chunk a source.</h2><p>{selected && !error ? 'Loading source pages and saved versions…' : 'Choose a file to see extracted pages and a reproducible token-based preview.'}</p><ol><li>Upload PDF / TXT</li><li>Inspect source pages</li><li>Generate → confirm → export</li></ol></Panel> : <>
          <Panel className="source-panel" label="Source page preview">
            <div className="source-title"><div><h2>{doc.name}</h2><span className="mono">{doc.page_count} PAGES · {(doc.pages.reduce((count, item) => count + item.character_count, 0) + 2 * (doc.page_count - 1)).toLocaleString()} CHARACTERS</span></div><Button aria-label="Delete selected document" onClick={() => setDeleteOpen(true)} disabled={Boolean(busy)}><Trash2 size={16} /></Button></div>
            {deleteOpen && <dialog ref={confirmation} className="delete-confirmation" aria-label="Confirm document deletion" onCancel={event => { event.preventDefault(); setDeleteOpen(false) }} onKeyDown={event => {
              if (event.key !== 'Tab') return
              const controls = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
              const first = controls[0], last = controls[controls.length - 1]
              if ((!event.shiftKey && document.activeElement === last) || (event.shiftKey && document.activeElement === first)) {
                event.preventDefault(); (event.shiftKey ? last : first)?.focus()
              }
            }}><div role="group" aria-label="Delete confirmation"><p>Delete <strong>{doc.name}</strong>, its file, pages, and all chunk versions? This cannot be undone.</p><Button onClick={() => void remove()} disabled={Boolean(busy)}>Confirm delete</Button><Button data-cancel onClick={() => setDeleteOpen(false)}>Cancel</Button></div></dialog>}
            {doc.warnings.map(warning => <p className="doc-warning" key={warning}>{warning}</p>)}
            <div className="source-toolbar"><div className="page-controls"><Button aria-label="Previous page" disabled={pageIndex === 0} onClick={() => setPageIndex(pageIndex - 1)}><ChevronLeft size={16} /></Button><span>Page {pageIndex + 1} / {doc.page_count}</span><Button aria-label="Next page" disabled={pageIndex >= doc.page_count - 1} onClick={() => setPageIndex(pageIndex + 1)}><ChevronRight size={16} /></Button></div>
              <label className="source-toggle"><input type="checkbox" checked={raw} onChange={event => setRaw(event.target.checked)} />Raw extracted text</label></div>
            <pre className="source-text" tabIndex={0} aria-label={`Page ${pageIndex + 1} text`}>{(raw ? page?.extracted_text : page?.text) || 'This page has no selectable text. OCR NOT AVAILABLE.'}</pre>
            <div className="source-foot"><span>{page?.character_count ?? 0} normalized characters</span><span>NFC · LF · 1-based pages</span></div>
          </Panel>
          <Panel className="chunk-settings" label="Chunk configuration">
            <div className="document-panel-heading"><h2><Split size={17} />Shape your chunks</h2><Badge>PREVIEW FIRST</Badge></div>
            <div className="tokenizer-info"><span className="status-dot" /><span>{tokenizer?.available ? `${tokenizer.id} · ${tokenizer.revision?.slice(0, 8)}` : 'E5 tokenizer unavailable'}</span></div>
            {tokenizer && !tokenizer.available && <p className="doc-warning">{tokenizer.message}</p>}
            {tokenizer?.mode === 'test-fixture-not-e5' && <p className="doc-warning">TEST FIXTURE — these counts are not E5 tokens. CI uses a deterministic offline byte tokenizer.</p>}
            <div className="chunk-config-fields"><TextField label="Chunk size (tokens)" type="number" min={1} max={maxSize} value={size} onChange={event => setSize(Number(event.target.value))} />
              <TextField label="Overlap (source tokens)" type="number" min={0} max={Math.max(0, size - 1)} value={overlap} onChange={event => setOverlap(Number(event.target.value))} />
              <Button className="button-primary" onClick={() => void generate()} disabled={!configValid || !tokenizer?.available || Boolean(busy) || doc.status === 'needs_ocr'}>Generate preview<Split size={16} /></Button></div>
            {!configValid && <p className="doc-warning" role="alert">Size must be 1–{maxSize} tokens; overlap must be at least 0 and smaller than size.</p>}
            <p className="config-hint">{tokenizer?.prefix_special_overhead ?? '—'} tokens reserved for <code>passage:</code> and special tokens. Every full input is checked against 512 tokens.</p>
            {stale && <p className="doc-warning">Configuration changed. Generate a new preview; the displayed version is unchanged.</p>}
            {doc.confirmed_id && <p className="config-hint"><Check size={13} />A confirmed version is saved. New previews will not overwrite it.</p>}
          </Panel>
          {version && <Panel className="chunk-inspector" label="Chunk inspector">
            <div className="document-panel-heading"><h2>Chunk inspector <span className="mono">{version.chunks.length} CHUNKS</span></h2><Badge tone={version.state === 'confirmed' ? 'green' : 'amber'}>{version.state.toUpperCase()} · V{version.version}</Badge></div>
            <div className="version-actions"><label>Saved versions<select aria-label="Saved versions" value={version.id} disabled={Boolean(busy)} onChange={event => void chooseVersion(event.target.value)}>{doc.versions.map(saved => <option key={saved.id} value={saved.id}>Version {saved.version} · {saved.state} · {saved.config.size}/{saved.config.overlap}</option>)}</select></label>
              <Button onClick={() => void confirm()} disabled={Boolean(busy) || stale || version.state === 'confirmed'}>Confirm / Save<Check size={15} /></Button>
              {version.state === 'confirmed' && <a className="button button-primary" href={documentAPI.exportURL(doc.id, version.id)} download>Download JSONL<Download size={15} /></a>}</div>
            <div className="chunk-inspector-grid"><div className="chunk-list" role="group" aria-label="Generated chunks">{version.chunks.map((part, index) => <button type="button" key={part.chunk_id} className={index === chunkIndex ? 'selected' : ''} aria-pressed={index === chunkIndex} onClick={() => setChunkIndex(index)}>
              <span><strong>Chunk {index + 1}</strong><Badge>{part.token_count} tokens</Badge></span><small>Pages {part.page_start}–{part.page_end} · {part.overlap_token_count} overlap tokens</small><p>{Array.from(part.text).slice(0, 100).join('')}</p></button>)}</div>
              {chunk && <div className="chunk-detail"><div className="chunk-detail-heading"><h3>Chunk {chunkIndex + 1}</h3><Button aria-label="Copy chunk text" onClick={() => { void navigator.clipboard.writeText(chunk.text).then(() => setNotice('Chunk text copied.')).catch(() => setError('Clipboard unavailable. Select and copy the chunk text.')) }}><Copy size={15} />Copy</Button></div>
                <div className="chunk-meta"><Badge>{chunk.token_count} content tokens</Badge><Badge>{chunk.model_token_count} / 512 input tokens</Badge><Badge>Pages {chunk.page_start}–{chunk.page_end}</Badge></div>
                <p className="overlap-legend"><span />Shared source: {chunk.overlap_token_count} tokens (requested {version.config.overlap}). Unicode-safe cuts can reduce overlap.</p>
                <pre className="chunk-full-text" tabIndex={0} aria-label="Full chunk text">{chunk.overlap_text && <mark>{chunk.overlap_text}</mark>}{chunk.text.slice(chunk.overlap_text.length)}</pre>
                <p className="config-hint">Canonical offsets [{chunk.start_offset}, {chunk.end_offset}) · Version {chunk.version}. Body is re-tokenized; overlap uses the full source token stream.</p>
              </div>}</div>
          </Panel>}
        </>}
      </div>
    </div>
  </>
}
