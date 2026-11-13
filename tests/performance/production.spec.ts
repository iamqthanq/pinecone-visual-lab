import { test, expect } from '@playwright/test'
import { mkdir, writeFile, access, readFile } from 'node:fs/promises'
import os from 'node:os'

const stage = process.env.PVL_VISUAL_STAGE ?? 'after'
test('production cold-entry, route CPU/network and bounded simulator frame profile', async ({ browser, request }) => {
  // BEFORE ran after the real visual audit on the same API. Match its loaded status,
  // outside browser timing, using only the already approved local synthetic E5 cache.
  if (stage === 'after') {
    const seed = JSON.parse(await readFile('.cache/d08-audit/real/seed.json', 'utf8'))
    const warm = await request.post('/api/search', { data: { query: 'Tìm kiếm vector sử dụng embedding và cosine như thế nào?', top_k: 1, target: seed.target }, timeout: 160000 })
    expect(warm.ok(), await warm.text()).toBe(true)
    expect((await warm.json()).embedding.mode).toBe('e5')
  }
  const samples = []
  for (let run = 0; run < 5; run++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' })
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }); await cdp.send('Performance.enable')
    await page.addInitScript(() => {
      const results: { duration: number; startTime: number }[] = []
      new PerformanceObserver(list => results.push(...list.getEntries().map(e => ({ duration: e.duration, startTime: e.startTime })))).observe({ type: 'longtask', buffered: true })
      Object.assign(window, { __d08LongTasks: results })
    })
    const begin = performance.now()
    await page.goto('http://127.0.0.1:5175/', { waitUntil: 'load' })
    await expect(page.getByRole('heading', { name: /Vector search,/ })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    const initialReadyMs = performance.now() - begin
    const initialMetrics = await cdp.send('Performance.getMetrics')
    const initialResources = await page.evaluate(() => performance.getEntriesByType('resource').filter(e => e.name.includes('/assets/') && new URL(e.name).pathname.endsWith('.js')).map(e => {
      const r = e as PerformanceResourceTiming; return { file: new URL(r.name).pathname, decodedBodySize: r.decodedBodySize, transferSize: r.transferSize, duration: r.duration }
    }))
    const routeStart = performance.now()
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Architecture Lab', exact: true }).click()
    await expect(page.locator('.react-flow__node')).toHaveCount(13)
    const routeReadyMs = performance.now() - routeStart
    const routeResources = await page.evaluate(() => performance.getEntriesByType('resource').filter(e => e.name.includes('/assets/') && new URL(e.name).pathname.endsWith('.js')).map(e => {
      const r = e as PerformanceResourceTiming; return { file: new URL(r.name).pathname, decodedBodySize: r.decodedBodySize, transferSize: r.transferSize, duration: r.duration }
    }))
    await page.getByLabel('Walkthrough', { exact: true }).selectOption('read')
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    const gaps = await page.evaluate(() => new Promise<number[]>(resolve => {
      const samples: number[] = []; let previous = performance.now(); const start = previous
      let frame = 0
      const collect = (time: number) => { samples.push(time - previous); previous = time
        if (time - start >= 2200) { cancelAnimationFrame(frame); resolve(samples) } else frame = requestAnimationFrame(collect)
      }
      frame = requestAnimationFrame(collect)
    }))
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    const finalMetrics = await cdp.send('Performance.getMetrics')
    const longTasks = await page.evaluate(() => (window as unknown as { __d08LongTasks: { duration: number; startTime: number }[] }).__d08LongTasks)
    samples.push({ run, initialReadyMs, routeReadyMs, initialResources, routeResources, initialMetrics: initialMetrics.metrics, finalMetrics: finalMetrics.metrics, longTasks, frameGapsMs: gaps })
    await context.close()
  }
  const directory = 'docs/evidence/d08'
  await mkdir(directory, { recursive: true })
  const file = `${directory}/performance-${stage}.json`
  if (stage === 'before') { let exists = false; try { await access(file); exists = true } catch { /* new baseline */ }; if (exists) throw new Error('Refuse overwriting baseline profile') }
  await writeFile(file, JSON.stringify({ stage, browser: browser.version(), os: `${os.platform()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0].model, cores: os.cpus().length, memoryBytes: os.totalmem(),
    method: '5 fresh Edge contexts; CDP cache disabled; loopback production HTTP, no compression/throttling; initial ready includes local fonts; route to13-node graph; finite2.2s rAF observation during Read Play. CDP cumulative CPU/layout/heap metrics and browser longtask observer. No E5 inference is timed here. Raw filmstrip/FPS/DevTools trace NOT MEASURED.', samples }, null, 2) + '\n', 'utf8')
})
