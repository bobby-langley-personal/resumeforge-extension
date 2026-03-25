import { useState, useEffect, useRef } from 'react'
import {
  FileText, Loader2, Copy, Check, Download, Eye,
  ChevronLeft, ExternalLink, Lightbulb, LogIn,
} from 'lucide-react'
import type { ScrapedJob, ResumeItem, PortOutMessage, FitAnalysis, User } from '../types'

const API_BASE = 'https://resume-forge-rho.vercel.app'

// Runs inside the page context via executeScript — no imports allowed
function scrapePageContent(): ScrapedJob {
  const url = window.location.href
  if (url.includes('linkedin.com/jobs')) {
    return {
      title: document.querySelector('.job-details-jobs-unified-top-card__job-title')?.textContent?.trim(),
      company: document.querySelector('.job-details-jobs-unified-top-card__company-name')?.textContent?.trim(),
      description: document.querySelector('.jobs-description__content')?.textContent?.trim(),
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
  return { title: document.title, description: document.body.innerText.slice(0, 5000), url }
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

type Step = 'scrape' | 'input' | 'generating' | 'done'
type AuthState = 'loading' | 'unauthenticated' | 'authenticated'

export default function App() {
  // Auth
  const [authState, setAuthState] = useState<AuthState>('loading')
  const [user, setUser] = useState<User | null>(null)

  const [step, setStep] = useState<Step>('scrape')
  const [job, setJob] = useState<ScrapedJob | null>(null)
  const [scraping, setScraping] = useState(false)

  // Documents from ResumeForge account
  const [docs, setDocs] = useState<ResumeItem[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [primaryDocId, setPrimaryDocId] = useState<string | null>(null)
  const [extraDocIds, setExtraDocIds] = useState<Set<string>>(new Set())

  // Generation
  const [includeCoverLetter, setIncludeCoverLetter] = useState(false)
  const [resume, setResume] = useState('')
  const [coverLetter, setCoverLetter] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [applicationId, setApplicationId] = useState<string | null>(null)

  // Result actions
  const [copied, setCopied] = useState<'resume' | 'cover' | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [activeTab, setActiveTab] = useState<'resume' | 'cover'>('resume')
  // Gap analysis
  const [fitAnalysis, setFitAnalysis] = useState<FitAnalysis | null>(null)
  const [analyzingFit, setAnalyzingFit] = useState(false)
  const [showFitView, setShowFitView] = useState(false)

  const portRef = useRef<chrome.runtime.Port | null>(null)

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
      setStep('input')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read page')
    } finally {
      setScraping(false)
    }
  }

  function buildPayload() {
    if (!job) return null
    const primaryDoc = docs.find((d) => d.id === primaryDocId)
    const extraDocs = docs.filter((d) => extraDocIds.has(d.id))

    return {
      company: job.company ?? '',
      jobTitle: job.title ?? '',
      jobDescription: job.description ?? '',
      backgroundExperience: primaryDoc?.content.text ?? '',
      includeCoverLetter,
      includeSummary: false,
      additionalContext: extraDocs.map((d) => ({
        title: d.title,
        type: d.item_type,
        text: d.content.text,
      })),
    }
  }

  async function generate() {
    const payload = buildPayload()
    if (!payload) return

    setStep('generating')
    setResume('')
    setCoverLetter('')
    setError(null)

    const port = chrome.runtime.connect({ name: 'generate' })
    portRef.current = port

    port.onMessage.addListener((msg: PortOutMessage) => {
      if (msg.type === 'chunk') {
        const ev = msg.event
        if (ev.type === 'resume_chunk' && ev.content) setResume((p) => p + ev.content)
        if (ev.type === 'cover_letter_chunk' && ev.content) setCoverLetter((p) => p + ev.content)
        if (ev.type === 'done') {
          // Final done event carries full text + applicationId
          if (ev.resumeText) setResume(ev.resumeText)
          if (ev.coverLetterText) setCoverLetter(ev.coverLetterText)
          if (ev.applicationId) setApplicationId(ev.applicationId)
          port.disconnect()
          setStep('done')
          setActiveTab('resume')
        }
      } else if (msg.type === 'done') {
        // Stream ended without a done event — mark complete anyway
        port.disconnect()
        setStep('done')
        setActiveTab('resume')
      } else if (msg.type === 'error') {
        port.disconnect()
        if (msg.status === 401) {
          setAuthState('unauthenticated')
        } else {
          setError(`Generation failed (${msg.status ?? msg.message})`)
          setStep('input')
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
      }) as { data: string } | { error: number | string }

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
      a.download = `${job?.company ?? 'resume'}_${job?.title ?? ''}.pdf`.replace(/\s+/g, '_')
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
    setResume('')
    setCoverLetter('')
    setError(null)
    setFitAnalysis(null)
    setShowFitView(false)
  }

  async function openPreview() {
    await chrome.storage.local.set({
      resumeforge_preview: {
        resumeText: resume,
        coverLetterText: coverLetter || undefined,
        company: job?.company,
        jobTitle: job?.title,
      },
    })
    chrome.tabs.create({ url: chrome.runtime.getURL('src/preview/index.html') })
  }

  async function analyzeGap() {
    if (fitAnalysis) { setShowFitView(true); return }
    const payload = buildPayload()
    if (!payload) return
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

  async function copy(text: string, which: 'resume' | 'cover') {
    await navigator.clipboard.writeText(text)
    setCopied(which)
    setTimeout(() => setCopied(null), 2000)
  }

  function toggleExtraDoc(id: string) {
    setExtraDocIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
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
              <p className="font-semibold text-zinc-100">ResumeForge</p>
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
            className="text-zinc-600 hover:text-zinc-400 text-xs transition-colors"
          >
            I've signed in — refresh
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
        <span className="font-semibold">ResumeForge</span>
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
              <p className="text-xs text-zinc-500 mb-1">Loaded from ResumeForge</p>
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
            <button
              onClick={scrapeJob}
              disabled={scraping}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-medium transition-colors"
            >
              {scraping ? <><Loader2 className="w-4 h-4 animate-spin" />Reading page...</> : 'Read job from this page'}
            </button>
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>
      )}

      {/* ── STEP: INPUT ── */}
      {step === 'input' && job && (
        <div className="flex flex-col flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Job summary */}
            <div className="rounded border border-zinc-800 bg-zinc-900/60 p-3">
              <p className="font-medium text-zinc-100 leading-snug">{job.title ?? 'Unknown title'}</p>
              {job.company && <p className="text-zinc-500 text-xs mt-0.5">{job.company}</p>}
            </div>

            {/* Document context */}
            {docs.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-zinc-500 uppercase tracking-wider">Resume context</p>

                {/* Primary doc selector */}
                <div className="space-y-1">
                  {docs.map((doc) => (
                    <label
                      key={doc.id}
                      className={`flex items-center gap-2.5 rounded px-3 py-2 cursor-pointer border transition-colors ${
                        primaryDocId === doc.id
                          ? 'border-blue-600/50 bg-blue-950/30'
                          : extraDocIds.has(doc.id)
                          ? 'border-zinc-700/50 bg-zinc-900/40'
                          : 'border-zinc-800/50 bg-zinc-900/20 opacity-50'
                      }`}
                    >
                      {/* Primary radio */}
                      <input
                        type="radio"
                        name="primary"
                        checked={primaryDocId === doc.id}
                        onChange={() => {
                          setPrimaryDocId(doc.id)
                          setExtraDocIds((prev) => {
                            const next = new Set(prev)
                            next.delete(doc.id)
                            return next
                          })
                        }}
                        className="accent-blue-500"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-zinc-200 truncate">{doc.title}</p>
                        <p className="text-xs text-zinc-600">{doc.item_type}{doc.is_default ? ' · default' : ''}</p>
                      </div>
                      {/* Extra context toggle (only for non-primary docs) */}
                      {primaryDocId !== doc.id && (
                        <input
                          type="checkbox"
                          checked={extraDocIds.has(doc.id)}
                          onChange={() => toggleExtraDoc(doc.id)}
                          title="Include as additional context"
                          className="accent-zinc-500"
                        />
                      )}
                    </label>
                  ))}
                </div>
                <p className="text-zinc-700 text-xs">Radio = primary · Checkbox = extra context</p>
              </div>
            ) : (
              <p className="text-zinc-600 text-xs">No saved documents found. Sign in to ResumeForge to load your resume library.</p>
            )}

            {/* Options */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeCoverLetter}
                onChange={(e) => setIncludeCoverLetter(e.target.checked)}
                className="accent-blue-500"
              />
              <span className="text-zinc-400 text-xs">Include cover letter</span>
            </label>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <button
              onClick={generate}
              disabled={!primaryDocId && docs.length > 0}
              className="w-full py-2.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 font-medium transition-colors"
            >
              Generate resume
            </button>
          </div>
        </div>
      )}

      {/* ── STEP: GENERATING ── */}
      {step === 'generating' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 text-xs text-zinc-500 shrink-0">
            <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
            Generating...
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <pre className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-mono">
              {resume || <span className="text-zinc-700">Resume will appear here...</span>}
            </pre>
          </div>
        </div>
      )}

      {/* ── STEP: DONE ── */}
      {step === 'done' && (
        <div className="flex flex-col flex-1 overflow-hidden">

          {/* ── Gap Analysis View ── */}
          {showFitView ? (
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
          ) : (
            <>
              {/* Tab bar: resume / cover letter */}
              {coverLetter && (
                <div className="flex border-b border-zinc-800 shrink-0">
                  {(['resume', 'cover'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`flex-1 py-2 text-xs font-medium transition-colors ${
                        activeTab === tab
                          ? 'text-zinc-100 border-b-2 border-blue-500'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {tab === 'resume' ? 'Resume' : 'Cover Letter'}
                    </button>
                  ))}
                </div>
              )}

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4">
                <pre className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-mono">
                  {activeTab === 'resume' ? resume : coverLetter}
                </pre>
              </div>

              {/* Actions */}
              <div className="p-3 border-t border-zinc-800 flex flex-col gap-2 shrink-0">
                <div className="flex gap-2">
                  <button
                    onClick={() => copy(activeTab === 'resume' ? resume : coverLetter, activeTab === 'resume' ? 'resume' : 'cover')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded border border-zinc-700 hover:border-zinc-500 text-zinc-300 text-xs transition-colors"
                  >
                    {copied === (activeTab === 'resume' ? 'resume' : 'cover')
                      ? <><Check className="w-3.5 h-3.5 text-green-400" />Copied</>
                      : <><Copy className="w-3.5 h-3.5" />Copy text</>
                    }
                  </button>
                  <button
                    onClick={openPreview}
                    title="Open full preview"
                    className="flex items-center justify-center px-2.5 py-2 rounded border border-zinc-700 hover:border-zinc-500 text-zinc-300 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={downloadPdf}
                    disabled={downloading}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-medium transition-colors"
                  >
                    {downloading
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Downloading...</>
                      : <><Download className="w-3.5 h-3.5" />Download PDF</>
                    }
                  </button>
                </div>
                <button
                  onClick={analyzeGap}
                  disabled={analyzingFit}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded border border-yellow-800/60 hover:border-yellow-700 text-yellow-400 hover:text-yellow-300 disabled:opacity-50 text-xs transition-colors"
                >
                  {analyzingFit
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Analyzing...</>
                    : <><Lightbulb className="w-3.5 h-3.5" />{fitAnalysis ? 'View gap analysis' : 'Gap analysis'}</>
                  }
                </button>
                <button
                  onClick={reset}
                  className="w-full py-1.5 text-zinc-600 hover:text-zinc-400 text-xs transition-colors"
                >
                  Start over
                </button>
              </div>
            </>
          )}
        </div>
      )}

      </>)}
    </div>
  )
}
