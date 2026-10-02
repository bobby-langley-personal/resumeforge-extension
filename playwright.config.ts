import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 1,
  workers: 1, // Extensions can't safely share a browser context across workers
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    headless: false, // Chrome extensions require a headed browser
    viewport: { width: 400, height: 700 },
    actionTimeout: 10_000,
  },
})
