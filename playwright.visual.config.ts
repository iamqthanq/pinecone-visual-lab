import { defineConfig } from '@playwright/test'
import { resolve } from 'node:path'
import { softwareProfile, softwareReferences } from './tests/visual/rendering'

const fixture = process.env.PVL_E2E_FIXTURE === '1'
const stage = process.env.PVL_VISUAL_STAGE ?? 'verify'
const replay = process.env.PVL_VISUAL_REPLAY === '1'
const software = stage === 'verify' || stage === 'proposal'
if (!['before', 'after', 'verify', 'proposal'].includes(stage)) throw new Error('Invalid capture stage')
if (software && (!fixture || !replay || process.platform !== 'win32')) throw new Error('Software visual references require Windows + explicit NOT-E5 replay')
if (process.argv.some(arg => arg === '-u' || arg.startsWith('-u=') || arg.startsWith('--update-snapshots'))) throw new Error('Automatic baseline updates are forbidden; capture a reviewed candidate separately')
if (process.env.CI && (stage !== 'verify' || !replay)) throw new Error('CI may verify recorded fixture references, never write/update candidates')
const python = process.platform === 'win32' ? '".\\.venv\\Scripts\\python.exe"' : 'python'
export default defineConfig({
  testDir: './tests/visual', workers: 1, fullyParallel: false, retries: 0, timeout: 600000,
  testMatch: stage === 'verify' ? '**/*.spec.ts' : '**/audit.spec.ts',
  updateSnapshots: 'none', snapshotPathTemplate: resolve(`${softwareReferences}/{arg}{ext}`),
  expect: { toHaveScreenshot: { maxDiffPixels: 100, threshold: 0.1 } },
  outputDir: 'test-results/d08-visual',
  reporter: [['list'], ['json', { outputFile: 'test-results/d08-visual-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:5175', browserName: 'chromium', channel: process.platform === 'win32' ? 'msedge' : undefined,
    launchOptions: { args: software ? [...softwareProfile.args] : [] },
    locale: softwareProfile.locale, deviceScaleFactor: softwareProfile.deviceScaleFactor,
    trace: 'retain-on-failure', reducedMotion: 'reduce' },
  webServer: [
    ...(!replay ? [{ command: `${python} -m uvicorn testsupport.rag_server:app --app-dir apps/api --host 127.0.0.1 --port 8002`,
      url: 'http://127.0.0.1:8002/api/health', reuseExistingServer: false, timeout: 30000,
      env: { PVL_DATA_DIR: resolve('.cache/d08-audit', fixture ? 'fixture' : 'real'), PVL_DISABLE_CLOUD: '1', PINECONE_API_KEY: '', PVL_LIVE_SEARCH_ENABLED: '0', PVL_OLLAMA_ENABLED: '0', HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' } }] : []),
    { command: `node scripts/serve_preview.mjs ${stage === 'before' ? '.cache/d08-before-dist' : 'apps/web/dist'} 5175 8002`,
      url: 'http://127.0.0.1:5175', reuseExistingServer: false, timeout: 30000 },
  ],
})
