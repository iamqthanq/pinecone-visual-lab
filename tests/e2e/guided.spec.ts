import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const fixture = process.env.PVL_E2E_FIXTURE === '1'
const evidence = fixture ? 'test-results/fixture-screenshots' : 'docs/evidence/d08/review-r1/regression'
const label = `${fixture ? 'NOT E5' : 'REAL E5'} / SQLite / MOCK OLLAMA or search-only / NO CLOUD`
async function action(page: Page, button: string, type: string) {
  const response = page.waitForResponse(r => r.url().includes('/api/guided/sessions/') && r.url().endsWith('/actions') && r.request().postDataJSON()?.action === type, { timeout: 160000 })
  await page.getByRole('button', { name: button, exact: true }).click()
  const result = await response
  expect(result.ok(), await result.text()).toBeTruthy()
  return result.json()
}
async function next(page: Page) { await expect(page.getByRole('button', { name: 'Next guided step' })).toBeEnabled(); await page.getByRole('button', { name: 'Next guided step' }).click() }
async function seekEnd(page: Page) { await page.getByLabel('Seek simulation step').focus(); await page.keyboard.press('End') }
async function captured(page: Page, name: string) {
  await mkdir(evidence, { recursive: true })
  // Capture fixed shell elements at the document origin, not their prior scroll offset.
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
  await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true })
}

test('complete guided local pipeline, reload/source linking, optional RAG, three simulations and safe reset', async ({ page, request }) => {
  test.setTimeout(480000)
  page.setDefaultTimeout(15000)
  // Independent unrelated user fixture, including another index/namespace/vector.
  const unrelated = await (await request.post('/api/documents', { multipart: { file: { name: 'user-unrelated.txt', mimeType: 'text/plain', buffer: Buffer.from('Tài liệu cá nhân tổng hợp: trồng cây và tưới nước trong vườn.') } } })).json()
  const userVersion = await (await request.post(`/api/documents/${unrelated.id}/preview`, { data: { size: 300, overlap: 50 } })).json()
  expect((await request.post(`/api/documents/${unrelated.id}/versions/${userVersion.id}/confirm`)).ok()).toBeTruthy()
  const userTarget = { mode: 'local', index: 'guide-user-index', namespace: 'unrelated-user-space' }
  const create = await (await request.post('/api/vector-store/indexes/create/preview', { data: { target: userTarget, cloud: 'local', region: 'this-device' } })).json()
  expect((await request.post('/api/vector-store/indexes/create/confirm', { data: { preview_id: create.preview_id, confirmed: true } })).ok()).toBeTruthy()
  let userJob = await (await request.post('/api/vector-store/ingest/preview', { data: { target: userTarget, document_id: unrelated.id, version_id: userVersion.id } })).json()
  for (let i = 0; i < 16 && userJob.state !== 'active'; i++) {
    const response = await request.post(`/api/vector-store/jobs/${userJob.id}/step`, { data: { confirmed: true, preview_token: userJob.preview_token }, timeout: 130000 })
    expect(response.ok()).toBeTruthy(); userJob = await response.json()
  }
  expect(userJob.state).toBe('active')
  const userFetch = await (await request.post('/api/vector-store/records/fetch', { data: { target: userTarget, ids: userJob.ids } })).json()
  const writes: string[] = []
  page.on('request', r => { if (r.method() === 'POST' && r.url().includes('/api/guided')) writes.push(r.url()) })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  expect(writes).toEqual([])
  await page.getByRole('button', { name: 'Start Guided Demo', exact: true }).click()
  const guide = page.getByRole('region', { name: 'Guided Demo', exact: true })
  await expect(guide).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next guided step' })).toBeDisabled()
  const upload = await action(page, 'Upload / verify project sample', 'upload')
  const sid = upload.session.id
  expect(upload.session.completed.extract).toBe(false)
  expect(upload.session.target.namespace).toMatch(/^pvl-demo-[a-f0-9]{32}$/)
  expect(upload.session.embedding_mode).toBe(fixture ? 'test-fixture-not-e5' : 'e5')
  const entries: unknown[] = [{ action: 'upload', ...upload }]
  await next(page)
  expect(new URL(page.url()).searchParams.get('demoDocument')).toBe(upload.session.document_id)
  const extracted = await action(page, 'Inspect / verify extracted page', 'extract')
  expect(extracted.result.pages[0].page_number).toBe(1)
  entries.push({ action: 'extract', ...extracted })
  await next(page)
  const preview = await action(page, 'Preview guided chunks', 'preview')
  expect(preview.result.state).toBe('draft')
  await expect(page.getByRole('button', { name: 'Next guided step' })).toBeDisabled()
  await page.getByLabel('I inspected this preview and confirm the demo version.').check()
  const confirmed = await action(page, 'Confirm guided chunks', 'confirm')
  expect(confirmed.result.state).toBe('confirmed')
  entries.push({ action: 'confirm', ...confirmed })
  const count = writes.length
  await page.reload()
  await expect(page.getByRole('button', { name: 'Next guided step' })).toBeEnabled()
  expect(writes.length).toBe(count)
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('pvl-guided-v1')!).step)).toBe(2)
  await next(page)
  const embedding = await action(page, 'Generate guided embedding', 'embedding')
  const vector = embedding.result.records[0]
  expect(vector.mode).toBe(fixture ? 'test-fixture-not-e5' : 'e5')
  expect(vector.values).toHaveLength(384)
  expect(Math.hypot(...vector.values)).toBeCloseTo(1, 5)
  expect(vector.source_version_id).toBe(confirmed.result.id)
  await expect(page.getByRole('region', { name: 'Guided source embedding', exact: true })).toContainText('384 DIMENSIONS')
  entries.push({ action: 'embedding', ...embedding })
  await next(page)
  const ingest = await action(page, 'Preview guided LOCAL ingest', 'ingest_preview')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Preview guided LOCAL ingest' })).toBeEnabled()
  const resumed = await action(page, 'Preview guided LOCAL ingest', 'ingest_preview')
  expect(resumed.result.id).toBe(ingest.result.id)
  await page.getByLabel('I confirm ingesting this confirmed sample into its LOCAL namespace.').check()
  let job = resumed.result
  for (let i = 0; i < 16 && job.state !== 'active'; i++) job = (await action(page, 'Ingest next LOCAL batch', 'ingest_step')).result
  expect(job.state).toBe('active'); expect(job.verified).toBe(job.count)
  const fetch = await action(page, 'Fetch / verify guided vector', 'fetch')
  expect(fetch.session.completed.upsert).toBe(true)
  expect(fetch.result.records[0].metadata.version_id).toBe(confirmed.result.id)
  entries.push({ action: 'fetch', ...fetch })
  await next(page)
  await page.getByLabel('Guided Top-K', { exact: true }).selectOption('1')
  await page.getByLabel('Guided page filter', { exact: true }).fill('2')
  const empty = await action(page, 'Run guided semantic search', 'search')
  expect(empty.result.hits).toHaveLength(0)
  await expect(page.getByRole('button', { name: 'Next guided step' })).toBeDisabled()
  await page.getByLabel('Guided page filter', { exact: true }).fill('1')
  const search = await action(page, 'Run guided semantic search', 'search')
  expect(search.result.hits).toHaveLength(1)
  expect(search.result.hits[0].document_id).toBe(upload.session.document_id)
  expect(search.result.embedding.prefix).toBe('query: ')
  entries.push({ action: 'search', ...search })
  await guide.getByRole('link', { name: 'Open guided result source →' }).click()
  await expect(page.getByLabel('Full chunk text')).toHaveText(search.result.hits[0].text)
  await page.reload()
  await expect(page.getByLabel('Saved versions')).toHaveValue(confirmed.result.id)
  await expect(page.getByLabel('Full chunk text')).toHaveText(search.result.hits[0].text)
  await next(page)
  await expect(page.getByRole('tab', { name: 'RAG Chat', exact: true })).toHaveAttribute('aria-selected', 'true')
  const rag = await action(page, 'Run guided search-only RAG', 'rag')
  expect(rag.result.status).toBe('search_only')
  expect(rag.result.answer).toBeNull()
  expect(rag.result.search.embedding.mode).toBe(fixture ? 'test-fixture-not-e5' : 'e5')
  entries.push({ action: 'rag', ...rag })
  await next(page)
  await expect(page.getByText('SIMULATION — EDUCATIONAL MODEL — NOT PINECONE TELEMETRY', { exact: true })).toBeVisible()
  await expect(page.locator('.react-flow__node')).toHaveCount(13)
  for (const mode of ['write', 'read', 'compaction']) {
    await page.getByLabel('Walkthrough', { exact: true }).selectOption(mode)
    await seekEnd(page)
    const image = JSON.parse(await page.getByTestId('simulation-snapshot').textContent() ?? '{}')
    if (mode === 'read') { expect(image.top.map((r: { id: string }) => r.id)).toEqual(['c-7', 'a-7']); expect(image.top[0].score).toBeCloseTo(1 / Math.sqrt(2), 12) }
    if (mode === 'compaction') { expect(image.slabs.at(-1).id).toBe('L2-1'); expect(image.slabs.at(-1).records.find((r: { id: string }) => r.id === 'b-7').values).toBeNull() }
    await mkdir(evidence, { recursive: true })
    await writeFile(`${fixture ? 'test-results' : 'docs/evidence/d08/review-r1/regression'}/simulator-${mode}.json`, JSON.stringify({ label: 'SIMULATION / TOY 2D / NOT E5 / NOT PINECONE TELEMETRY', snapshot: image }, null, 2) + '\n', 'utf8')
    if (!fixture) await captured(page, `simulator-${mode}-1440`)
  }
  await expect(page.getByText('Guided Demo complete. Real local pipeline and educational simulation remain distinct.')).toBeVisible()
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(axe.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')).map(v => ({ id: v.id, summary: v.nodes[0]?.failureSummary }))).toEqual([])
  await captured(page, 'guided-simulator-desktop-1440')
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Guided simulator overflow at ${width}`).toBeTruthy()
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await captured(page, 'guided-simulator-mobile-390')
  const reset = await action(page, 'Reset tour / simulation only', 'reset')
  expect(Object.values(reset.session.completed).every(v => v === false)).toBeTruthy()
  expect((await request.get(`/api/documents/${unrelated.id}`)).ok()).toBeTruthy()
  expect((await request.get(`/api/documents/${upload.session.document_id}`)).ok()).toBeTruthy()
  const remaining = await (await request.post('/api/vector-store/records/fetch', { data: { target: userTarget, ids: userJob.ids } })).json()
  expect(remaining.records).toEqual(userFetch.records)
  expect((await request.get(`/api/vector-store/jobs/${job.id}`)).ok()).toBeTruthy()
  entries.push({ action: 'reset', ...reset, unrelated_preserved: true })
  await writeFile(fixture ? 'docs/evidence/d08/review-r1/regression/fixture-guided-example.json' : 'docs/evidence/d08/review-r1/regression/browser-guided-example.json', JSON.stringify({ label, sid, entries }, null, 2) + '\n', 'utf8')
  await page.getByRole('button', { name: 'Cancel Guided Demo' }).click()
  await expect(page.getByRole('region', { name: 'Guided Demo', exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => sessionStorage.getItem('pvl-guided-v1'))).toBeNull()
})

test('standalone simulation finite play/pause/back/replay/reset, reduced motion and no backend writes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const writes: string[] = []
  page.on('request', r => { if (r.method() !== 'GET') writes.push(r.url()) })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/architecture')
  await page.getByLabel('Walkthrough', { exact: true }).selectOption('read')
  await expect(page.getByText(/REDUCED MOTION:/)).toBeVisible()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect.poll(() => page.getByLabel('Seek simulation step').inputValue()).not.toBe('0')
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  const cursor = await page.getByLabel('Seek simulation step').inputValue()
  await page.waitForTimeout(1100) // presentation scheduler test, never a logical oracle or latency claim
  expect(await page.getByLabel('Seek simulation step').inputValue()).toBe(cursor)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  expect(await page.getByLabel('Seek simulation step').inputValue()).toBe(cursor)
  await page.getByRole('button', { name: 'Replay', exact: true }).click()
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  expect(await page.getByLabel('Seek simulation step').inputValue()).toBe('0')
  await page.getByLabel('Speed', { exact: true }).selectOption('2')
  await seekEnd(page)
  await captured(page, 'simulator-desktop-1440')
  await page.setViewportSize({ width: 390, height: 844 })
  await captured(page, 'simulator-mobile-390')
  await page.goto('/')
  await page.goto('/architecture')
  expect(await page.getByLabel('Seek simulation step').inputValue()).toBe('0')
  expect(writes).toEqual([])
})

test('malformed guide storage and backend failure remain cancellable without implicit data/model calls', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('pvl-guided-v1', '{malformed'))
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Guided Demo', exact: true })).toHaveCount(0)
  await page.route('**/api/guided/sessions', route => route.abort('connectionfailed'))
  await page.getByRole('button', { name: 'Start Guided Demo', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Guided backend offline')
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Architecture Lab' }).click()
  await expect(page.getByRole('heading', { name: 'Follow a write. Unpack a read.' })).toBeVisible()
})
