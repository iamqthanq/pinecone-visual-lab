import { test, expect } from '@playwright/test'
import { replay } from './replay'

test('production initial graph defers labs, diagram, GSAP and RAG; slow route cannot replace newer navigation', async ({ page }) => {
  const playback = await replay(page), assets: string[] = []
  page.on('request', request => { if (new URL(request.url()).pathname.endsWith('.js')) assets.push(request.url()) })
  await page.goto('/'); await expect(page.getByText('ONLINE', { exact: true })).toBeVisible()
  expect(assets.some(url => /DocumentsLab-|ArchitectureLab-|gsap-|RagChat-/.test(url))).toBe(false)
  let release!: () => void
  const hold = new Promise<void>(resolve => { release = resolve })
  await page.route('**/assets/DocumentsLab-*.js', async route => { await hold; await route.continue().catch(() => {}) })
  const nav = page.getByRole('navigation', { name: 'Main navigation' })
  await nav.getByRole('link', { name: 'Documents Lab', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Opening Documents Lab' })).toBeVisible()
  await nav.getByRole('link', { name: 'Search Lab', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Semantic Search', exact: true })).toBeVisible()
  release()
  await expect(page.getByRole('heading', { name: 'Start with the source.' })).toHaveCount(0)
  await expect(page.locator('#main')).toBeFocused()
  expect(assets.some(url => /ArchitectureLab-|gsap-|RagChat-/.test(url))).toBe(false)
  await page.getByRole('tab', { name: 'RAG Chat', exact: true }).click()
  await expect(page.getByLabel('RAG question in Vietnamese')).toBeVisible()
  expect(assets.some(url => /RagChat-/.test(url))).toBe(true)
  expect(playback.missing).toEqual([])
})

test('failed lazy asset keeps shell usable and explicit reload recovers the same URL', async ({ page }) => {
  const playback = await replay(page)
  await page.route('**/assets/DocumentsLab-*.js', route => route.abort('failed'))
  await page.goto('/documents')
  await expect(page.getByRole('alert')).toContainText('Documents Lab could not open')
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Return to Overview' })).toHaveAttribute('href', '/')
  await page.unroute('**/assets/DocumentsLab-*.js')
  await page.getByRole('button', { name: 'Reload current lab' }).click()
  await expect(page.getByRole('button', { name: 'Choose file', exact: true })).toBeEnabled()
  expect(new URL(page.url()).pathname).toBe('/documents')
  expect(playback.missing).toEqual([])
})

test('native confirmation traps keyboard focus, Escape restores invoker, mobile navigation works without pointer', async ({ page }) => {
  const playback = await replay(page), seed = playback.catalog.seed as { document_id: string; version_id: string; chunk_id: string }
  const deletes: string[] = []
  page.on('request', request => { if (request.method() === 'DELETE') deletes.push(request.url()) })
  await page.goto(`/documents?document=${seed.document_id}&version=${seed.version_id}&chunk=${seed.chunk_id}&page=1`)
  const remove = page.getByRole('button', { name: 'Delete selected document' })
  await expect(page.getByLabel('Full chunk text')).toBeVisible()
  await remove.focus(); await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog'), cancel = dialog.getByRole('button', { name: 'Cancel', exact: true })
  await expect(cancel).toBeFocused()
  await expect(cancel).toHaveCSS('outline-style', 'solid')
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true)
  }
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Shift+Tab')
    expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true)
  }
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(remove).toBeFocused()
  expect(deletes).toEqual([])
  await page.setViewportSize({ width: 390, height: 844 })
  const menu = page.getByRole('button', { name: 'Open navigation' })
  await menu.focus(); await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Close navigation' })).toHaveAttribute('aria-expanded', 'true')
  const architecture = page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Architecture Lab', exact: true })
  await architecture.focus(); await page.keyboard.press('Enter')
  await expect(page.locator('#main')).toBeFocused()
  await expect(page.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false')
  expect(playback.missing).toEqual([])
})

test('real GSAP motion settles and reduced-motion change leaves all source data visible', async ({ page }) => {
  const playback = await replay(page), seed = playback.catalog.seed as { document_id: string; version_id: string; chunk_id: string }
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(`/documents?document=${seed.document_id}&version=${seed.version_id}&chunk=${seed.chunk_id}&page=1`)
  const chunk = page.getByLabel('Full chunk text')
  await expect(chunk).toBeVisible()
  await expect.poll(() => page.locator('.chunk-detail').evaluate(node => [node.style.opacity, node.style.transform])).toEqual(['', ''])
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(chunk).toBeVisible()
  await expect(page.locator('.chunk-detail')).toHaveCSS('opacity', '1')
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Architecture Lab', exact: true }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.locator('.sim-node').first()).toHaveCSS('opacity', '1')
  expect(playback.missing).toEqual([])
})

test('Guided Demo can be cancelled while its lazy panel is pending without deleting source data', async ({ page }) => {
  const playback = await replay(page), seed = playback.catalog.seed as { id: string }
  await page.addInitScript(id => sessionStorage.setItem('pvl-guided-v1', JSON.stringify({ schema: 1, id, step: 3,
    simulator: { mode: 'write', seed: 7, cursor: 0, playing: false, speed: 1 }, modes: [] })), seed.id)
  let release!: () => void
  const hold = new Promise<void>(resolve => { release = resolve })
  await page.route('**/assets/GuidedPanel-*.js', async route => { await hold; await route.continue().catch(() => {}) })
  const deletes: string[] = []
  page.on('request', request => { if (request.method() === 'DELETE') deletes.push(request.url()) })
  try {
    await page.goto('/')
    await expect(page.getByRole('status').filter({ hasText: 'Opening Guided Demo' })).toBeVisible()
    await page.getByRole('button', { name: 'Cancel Guided Demo', exact: true }).click()
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('pvl-guided-v1'))).toBeNull()
  } finally { release() }
  await expect(page.getByRole('region', { name: 'Guided Demo', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Start Guided Demo', exact: true })).toBeVisible()
  expect(deletes).toEqual([]); expect(playback.missing).toEqual([])
})
