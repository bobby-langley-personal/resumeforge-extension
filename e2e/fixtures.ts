import { test as base, chromium, type BrowserContext } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.join(__dirname, '../dist')

/**
 * Custom fixtures that boot a persistent Chrome context with the built
 * extension loaded.  Service-worker requests are interceptable via
 * context.route() in Playwright 1.34+ (experimental) and 1.40+ (stable).
 */
export const test = base.extend<{
  context: BrowserContext
  extensionId: string
}>({
  // Override the default context with one that has the extension loaded
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${distPath}`,
        `--load-extension=${distPath}`,
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
    })
    await use(context)
    await context.close()
  },

  // Resolves the dynamic extension ID from the running service worker URL
  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers()
    if (!background) {
      background = await context.waitForEvent('serviceworker', { timeout: 15_000 })
    }
    // Service worker URL format: chrome-extension://<id>/src/background/index.js
    const extensionId = background.url().split('/')[2]
    await use(extensionId)
  },
})

export { expect } from '@playwright/test'
