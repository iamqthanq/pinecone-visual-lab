import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const fixture = process.env.PVL_E2E_FIXTURE === '1'
const evidence = fixture ? 'test-results/fixture-screenshots' : 'docs/evidence/d06'

test('Vietnamese PDF/TXT → ACTIVE ingest → Search/filter/compare/trace → exact historical source → reload/namespace', async ({ page, request }) => {
  test.setTimeout(240000)
  execFileSync(process.platform === 'win32' ? '.venv/Scripts/python.exe' : 'python', ['scripts/create_pdf_fixture.py'], { env: { ...process.env, PYTHONUTF8: '1' } })
  const sources = [
    { name: 'search-vietnamese.pdf', mimeType: 'application/pdf', buffer: await readFile('.cache/e2e-fixtures/vietnamese.pdf') },
    { name: 'bánh-mì.txt', mimeType: 'text/plain', buffer: Buffer.from('Làm bánh mì: trộn bột mì, men, muối và nước, ủ bột rồi nướng trong lò.\n'.repeat(3)) },
  ]
  const docs: { id: string; name: string; version: { id: string; chunks: { chunk_id: string; text: string; page_start: number; page_end: number }[] } }[] = []
  for (const file of sources) {
    const uploaded = await request.post('/api/documents', { multipart: { file } })
    expect(uploaded.status()).toBe(201)
    const doc = await uploaded.json()
    const draft = await request.post(`/api/documents/${doc.id}/preview`, { data: { size: 300, overlap: 50 } })
    expect(draft.status()).toBe(201)
    const version = await draft.json()
    expect((await request.post(`/api/documents/${doc.id}/versions/${version.id}/confirm`)).ok()).toBeTruthy()
    const preview = await request.post('/api/vector-store/ingest/preview', { data: { target: { mode: 'local', index: 'local-e5', namespace: 'search-seminar' }, document_id: doc.id, version_id: version.id } })
    expect(preview.ok()).toBeTruthy()
    let job = await preview.json()
    for (let i = 0; i < 100 && job.state !== 'active'; i++) {
      const step = await request.post(`/api/vector-store/jobs/${job.id}/step`, { data: { confirmed: true, preview_token: job.preview_token }, timeout: 130000 })
      expect(step.ok()).toBeTruthy()
      job = await step.json()
    }
    expect(job.state).toBe('active')
    docs.push({ id: doc.id, name: doc.name, version })
  }
  // D02's newest confirmed pointer is deliberately different from D04's ACTIVE generation.
  const newer = await (await request.post(`/api/documents/${docs[0].id}/preview`, { data: { size: 180, overlap: 30 } })).json()
  expect((await request.post(`/api/documents/${docs[0].id}/versions/${newer.id}/confirm`)).ok()).toBeTruthy()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/search')
  await expect(page.getByRole('heading', { name: 'Find meaning. Follow the source.' })).toBeVisible()
  await expect(page.getByLabel('Search index')).toHaveValue('local-e5')
  await page.getByLabel('Question in Vietnamese or another language').fill('Cơ sở dữ liệu vector tìm kiếm thông tin theo ngữ nghĩa như thế nào?')
  await page.getByLabel('Search namespace').fill('search-seminar')
  await page.getByLabel('Top-K', { exact: true }).selectOption('1')
  await page.getByLabel('Filter document', { exact: true }).selectOption(docs[0].id)
  await page.getByLabel('Exact source filename').fill(docs[0].name)
  await page.getByLabel('Page from', { exact: true }).fill('2')
  await page.getByLabel('Page to', { exact: true }).fill('2')
  await page.getByLabel('Compare with / without filters (same query embedding)').check()
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/search') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Search', exact: true }).focus()
  await page.keyboard.press('Enter')
  const response = await responsePromise
  expect(response.ok()).toBeTruthy()
  const result = await response.json()
  expect(result.embedding.mode).toBe(fixture ? 'test-fixture-not-e5' : 'e5')
  expect(result.embedding.prefix).toBe('query: ')
  expect(result.embedding.input_token_count).toBeLessThanOrEqual(512)
  expect(result.hits).toHaveLength(1)
  expect(result.hits[0].document_id).toBe(docs[0].id)
  expect(result.hits[0].version_id).toBe(docs[0].version.id)
  expect(result.hits[0].page_start).toBeLessThanOrEqual(2)
  expect(result.hits[0].page_end).toBeGreaterThanOrEqual(2)
  expect(result.comparison).toHaveLength(1)
  expect(result.trace.stages.some((stage: { name: string }) => stage.name === 'source_lookup')).toBeTruthy()
  expect(result.trace.stages.every((stage: { ms: number }) => Number.isFinite(stage.ms) && stage.ms >= 0)).toBeTruthy()
  const filtered = page.getByRole('region', { name: 'Filtered results', exact: true })
  await expect(filtered.getByRole('link', { name: 'Open exact source' })).toHaveAttribute('href', result.hits[0].source_url)
  await expect(page.getByRole('region', { name: 'Search Trace' })).toBeVisible()
  await filtered.getByRole('button', { name: 'Copy citation rank 1 Filtered results' }).click()
  await expect(page.getByText('Source text and citation copied.')).toBeVisible()
  await mkdir(evidence, { recursive: true })
  await writeFile(fixture ? 'docs/evidence/d06/fixture-search-example.json' : 'docs/evidence/d06/browser-search-example.json', JSON.stringify({ label: fixture ? 'OFFLINE FIXTURE — NOT E5 / NO CLOUD' : 'REAL E5 / LOCAL SQLite / NO CLOUD', request: response.request().postDataJSON(), response: result }, null, 2) + '\n', 'utf8')
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0) })
  await page.screenshot({ path: `${evidence}/search-desktop-1440.png`, fullPage: true })
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(axe.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')).map(v => ({ id: v.id, summary: v.nodes[0]?.failureSummary }))).toEqual([])
  for (const width of [1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Search overflow at ${width}`).toBeTruthy()
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0) })
  await page.screenshot({ path: `${evidence}/search-mobile-390.png`, fullPage: true })
  await filtered.getByRole('link', { name: 'Open exact source' }).click()
  await expect(page.getByLabel('Saved versions')).toHaveValue(docs[0].version.id)
  const chunk = docs[0].version.chunks.find(c => c.chunk_id === result.hits[0].chunk_id)!
  expect(chunk).toBeTruthy()
  await expect(page.getByLabel('Full chunk text')).toHaveText(chunk.text)
  await expect(page.getByLabel(`Page ${chunk.page_start} text`)).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Saved versions')).toHaveValue(docs[0].version.id)
  await expect(page.getByLabel('Full chunk text')).toHaveText(chunk.text)
  await page.goto('/search')
  await page.getByLabel('Question in Vietnamese or another language').fill('Tìm kiếm vector')
  await page.getByLabel('Search namespace').fill('no-such-namespace')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByText('No matching chunks.')).toBeVisible()
  await page.getByLabel('Page from', { exact: true }).fill('3')
  await page.getByLabel('Page to', { exact: true }).fill('2')
  await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeDisabled()
  await expect(page.getByRole('alert')).toContainText('Invalid filter')
  await page.getByRole('button', { name: 'Reset query & filters' }).click()
  await expect(page.getByLabel('Question in Vietnamese or another language')).toHaveValue('')
})

test('Search reload and LIVE switch make no automatic cloud query; invalid deep links fail closed', async ({ page }) => {
  const searches: string[] = []
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/search')) searches.push(request.url()) })
  await page.goto('/search')
  await page.getByLabel('Retrieval mode').selectOption('live')
  await expect(page.getByText(/LIVE NOT VERIFIED/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Load search indexes' })).toBeDisabled()
  expect(searches).toEqual([])
  await page.reload()
  await expect(page.getByLabel('Retrieval mode')).toHaveValue('local')
  expect(searches).toEqual([])
  await page.goto('/documents?document=not-a-uuid&version=bad&chunk=bad&page=1')
  await expect(page.getByRole('alert')).toContainText('Invalid source link')
  await expect(page.getByLabel('Full chunk text')).toHaveCount(0)
})
