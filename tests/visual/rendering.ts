import type { Browser, Page } from '@playwright/test'
import os from 'node:os'

// R1: Intel GPU matches the old reference; software exactly reproduces CI output.
// Keep one explicit visual-only pipeline on both machines. App/E2E/perf are native.
export const softwareProfile = {
  name: 'edge-windows-software-v1', args: ['--disable-gpu'], locale: 'en-US', deviceScaleFactor: 1,
} as const
export const softwareReferences = 'docs/evidence/d08/review-r1/software-references'

export async function renderingEnvironment(browser: Browser, page: Page, software = true) {
  const session = await browser.newBrowserCDPSession()
  try {
    const version = await session.send('Browser.getVersion')
    const { gpu } = await session.send('SystemInfo.getInfo')
    const client = await page.evaluate(() => ({ locale: navigator.language, dpr: devicePixelRatio,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, userAgent: navigator.userAgent }))
    return { profile: software ? softwareProfile : { ...softwareProfile, name: 'edge-native-default', args: [] }, browserVersion: browser.version(), version,
      platform: process.platform, osRelease: os.release(), client,
      gpu: { featureStatus: gpu.featureStatus, renderer: gpu.auxAttributes?.glRenderer,
        implementation: gpu.auxAttributes?.glImplementationParts,
        subpixelFontRendering: gpu.auxAttributes?.subpixelFontRendering,
        devices: gpu.devices.map(device => ({ vendorId: device.vendorId, deviceId: device.deviceId,
          deviceString: device.deviceString, driverVersion: device.driverVersion })) } }
  } finally { await session.detach() }
}
