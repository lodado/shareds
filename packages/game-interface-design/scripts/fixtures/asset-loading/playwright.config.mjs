import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  reporter: [['line'], ['json', { outputFile: 'asset-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:4179', serviceWorkers: 'block' },
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 4179 --strictPort', url: 'http://127.0.0.1:4179', reuseExistingServer: false },
})
