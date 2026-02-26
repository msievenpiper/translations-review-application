import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    // Electron tests configure the browser per-test via _electron.launch()
  },
  reporter: [['list']]
})
