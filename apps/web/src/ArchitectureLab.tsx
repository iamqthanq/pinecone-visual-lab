import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Background, Controls, Handle, Position, ReactFlow } from '@xyflow/react'
import type { Node, NodeProps } from '@xyflow/react'
import { gsap } from 'gsap'
import { Badge, Button, Panel } from './components'
import { diagram } from './simulator-graph'
import { initialSimulator, program, SIMULATION_LABEL, simulatorReducer, snapshot, visible } from './simulator'
import type { Mode, SimulatorState } from './simulator'
import '@xyflow/react/dist/style.css'
import './simulator.css'

type SimNode = Node<{ label: string; active: boolean }, 'simulation'>
function SimulationNode({ data }: NodeProps<SimNode>) {
  return <div className={`sim-node ${data.active ? 'sim-active' : ''}`}><Handle type="target" position={Position.Top} /><div className="sim-node-content">{data.label}<small>{data.active ? 'CURRENT TOY STEP' : 'CONCEPTUAL COMPONENT'}</small></div><Handle type="source" position={Position.Bottom} /></div>
}
const nodeTypes = { simulation: SimulationNode }
const source = 'https://www.pinecone.io/learn/slab-architecture/'

export default function ArchitectureLab({ initial, onChange }: { initial?: SimulatorState; onChange?: (state: SimulatorState) => void }) {
  const [state, dispatch] = useReducer(simulatorReducer, initial ?? initialSimulator())
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  const root = useRef<HTMLDivElement>(null)
  const steps = useMemo(() => program(state.mode, state.seed), [state.mode, state.seed])
  const data = useMemo(() => snapshot(state), [state])
  const current = state.cursor ? steps[state.cursor - 1] : undefined
  const graph = useMemo(() => diagram(data, current), [data, current])
  useEffect(() => { onChange?.(state) }, [state, onChange])
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const change = () => setReduced(media?.matches ?? false)
    media?.addEventListener('change', change)
    return () => media?.removeEventListener('change', change)
  }, [])
  useEffect(() => {
    const hidden = () => { if (document.hidden) dispatch({ type: 'pause' }) }
    document.addEventListener('visibilitychange', hidden)
    return () => document.removeEventListener('visibilitychange', hidden)
  }, [])
  useEffect(() => {
    if (!state.playing || document.hidden) return
    const timer = window.setTimeout(() => dispatch({ type: 'next' }), 1000 / state.speed)
    return () => window.clearTimeout(timer)
  }, [state.playing, state.cursor, state.speed, state.mode])
  useEffect(() => {
    if (reduced || !state.playing || document.hidden || !root.current) return
    // Animate inner labels, never React Flow positioning transforms. No state callback.
    const ctx = gsap.context(() => {
      const nodes = root.current?.querySelectorAll('.sim-active .sim-node-content')
      if (nodes?.length) gsap.timeline({ defaults: { ease: 'power1.out' } })
        .fromTo(nodes, { opacity: 0.55, y: 4 }, { opacity: 1, y: 0, duration: 0.2 / state.speed })
    }, root)
    const hidden = () => { if (document.hidden) ctx.revert() }
    document.addEventListener('visibilitychange', hidden)
    return () => { document.removeEventListener('visibilitychange', hidden); ctx.revert() }
  }, [state.cursor, state.mode, state.speed, state.playing, reduced])
  return <div ref={root} className="simulator">
    <div className="page-meta"><Badge>D07 · ARCHITECTURE LAB</Badge><span className="mono">SEE THE CONCEPT. INSPECT THE RULE.</span></div>
    <div className="documents-title"><div><span className="eyebrow accent">SLAB SIMULATOR</span><h1>Follow a write. Unpack a read.</h1><p>Step through a small, deterministic model. Compare immutable files, latest versions and calculated toy scores.</p></div></div>
    <div className="simulation-banner" role="note"><strong>{SIMULATION_LABEL}</strong><p>In-memory toy data only · seed {state.seed} · 2D cosine, not E5 384D · no real WAL, cloud storage or performance measurements.</p></div>
    <Panel className="sim-controls" label="Simulator controls"><label>Walkthrough<select aria-label="Walkthrough" value={state.mode} onChange={e => dispatch({ type: 'mode', mode: e.target.value as Mode })}><option value="write">Write + Flush</option><option value="read">Read + Candidate Merge + Top-K</option><option value="compaction">Compaction + Updates + Deletes</option></select></label><div className="sim-buttons"><Button onClick={() => dispatch({ type: 'play' })} disabled={state.playing || state.cursor === steps.length}>Play</Button><Button onClick={() => dispatch({ type: 'pause' })} disabled={!state.playing}>Pause</Button><Button onClick={() => dispatch({ type: 'back' })} disabled={!state.cursor}>Back</Button><Button onClick={() => dispatch({ type: 'next' })} disabled={state.cursor === steps.length}>Next</Button><Button onClick={() => dispatch({ type: 'replay' })}>Replay</Button><Button onClick={() => dispatch({ type: 'reset' })}>Reset</Button></div><label>Speed<select aria-label="Speed" value={state.speed} onChange={e => dispatch({ type: 'speed', speed: Number(e.target.value) })}><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option></select></label>
      <label className="sim-seek">Seek step · {state.cursor}/{steps.length}<input aria-label="Seek simulation step" type="range" min={0} max={steps.length} value={state.cursor} onChange={e => dispatch({ type: 'seek', cursor: Number(e.target.value) })} /></label><p>Speed controls animation/presentation delay only, never scores or storage logic. {reduced ? 'REDUCED MOTION: movement disabled; all steps remain available.' : 'No autoplay; playback is finite. Hidden tabs pause.'}</p>
    </Panel>
    <div className="sim-step" aria-live="polite" aria-atomic="true"><Badge>{current?.concept ?? 'toy simulation rule'}</Badge><h2>{current?.title ?? 'Ready to explore'}</h2><p>{current?.detail ?? (state.mode === 'write' ? 'Start with an empty toy WAL. Next logs a write; acknowledgment and memtable staging follow.' : 'This preset starts from a deterministic preloaded toy dataset, not real application records. Inspect its baseline below, then Next.')}</p></div>
    <Panel className="sim-graph-panel" label="Interactive simulation diagram"><h2>Conceptual data paths</h2><p>Pan or use zoom controls. Mint marks the current step. A readable linear alternative and all data follow below.</p><div className="sim-graph"><ReactFlow nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} fitView minZoom={0.15} maxZoom={1.5} nodesDraggable={false} nodesConnectable={false} edgesFocusable={false} proOptions={{ hideAttribution: false }} ariaLabelConfig={{ 'controls.zoomIn.ariaLabel': 'Zoom simulation in', 'controls.zoomOut.ariaLabel': 'Zoom simulation out', 'controls.fitView.ariaLabel': 'Fit simulation diagram' }}><Background color="#34475b" gap={24} /><Controls showInteractive={false} /></ReactFlow></div></Panel>
    <div className="sim-data-grid"><Panel className="search-panel" label="Toy data state"><div className="document-panel-heading"><h2>Toy data state</h2><Badge>SIMULATION COUNTS ONLY</Badge></div><p>{graph.counts.wal} logged toy writes · {data.acknowledged.length} acknowledged · {graph.counts.memtable} memtable records (all namespaces) · {graph.counts.activeSlabs} live toy slabs.</p><h3>Visible in namespace lesson</h3><ul>{visible(data).map(r => <li key={r.id}><code>{r.id}</code> · seq {r.seq} · [{r.values?.join(', ')}]</li>)}</ul><h3>Immutable files / manifest</h3><ul>{data.slabs.map(s => <li key={s.id}><strong>{s.id}</strong> · L{s.level} · {data.retired.includes(s.id) ? 'RETIRED, original snapshot retained' : 'LIVE'}<ul>{s.records.map(r => <li key={`${r.id}-${r.seq}`}>{r.id} / seq {r.seq} / {r.values ? `[${r.values.join(', ')}]` : 'TOMBSTONE (retained)'}</li>)}</ul></li>)}</ul><details><summary>Complete deterministic snapshot</summary><pre data-testid="simulation-snapshot">{JSON.stringify(data, null, 2)}</pre></details></Panel>
      <Panel className="search-panel" label="Toy query results"><h2>2D cosine oracle</h2><p>cos(q,x) = (q₁x₁ + q₂x₂) / (‖q‖‖x‖). Query [1,0], Top-2; equal scores sort by ID. Exact toy scoring illustrates candidate merging; production Pinecone uses more sophisticated ANN methods.</p><h3>Candidate lists</h3><ul>{data.candidates.map(r => <li key={`${r.executor}-${r.id}`}>{r.executor}: {r.id} / seq {r.seq} / cosine {r.score.toFixed(6)}</li>)}</ul><h3>Returned toy Top-K</h3><ol>{data.top.map(r => <li key={r.id}>{r.id}: <strong>{r.score.toFixed(6)}</strong></li>)}</ol><p className="config-hint">Stale versions and tombstones are resolved globally before toy ranking; foreign namespaces are excluded. Compaction never alters the latest live view.</p></Panel></div>
    <Panel className="search-panel" label="Linear simulation event log"><h2>Event log / text alternative</h2><p>No background reads or writes. Seek revisits the same snapshots; retired files stay inspectable.</p><ol className="sim-event-log">{steps.map((step, i) => <li key={i} aria-current={state.cursor === i + 1 ? 'step' : undefined}><button onClick={() => dispatch({ type: 'seek', cursor: i + 1 })}>Step {i + 1}: {step.title}</button><p>{step.detail}</p></li>)}</ol></Panel>
    <Panel className="search-panel" label="Architecture sources"><h2>Published concepts vs teaching rules</h2><dl className="sim-claims"><div><dt>DOCUMENTED CONCEPT</dt><dd>Durable log before acknowledgment; memtable; immutable slabs; background compaction; query fanout/candidate merge; executor caches. <a href={source} target="_blank" rel="noreferrer">Pinecone: Write Path, Storage, Read Path ↗</a></dd></div><div><dt>TOY SIMULATION RULE</dt><dd>Seeded IDs, explicit event order,2D vectors, exact scoring,2-input compaction, global version mask and retained tombstones are our bounded teaching model. No implementation thresholds, freshness SLA or real performance claim.</dd></div></dl><p><a href="https://www.pinecone.io/how-pinecone-works/" target="_blank" rel="noreferrer">Official architecture overview ↗</a>. The pages differ in some algorithm size descriptions and freshness wording; this simulator deliberately makes no such guarantee.</p></Panel>
  </div>
}
