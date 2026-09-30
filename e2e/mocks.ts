import type { BrowserContext } from '@playwright/test'

const API = 'https://www.easy-apply.ai'

// ── Fixtures ──────────────────────────────────────────────────────────────────

export const MOCK_USER = {
  id: 'test-user-id',
  name: 'Test User',
  email: 'test@example.com',
  imageUrl: null,
}

export const MOCK_DOC = {
  id: 'doc-1',
  title: 'My Resume',
  item_type: 'resume',
  is_default: true,
  content: {
    text: [
      'John Doe | Software Engineer | john@example.com | San Francisco, CA',
      '',
      'EXPERIENCE:',
      'TechCorp | San Francisco, CA',
      'Senior Software Engineer | Jan 2021 – Present',
      '• Led a team of 3 engineers to deliver a new authentication system, reducing login failures by 40%',
      '• Built REST APIs serving 100k daily active users using Node.js and TypeScript',
      '• Reduced deployment time by 60% by migrating to containerised CI/CD pipelines',
      '',
      'SKILLS:',
      'Languages: TypeScript, JavaScript, Python',
      'Frameworks: React, Node.js, Express',
      '',
      'EDUCATION:',
      'State University | San Francisco, CA',
      'B.S. Computer Science',
    ].join('\n'),
  },
}

export const MOCK_BILLING = {
  subscription_status: 'free',
  subscription_period_end: null,
  tailored_resume_count: 0,
  weekly_resume_count: 0,
  weekly_window_ends_at: null,
  chat_unlocked_count: 0,
  interview_prep_count: 0,
  experience_interview_count: 0,
}

// ── SSE stream bodies ─────────────────────────────────────────────────────────

function sse(...events: object[]): string {
  return events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('')
}

export const SSE = {
  /** Normal successful run — sends done with applicationId */
  success: sse(
    { type: 'status', message: 'Analyzing job description...' },
    { type: 'resume_chunk', content: 'John Doe\nSoftware Engineer\n\n' },
    { type: 'resume_chunk', content: 'EXPERIENCE:\nTechCorp | San Francisco, CA\n' },
    { type: 'resume_done' },
    {
      type: 'done',
      resumeText: 'John Doe\nSoftware Engineer\n\nEXPERIENCE:\nTechCorp | San Francisco, CA',
      coverLetterText: '',
      applicationId: 'test-app-id-123',
      chatEnabled: false,
    },
  ),

  /** Server sends an error event then closes the stream */
  serverError: sse(
    { type: 'status', message: 'Analyzing job description...' },
    { type: 'error', message: 'Resume generation failed: Service unavailable' },
  ),

  /** Stream closes abruptly with no done or error event */
  incompleteStream: sse(
    { type: 'status', message: 'Analyzing job description...' },
    { type: 'resume_chunk', content: 'partial content...' },
    // Intentionally no done event
  ),
}

// ── Mock helpers ──────────────────────────────────────────────────────────────

/**
 * Set up all API mocks for an authenticated user with one resume doc loaded.
 * Must be called before navigating to the sidepanel page.
 */
export async function setupAuthMocks(context: BrowserContext) {
  await context.route(`${API}/api/me`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) })
  )
  await context.route(`${API}/api/resumes`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([MOCK_DOC]) })
  )
  await context.route(`${API}/api/billing/status`, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_BILLING) })
  )
  // Non-critical fire-and-forget endpoints
  await context.route(`${API}/api/ping-extension`, route => route.fulfill({ status: 200, body: '{}' }))
  await context.route(`${API}/api/log-event`, route => route.fulfill({ status: 200, body: '{}' }))
  await context.route(`${API}/api/parse-job-details`, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ company: '', jobTitle: '', questions: [] }),
    })
  )
}

/** Set up mocks for an unauthenticated state */
export async function setupUnauthMocks(context: BrowserContext) {
  await context.route(`${API}/api/me`, route =>
    route.fulfill({ status: 401, body: 'Unauthorized' })
  )
}

/**
 * Mock a specific SSE response for the generate-documents endpoint.
 * Call AFTER setupAuthMocks.
 */
export async function mockGenerate(context: BrowserContext, sseBody: string) {
  await context.route(`${API}/api/generate-documents`, route =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      body: sseBody,
    })
  )
}

/** Mock the PDF download endpoint (resume docType is the default) */
export async function mockPdfDownload(context: BrowserContext, status: number) {
  // Mock both /resume and /cover-letter variants
  for (const docType of ['resume', 'cover-letter']) {
    await context.route(`${API}/api/download-pdf/${docType}`, route =>
      route.fulfill({
        status,
        body: status === 200 ? 'JVBERi0xLjQ=' : 'Internal server error',
        contentType: status === 200 ? 'application/pdf' : 'text/plain',
        headers: status === 200 ? { 'Content-Disposition': 'attachment; filename="Resume.pdf"' } : {},
      })
    )
  }
}

/** Mock the DOCX download endpoint */
export async function mockDocxDownload(context: BrowserContext, status: number) {
  for (const docType of ['resume', 'cover-letter']) {
    await context.route(`${API}/api/download-docx/${docType}`, route =>
      route.fulfill({
        status,
        body: status === 200 ? 'UEsDB' : 'Internal server error',
        contentType: status === 200
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'text/plain',
        headers: status === 200 ? { 'Content-Disposition': 'attachment; filename="Resume.docx"' } : {},
      })
    )
  }
}
