import { test, expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { record, recorded, replay } from './replay'
import { renderingEnvironment, softwareReferences } from './rendering'

const fixture = process.env.PVL_E2E_FIXTURE === '1'
const mode = fixture ? 'fixture' : 'real-e5'
const stage = process.env.PVL_VISUAL_STAGE ?? 'verify'
const replaying = process.env.PVL_VISUAL_REPLAY === '1'
const recording = process.env.PVL_VISUAL_RECORD === '1'
const supplement = process.env.PVL_VISUAL_SUPPLEMENT === 'rag'
if (supplement && ['verify', 'proposal'].includes(stage)) throw new Error('Supplement capture is separate from software reference verification/proposal')
if (recording && (!fixture || stage !== 'after' || replaying)) throw new Error('Recording requires explicit fixture AFTER capture against the real isolated API')
const output = stage === 'proposal' ? softwareReferences : stage === 'verify' ? `.cache/d08-visual-verify/${mode}` : `docs/evidence/d08/${stage}/${mode}`
const widths = [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]
const query = 'Tìm kiếm vector sử dụng embedding và cosine như thế nào?'

interface Seed { id: string; document_id: string; version_id: string; chunk_id: string; job_id: string; target: { namespace: string }; draft: string; vector: string }
async function prepare(request: APIRequestContext): Promise<Seed> {
  const directory = `.cache/d08-audit/${fixture ? 'fixture' : 'real'}`
  await mkdir(directory, { recursive: true })
  const seedPath = `${directory}/seed.json`
  let seed: Seed | null = null
  try { seed = JSON.parse(await readFile(seedPath, 'utf8')) } catch { /* first explicit synthetic setup */ }
  if (!seed) {
    const response = await request.post('/api/guided/sessions'); expect(response.status()).toBe(201)
    const { id } = await response.json()
    async function act(action: string) {
      const r = await request.post(`/api/guided/sessions/${id}/actions`, { data: { action, confirmed: true }, timeout: 160000 })
      expect(r.ok(), await r.text()).toBeTruthy(); return r.json()
    }
    for (const action of ['upload', 'extract', 'preview', 'confirm', 'embedding', 'ingest_preview']) await act(action)
    let job
    for (let i = 0; i < 16; i++) { job = (await act('ingest_step')).result; if (job.state === 'active') break }
    expect(job.state).toBe('active')
    const fetched = await act('fetch'); await act('search'); await act('skip_rag')
    const draft = await (await request.post(`/api/documents/${fetched.session.document_id}/preview`, { data: { size: 180, overlap: 30 } })).json()
    seed = { ...fetched.session, draft: draft.id, vector: fetched.result.records[0].id }
    await writeFile(seedPath, JSON.stringify(seed, null, 2) + '\n', 'utf8')
  }
  const state = await (await request.get(`/api/guided/sessions/${seed!.id}`)).json()
  expect(state.completed.upsert).toBe(true)
  // Explicit real retrieval warms only the approved cache, never import/startup download.
  const warm = await request.post('/api/search', { data: { query, top_k: 1, target: state.target }, timeout: 160000 })
  expect(warm.ok(), await warm.text()).toBeTruthy()
  expect((await warm.json()).embedding.mode).toBe(fixture ? 'test-fixture-not-e5' : 'e5')
  return seed!
}

test('paired production visual audit on owned persistent synthetic data', async ({ page, request, browser }, testInfo) => {
  const seed = replaying ? (await recorded()).seed as Seed : await prepare(request)
  const playback = replaying ? await replay(page) : null
  const saveRecording = recording ? record(page, seed) : null
  await mkdir(output, { recursive: true })
  const environment = await renderingEnvironment(browser, page, ['proposal', 'verify'].includes(stage))
  // Persist before the first assertion/capture so failed CI retains the actual environment.
  const environmentJson = JSON.stringify(environment, null, 2) + '\n'
  await writeFile(testInfo.outputPath('rendering-environment.json'), environmentJson, 'utf8')
  await testInfo.attach('rendering-environment', { body: environmentJson, contentType: 'application/json' })
  if (['proposal', 'verify'].includes(stage)) {
    expect(environment.gpu.featureStatus?.gpu_compositing).toBe('disabled_software')
    expect(environment.gpu.featureStatus?.rasterization).toBe('disabled_software')
    expect(environment.client).toMatchObject({ locale: 'en-US', dpr: 1, reducedMotion: true })
  }
  const captures: unknown[] = [], accessibility: unknown[] = []
  const captureStates: unknown[] = []
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const selected = new URLSearchParams({ demoDocument: seed.document_id, demoVersion: seed.version_id, demoChunk: seed.chunk_id, demoNamespace: seed.target.namespace })
  const source = `/documents?document=${seed.document_id}&version=${seed.version_id}&chunk=${seed.chunk_id}&page=1`
  const masks = ['.connection-message small', '.search-trace .document-panel-heading > strong', '.search-trace li > span:last-child', '.vector-metrics > span:nth-child(3) strong', '.vector-metrics > span:nth-child(4) strong']
  async function shots(screen: string, state: string, scan = true) {
    if (supplement && screen !== 'rag-chat') return
    const cleanRag = screen === 'rag-chat' && (supplement || ['verify', 'proposal'].includes(stage))
    for (const viewport of widths) {
      await page.setViewportSize(viewport)
      await page.evaluate(async () => { await document.fonts.ready; (document.activeElement as HTMLElement)?.blur(); scrollTo(0, 0); await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame) })
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
      // Baseline records defects; after/verify must fix them, never mask layout.
      if (stage !== 'before') expect(overflow, `${screen} overflow ${viewport.width}`).toBe(false)
      const file = `${cleanRag ? 'rag-chat-visible' : screen}-${viewport.width}.png`
      const renderingState = await page.evaluate(() => {
        const node = document.querySelector<HTMLElement>('.sim-node-content')
        return { deviceScaleFactor: devicePixelRatio, locale: navigator.language,
          fontsStatus: document.fonts.status, faces: Array.from(document.fonts).map(face => ({ family: face.family, weight: face.weight, status: face.status })),
          graph: node ? { viewport: document.querySelector('.react-flow__viewport')?.getAttribute('style'),
            nodes: document.querySelectorAll('.react-flow__node').length, font: getComputedStyle(node).font,
            step: document.querySelector<HTMLInputElement>('input[aria-label="Seek simulation step"]')?.value,
            mode: document.querySelector<HTMLSelectElement>('select[aria-label="Walkthrough"]')?.value,
            runningAnimations: document.querySelector('.simulator')?.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length } : null }
      })
      const captureState = { file, viewport, renderingState, sha256: null as string | null }
      captureStates.push(captureState)
      await writeFile(testInfo.outputPath('capture-states.json'), JSON.stringify(captureStates, null, 2) + '\n', 'utf8')
      if (stage === 'before' || stage === 'proposal') {
        let exists = false; try { await access(`${output}/${file}`); exists = true } catch { /* new baseline */ }
        if (exists) throw new Error(`Refuse overwriting ${stage} reference ${file}`)
      }
      const options = { fullPage: true, animations: 'disabled' as const, mask: masks.map(s => page.locator(cleanRag ? `${s}:visible` : s)), maskColor: '#30485c' }
      if (stage === 'verify') await expect(page).toHaveScreenshot(file, options)
      const image = await page.screenshot({ path: `${output}/${file}`, ...options })
      captureState.sha256 = createHash('sha256').update(image).digest('hex')
      await writeFile(testInfo.outputPath('capture-states.json'), JSON.stringify(captureStates, null, 2) + '\n', 'utf8')
      captures.push({ file, screen, state, viewport, overflow, scroll: { x: 0, y: 0 }, masks: cleanRag ? masks.map(s => `${s}:visible`) : masks, url: new URL(page.url()).pathname + new URL(page.url()).search })
      if (scan && [1440, 390].includes(viewport.width)) {
        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
        const violations = result.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) }))
        accessibility.push({ screen, width: viewport.width, violations })
        if (stage !== 'before') expect(violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')), `${screen} axe`).toEqual([])
      }
    }
    await page.setViewportSize({ width: 320, height: 844 })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    if (stage !== 'before') expect(overflow, `${screen} overflow320`).toBe(false)
    captures.push({ screen, width: 320, overflow, purpose: 'overflow only, no image' })
    await page.setViewportSize(widths[0])
  }
  await page.goto('/'); await expect(page.getByText('ONLINE', { exact: true })).toBeVisible()
  await shots('overview', 'Actual local health and loaded model, guide off')
  await page.goto('/documents'); await expect(page.getByRole('button', { name: 'Choose file', exact: true })).toBeEnabled()
  await shots('documents-unselected', 'Stored sample exists; source inspector intentionally unselected')
  await page.goto(source); await expect(page.getByLabel('Full chunk text')).toBeVisible()
  await shots('documents-source', 'Pinned confirmed source/page/chunk')
  await page.getByLabel('Saved versions', { exact: true }).selectOption(seed.draft)
  await expect(page.getByRole('region', { name: 'Chunk inspector' })).toContainText('DRAFT')
  await shots('chunks-versions', 'Retained draft180/30; confirmed300/50 remains ACTIVE')
  await page.goto(`/vectors?${selected}`)
  await expect(page.getByLabel('Embedding source chunk')).toHaveValue(seed.chunk_id)
  await page.getByRole('button', { name: 'Generate Embedding', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Passage vector 384 dimensions' })).toBeVisible({ timeout: 160000 })
  await shots('embeddings', 'Actual cached passage embedding384D, heatmap and source')
  await page.goto(`/vectors/store?${selected}`)
  await page.getByRole('button', { name: 'Load namespace', exact: true }).click()
  await expect(page.getByLabel('Saved manifest')).toBeEnabled()
  await page.getByLabel('Saved manifest').selectOption(seed.job_id)
  await page.getByRole('button', { name: `Fetch vector ${seed.vector}`, exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Fetched vector', exact: true })).toBeVisible()
  await shots('vector-explorer', 'Verified ACTIVE manifest and actual SQLite adapter fetch384D')
  await page.goto(`/search?${selected}`)
  await expect(page.getByLabel('Search index')).toHaveValue('local-e5')
  await page.getByLabel('Question in Vietnamese or another language').fill(query)
  await page.getByLabel('Top-K', { exact: true }).selectOption('1')
  await page.getByLabel('Compare with / without filters (same query embedding)').check()
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Search Trace' })).toBeVisible({ timeout: 160000 })
  await shots('semantic-search', 'Actual Top1/source/filter comparison and measured trace; only time numerals masked')
  await page.getByRole('tab', { name: 'RAG Chat', exact: true }).click()
  await expect(page.getByLabel('RAG index')).toHaveValue('local-e5')
  await page.getByLabel('RAG Top-K').selectOption('1')
  await page.getByLabel('RAG question in Vietnamese').fill(query)
  await page.getByRole('button', { name: 'Refresh Ollama readiness' }).click()
  await page.getByRole('button', { name: 'Send RAG question' }).click()
  await expect(page.getByRole('region', { name: 'RAG Trace' })).toBeVisible({ timeout: 160000 })
  await page.getByText('Context inspector ·', { exact: false }).click()
  await shots('rag-chat', 'Real retrieval or labeled NOT-E5; always Mock Ollama NOT REAL LLM; verified context open')
  await page.goto('/architecture')
  for (const simulation of ['write', 'read', 'compaction']) {
    await page.getByLabel('Walkthrough', { exact: true }).selectOption(simulation)
    await page.getByLabel('Seek simulation step').focus(); await page.keyboard.press('End')
    await shots(`architecture-${simulation}`, `SIMULATION toy2D seed7 ${simulation} final; not telemetry`)
  }
  const memory = { schema: 1, id: seed.id, step: 3, simulator: { mode: 'write', seed: 7, cursor: 0, playing: false, speed: 1 }, modes: [] }
  await page.evaluate(m => sessionStorage.setItem('pvl-guided-v1', JSON.stringify(m)), memory)
  await page.goto(`/vectors?${selected}`)
  await expect(page.getByRole('region', { name: 'Guided Demo', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Generate guided embedding' }).click()
  await expect(page.getByRole('region', { name: 'Guided source embedding', exact: true })).toBeVisible({ timeout: 160000 })
  await shots('guided-embedding', 'Restored real backend receipts, same session/source; explicit cached embedding')
  const guide = page.getByRole('navigation', { name: 'Guided Demo steps' })
  await guide.getByRole('button', { name: /8.*Slab simulation/ }).click()
  for (const simulation of ['write', 'read', 'compaction']) {
    await page.getByLabel('Walkthrough', { exact: true }).selectOption(simulation)
    await page.getByLabel('Seek simulation step').focus(); await page.keyboard.press('End')
  }
  await shots('guided-complete', 'All seven real actions verified; three simulation finals inspected through controls')
  await page.getByRole('button', { name: 'Cancel Guided Demo' }).click()
  await page.route('**/api/health', route => route.abort('connectionfailed'))
  await page.goto('/'); await expect(page.getByText('OFFLINE', { exact: true })).toBeVisible()
  await shots('offline-fault', 'Explicit health-request fault injection; backend remains running')
  await page.unroute('**/api/health')
  await page.goto(source); await expect(page.getByLabel('Full chunk text')).toBeVisible()
  await page.getByLabel('Overlap (source tokens)').fill('9999')
  await expect(page.getByRole('alert')).toBeVisible()
  await shots('invalid-config', 'Real client validation, retained confirmed data; no invalid request sent')
  await page.getByRole('button', { name: 'Delete selected document' }).click()
  await shots('delete-confirmation', 'Unconfirmed existing document deletion UI; never submit delete')
  expect(errors).toEqual([])
  expect(playback?.missing ?? []).toEqual([])
  await saveRecording?.()
  await testInfo.attach('capture-states', { body: JSON.stringify(captureStates, null, 2), contentType: 'application/json' })
  const manifest = { stage, mode, environment, label: `${fixture ? 'NOT E5' : 'REAL E5'} / LOCAL SQLITE / MOCK OLLAMA NOT REAL LLM / NO CLOUD`,
    source_base: '24d56a9af81d0277224dc0f3b7eff5fd0f395bf3', browser: browser.version(),
    head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), seed, captures, accessibility,
    provenance: 'Bundled project-authored CC0 Vietnamese sample; separate ignored data root; BEFORE never overwritten',
    transport: replaying ? 'READ-ONLY RECORDED NOT E5 API FIXTURE; NOT A BACKEND INTEGRATION TEST' : 'Actual isolated backend services',
    review: stage === 'before' ? 'Immutable D07 comparison reference' : 'Candidate for independent ChatGPT/owner visual review, not automatically approved' }
  await writeFile(`${output}/${supplement ? 'supplement-rag' : 'manifest'}.json`, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
})
