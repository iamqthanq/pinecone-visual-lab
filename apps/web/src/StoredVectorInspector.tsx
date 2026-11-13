import { memo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Panel } from './components'
import type { FetchedVectors } from './vector-store-api'
import { VectorValues } from './VectorValues'
import { useDataMotion } from './useDataMotion'
import './vectors.css'
import './vector-store.css'

export const StoredVectorInspector = memo(function StoredVectorInspector({ fetched, onNotice }: { fetched: FetchedVectors; onNotice: (message: string) => void }) {
  const [table, setTable] = useState(false)
  const reveal = useRef<HTMLElement>(null)
  useDataMotion(reveal, fetched, { selector: '.vector-heatmap, .vector-metrics', duration: 0.3 })
  const record = fetched.records[0]
  if (!record) return <Panel className="store-panel"><h2>Vector not found</h2><p>The adapter returned no record for this ID in the selected namespace.</p></Panel>
  const metadata = record.metadata
  return <Panel ref={reveal} className="store-panel vector-inspector" label="Stored vector inspector">
    <div className="document-panel-heading"><h2>Fetched vector</h2><Badge tone="green">{record.values.length} DIMENSIONS</Badge></div>
    <p className="mono store-id">{record.id}</p><p className="config-hint">Actual {fetched.data_origin} · {fetched.target.index} / {fetched.target.namespace || '(default namespace)'}</p>
    {metadata.embedding_mode !== 'e5' && <p className="doc-warning">NOT E5 / unverified origin. Fixture vectors are not semantic embeddings.</p>}
    <div className="vector-metrics"><span><small>L2 NORM</small><strong>{Math.hypot(...record.values).toFixed(6)}</strong></span><span><small>MODEL</small><strong>{String(metadata.model_id ?? 'Not supplied')}</strong></span></div>
    <dl className="store-metadata">{Object.entries(metadata).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl>
    <div className="vector-view-controls"><div role="group" aria-label="Stored vector view"><Button aria-pressed={!table} onClick={() => setTable(false)}>Heatmap</Button><Button aria-pressed={table} onClick={() => setTable(true)}>Table</Button></div><Button onClick={() => {
      void navigator.clipboard.writeText(JSON.stringify({ ...record, target: fetched.target, data_origin: fetched.data_origin })).then(() => onNotice('Full stored vector JSON copied.')).catch(() => onNotice('Clipboard unavailable. Select values from the table.'))
    }}>Copy stored vector JSON</Button></div>
    <VectorValues values={record.values} title="Stored vector" table={table} />
    <p className="config-hint">A fetched record proves storage, not search quality. Cosine is geometry, not a probability. Top-k retrieval is available in Search Lab. <Link to="/documents">Inspect original documents</Link>.</p>
  </Panel>
})
