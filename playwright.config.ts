import { defineConfig } from '@playwright/test'
import { resolve } from 'node:path'

const python = process.platform === 'win32' ? '".\\.venv\\Scripts\\python.exe"' : 'python'
const apiModule = process.env.PVL_E2E_FIXTURE === '1' ? 'testsupport.fixture_server:app' : 'app.main:app'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:5174',
    browserName: 'chromium',
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `${python} -m uvicorn ${apiModule} --app-dir apps/api --host 127.0.0.1 --port 8001`,
      url: 'http://127.0.0.1:8001/api/health',
      reuseExistingServer: false,
      env: { PVL_DATA_DIR: resolve('.cache/e2e-d04', String(process.pid)), PVL_DISABLE_CLOUD: '1', HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' },
      timeout: 30000,
    },
    {
      command: 'npm run dev --workspace apps/web -- --port 5174',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
      env: { PVL_API_PROXY_TARGET: 'http://127.0.0.1:8001' },
      timeout: 30000,
    },
  ],
})
