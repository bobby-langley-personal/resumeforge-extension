import { useState, useEffect, useRef } from 'react'
import {
  FileText, Loader2, Download, Eye,
  ChevronLeft, ExternalLink, Lightbulb, LogIn, MessageSquare, Copy, Check, RefreshCw,
} from 'lucide-react'
import type { ScrapedJob, ResumeItem, PortOutMessage, FitAnalysis, User } from '../types'

const API_BASE = 'https://easy-apply.ai'

// Runs inside the page context via executeScript — must be synchronous, no imports allowed
function scrapePageContent(): ScrapedJob {
  const url = window.location.href
  if (url.includes('linkedin.com')) {
    const getText = (el: Element | null) => ((el as HTMLElement)?.innerText || el?.textContent || '').trim()

    const pick = (...selectors: string[]) => {
      for (const sel of selectors) {
        const text = getText(document.querySelector(sel))
        if (text) return text
      }
      return undefined
    }

    // Title/company from page title as fallback: "Job Title at Company | LinkedIn"
    const pageTitle = document.title.replace(/\s*\|\s*LinkedIn\s*$/i, '').trim()
    const titleMatch = pageTitle.match(/^(.+?)\s+at\s+(.+)$/i)
    const titleFromPage = titleMatch?.[1]?.trim()
    const companyFromPage = titleMatch?.[2]?.trim()

    // Try specific selectors first, fall back to body text
    const descSelectors = [
      '#job-details',
      '.jobs-description__content',
      '.jobs-description-content__text',
      '.jobs-box__html-content',
      '[class*="jobs-description"]',
      '.description__text',
    ]
    let description: string | undefined
    for (const sel of descSelectors) {
      const text = getText(document.querySelector(sel))
      if (text.length > 100) { description = text; break }
    }
    if (!description) {
      const bodyText = document.body.innerText.slice(0, 5000)
      description = bodyText || undefined
    }

    return {
      title: pick(
        '.job-details-jobs-unified-top-card__job-title h1',
        '.job-details-jobs-unified-top-card__job-title',
        '.jobs-unified-top-card__job-title h1',
        '.jobs-unified-top-card__job-title',
        'h1.t-24',
        'h1',
      ) ?? titleFromPage,
      company: pick(
        '.job-details-jobs-unified-top-card__company-name',
        '.jobs-unified-top-card__company-name',
        '.topcard__org-name-link',
        '.job-details-jobs-unified-top-card__primary-description-without-tagline a',
        '[class*="company-name"]',
      ) ?? companyFromPage,
      description,
      url,
    }
  }
  if (url.includes('greenhouse.io')) {
    return {
      title: document.querySelector('h1.app-title')?.textContent?.trim(),
      company: document.querySelector('.company-name')?.textContent?.trim(),
      description: document.querySelector('#content')?.textContent?.trim(),
      url,
    }
  }
  if (url.includes('jobs.lever.co')) {
    return {
      title: document.querySelector('.posting-headline h2')?.textContent?.trim(),
      company: document.querySelector('.posting-headline .company-name')?.textContent?.trim(),
      description: document.querySelector('.posting-description')?.textContent?.trim(),
      url,
    }
  }
  if (url.includes('myworkdayjobs.com') || url.includes('workday.com')) {
    return {
      title: document.querySelector('[data-automation-id="jobPostingHeader"]')?.textContent?.trim(),
      description: document.querySelector('[data-automation-id="job-posting-details"]')?.textContent?.trim(),
      url,
    }
  }
  if (url.includes('indeed.com')) {
    const pick = (...selectors: string[]) => {
      for (const sel of selectors) {
        const el = document.querySelector(sel)
        const text = el?.textContent?.trim()
        if (text) return text
      }
      return undefined
    }
    return {
      title: pick(
        '[data-testid="jobsearch-JobInfoHeader-title"]',
        '.jobsearch-JobInfoHeader-title',
        'h1',
      )?.replace(/\s*-\s*job\s*post\s*$/i, '').trim(),
      company: pick(
        '[data-testid="inlineHeader-companyName"]',
        '.jobsearch-InlineCompanyRating-companyHeader a',
        '.jobsearch-CompanyInfoWithoutHeaderImage a',
      ),
      description: pick(
        '#jobDescriptionText',
        '.jobsearch-jobDescriptionText',
      ),
      url,
    }
  }
  // Generic fallback — try to extract company/title from common page title patterns
  // e.g. "Role at Company", "Role | Company", "Role - Company"
  const titleText = document.title
  // Strip known noisy suffixes like " - Indeed", " | LinkedIn", etc. before extracting
  const cleanTitle = titleText.replace(/\s*[-|–]\s*(Indeed|Glassdoor|ZipRecruiter|Monster|CareerBuilder|SimplyHired|LinkedIn)\s*$/i, '').trim()
  const companyFromTitle = cleanTitle.match(/(?:\s+(?:at|@)\s+|\s*[|\-–]\s*)([^|\-–]+)$/i)?.[1]?.trim()
  const jobTitleFromTitle = cleanTitle.match(/^([^|\-–@]+?)(?:\s+(?:at|@)\s+|\s*[|\-–])/i)?.[1]?.trim() ?? cleanTitle
  return {
    title: jobTitleFromTitle,
    company: companyFromTitle,
    description: document.body.innerText.slice(0, 5000),
    url,
  }
}

// ── Fit analysis view ─────────────────────────────────────────────────────────
const FIT_COLOR: Record<string, string> = {
  'Strong Fit': 'text-green-400 border-green-700 bg-green-950/40',
  'Good Fit':   'text-blue-400  border-blue-700  bg-blue-950/40',
  'Stretch Role':'text-amber-400 border-amber-700 bg-amber-950/40',
}

function FitSection({ title, items, color }: { title: string; items: { point: string; source?: string }[]; color: string }) {
  if (!items?.length) return null
  return (
    <div>
      <p className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${color}`}>{title}</p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-zinc-300 text-xs leading-snug">
            <span className={`mr-1.5 ${color}`}>›</span>
            {item.point}
          </li>
        ))}
      </ul>
    </div>
  )
}

type Step = 'scrape' | 'confirm' | 'generating' | 'done'
type AuthState = 'loading' | 'unauthenticated' | 'authenticated'

export default function App() {
  // Auth
  const [authState, setAuthState] = useState<AuthState>('loading')
  const [user, setUser] = useState<User | null>(null)

  const [step, setStep] = useState<Step>('scrape')
  const [job, setJob] = useState<ScrapedJob | null>(null)
  const [scraping, setScraping] = useState(false)
  const [confirmTitle, setConfirmTitle] = useState('')
  const [confirmCompany, setConfirmCompany] = useState('')
  const [confirmDescription, setConfirmDescription] = useState('')

  // Documents from Easy Apply account
  const [docs, setDocs] = useState<ResumeItem[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [primaryDocId, setPrimaryDocId] = useState<string | null>(null)
  const [extraDocIds, setExtraDocIds] = useState<Set<string>>(new Set())

  const [parsing, setParsing] = useState(false)

  // Generation
  const [includeCoverLetter, setIncludeCoverLetter] = useState(false)
  const [includeSummary, setIncludeSummary] = useState(false)
  const [coverLetter, setCoverLetter] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [applicationId, setApplicationId] = useState<string | null>(null)

  // Result actions
  const [downloading, setDownloading] = useState(false)
  const [downloadingCoverLetter, setDownloadingCoverLetter] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  // Gap analysis
  const [fitAnalysis, setFitAnalysis] = useState<FitAnalysis | null>(null)
  const [analyzingFit, setAnalyzingFit] = useState(false)
  const [showFitView, setShowFitView] = useState(false)

  // Follow-up questions
  const [showQAView, setShowQAView] = useState(false)
  const [qaInput, setQaInput] = useState('')
  const [qaAnswers, setQaAnswers] = useState<{ question: string; answer: string }[]>([])
  const [qaLoading, setQaLoading] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  const portRef = useRef<chrome.runtime.Port | null>(null)
  const cancelledRef = useRef(false)
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    checkAuth()
  }, [])

  async function checkAuth() {
    setAuthState('loading')
    const response = await chrome.runtime.sendMessage({ type: 'FETCH_ME' }) as
      | { data: User }
      | { error: number | string }

    if ('error' in response) {
      setAuthState('unauthenticated')
      return
    }
    setUser(response.data)
    setAuthState('authenticated')
    loadDocs()
  }

  async function loadDocs() {
    setDocsLoading(true)
    const response = await chrome.runtime.sendMessage({ type: 'FETCH_RESUMES' }) as
      | { data: ResumeItem[] }
      | { error: number | string }

    setDocsLoading(false)
    if ('error' in response) return

    const items = response.data ?? []
    setDocs(items)

    const defaultDoc = items.find((d) => d.is_default)
    if (defaultDoc) {
      setPrimaryDocId(defaultDoc.id)
      setExtraDocIds(new Set(items.filter((d) => !d.is_default).map((d) => d.id)))
    } else if (items.length > 0) {
      setPrimaryDocId(items[0].id)
      setExtraDocIds(new Set(items.slice(1).map((d) => d.id)))
    }
  }

  async function scrapeJob() {
    setScraping(true)
    setError(null)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab.id) throw new Error('No active tab found')
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapePageContent,
      })
      const scraped = results[0]?.result
      if (!scraped) throw new Error('Could not read page content')
      setJob(scraped)
      setConfirmTitle(scraped.title ?? '')
      setConfirmCompany(scraped.company ?? '')
      setConfirmDescription(scraped.description ?? '')
      setStep('confirm')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read page')
    } finally {
      setScraping(false)
    }
  }

  async function enterManually() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    setJob({ url: tab?.url ?? '' })
    setConfirmTitle('')
    setConfirmCompany('')
    setConfirmDescription('')
    setError(null)
    setStep('confirm')
  }

  async function parsePastedDescription(text: string) {
    if (text.length < 100) return
    setParsing(true)
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'PARSE_JOB',
        payload: { jobDescription: text },
      }) as { data: { company?: string; jobTitle?: string } } | { error: number | string }
      if ('error' in response) return
      if (response.data.jobTitle) setConfirmTitle(response.data.jobTitle)
      if (response.data.company) setConfirmCompany(response.data.company)
    } finally {
      setParsing(false)
    }
  }

  function buildPayload(scrapedJob: ScrapedJob, overrides?: { title?: string; company?: string; description?: string }) {
    const primaryDoc = docs.find((d) => d.id === primaryDocId)
    const extraDocs = docs.filter((d) => extraDocIds.has(d.id))

    return {
      company: (overrides?.company ?? scrapedJob.company) || 'Company',
      jobTitle: (overrides?.title ?? scrapedJob.title) || 'Role',
      jobDescription: overrides?.description ?? scrapedJob.description ?? '',
      backgroundExperience: primaryDoc?.content.text ?? '',
      includeCoverLetter,
      includeSummary,
      additionalContext: extraDocs.map((d) => ({
        title: d.title,
        type: d.item_type,
        text: d.content.text,
      })),
    }
  }

  async function generate(scrapedJob?: ScrapedJob) {
    const payload = buildPayload(scrapedJob ?? job!, { title: confirmTitle, company: confirmCompany, description: confirmDescription })

    // Client-side validation before hitting the API
    if (!payload.backgroundExperience) {
      setError('No resume content found. Add a document in Easy Apply first.')
      return
    }
    if (!payload.jobDescription) {
      setError('Could not extract job description from this page.')
      return
    }

    setStep('generating')
    setCoverLetter('')
    setError(null)
    cancelledRef.current = false
    setElapsed(0)
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000)

    let port: chrome.runtime.Port
    try {
      port = chrome.runtime.connect({ name: 'generate' })
    } catch {
      setError('Lost connection to extension. Please reload the page and try again.')
      setStep('scrape')
      return
    }
    portRef.current = port

    let finished = false

    port.onDisconnect.addListener(() => {
      if (!finished && !cancelledRef.current) {
        setError('Connection lost. Please reload and try again.')
        setStep('scrape')
      }
    })

    port.onMessage.addListener((msg: PortOutMessage) => {
      if (msg.type === 'chunk') {
        const ev = msg.event
        if (ev.type === 'cover_letter_chunk' && ev.content) setCoverLetter((p) => p + ev.content)
        if (ev.type === 'done') {
          // Final done event carries full text + applicationId
          if (ev.coverLetterText) setCoverLetter(ev.coverLetterText)
          if (ev.applicationId) setApplicationId(ev.applicationId)
          finished = true
          clearInterval(timerRef.current!)
          port.disconnect()
          setStep('done')
        }
      } else if (msg.type === 'done') {
        // Stream ended without a done event — mark complete anyway
        finished = true
        clearInterval(timerRef.current!)
        port.disconnect()
        setStep('done')
      } else if (msg.type === 'error') {
        finished = true
        clearInterval(timerRef.current!)
        port.disconnect()
        if (msg.status === 401) {
          setAuthState('unauthenticated')
        } else {
          const detail = msg.status === 400
            ? 'Missing required fields — ensure job description and resume content are loaded.'
            : `Generation failed (${msg.status ?? msg.message})`
          setError(detail)
          setStep('scrape')
        }
      }
    })

    port.postMessage({ type: 'START', payload })
  }

  async function downloadPdf() {
    if (!applicationId) {
      window.open(`${API_BASE}/dashboard`, '_blank')
      return
    }
    setDownloading(true)
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DOWNLOAD_PDF',
        payload: { applicationId },
      }) as { data: string; filename: string } | { error: number | string }

      if ('error' in response) {
        window.open(`${API_BASE}/dashboard`, '_blank')
        return
      }

      const blob = new Blob(
        [Uint8Array.from(atob(response.data), (c) => c.charCodeAt(0))],
        { type: 'application/pdf' }
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = response.filename
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  function reset() {
    portRef.current?.disconnect()
    setStep('scrape')
    setJob(null)
    setConfirmTitle('')
    setConfirmCompany('')
    setConfirmDescription('')
    setCoverLetter('')
    setError(null)
    setFitAnalysis(null)
    setShowFitView(false)
    setShowQAView(false)
    setDownloadingCoverLetter(false)
    setQaInput('')
    setQaAnswers([])
  }

  function cancel() {
    cancelledRef.current = true
    clearInterval(timerRef.current!)
    portRef.current?.disconnect()
    setStep('confirm')
  }

  async function getAnswers() {
    const questions = qaInput.split('\n').map((q) => q.trim()).filter((q) => q.length > 0).slice(0, 5)
    if (questions.length === 0) return
    const payload = buildPayload(job!, { title: confirmTitle, company: confirmCompany, description: confirmDescription })
    setQaLoading(true)
    setQaAnswers([])
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ANSWER_QUESTIONS',
        payload: {
          company: payload.company,
          jobTitle: payload.jobTitle,
          jobDescription: payload.jobDescription,
          backgroundExperience: payload.backgroundExperience,
          questions,
        },
      }) as { data: { answers: { question: string; answer: string }[] } } | { error: number | string }
      if ('error' in response) {
        if (response.error === 401) setAuthState('unauthenticated')
        return
      }
      setQaAnswers(response.data.answers)
    } finally {
      setQaLoading(false)
    }
  }

  function copyAnswer(text: string, idx: number) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 1500)
    })
  }

  async function downloadCoverLetterPdf() {
    if (!applicationId) return
    setDownloadingCoverLetter(true)
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DOWNLOAD_PDF',
        payload: { applicationId, docType: 'cover-letter' },
      }) as { data: string; filename: string } | { error: number | string }

      if ('error' in response) {
        window.open(`${API_BASE}/dashboard`, '_blank')
        return
      }

      const blob = new Blob(
        [Uint8Array.from(atob(response.data), (c) => c.charCodeAt(0))],
        { type: 'application/pdf' }
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = response.filename
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloadingCoverLetter(false)
    }
  }

  async function openPreview() {
    if (!applicationId) return
    setPreviewing(true)
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DOWNLOAD_PDF',
        payload: { applicationId },
      }) as { data: string } | { error: number | string }

      if ('error' in response) {
        window.open(`${API_BASE}/dashboard`, '_blank')
        return
      }
      await chrome.storage.local.set({ easy_apply_pdf_preview: response.data })
      chrome.tabs.create({ url: chrome.runtime.getURL('src/preview/index.html') })
    } finally {
      setPreviewing(false)
    }
  }

  async function analyzeGap() {
    if (fitAnalysis) { setShowFitView(true); return }
    if (!job) return
    const payload = buildPayload(job, { title: confirmTitle, company: confirmCompany, description: confirmDescription })
    setAnalyzingFit(true)
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ANALYZE_FIT',
        payload: {
          company: payload.company,
          jobTitle: payload.jobTitle,
          jobDescription: payload.jobDescription,
          backgroundExperience: payload.backgroundExperience,
          additionalContext: payload.additionalContext,
        },
      }) as { data: FitAnalysis } | { error: number | string }

      if ('error' in response) {
        if (response.error === 401) setAuthState('unauthenticated')
        return
      }
      setFitAnalysis(response.data)
      setShowFitView(true)
    } finally {
      setAnalyzingFit(false)
    }
  }

  const primaryDoc = docs.find((d) => d.id === primaryDocId)

  return (
    <div className="w-full min-h-screen bg-zinc-950 text-zinc-100 flex flex-col text-sm">

      {/* ── LOADING ── */}
      {authState === 'loading' && (
        <div className="flex flex-col items-center justify-center flex-1 gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-zinc-600" />
          <p className="text-zinc-600 text-xs">Connecting…</p>
        </div>
      )}

      {/* ── SIGN-IN SCREEN ── */}
      {authState === 'unauthenticated' && (
        <div className="flex flex-col items-center justify-center flex-1 gap-6 px-8 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-600/20 flex items-center justify-center">
              <FileText className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <p className="font-semibold text-zinc-100">Easy Apply</p>
              <p className="text-zinc-500 text-xs mt-1 leading-relaxed">
                Sign in to tailor your resume to any job posting in seconds.
              </p>
            </div>
          </div>
          <div className="w-full space-y-2">
            <a
              href={`${API_BASE}/sign-in`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded bg-blue-600 hover:bg-blue-500 font-medium text-sm transition-colors"
            >
              <LogIn className="w-4 h-4" />
              Sign in
            </a>
            <a
              href={`${API_BASE}/sign-up`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-2 rounded border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-xs transition-colors"
            >
              Create an account <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <button
            onClick={checkAuth}
            className="w-full flex items-center justify-center gap-2 py-2 rounded border border-zinc-500 hover:border-zinc-300 text-zinc-200 hover:text-white text-xs font-medium transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            I&apos;ve signed in — refresh
          </button>
        </div>
      )}

      {/* ── AUTHENTICATED UI ── */}
      {authState === 'authenticated' && (<>

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800 shrink-0">
        {step !== 'scrape' && (
          <button onClick={reset} className="text-zinc-600 hover:text-zinc-400 mr-1 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        <FileText className="w-4 h-4 text-blue-400 shrink-0" />
        <span className="font-semibold">Easy Apply</span>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {step !== 'scrape' && job?.company && (
            <span className="text-zinc-600 truncate max-w-[90px] text-xs">{job.company}</span>
          )}
          {user && (
            user.imageUrl ? (
              <img
                src={user.imageUrl}
                alt={user.name || user.email}
                title={user.name || user.email}
                className="w-6 h-6 rounded-full ring-1 ring-zinc-700 object-cover shrink-0"
              />
            ) : (
              <div
                title={user.name || user.email}
                className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center shrink-0 ring-1 ring-zinc-700"
              >
                <span className="text-[9px] font-bold text-white">
                  {(user.name || user.email).charAt(0).toUpperCase()}
                </span>
              </div>
            )
          )}
        </div>
      </div>

      {/* ── STEP: SCRAPE ── */}
      {step === 'scrape' && (
        <div className="flex flex-col items-center justify-center flex-1 gap-5 px-6 text-center">
          {docsLoading ? (
            <div className="flex items-center gap-2 text-zinc-600 text-xs">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading your documents...
            </div>
          ) : primaryDoc ? (
            <div className="w-full rounded border border-zinc-800 bg-zinc-900/60 p-3 text-left">
              <p className="text-xs text-zinc-500 mb-1">Loaded from Easy Apply</p>
              <p className="text-zinc-300 text-xs font-medium">{primaryDoc.title}</p>
              {docs.length > 1 && (
                <p className="text-zinc-600 text-xs mt-0.5">+{docs.length - 1} additional doc{docs.length > 2 ? 's' : ''}</p>
              )}
            </div>
          ) : null}

          <div className="space-y-3 w-full">
            <p className="text-zinc-400 leading-relaxed text-xs">
              Open a job posting, then click below to pull the details and tailor your resume.
            </p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeCoverLetter}
                onChange={(e) => setIncludeCoverLetter(e.target.checked)}
                className="accent-blue-500"
              />
              <span className="text-zinc-400 text-xs">Include cover letter</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeSummary}
                onChange={(e) => setIncludeSummary(e.target.checked)}
                className="accent-blue-500"
              />
              <span className="text-zinc-400 text-xs">Include summary section</span>
            </label>
            <button
              onClick={scrapeJob}
              disabled={scraping}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-medium transition-colors"
            >
              {scraping ? <><Loader2 className="w-4 h-4 animate-spin" />Reading page...</> : 'Read job from this page'}
            </button>
            <p className="text-zinc-600 text-[10px] leading-snug">
              If scraping fails, reload the job page tab first, then try again.
            </p>
            <button
              onClick={enterManually}
              className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
            >
              Paste description manually instead
            </button>
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>
      )}

      {/* ── STEP: CONFIRM ── */}
      {step === 'confirm' && job && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <p className="text-zinc-400 text-xs">Confirm the details before generating.</p>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                Job Title
                {parsing && <span className="ml-1 text-zinc-600 normal-case font-normal">extracting…</span>}
              </label>
              <input
                type="text"
                value={confirmTitle}
                onChange={(e) => setConfirmTitle(e.target.value)}
                placeholder={parsing ? 'Extracting…' : ''}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
                Company
                {parsing && <span className="ml-1 text-zinc-600 normal-case font-normal">extracting…</span>}
              </label>
              <input
                type="text"
                value={confirmCompany}
                onChange={(e) => setConfirmCompany(e.target.value)}
                placeholder={parsing ? 'Extracting…' : ''}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-100 text-xs focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">Job Description</label>
              <textarea
                value={confirmDescription}
                onChange={(e) => setConfirmDescription(e.target.value)}
                onPaste={(e) => {
                  const text = e.clipboardData.getData('text')
                  if (text.length >= 100) parsePastedDescription(text)
                }}
                placeholder="Paste the job description here…"
                rows={8}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-300 text-xs focus:outline-none focus:border-blue-500 resize-none leading-relaxed"
              />
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}
          </div>

          <div className="p-3 border-t border-zinc-800 flex flex-col gap-2 shrink-0">
            <button
              onClick={() => generate()}
              disabled={!confirmDescription.trim()}
              className="w-full py-2.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-medium text-sm transition-colors"
            >
              Generate
            </button>
            <button
              onClick={reset}
              className="w-full py-1.5 text-zinc-400 hover:text-zinc-200 text-xs transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* ── STEP: GENERATING ── */}
      {step === 'generating' && (
        <div className="flex flex-col items-center justify-center flex-1 gap-5 px-6 text-center">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
          </div>
          <div>
            <p className="text-zinc-200 font-medium text-sm">Tailoring your resume…</p>
            <p className="text-zinc-600 text-xs mt-1">{job?.company ? `for ${job.company}` : 'This may take a moment'}</p>
          </div>
          {/* Animated progress bar */}
          <div className="w-full max-w-xs h-1 rounded-full bg-zinc-800 overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full" style={{ animation: 'progress 1.8s ease-in-out infinite' }} />
          </div>
          <p className="text-zinc-600 text-[10px] tabular-nums">{elapsed}s</p>
          <button
            onClick={cancel}
            className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── STEP: DONE ── */}
      {step === 'done' && (
        <div className="flex flex-col flex-1 overflow-hidden">

          {/* ── Follow-up Questions View ── */}
          {showQAView ? (
            <>
              <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 shrink-0">
                <button
                  onClick={() => setShowQAView(false)}
                  className="text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs font-medium text-zinc-200">Follow-up Questions</span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                    Application questions
                    <span className="ml-1 font-normal normal-case text-zinc-600">· one per line, up to 5</span>
                  </label>
                  <textarea
                    value={qaInput}
                    onChange={(e) => setQaInput(e.target.value)}
                    placeholder={"What excites you about this role?\nDescribe a challenge you overcame…"}
                    rows={5}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-300 text-xs focus:outline-none focus:border-blue-500 resize-none leading-relaxed"
                  />
                  <button
                    onClick={getAnswers}
                    disabled={qaLoading || !qaInput.trim()}
                    className="w-full mt-2 flex items-center justify-center gap-1.5 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-medium transition-colors"
                  >
                    {qaLoading
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Writing answers…</>
                      : 'Get answers'
                    }
                  </button>
                </div>

                {qaAnswers.length > 0 && (
                  <div className="space-y-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Answers</p>
                    {qaAnswers.map((qa, i) => (
                      <div key={i} className="rounded border border-zinc-800 bg-zinc-900/60 p-3 space-y-2">
                        <p className="text-[10px] font-semibold text-zinc-400 leading-snug">{qa.question}</p>
                        <p className="text-zinc-300 text-xs leading-relaxed whitespace-pre-wrap">{qa.answer}</p>
                        <button
                          onClick={() => copyAnswer(qa.answer, i)}
                          className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          {copiedIdx === i
                            ? <><Check className="w-3 h-3 text-green-400" /><span className="text-green-400">Copied</span></>
                            : <><Copy className="w-3 h-3" />Copy</>
                          }
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}

          {/* ── Gap Analysis / Main Done View ── */}
          {showFitView && !showQAView ? (
            <>
              <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 shrink-0">
                <button
                  onClick={() => setShowFitView(false)}
                  className="text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <Lightbulb className="w-3.5 h-3.5 text-yellow-400" />
                <span className="text-xs font-medium text-zinc-200">Gap Analysis</span>
                {fitAnalysis && (
                  <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded border ${FIT_COLOR[fitAnalysis.overallFit] ?? ''}`}>
                    {fitAnalysis.overallFit}
                  </span>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {fitAnalysis ? (
                  <>
                    {fitAnalysis.plannedImprovements?.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">What was improved</p>
                        <ul className="space-y-1">
                          {fitAnalysis.plannedImprovements.map((item, i) => (
                            <li key={i} className="text-zinc-300 text-xs leading-snug flex gap-1.5">
                              <span className="text-zinc-500 shrink-0">→</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <FitSection title="Strengths" items={fitAnalysis.strengths} color="text-green-400" />
                    <FitSection title="Gaps" items={fitAnalysis.gaps} color="text-red-400" />
                    <FitSection title="Suggestions" items={fitAnalysis.suggestions} color="text-blue-400" />
                  </>
                ) : (
                  <div className="flex items-center justify-center h-20 text-zinc-600 text-xs">
                    No analysis available
                  </div>
                )}
              </div>
            </>
          ) : !showQAView ? (
            <>
              {/* Success summary */}
              <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
                <div className="w-10 h-10 rounded-xl bg-green-600/20 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-zinc-100 font-medium text-sm">Resume ready</p>
                  {job?.title && <p className="text-zinc-500 text-xs mt-1">{job.title}{job.company ? ` · ${job.company}` : ''}</p>}
                  {coverLetter && <p className="text-zinc-600 text-xs mt-0.5">Cover letter included</p>}
                </div>
              </div>

              {/* Actions */}
              <div className="p-3 border-t border-zinc-800 flex flex-col gap-2 shrink-0">
                <div className="flex gap-2">
                  <button
                    onClick={openPreview}
                    disabled={!applicationId || previewing}
                    title={applicationId ? 'Preview PDF' : 'Preview available after generation completes'}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded border border-zinc-700 hover:border-zinc-500 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed text-xs transition-colors"
                  >
                    {previewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                    {!previewing && 'Preview'}
                  </button>
                  <button
                    onClick={downloadPdf}
                    disabled={downloading}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-medium transition-colors"
                  >
                    {downloading
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Downloading…</>
                      : <><Download className="w-3.5 h-3.5" />Download PDF</>
                    }
                  </button>
                </div>
                {coverLetter && (
                  <button
                    onClick={downloadCoverLetterPdf}
                    disabled={!applicationId || downloadingCoverLetter}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded border border-zinc-700 hover:border-zinc-500 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed text-xs transition-colors"
                  >
                    {downloadingCoverLetter
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Downloading…</>
                      : <><Download className="w-3.5 h-3.5" />Download Cover Letter</>
                    }
                  </button>
                )}
                <button
                  onClick={analyzeGap}
                  disabled={analyzingFit}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded border border-yellow-800/60 hover:border-yellow-700 text-yellow-400 hover:text-yellow-300 disabled:opacity-50 text-xs transition-colors"
                >
                  {analyzingFit
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Analyzing…</>
                    : <><Lightbulb className="w-3.5 h-3.5" />{fitAnalysis ? 'View gap analysis' : 'Gap analysis'}</>
                  }
                </button>
                <button
                  onClick={() => setShowQAView(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-xs transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Follow-up questions
                </button>
                <a
                  href={`${API_BASE}/dashboard`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-xs transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open in Easy Apply
                </a>
                <button
                  onClick={reset}
                  className="w-full py-1.5 text-zinc-400 hover:text-zinc-200 text-xs transition-colors"
                >
                  Start over
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}

      </>)}
    </div>
  )
}
