import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const fixture = process.env.PVL_E2E_FIXTURE === '1'
const evidence = fixture ? 'test-results/fixture-screenshots' : 'docs/evidence/d06'

test('confirmed source → CPU embedding → all 384 values → query → cosine → responsive inspector', async ({ page, request }) => {
  test.setTimeout(180000)
  const uploaded = await request.post('/api/documents', { multipart: { file: {
    name: 'embedding-source.txt', mimeType: 'text/plain', buffer: Buffer.from('query: Cơ sở dữ liệu vector lưu biểu diễn ngữ nghĩa. Tìm kiếm theo độ tương đồng.\n\n'.repeat(10)),
  } } })
  expect(uploaded.status()).toBe(201)
  const doc = await uploaded.json()
  const preview = await request.post(`/api/documents/${doc.id}/preview`, { data: { size: 300, overlap: 50 } })
  expect(preview.status()).toBe(201)
  const version = await preview.json()
  await request.post(`/api/documents/${doc.id}/versions/${version.id}/confirm`)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/vectors')
  await expect(page.getByLabel('Embedding document').locator('option', { hasText: doc.name })).toHaveCount(1)
  await page.getByLabel('Embedding document').selectOption(doc.id)
  await page.getByLabel('Embedding confirmed version').selectOption(version.id)
  await page.getByLabel('Embedding source chunk').selectOption(version.chunks[0].chunk_id)
  await expect(page.getByLabel('Embedding source text')).toContainText('Cơ sở dữ liệu vector')
  await page.getByRole('button', { name: 'Generate Embedding', exact: true }).click()
  const heatmap = page.getByRole('group', { name: 'Passage vector 384 dimensions' })
  await expect(heatmap).toBeVisible({ timeout: 130000 })
  await expect(heatmap.locator('span')).toHaveCount(384)
  await page.getByRole('group', { name: 'Passage vector view' }).getByRole('button', { name: 'Table', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Passage vector numeric values' }).getByRole('row')).toHaveCount(385)
  await page.getByRole('button', { name: 'Copy Passage vector' }).click()
  await expect(page.getByText('Full 384D vector JSON copied.')).toBeVisible()
  await page.getByRole('group', { name: 'Passage vector view' }).getByRole('button', { name: 'Heatmap' }).click()
  await page.getByLabel('Vietnamese or multilingual query').fill('Tìm kiếm dữ liệu vector theo ngữ nghĩa như thế nào?')
  await page.getByRole('button', { name: 'Generate query embedding' }).click()
  await expect(page.getByRole('group', { name: 'Query vector 384 dimensions' })).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: 'Compare query with chunk' }).click()
  await expect(page.getByLabel('Cosine similarity')).toBeVisible()
  expect(Number(await page.getByLabel('Cosine similarity').textContent())).toBeGreaterThanOrEqual(-1)
  await page.getByRole('button', { name: 'Related pair', exact: true }).click()
  await page.getByRole('button', { name: 'Compare sentences' }).click()
  await expect(page.getByLabel('Cosine similarity')).toBeVisible({ timeout: 30000 })
  const status = await (await request.get('/api/embeddings/status')).json()
  expect(status.mode).toBe(fixture ? 'test-fixture-not-e5' : 'e5')
  expect(status.state).toBe('loaded')
  const result = await request.post('/api/embeddings/chunks', { data: {
    document_id: doc.id, version_id: version.id, chunk_ids: [version.chunks[0].chunk_id],
  } })
  const batch = await result.json()
  expect(batch.records[0].values).toHaveLength(384)
  expect(batch.records[0].source_chunk_id).toBe(version.chunks[0].chunk_id)
  expect(batch.records[0].cached).toBe(true)
  await mkdir(evidence, { recursive: true })
  if (!fixture) await writeFile(`${evidence}/browser-vector-sample.json`, JSON.stringify(batch, null, 2)+'\n', 'utf8')
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0) })
  await page.screenshot({ path: `${evidence}/vectors-desktop-1440.png`, fullPage: true })
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(axe.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')).map(v => ({
    id: v.id, impact: v.impact, nodeCount: v.nodes.length, details: v.nodes[0]?.failureSummary,
  }))).toEqual([])
  for (const width of [1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `${evidence}/vectors-mobile-390.png`, fullPage: true })
  await page.getByLabel('Vietnamese or multilingual query').fill('a '.repeat(1200))
  await page.getByRole('button', { name: 'Generate query embedding' }).click()
  await expect(page.getByRole('alert')).toContainText('512 tokens')
  await expect(page.getByRole('group', { name: 'Query vector 384 dimensions' })).toHaveCount(0)
})

test('model missing stays unavailable, with no invented vector or startup download', async ({ page }) => {
  await page.route('**/api/embeddings/status', route => route.fulfill({ json: {
    state: 'not_cached', mode: 'e5', model_id: 'intfloat/multilingual-e5-small', model_revision: 'test-unavailable', dimension: 384,
    message: 'Model not cached. Run opt-in setup.', setup_command: 'setup_embedding_model.py --accept-download', cache_state: 'missing',
  } }))
  await page.goto('/vectors')
  await expect(page.getByText('NOT CACHED', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Generate query embedding' })).toBeDisabled()
  await expect(page.getByText('Model not cached. Run opt-in setup.')).toBeVisible()
  await expect(page.getByRole('group', { name: 'Query vector 384 dimensions' })).toHaveCount(0)
})
