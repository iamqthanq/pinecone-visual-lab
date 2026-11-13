import { test, expect } from '@playwright/test'
import { renderingEnvironment, softwareProfile } from './rendering'

test('visual profile fixes the effective software compositor, locale, scale and reduced motion', async ({ browser, page }, testInfo) => {
  const environment = await renderingEnvironment(browser, page)
  expect(environment.profile.name).toBe(softwareProfile.name)
  expect(environment.gpu.featureStatus?.gpu_compositing).toBe('disabled_software')
  expect(environment.gpu.featureStatus?.rasterization).toBe('disabled_software')
  expect(environment.client).toMatchObject({ locale: 'en-US', dpr: 1, reducedMotion: true })
  expect(environment.browserVersion).toMatch(/^\d+\.\d+\.\d+\.\d+$/)
  await testInfo.attach('effective-rendering-profile', { body: JSON.stringify(environment, null, 2), contentType: 'application/json' })
})
