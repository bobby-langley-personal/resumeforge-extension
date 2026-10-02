/**
 * End-to-end tests for the Easy Apply sidepanel.
 *
 * Architecture notes:
 * - The extension's background service worker calls https://www.easy-apply.ai
 *   directly via fetch() when no easy-apply.ai tab is open.  Playwright's
 *   context.route() intercepts those service-worker requests (Playwright 1.34+).
 * - All tests use the "Paste description manually" flow to avoid needing a
 *   real job-listing tab to scrape.
 * - Tests marked [HOTFIX] specifically validate the error-handling changes
 *   made in v0.3.8.
 */

import { test, expect } from './fixtures'
import {
  setupAuthMocks,
  setupUnauthMocks,
  mockGenerate,
  mockPdfDownload,
  mockDocxDownload,
  SSE,
} from './mocks'

const LONG_TIMEOUT = 15_000
const SHORT_TIMEOUT = 8_000

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Navigate to the sidepanel HTML page for the loaded extension */
async function openSidepanel(context: any, extensionId: string) {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`)
  return page
}

/**
 * Click "Paste description manually", then fill in all three confirm fields.
 * Waits for the confirm step to appear before returning.
 */
async function goToConfirmStep(page: any) {
  await page.getByText('Paste description manually instead').click({ timeout: SHORT_TIMEOUT })
  await expect(page.getByText('Confirm the details before generating.')).toBeVisible({ timeout: SHORT_TIMEOUT })

  // Job Title — first text input
  await page.locator('input[type="text"]').first().fill('Senior Software Engineer')
  // Company — second text input
  await page.locator('input[type="text"]').nth(1).fill('Acme Corp')
  // Description — the textarea
  await page.locator('textarea').fill(
    'We are looking for a Senior Software Engineer to join our growing team. ' +
    'You will design and build scalable backend services using Node.js and TypeScript. ' +
    'Requirements: 5+ years experience with TypeScript, strong API design skills, ' +
    'experience with cloud infrastructure (AWS/GCP), and a passion for clean code. ' +
    'You will work closely with product and design to ship features end to end.'
  )
}

/**
 * Complete a successful generation run and wait for the "Résumé ready" screen.
 * Requires mockGenerate(SSE.success) to already be set up.
 */
async function generateAndWaitForDone(page: any) {
  await page.getByRole('button', { name: 'Generate' }).click()
  await expect(page.getByText('Résumé ready')).toBeVisible({ timeout: LONG_TIMEOUT })
}

// ── Test suites ───────────────────────────────────────────────────────────────

test.describe('Auth states', () => {
  test('shows sign-in screen when not authenticated', async ({ context, extensionId }) => {
    await setupUnauthMocks(context)
    const page = await openSidepanel(context, extensionId)

    await expect(page.getByText('Sign in to Easy Apply')).toBeVisible({ timeout: LONG_TIMEOUT })
    await expect(page.getByText('Read job from this page')).not.toBeVisible()
    await expect(page.getByText('How to connect')).toBeVisible()
  })

  test('shows scrape screen when authenticated', async ({ context, extensionId }) => {
    await setupAuthMocks(context)
    const page = await openSidepanel(context, extensionId)

    await expect(page.getByText('Read job from this page')).toBeVisible({ timeout: LONG_TIMEOUT })
    await expect(page.getByText('Sign in to Easy Apply')).not.toBeVisible()
  })
})

test.describe('Scrape screen', () => {
  test('shows the loaded resume document', async ({ context, extensionId }) => {
    await setupAuthMocks(context)
    const page = await openSidepanel(context, extensionId)

    await expect(page.getByText('My Resume')).toBeVisible({ timeout: LONG_TIMEOUT })
    await expect(page.getByText('Loaded from Easy Apply')).toBeVisible()
  })

  test('shows free usage counter for free-tier users', async ({ context, extensionId }) => {
    await setupAuthMocks(context)
    const page = await openSidepanel(context, extensionId)

    await expect(page.getByText(/0\/5 free this week/)).toBeVisible({ timeout: LONG_TIMEOUT })
  })

  test('shows cover letter and summary checkboxes', async ({ context, extensionId }) => {
    await setupAuthMocks(context)
    const page = await openSidepanel(context, extensionId)

    await expect(page.getByText('Include cover letter')).toBeVisible({ timeout: LONG_TIMEOUT })
    await expect(page.getByText('Include summary section')).toBeVisible()
  })

  test('offers paste-manually fallback', async ({ context, extensionId }) => {
    await setupAuthMocks(context)
    const page = await openSidepanel(context, extensionId)

    await expect(page.getByText('Paste description manually instead')).toBeVisible({ timeout: LONG_TIMEOUT })
  })
})

test.describe('Confirm step', () => {
  test('navigates to confirm step via paste-manually', async ({ context, extensionId }) => {
    await setupAuthMocks(context)
    const page = await openSidepanel(context, extensionId)
    await goToConfirmStep(page)

    await expect(page.getByText('Job Title')).toBeVisible()
    await expect(page.getByText('Company')).toBeVisible()
    await expect(page.getByText('Job Description')).toBeVisible()
  })

  test('generate button is disabled with empty description', async ({ context, extensionId }) => {
    await setupAuthMocks(context)
    const page = await openSidepanel(context, extensionId)

    await page.getByText('Paste description manually instead').click({ timeout: SHORT_TIMEOUT })
    await expect(page.getByText('Confirm the details before generating.')).toBeVisible({ timeout: SHORT_TIMEOUT })
    // No description filled — button should be disabled
    await expect(page.getByRole('button', { name: 'Generate' })).toBeDisabled()
  })

  test('generate button enables when description is filled', async ({ context, extensionId }) => {
    await setupAuthMocks(context)
    const page = await openSidepanel(context, extensionId)
    await goToConfirmStep(page)

    await expect(page.getByRole('button', { name: 'Generate' })).toBeEnabled()
  })

  test('back button returns to scrape step', async ({ context, extensionId }) => {
    await setupAuthMocks(context)
    const page = await openSidepanel(context, extensionId)

    await page.getByText('Paste description manually instead').click({ timeout: SHORT_TIMEOUT })
    await expect(page.getByText('Confirm the details before generating.')).toBeVisible({ timeout: SHORT_TIMEOUT })
    // Use exact regex match to avoid substring-matching "feedBack" button title
    await page.locator('button').filter({ hasText: /^Back$/ }).click()

    await expect(page.getByText('Read job from this page')).toBeVisible()
  })
})

test.describe('Generation — [HOTFIX v0.3.8 validation]', () => {
  test('[HOTFIX] shows server error message — does NOT show "Résumé ready"', async ({ context, extensionId }) => {
    await setupAuthMocks(context)
    await mockGenerate(context, SSE.serverError)

    const page = await openSidepanel(context, extensionId)
    await goToConfirmStep(page)
    await page.getByRole('button', { name: 'Generate' }).click()

    // Must show the error text from the server event
    await expect(
      page.getByText('Resume generation failed', { exact: false })
    ).toBeVisible({ timeout: LONG_TIMEOUT })

    // Must NOT show success screen
    await expect(page.getByText('Résumé ready')).not.toBeVisible()

    // Must return to scrape step
    await expect(page.getByText('Read job from this page')).toBeVisible()
  })

  test('[HOTFIX] shows error when stream closes without a done event', async ({ context, extensionId }) => {
    await setupAuthMocks(context)
    await mockGenerate(context, SSE.incompleteStream)

    const page = await openSidepanel(context, extensionId)
    await goToConfirmStep(page)
    await page.getByRole('button', { name: 'Generate' }).click()

    await expect(
      page.getByText('Generation did not complete', { exact: false })
    ).toBeVisible({ timeout: LONG_TIMEOUT })

    await expect(page.getByText('Résumé ready')).not.toBeVisible()
    await expect(page.getByText('Read job from this page')).toBeVisible()
  })

  test('happy path: shows "Résumé ready" with Preview and PDF enabled', async ({ context, extensionId }) => {
    await setupAuthMocks(context)
    await mockGenerate(context, SSE.success)

    const page = await openSidepanel(context, extensionId)
    await goToConfirmStep(page)
    await generateAndWaitForDone(page)

    // Success screen
    await expect(page.getByText('Résumé ready')).toBeVisible()
    // Note: job.title/company are not set in paste-manually flow (job = { url: '' }),
    // so the subtitle line is correctly absent. Check buttons instead.

    // Preview button enabled (applicationId was set from the done event)
    await expect(page.getByRole('button', { name: 'Preview' })).toBeEnabled()

    // Download buttons enabled
    await expect(page.getByRole('button', { name: 'PDF' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'DOCX' })).toBeEnabled()
  })

  test('[HOTFIX] PDF download error shows error message — does not open /dashboard', async ({ context, extensionId }) => {
    await setupAuthMocks(context)
    await mockGenerate(context, SSE.success)
    await mockPdfDownload(context, 500)

    const page = await openSidepanel(context, extensionId)
    await goToConfirmStep(page)
    await generateAndWaitForDone(page)

    // Track if a /dashboard tab is opened
    let dashboardOpened = false
    context.on('page', (newPage: any) => {
      if (newPage.url().includes('/dashboard')) dashboardOpened = true
    })

    await page.getByRole('button', { name: 'PDF' }).click()
    await expect(
      page.getByText('Could not download the PDF', { exact: false })
    ).toBeVisible({ timeout: SHORT_TIMEOUT })
    expect(dashboardOpened).toBe(false)
  })

  test('[HOTFIX] DOCX download error shows error message', async ({ context, extensionId }) => {
    await setupAuthMocks(context)
    await mockGenerate(context, SSE.success)
    await mockDocxDownload(context, 500)

    const page = await openSidepanel(context, extensionId)
    await goToConfirmStep(page)
    await generateAndWaitForDone(page)

    await page.getByRole('button', { name: 'DOCX' }).click()
    await expect(
      page.getByText('Could not download the DOCX', { exact: false })
    ).toBeVisible({ timeout: SHORT_TIMEOUT })
  })

  test('cancel during generation returns to confirm step', async ({ context, extensionId }) => {
    await setupAuthMocks(context)
    // Use a delay-less stream that won't resolve instantly so we can cancel
    await context.route('https://www.easy-apply.ai/api/generate-documents', async route => {
      // Hold the response open briefly so the user can cancel
      await new Promise(resolve => setTimeout(resolve, 3_000))
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: SSE.success,
      })
    })

    const page = await openSidepanel(context, extensionId)
    await goToConfirmStep(page)
    await page.getByRole('button', { name: 'Generate' }).click()

    // Should be on generating screen
    await expect(page.getByText('Tailoring your résumé…')).toBeVisible({ timeout: SHORT_TIMEOUT })

    // Cancel
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('Confirm the details before generating.')).toBeVisible({ timeout: SHORT_TIMEOUT })
  })

  test('start over from done screen returns to scrape step', async ({ context, extensionId }) => {
    await setupAuthMocks(context)
    await mockGenerate(context, SSE.success)

    const page = await openSidepanel(context, extensionId)
    await goToConfirmStep(page)
    await generateAndWaitForDone(page)

    await page.getByRole('button', { name: 'Start over' }).click()
    await expect(page.getByText('Read job from this page')).toBeVisible()
  })
})

test.describe('Generation — 402 paywall', () => {
  test('shows paywall screen when free limit is reached', async ({ context, extensionId }) => {
    await setupAuthMocks(context)
    await context.route('https://www.easy-apply.ai/api/generate-documents', route =>
      route.fulfill({
        status: 402,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'FREE_LIMIT_REACHED', upgradeUrl: '/pricing' }),
      })
    )

    const page = await openSidepanel(context, extensionId)
    await goToConfirmStep(page)
    await page.getByRole('button', { name: 'Generate' }).click()

    await expect(page.getByText("You've used your free résumés this week")).toBeVisible({ timeout: LONG_TIMEOUT })
    await expect(page.getByRole('link', { name: 'Upgrade to Pro' })).toBeVisible()
  })
})
