import { test, expect } from '@playwright/test'
import { spawnSync } from 'node:child_process'

test('config rejects both snapshot-update aliases and CI proposal capture before any tests execute', () => {
  const environment = { ...process.env, PVL_E2E_FIXTURE: '1', PVL_VISUAL_REPLAY: '1', PVL_VISUAL_STAGE: 'verify' }
  // --list is deliberately non-executing even if this guard ever regresses.
  for (const flag of ['--update-snapshots', '-u']) {
    const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.visual.config.ts', '--list', flag],
      { encoding: 'utf8', env: environment, timeout: 20000 })
    expect(result.status).not.toBe(0)
    expect(result.stderr + result.stdout).toContain('Automatic baseline updates are forbidden')
  }
  const ci = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.visual.config.ts', '--list'],
    { encoding: 'utf8', env: { ...environment, CI: '1', PVL_VISUAL_STAGE: 'proposal' }, timeout: 20000 })
  expect(ci.status).not.toBe(0)
  expect(ci.stderr + ci.stdout).toContain('CI may verify recorded fixture references, never write/update candidates')
})
