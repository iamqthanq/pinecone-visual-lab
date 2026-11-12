import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const evidence = process.env.PVL_E2E_FIXTURE === '1' ? 'test-results/fixture-screenshots' : 'docs/evidence/d08/regression'

test('live API health, desktop navigation, accessibility, and screenshot', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const response = await request.get('http://127.0.0.1:8001/api/health')
  expect(response.ok()).toBeTruthy()
  expect(await response.json()).toMatchObject({
    status: 'ok', phase: 'D07', documents: 'available', pinecone: 'not_configured',
  })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await expect(page.getByText('ONLINE', { exact: true })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: `${evidence}/overview-desktop-1440.png`, fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([])
  for (const title of ['Documents Lab', 'Vectors Lab', 'Search Lab', 'Architecture Lab']) {
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: title }).click()
    if (title === 'Documents Lab') {
      await expect(page.getByRole('heading', { name: 'Start with the source.' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Choose file' })).toBeEnabled()
    } else if (title === 'Vectors Lab') {
      await expect(page.getByRole('heading', { name: 'Turn text into coordinates.' })).toBeVisible()
    } else if (title === 'Search Lab') {
      await expect(page.getByRole('heading', { name: 'Find meaning. Follow the source.' })).toBeVisible()
    } else {
      await expect(page.getByRole('heading', { name: 'Follow a write. Unpack a read.', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled()
    }
  }
  await expect(page.getByText('SIMULATION — EDUCATIONAL MODEL — NOT PINECONE TELEMETRY', { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('mobile menu, deep links, reduced motion and layout at five widths', async ({ page }) => {
  test.setTimeout(90000) // 30 full-page navigations now include the real React Flow diagram.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByText('ONLINE', { exact: true })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: `${evidence}/overview-mobile-390.png`, fullPage: true })
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await expect(page.getByRole('button', { name: 'Close navigation' })).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Documents Lab' }).click()
  await expect(page.getByRole('heading', { name: 'Start with the source.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false')
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    for (const route of ['/', '/documents', '/vectors', '/vectors/store', '/search', '/architecture']) {
      await page.goto(route)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${route} overflow at ${width}px`).toBeTruthy()
    }
  }
})

test('network failure and recovery (explicitly intercepted fault injection)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.route('**/api/health', route => route.abort('connectionfailed'))
  await page.goto('/')
  await expect(page.getByText('OFFLINE', { exact: true })).toBeVisible()
  await expect(page.getByText(/Start the FastAPI server/)).toBeVisible()
  await page.screenshot({ path: `${evidence}/offline-fault-injection.png`, fullPage: true })
  await page.unroute('**/api/health')
  await page.getByRole('button', { name: 'Check connection' }).click()
  await expect(page.getByText('ONLINE', { exact: true })).toBeVisible()
})

test('keyboard skip link is first and visible', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  await expect(skip).toBeInViewport()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()
})
