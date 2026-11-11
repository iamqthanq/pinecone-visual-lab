// Run only with the web server running and this project's API stopped.
import { chromium, expect } from '@playwright/test'

let apiResponded = false
try {
  await fetch('http://127.0.0.1:8000/api/health', { signal: AbortSignal.timeout(2000) })
  apiResponded = true
} catch { /* An unreachable API is the precondition for this smoke. */ }
if (apiResponded) throw new Error('Stop the local API before running the real-offline smoke.')

const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto('http://127.0.0.1:5173/')
  await expect(page.getByText('OFFLINE', { exact: true })).toBeVisible()
  await expect(page.getByText(/Start the FastAPI server/)).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: 'docs/evidence/d01/offline-real-server-stopped.png', fullPage: true })
  console.log('PASS: browser shows OFFLINE with the actual API stopped; no request interception used.')
} finally {
  await browser.close()
}
