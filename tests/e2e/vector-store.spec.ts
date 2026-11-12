import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'

const fixture = process.env.PVL_E2E_FIXTURE === '1'
const evidence = fixture ? 'test-results/fixture-screenshots' : 'docs/evidence/d08/regression'

test('confirmed chunks → E5/fixture → local upsert → actual adapter fetch → reload → namespace isolation → owned delete', async ({ page, request }) => {
  test.setTimeout(180000)
  const uploaded = await request.post('/api/documents', { multipart: { file: {
    name: 'vector-store-source.txt', mimeType: 'text/plain', buffer: Buffer.from('Cơ sở dữ liệu vector lưu biểu diễn ngữ nghĩa. Tìm kiếm dữ liệu theo độ tương đồng.\n\n'.repeat(5)),
  } } })
  expect(uploaded.status()).toBe(201)
  const doc = await uploaded.json()
  const source = await request.post(`/api/documents/${doc.id}/preview`, { data: { size: 300, overlap: 50 } })
  expect(source.status()).toBe(201)
  const version = await source.json()
  expect((await request.post(`/api/documents/${doc.id}/versions/${version.id}/confirm`)).ok()).toBeTruthy()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/vectors')
  await page.getByRole('link', { name: 'Open Vector Explorer' }).click()
  await expect(page.getByRole('heading', { name: 'Follow vectors into storage.' })).toBeVisible()
  await page.getByLabel('Namespace', { exact: true }).fill('seminar-d04')
  await page.getByRole('button', { name: 'Load namespace', exact: true }).click()
  await expect(page.getByText('Loaded: LOCAL / local-e5 / seminar-d04')).toBeVisible()
  await page.getByLabel('Source document', { exact: true }).selectOption(doc.id)
  await page.getByLabel('Confirmed source version', { exact: true }).selectOption(version.id)
  await page.getByRole('button', { name: 'Preview ingest', exact: true }).click()
  await expect(page.getByText('PENDING', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirm / resume ingest' })).toBeDisabled()
  await page.getByLabel(/I confirm this exact target/).check()
  await page.getByRole('button', { name: 'Confirm / resume ingest' }).click()
  await expect(page.getByText('All records fetched and verified. Manifest ACTIVE.')).toBeVisible({ timeout: 130000 })
  const jobsResponse = await request.get('/api/vector-store/jobs?mode=local&index=local-e5&namespace=seminar-d04')
  const manifest = (await jobsResponse.json()).jobs.find((item: { document_id: string }) => item.document_id === doc.id)
  expect(manifest.state).toBe('active')
  expect(manifest.checkpoint).toBe(version.chunks.length)
  expect(manifest.verified).toBe(version.chunks.length)
  await page.getByRole('button', { name: `Fetch vector ${manifest.ids[0]}`, exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Fetched vector', exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Stored vector 384 dimensions' }).locator('span')).toHaveCount(384)
  await expect(page.getByText('Actual SQLite adapter fetch', { exact: false })).toBeVisible()
  await page.getByRole('group', { name: 'Stored vector view' }).getByRole('button', { name: 'Table', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Stored vector numeric values' }).getByRole('row')).toHaveCount(385)
  await page.getByRole('button', { name: 'Copy stored vector JSON' }).click()
  await expect(page.getByText('Full stored vector JSON copied.')).toBeVisible()
  await page.getByRole('group', { name: 'Stored vector view' }).getByRole('button', { name: 'Heatmap' }).click()
  const fetched = await (await request.post('/api/vector-store/records/fetch', { data: { target: manifest.target, ids: [manifest.ids[0]] } })).json()
  expect(fetched.data_origin).toBe('SQLite adapter fetch')
  expect(fetched.records[0].metadata.embedding_mode).toBe(fixture ? 'test-fixture-not-e5' : 'e5')
  expect(fetched.records[0].metadata.version_id).toBe(version.id)
  expect(fetched.records[0].values).toHaveLength(384)
  await mkdir(evidence, { recursive: true })
  if (!fixture) await writeFile(`${evidence}/browser-stored-vector.json`, JSON.stringify({ manifest, fetched }, null, 2) + '\n', 'utf8')
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0) })
  await page.screenshot({ path: `${evidence}/vector-store-desktop-1440.png`, fullPage: true })
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(axe.violations.filter(v => ['serious', 'critical'].includes(v.impact ?? '')).map(v => ({ id: v.id, details: v.nodes[0]?.failureSummary }))).toEqual([])
  for (const width of [1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Store overflow at ${width}`).toBeTruthy()
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0) })
  await page.screenshot({ path: `${evidence}/vector-store-mobile-390.png`, fullPage: true })
  await page.reload()
  await page.getByLabel('Namespace', { exact: true }).fill('seminar-d04')
  await page.getByRole('button', { name: 'Load namespace', exact: true }).click()
  await expect(page.getByRole('button', { name: `Fetch vector ${manifest.ids[0]}`, exact: true })).toBeVisible()
  await page.getByLabel('Namespace', { exact: true }).fill('other-namespace')
  await page.getByRole('button', { name: 'Load namespace', exact: true }).click()
  await expect(page.getByText('No vector IDs in this namespace.', { exact: false })).toBeVisible()
  await page.getByLabel('Namespace', { exact: true }).fill('seminar-d04')
  await page.getByRole('button', { name: 'Load namespace', exact: true }).click()
  await page.getByLabel('Saved manifest', { exact: true }).selectOption(manifest.id)
  await page.getByRole('button', { name: 'Preview owned-vector deletion' }).click()
  await expect(page.getByRole('button', { name: 'Confirm exact deletion' })).toBeDisabled()
  await page.getByLabel('Delete only these exact owned IDs in the displayed target.').check()
  await page.getByRole('button', { name: 'Confirm exact deletion' }).click()
  await expect(page.getByText('Owned vectors deleted and absence verified. Source documents preserved.')).toBeVisible()
  expect((await request.get(`/api/documents/${doc.id}`)).ok()).toBeTruthy()
  const empty = await (await request.post('/api/vector-store/records/list', { data: { target: manifest.target } })).json()
  expect(empty.ids).toEqual([])
})

test('LIVE switching makes no implicit discovery; explicit connect is safely denied in offline E2E', async ({ page }) => {
  const calls: string[] = []
  page.on('request', request => { if (request.postData()?.includes('"mode":"live"')) calls.push(request.url()) })
  await page.goto('/vectors/store')
  await expect(page.getByRole('button', { name: 'Load namespace' })).toBeEnabled()
  await page.getByLabel('Storage mode').selectOption('live')
  await expect(page.getByText(/LIVE NOT VERIFIED/)).toBeVisible()
  expect(calls).toEqual([])
  await page.getByRole('button', { name: 'Connect / list LIVE indexes' }).click()
  await expect(page.getByRole('alert')).toContainText('cloud_disabled')
  await expect(page.getByRole('button', { name: 'Load namespace' })).toBeDisabled()
})

test('local index creation requires preview and explicit confirmation', async ({ page }) => {
  await page.goto('/vectors/store')
  await page.getByText('Create an index · preview first', { exact: true }).click()
  await page.getByLabel('New index name').fill('seminar-index')
  await page.getByRole('button', { name: 'Preview new index' }).click()
  await expect(page.getByRole('button', { name: 'Confirm create index' })).toBeDisabled()
  await page.getByLabel('I confirm this exact index configuration and have reviewed quota/cost.').check()
  await page.getByRole('button', { name: 'Confirm create index' }).click()
  await expect(page.getByText('Index created and Ready. Load a namespace to continue.')).toBeVisible()
  await expect(page.getByLabel('Index', { exact: true })).toHaveValue('seminar-index')
})

test('multi-page Vietnamese PDF confirmed version is stored with real source pages', async ({ page, request }) => {
  test.setTimeout(180000)
  execFileSync(process.platform === 'win32' ? '.venv/Scripts/python.exe' : 'python', ['scripts/create_pdf_fixture.py'], { env: { ...process.env, PYTHONUTF8: '1' } })
  const upload = await request.post('/api/documents', { multipart: { file: {
    name: 'store-vietnamese.pdf', mimeType: 'application/pdf', buffer: await readFile('.cache/e2e-fixtures/vietnamese.pdf'),
  } } })
  expect(upload.status()).toBe(201)
  const doc = await upload.json()
  expect(doc.page_count).toBe(2)
  const response = await request.post(`/api/documents/${doc.id}/preview`, { data: { size: 300, overlap: 50 } })
  expect(response.status()).toBe(201)
  const version = await response.json()
  expect((await request.post(`/api/documents/${doc.id}/versions/${version.id}/confirm`)).ok()).toBeTruthy()
  const preview = await request.post('/api/vector-store/ingest/preview', { data: {
    target: { mode: 'local', index: 'local-e5', namespace: 'pdf-d04' }, document_id: doc.id, version_id: version.id,
  } })
  expect(preview.ok()).toBeTruthy()
  let job = await preview.json()
  for (let i = 0; i < 100 && job.state !== 'active'; i++) {
    const step = await request.post(`/api/vector-store/jobs/${job.id}/step`, { data: { confirmed: true, preview_token: job.preview_token }, timeout: 130000 })
    expect(step.ok()).toBeTruthy()
    job = await step.json()
  }
  expect(job.state).toBe('active')
  const records: { metadata: Record<string, unknown> }[] = []
  for (let offset = 0; offset < job.ids.length; offset += 8) {
    const fetched = await request.post('/api/vector-store/records/fetch', { data: { target: job.target, ids: job.ids.slice(offset, offset + 8) } })
    expect(fetched.ok()).toBeTruthy()
    records.push(...(await fetched.json()).records)
  }
  expect(records).toHaveLength(version.chunks.length)
  expect(records.some(record => record.metadata.page_end === 2)).toBeTruthy()
  for (let i = 0; i < records.length; i++) {
    expect(records[i].metadata.chunk_id).toBe(version.chunks[i].chunk_id)
    expect(records[i].metadata.page_start).toBe(version.chunks[i].page_start)
    expect(records[i].metadata.page_end).toBe(version.chunks[i].page_end)
    expect(records[i].metadata.embedding_mode).toBe(fixture ? 'test-fixture-not-e5' : 'e5')
  }
  await page.goto('/vectors/store')
  await page.getByLabel('Namespace', { exact: true }).fill('pdf-d04')
  await page.getByRole('button', { name: 'Load namespace', exact: true }).click()
  await page.getByRole('button', { name: `Fetch vector ${job.ids[0]}`, exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Fetched vector', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Stored vector inspector' }).getByText('store-vietnamese.pdf', { exact: true })).toBeVisible()
  const removal = await (await request.post(`/api/vector-store/jobs/${job.id}/delete-preview`)).json()
  for (let i = 0; i < 100; i++) {
    const deletion = await request.post(`/api/vector-store/deletions/${removal.id}/step`, { data: { confirmed: true } })
    expect(deletion.ok()).toBeTruthy()
    if ((await deletion.json()).state === 'deleted') break
  }
  expect((await (await request.post('/api/vector-store/records/list', { data: { target: job.target } })).json()).ids).toEqual([])
})
