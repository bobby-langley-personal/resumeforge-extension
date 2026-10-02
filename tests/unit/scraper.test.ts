/**
 * Unit tests for the universal scraper logic.
 *
 * Tests the text-anchor extraction approach used in scrapePageContent().
 * We set up a mock DOM with jsdom and verify the logic extracts the right
 * fields — matching what the real scraper does in the browser.
 */
import { describe, it, expect, beforeEach } from 'vitest'

// ── Helper: set up a mock DOM and run the scraper logic against it ────────────

function setupDOM(html: string) {
  document.body.innerHTML = html
}

/** Mirror of the text-anchor extraction logic in scrapePageContent() */
function extractDescription(root: Element): string | undefined {
  const getText = (el: Element | null) =>
    ((el as HTMLElement)?.innerText || el?.textContent || '').trim()

  const panelText = getText(root)
  const anchors = [
    /Full\s+job\s+description/i,
    /Job\s+Description/i,
    /About\s+the\s+role/i,
    /About\s+this\s+job/i,
    /About\s+the\s+job/i,
    /What\s+you['']ll\s+do/i,
    /The\s+Role/i,
    /Responsibilities/i,
    /Description/i,
  ]
  for (const anchor of anchors) {
    const idx = panelText.search(anchor)
    if (idx >= 0) return panelText.slice(idx, idx + 8000)
  }
  if (panelText.length > 300) return panelText.slice(0, 8000)
  return undefined
}

function extractTitle(root: Element): string | undefined {
  const getText = (el: Element | null) =>
    ((el as HTMLElement)?.innerText || el?.textContent || '').trim()
  return (
    getText(root.querySelector('[data-testid*="job-title"]')) ||
    getText(root.querySelector('[data-testid*="jobTitle"]')) ||
    getText(root.querySelector('h1')) ||
    getText(root.querySelector('h2')) ||
    undefined
  )
}

function extractCompany(root: Element): string | undefined {
  const getText = (el: Element | null) =>
    ((el as HTMLElement)?.innerText || el?.textContent || '').trim()
  return (
    getText(root.querySelector('[data-testid="company-name"]')) ||
    getText(root.querySelector('[class*="company-name"]')) ||
    getText(root.querySelector('a[href*="/cmp/"]')) ||
    undefined
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('text-anchor description extraction', () => {
  it('finds description after "Full job description" heading (Indeed pattern)', () => {
    setupDOM(`
      <div id="panel">
        <h1>Software Engineer</h1>
        <h4>Full job description</h4>
        <p>We are looking for a skilled engineer to join our team.</p>
        <ul><li>Build scalable APIs</li><li>Work with React</li></ul>
      </div>
    `)
    const panel = document.getElementById('panel')!
    const desc = extractDescription(panel)
    expect(desc).toContain('Full job description')
    expect(desc).toContain('skilled engineer')
  })

  it('finds description after "About the role" heading (Glassdoor pattern)', () => {
    setupDOM(`
      <div id="panel">
        <h2>Senior Product Manager</h2>
        <section>
          <h3>About the role</h3>
          <p>You will own the product roadmap and work closely with engineering.</p>
        </section>
      </div>
    `)
    const panel = document.getElementById('panel')!
    const desc = extractDescription(panel)
    expect(desc).toContain('About the role')
    expect(desc).toContain('product roadmap')
  })

  it('finds description after "Job Description" heading', () => {
    setupDOM(`
      <div id="panel">
        <div class="job-header"><h1>Data Analyst</h1></div>
        <div class="job-body">
          <h2>Job Description</h2>
          <p>Analyze data and build dashboards using SQL and Python.</p>
        </div>
      </div>
    `)
    const panel = document.getElementById('panel')!
    const desc = extractDescription(panel)
    expect(desc).toContain('Job Description')
    expect(desc).toContain('SQL and Python')
  })

  it('falls back to panel text when no anchor found but content is substantial', () => {
    const longText = 'We are hiring a great engineer. '.repeat(20) // >300 chars
    setupDOM(`<div id="panel"><p>${longText}</p></div>`)
    const panel = document.getElementById('panel')!
    const desc = extractDescription(panel)
    expect(desc).toBeTruthy()
    expect(desc!.length).toBeGreaterThan(300)
  })

  it('returns undefined for thin panel content with no anchor', () => {
    setupDOM(`<div id="panel"><p>Short text.</p></div>`)
    const panel = document.getElementById('panel')!
    const desc = extractDescription(panel)
    expect(desc).toBeUndefined()
  })

  it('picks "About the role" anchor over "Responsibilities" which appears later', () => {
    setupDOM(`
      <div id="panel">
        <h2>About the role</h2>
        <p>You will own the roadmap.</p>
        <h3>Responsibilities</h3>
        <p>Build and ship features.</p>
      </div>
    `)
    const panel = document.getElementById('panel')!
    const desc = extractDescription(panel)
    // "About the role" is higher priority in anchors array than "Responsibilities"
    expect(desc).toContain('About the role')
    expect(desc).toContain('Responsibilities')
    // Both appear but anchor starts from "About the role"
    expect(desc!.indexOf('About the role')).toBeLessThan(desc!.indexOf('Responsibilities'))
  })

  it('truncates description at 8000 characters', () => {
    const huge = 'x'.repeat(10000)
    setupDOM(`<div id="panel"><h2>Full job description</h2><p>${huge}</p></div>`)
    const panel = document.getElementById('panel')!
    const desc = extractDescription(panel)
    expect(desc!.length).toBeLessThanOrEqual(8000)
  })
})

describe('title extraction', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('extracts title from data-testid="vj-job-title" (Indeed viewjob panel)', () => {
    setupDOM(`
      <div id="panel">
        <h5 data-testid="vj-job-title">Junior QA Engineer - US Remote</h5>
        <h1>Some other heading</h1>
      </div>
    `)
    const panel = document.getElementById('panel')!
    expect(extractTitle(panel)).toBe('Junior QA Engineer - US Remote')
  })

  it('falls back to h1 when no data-testid present', () => {
    setupDOM(`<div id="panel"><h1>Frontend Developer</h1></div>`)
    const panel = document.getElementById('panel')!
    expect(extractTitle(panel)).toBe('Frontend Developer')
  })

  it('falls back to h2 when no h1 present', () => {
    setupDOM(`<div id="panel"><h2>Backend Engineer</h2></div>`)
    const panel = document.getElementById('panel')!
    expect(extractTitle(panel)).toBe('Backend Engineer')
  })

  it('returns undefined when no title elements found', () => {
    setupDOM(`<div id="panel"><p>Some text</p></div>`)
    const panel = document.getElementById('panel')!
    expect(extractTitle(panel)).toBeUndefined()
  })
})

describe('company extraction', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('extracts company from data-testid="company-name"', () => {
    setupDOM(`
      <div id="panel">
        <span data-testid="company-name">PerfectServe</span>
      </div>
    `)
    const panel = document.getElementById('panel')!
    expect(extractCompany(panel)).toBe('PerfectServe')
  })

  it('extracts company from class containing "company-name" (hyphenated)', () => {
    setupDOM(`
      <div id="panel">
        <a class="jobsearch-company-name-link">Acme Corp</a>
      </div>
    `)
    const panel = document.getElementById('panel')!
    expect(extractCompany(panel)).toBe('Acme Corp')
  })

  it('extracts company from /cmp/ link (Indeed company page pattern)', () => {
    setupDOM(`
      <div id="panel">
        <a href="https://www.indeed.com/cmp/Perfectserve?from=viewjob">PerfectServe</a>
      </div>
    `)
    const panel = document.getElementById('panel')!
    expect(extractCompany(panel)).toBe('PerfectServe')
  })

  it('returns undefined when no company element found', () => {
    setupDOM(`<div id="panel"><h1>Job Title</h1></div>`)
    const panel = document.getElementById('panel')!
    expect(extractCompany(panel)).toBeUndefined()
  })
})
