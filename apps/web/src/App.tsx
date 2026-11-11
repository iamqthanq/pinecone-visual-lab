import { useEffect, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import {
  ArrowDown, ArrowRight, ArrowUpRight, Blocks, BookOpen, Box, Braces, Check,
  ChevronRight, CircleHelp, Code2, Database, FileText, LayoutDashboard,
  Menu, MessageSquare, Network, RefreshCw, Search, Server, ShieldCheck, Sparkles,
  Split, Terminal, WifiOff, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getHealth } from './api'
import type { Health } from './api'
import { Badge, Button, LoadingState, Panel } from './components'
import DocumentsLab from './DocumentsLab'

const repo = 'https://github.com/iamqthanq/pinecone-visual-lab'
const labs: { path: string; title: string; short: string; icon: LucideIcon;
  phase: string; description: string; next: string[] }[] = [
  { path: '/documents', title: 'Documents Lab', short: 'Documents', icon: FileText, phase: 'D02',
    description: 'Follow a document from its original pages to source-linked chunks.',
    next: ['Upload PDF or TXT documents', 'Inspect extracted text by page', 'Adjust chunk size and overlap'] },
  { path: '/vectors', title: 'Vectors Lab', short: 'Vectors', icon: Box, phase: 'D03–D04',
    description: 'Inspect embeddings and understand where vectors are stored.',
    next: ['Generate and inspect 384-dimensional embeddings', 'Select an index and namespace', 'Upsert and fetch vectors with source metadata'] },
  { path: '/search', title: 'Search Lab', short: 'Search', icon: Search, phase: 'D05–D06',
    description: 'Find related passages, inspect scores, and trace every result to its source.',
    next: ['Run semantic search with metadata filters', 'Inspect retrieval scores and execution traces', 'Ask questions with optional local RAG'] },
  { path: '/architecture', title: 'Architecture Lab', short: 'Architecture', icon: Network, phase: 'D07',
    description: 'Step through an educational model of the Slab architecture.',
    next: ['Follow the simulated write and read paths', 'Control playback and compaction steps', 'Keep simulation separate from live Pinecone data'] },
]

type Connection = { status: 'checking' } | { status: 'online'; health: Health }
  | { status: 'offline'; message: string }

function useBackend() {
  const [connection, setConnection] = useState<Connection>({ status: 'checking' })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const timeout = window.setTimeout(() => controller.abort(), 5000)
    getHealth(controller.signal).then(health => {
      if (active) setConnection({ status: 'online', health })
    }).catch(() => {
      if (active) setConnection({ status: 'offline', message: 'Start the FastAPI server on port 8000, then check again.' })
    }).finally(() => window.clearTimeout(timeout))
    return () => { active = false; controller.abort(); window.clearTimeout(timeout) }
  }, [revision])
  useEffect(() => {
    const timer = window.setInterval(() => setRevision(value => value + 1), 15000)
    return () => window.clearInterval(timer)
  }, [])
  return { connection, refresh: () => setRevision(value => value + 1) }
}

function Brand() {
  return <Link to="/" className="brand" aria-label="Pinecone Visual Lab home">
    <span className="brand-mark"><Blocks size={23} strokeWidth={1.5} /></span>
    <span>Pinecone<span className="brand-subtitle">VISUAL LAB</span></span>
  </Link>
}

function Pipeline() {
  const stages = [
    { name: 'Documents', detail: 'PDF / TXT', icon: FileText, to: '/documents' },
    { name: 'Chunks', detail: 'Source-linked text', icon: Split, to: '/documents' },
    { name: 'Embeddings', detail: '384 dimensions', icon: Braces, to: '/vectors' },
    { name: 'Vector store', detail: 'Index + namespace', icon: Database, to: '/vectors' },
    { name: 'Search', detail: 'Top-k retrieval', icon: Search, to: '/search' },
    { name: 'Answer', detail: 'Optional local RAG', icon: MessageSquare, to: '/search' },
  ]
  return <Panel className="pipeline-panel" label="Learning pipeline roadmap">
    <div className="section-heading"><div><span className="eyebrow">THE LEARNING PATH</span>
      <h2>One document. Every step visible.</h2></div><Badge>D02 READY · D03–D06 PLANNED</Badge></div>
    <ol className="pipeline" id="pipeline">{stages.map((stage, index) =>
      <li key={stage.name}><Link to={stage.to} className="pipeline-stage">
        <span className="stage-top"><span className="mono">0{index + 1}</span><ArrowUpRight size={14} /></span>
        <span className={`stage-icon stage-color-${index}`}><stage.icon size={25} strokeWidth={1.5} /></span>
        <strong>{stage.name}</strong><span className="stage-detail">{stage.detail}</span>
      </Link>{index < stages.length - 1 && <ChevronRight className="stage-arrow" size={17} aria-hidden="true" />}</li>,
    )}</ol>
    <div className="pipeline-foot"><ShieldCheck size={15} /><span>Every result will link back to its source.</span>
      <span className="pipeline-note">Documents + chunks available; vector stages planned.</span></div>
  </Panel>
}

function ConnectionPanel({ connection, refresh }: { connection: Connection; refresh: () => void }) {
  const online = connection.status === 'online'
  return <Panel className="connection-panel" label="Environment status">
    <div className="panel-top"><h2><Terminal size={17} />Your environment</h2><span className="mono">LOCAL</span></div>
    <div className="service-row"><span className="service-icon"><Server size={18} /></span>
      <div><strong>Backend API</strong><span>FastAPI · /api/health</span></div>
      <Badge tone={online ? 'green' : connection.status === 'offline' ? 'amber' : 'muted'}>
        <span className={`status-dot ${online ? 'online' : ''}`} />
        {online ? 'ONLINE' : connection.status === 'offline' ? 'OFFLINE' : 'CHECKING'}
      </Badge></div>
    <div className="service-row"><span className="service-icon"><Database size={18} /></span>
      <div><strong>Pinecone</strong><span>Cloud vector database</span></div><Badge>NOT CONFIGURED</Badge></div>
    <div className="service-row"><span className="service-icon"><Sparkles size={18} /></span>
      <div><strong>Embedding model</strong><span>Local inference</span></div><Badge>NOT LOADED</Badge></div>
    <div className="connection-message" aria-live="polite">
      {connection.status === 'checking' ? <LoadingState /> : online
        ? <><Check size={16} /><span>Connected to your local API.<small className="mono">v{connection.health.version} · {new Date(connection.health.timestamp).toLocaleTimeString()}</small></span></>
        : <><WifiOff size={17} /><span>{connection.status === 'offline' && connection.message}</span></>}
    </div>
    <Button className="button-subtle check-button" onClick={refresh}><RefreshCw size={14} />Check connection</Button>
  </Panel>
}

function Overview({ connection, refresh }: { connection: Connection; refresh: () => void }) {
  return <>
    <div className="page-meta"><span className="page-tag"><span className="status-dot online" />D02 · DOCUMENTS & CHUNKS</span>
      <span className="mono meta-right">A WORKBENCH FOR VECTOR DATABASES</span></div>
    <div className="overview-top">
      <section className="intro"><span className="eyebrow accent">LEARN BY LOOKING INSIDE</span>
        <h1>Vector search,<br /><span>step by step.</span></h1>
        <p>From a document to a relevant answer.<br className="desktop-break" /> See how the pieces connect, then inspect each one.</p>
        <div className="intro-actions"><a href="#pipeline" className="button button-primary">View learning path<ArrowDown size={16} /></a>
          <a href={`${repo}/blob/main/README.md`} target="_blank" rel="noreferrer" className="text-link">Project repository<ArrowUpRight size={16} /></a></div>
        <div className="foundation-note"><span className="note-line" /><span>Documents Lab is ready.<br />Upload, inspect, chunk, and export.</span></div>
      </section>
      <ConnectionPanel connection={connection} refresh={refresh} />
    </div>
    <Pipeline />
    <section className="labs-section" aria-labelledby="labs-title">
      <div className="section-heading"><div><span className="eyebrow">YOUR WORKSPACE</span><h2 id="labs-title">A lab for every question.</h2></div>
        <span className="section-aside">Choose a lab to see what comes next.</span></div>
      <div className="lab-grid">{labs.map(lab => <Link to={lab.path} key={lab.path} className="lab-card">
        <div className="lab-card-top"><span className="lab-icon"><lab.icon size={21} strokeWidth={1.5} /></span><ArrowUpRight size={17} /></div>
        <h3>{lab.title}</h3><p>{lab.description}</p><div className="lab-card-bottom"><Badge>{lab.path === '/documents' ? 'D02 IMPLEMENTED' : 'PLANNED'}</Badge><span className="mono">{lab.phase}</span></div>
      </Link>)}</div>
    </section>
    <div className="mode-strip"><span className="mode-symbol"><Network size={18} /></span>
      <div><strong>Three perspectives. Clearly separated.</strong><p>Live Pinecone, local retrieval, and educational simulation are planned as distinct modes.</p></div>
      <Link to="/architecture" className="text-link">View architecture<ArrowRight size={16} /></Link></div>
  </>
}

function PlannedLab({ lab }: { lab: typeof labs[number] }) {
  return <>
    <div className="page-meta"><Badge>PLANNED · {lab.phase}</Badge><span className="mono">FOUNDATION PREVIEW</span></div>
    <div className="lab-page-title"><span className="lab-icon large"><lab.icon size={32} strokeWidth={1.4} /></span>
      <h1>{lab.title}</h1><p>{lab.description}</p></div>
    <Panel className="planned-panel"><div className="planned-heading"><span className="eyebrow">COMING IN {lab.phase}</span>
      <h2>This lab is on the roadmap.</h2><p>D01 provides the interface foundation. Processing tools will be added in the assigned phase.</p></div>
      <ul className="roadmap-list">{lab.next.map((step, index) => <li key={step}>
        <span className="mono">0{index + 1}</span><span>{step}</span><Badge>PLANNED</Badge></li>)}</ul>
      <div className="empty-state"><Code2 size={23} /><span>No processing is available in this lab yet. No data has been uploaded or generated.</span></div>
      <Link to="/" className="button button-secondary">Back to overview<ArrowRight size={16} /></Link>
    </Panel>
    {lab.path === '/architecture' && <Panel className="mode-explainer" label="Planned retrieval modes">
      <h2>What each mode will mean</h2><dl>
        <div><dt>LIVE PINECONE</dt><dd>Real Pinecone API requests, index, namespace, and retrieval results.</dd></div>
        <div><dt>LOCAL DEMO</dt><dd>Local vector retrieval; prebuilt fixtures will be explicitly labeled.</dd></div>
        <div><dt>SLAB SIMULATOR</dt><dd>An educational simulation, separate from live Pinecone telemetry.</dd></div>
      </dl><Badge>ALL MODES PLANNED</Badge></Panel>}
  </>
}

export default function App() {
  const { connection, refresh } = useBackend()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const currentLab = labs.find(lab => lab.path === location.pathname)
  useEffect(() => {
    document.title = `${currentLab?.title ?? 'Overview'} · Pinecone Visual Lab`
  }, [currentLab])
  return <div className="app-shell">
    <a href="#main" className="skip-link">Skip to content</a>
    <header className="mobile-header"><Brand /><Button aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
      aria-expanded={menuOpen} aria-controls="sidebar" className="icon-button" onClick={() => setMenuOpen(!menuOpen)}>
      {menuOpen ? <X size={21} /> : <Menu size={21} />}</Button></header>
    <aside className={`sidebar ${menuOpen ? 'menu-open' : ''}`} id="sidebar">
      <div className="sidebar-brand"><Brand /></div>
      <div className="workspace-label"><span className="workspace-avatar">VL</span><span>Seminar workspace<small>Local development</small></span><span className="workspace-dot" /></div>
      <span className="nav-label">WORKBENCH</span>
      <nav aria-label="Main navigation" onClick={() => setMenuOpen(false)}>
        <NavLink to="/" end><LayoutDashboard size={19} /><span>Overview</span><span className="nav-shortcut">01</span></NavLink>
        {labs.map(lab => <NavLink to={lab.path} key={lab.path}><lab.icon size={19} /><span>{lab.title}</span></NavLink>)}
      </nav>
      <div className="sidebar-guide"><span className="guide-icon"><BookOpen size={18} /></span><strong>Built to explain.</strong>
        <p>Follow the data. Understand<br />the decisions along the way.</p><Link to="/architecture" onClick={() => setMenuOpen(false)}>See the roadmap<ArrowUpRight size={15} /></Link></div>
      <div className="sidebar-bottom"><a href={`${repo}/issues/3`} target="_blank" rel="noreferrer"><CircleHelp size={17} />D02 specification<ArrowUpRight size={13} /></a>
        <div><span className="version-mark">pvl</span><span className="mono">v0.2.0 · Documents</span></div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14} /><span>{currentLab?.title ?? 'Overview'}</span></div>
      <div className="topbar-actions"><span className="local-chip"><span className="status-dot" />LOCAL WORKSPACE</span>
        <a href={repo} target="_blank" rel="noreferrer" className="repo-link" aria-label="Open GitHub repository"><Code2 size={18} /><span>Repository</span><ArrowUpRight size={13} /></a></div></header>
      <main id="main" tabIndex={-1}><Routes><Route path="/" element={<Overview connection={connection} refresh={refresh} />} />
        {labs.map(lab => <Route key={lab.path} path={lab.path} element={lab.path === '/documents' ? <DocumentsLab /> : <PlannedLab lab={lab} />} />)}
        <Route path="*" element={<Panel className="planned-panel"><h1>Page not found</h1><p>This route is not part of the lab.</p><Link to="/" className="button">Back to overview</Link></Panel>} />
      </Routes>
      <footer className="app-footer"><span><span className="footer-dot" />Pinecone Visual Lab</span><span>Vector databases, made visible.<span className="footer-divider">/</span>Seminar edition</span></footer>
      </main>
    </div>
  </div>
}
