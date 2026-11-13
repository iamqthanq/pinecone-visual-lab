import { defineConfig } from '@playwright/test'
import visual from './playwright.visual.config'

if (!['before', 'after'].includes(process.env.PVL_VISUAL_STAGE ?? '')) throw new Error('Explicit before/after profile stage required')
if (process.env.PVL_E2E_FIXTURE || process.env.PVL_VISUAL_REPLAY) throw new Error('Performance profile uses the actual local API/cache, not recorded fixture replay')
export default defineConfig({ ...visual, testDir: './tests/performance', testMatch: '**/*.spec.ts',
  reporter: [['list'], ['json', { outputFile: 'test-results/d08-performance-results.json' }]],
})
