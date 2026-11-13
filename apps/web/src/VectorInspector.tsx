import { memo, useRef, useState } from 'react'
import { Braces, Copy } from 'lucide-react'
import { Badge, Button, Panel } from './components'
import type { EmbeddingRecord } from './embeddings-api'
import { VectorValues } from './VectorValues'
import { useDataMotion } from './useDataMotion'
import './vectors.css'

export const VectorInspector = memo(function VectorInspector({ record, title, onNotice }: { record: EmbeddingRecord; title: string; onNotice: (text: string) => void }) {
  const [view, setView] = useState('heatmap')
  const reveal = useRef<HTMLElement>(null)
  useDataMotion(reveal, record, { selector: '.vector-heatmap, .vector-metrics', duration: 0.3 })
  return <Panel ref={reveal} className="vector-inspector" label={title}>
    <div className="document-panel-heading"><h2><Braces size={18} />{title}</h2><Badge tone="green">{record.dimension} DIMENSIONS</Badge></div>
    <p className="vector-model mono">{record.model_id} · {record.model_revision}</p>
    {record.mode !== 'e5' && <p className="doc-warning">TEST FIXTURE — NOT E5. These vectors do not encode semantic meaning.</p>}
    <div className="vector-metrics"><span><small>INPUT</small><strong>{record.input_token_count} tokens</strong></span><span><small>L2 NORM</small><strong>{record.norm.toFixed(6)}</strong></span><span><small>INFERENCE · BATCH {record.batch_size}</small><strong>{record.inference_ms.toFixed(1)} ms{record.cached ? ' · cached' : ''}</strong></span><span><small>LOAD · THIS RECORD</small><strong>{record.load_ms.toFixed(1)} ms</strong></span></div>
    <p className="config-hint">Prefix <code>{record.prefix}</code> · L2 normalized · CPU / float32 · min {Math.min(...record.values).toFixed(5)} / max {Math.max(...record.values).toFixed(5)}</p>
    {record.source_chunk_id && <p className="vector-provenance mono">Document {record.source_document_id}<br />Version {record.source_version_id}<br />Chunk {record.source_chunk_id} · pages {record.page_start}–{record.page_end}</p>}
    <div className="vector-view-controls"><div role="group" aria-label={`${title} view`}><Button aria-pressed={view === 'heatmap'} onClick={() => setView('heatmap')}>Heatmap</Button><Button aria-pressed={view === 'table'} onClick={() => setView('table')}>Table</Button></div><Button aria-label={`Copy ${title}`} onClick={() => {
      void navigator.clipboard.writeText(JSON.stringify(record)).then(() => onNotice('Full 384D vector JSON copied.')).catch(() => onNotice('Clipboard unavailable. Use the vector table to select values.'))
    }}><Copy size={15} />Copy vector JSON</Button></div>
    <VectorValues values={record.values} title={title} table={view === 'table'} />
    <p className="config-hint">Whole-batch inference timing; no invented per-item latencies. Cached records retain their original measurement.</p>
  </Panel>
})
