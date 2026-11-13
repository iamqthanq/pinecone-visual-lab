import type { Page, Request } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'

const file = 'docs/evidence/d08/fixture-replay.json'
interface Recorded { status: number; body: unknown }
interface Catalog { label: string; seed: unknown; responses: Record<string, Recorded> }
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]))
  return value
}
function key(request: Request) {
  const url = new URL(request.url()); url.searchParams.sort()
  let body: unknown = request.postData()
  try { body = request.postDataJSON() } catch { /* non-JSON key stays literal */ }
  return `${request.method()} ${url.pathname}${url.search} ${JSON.stringify(canonical(body))}`
}
export async function recorded() { return JSON.parse(await readFile(file, 'utf8')) as Catalog }
export async function replay(page: Page) {
  const catalog = await recorded(), missing: string[] = []
  await page.route('**/*', async route => {
    if (new URL(route.request().url()).hostname === '127.0.0.1') await route.fallback()
    else { missing.push(`NON-LOOPBACK REQUEST BLOCKED: ${route.request().url()}`); await route.abort('blockedbyclient') }
  })
  await page.route('**/api/**', async route => {
    const id = key(route.request()), response = catalog.responses[id]
    if (!response) { missing.push(id); await route.abort('blockedbyclient'); return }
    await route.fulfill({ status: response.status, contentType: 'application/json', body: JSON.stringify(response.body) })
  })
  return { catalog, missing }
}
export function record(page: Page, seed: unknown) {
  const responses: Record<string, Recorded> = {}, pending: Promise<void>[] = []
  page.on('response', response => {
    if (!new URL(response.url()).pathname.startsWith('/api/')) return
    pending.push((async () => {
      try {
        const id = key(response.request()), body: unknown = await response.json()
        responses[id] ??= { status: response.status(), body }
      } catch { /* aborted health-fault response has no body */ }
    })())
  })
  return async () => {
    await Promise.all(pending)
    await writeFile(file, JSON.stringify({ label: 'RECORDED ACTUAL NOT E5 / MOCK OLLAMA NOT REAL LLM / SYNTHETIC CC0 / NO CLOUD', seed, responses }, null, 2) + '\n', 'utf8')
  }
}
