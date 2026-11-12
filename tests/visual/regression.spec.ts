import { test, expect } from '@playwright/test'
import { replay } from './replay'

test('visual comparator accepts the frozen candidate and rejects a deliberate panel-color defect', async ({ page }) => {
  await replay(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/'); await expect(page.getByText('ONLINE', { exact: true })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  const options = { fullPage: true, animations: 'disabled' as const, mask: [page.locator('.connection-message small')], maskColor: '#30485c' }
  await expect(page).toHaveScreenshot('overview-1440.png', options)
  await page.addStyleTag({ content: '.panel { background: #ee2020 !important; }' })
  await expect(page).not.toHaveScreenshot('overview-1440.png', { ...options, timeout: 3000 })
})
