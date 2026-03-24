import { useState, useRef } from 'react'
import { FileText, Loader2, Copy, Check, ExternalLink, ChevronLeft } from 'lucide-react'
import type { ScrapedJob } from '../types'
import { getAuthToken } from '../lib/auth'

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
  return {
    title: document.title,
    description: document.body.innerText.slice(0, 5000),
    url,
  }
}

type Step = 'scrape' | 'input' | 'generating' | 'done'

export default function App() {
  const [step, setStep] = useState<Step>('scrape')
  const [job, setJob] = useState<ScrapedJob | null>(null)
  const [background, setBackground] = useState('')
  const [includeCoverLetter, setIncludeCoverLetter] = useState(false)
  const [resume, setResume] = useState('')
  const [coverLetter, setCoverLetter] = useState('')
  const [scraping, setScraping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)

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

  async function generate() {
    if (!job || !background.trim()) return
    setStep('generating')
    setResume('')
    setCoverLetter('')
    setError(null)

    try {
      const token = await getAuthToken()
      const response = await fetch(`${API_BASE}/api/generate-documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          company: job.company ?? '',
          jobTitle: job.title ?? '',
          jobDescription: job.description ?? '',
          backgroundExperience: background,
          includeCoverLetter,
          includeSummary: false,
        }),
      })

      if (response.status === 401) {
        setError('Sign in required — open ResumeForge and sign in, then try again.')
        setStep('input')
        return
      }
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const reader = response.body!.getReader()
      readerRef.current = reader
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw || raw === '[DONE]') continue
          try {
            const event = JSON.parse(raw) as Record<string, string>
            if (event.event === 'resume_chunk' && event.content) {
              setResume((prev) => prev + event.content)
            } else if (event.event === 'cover_letter_chunk' && event.content) {
              setCoverLetter((prev) => prev + event.content)
            }
          } catch {
            // non-JSON line, skip
          }
        }
      }

      setStep('done')
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Generation failed')
      setStep('input')
    }
  }

  function reset() {
    readerRef.current?.cancel()
    setStep('scrape')
    setJob(null)
    setBackground('')
    setResume('')
    setCoverLetter('')
    setError(null)
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="w-full min-h-screen bg-zinc-950 text-zinc-100 flex flex-col text-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800 shrink-0">
        {step !== 'scrape' && (
          <button onClick={reset} className="text-zinc-600 hover:text-zinc-400 mr-1 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        <FileText className="w-4 h-4 text-blue-400" />
        <span className="font-semibold">ResumeForge</span>
        {step !== 'scrape' && job && (
          <span className="text-zinc-600 truncate ml-auto max-w-[120px]">
            {job.company ?? job.title}
          </span>
        )}
      </div>

      {/* Steps */}
      {step === 'scrape' && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 px-6 text-center">
          <p className="text-zinc-400 leading-relaxed">
            Open a job posting, then click below to pull the details.
          </p>
          <button
            onClick={scrapeJob}
            disabled={scraping}
            className="flex items-center gap-2 px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-medium transition-colors"
          >
            {scraping ? <><Loader2 className="w-4 h-4 animate-spin" /> Reading page...</> : 'Read job from this page'}
          </button>
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>
      )}

      {step === 'input' && job && (
        <div className="flex flex-col flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Job summary */}
            <div className="rounded border border-zinc-800 bg-zinc-900 p-3 space-y-0.5">
              <p className="font-medium text-zinc-100">{job.title ?? 'Unknown title'}</p>
              {job.company && <p className="text-zinc-500">{job.company}</p>}
              {job.description && (
                <p className="text-zinc-600 text-xs pt-1 line-clamp-2">
                  {job.description.slice(0, 200)}...
                </p>
              )}
            </div>

            {/* Background */}
            <div>
              <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-2">
                Your background
              </label>
              <textarea
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                placeholder="Paste your resume, work history, or a summary of your experience..."
                rows={8}
                className="w-full rounded border border-zinc-800 bg-zinc-900 text-zinc-100 placeholder-zinc-700 px-3 py-2 text-xs leading-relaxed resize-none focus:outline-none focus:border-zinc-600 transition-colors"
              />
            </div>

            {/* Options */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeCoverLetter}
                onChange={(e) => setIncludeCoverLetter(e.target.checked)}
                className="rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-0"
              />
              <span className="text-zinc-400 text-xs">Include cover letter</span>
            </label>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <button
              onClick={generate}
              disabled={!background.trim()}
              className="w-full py-2.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 font-medium transition-colors"
            >
              Generate resume
            </button>
          </div>
        </div>
      )}

      {step === 'generating' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 text-xs text-zinc-500">
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

      {step === 'done' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Tab bar if cover letter exists */}
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
              <span className="text-xs text-zinc-500 uppercase tracking-wider">Resume</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copy(resume)}
                  className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <a
                  href={API_BASE}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  Full app
                </a>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <pre className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-mono">
                {resume}
              </pre>
            </div>

            {coverLetter && (
              <>
                <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-800">
                  <span className="text-xs text-zinc-500 uppercase tracking-wider">Cover Letter</span>
                  <button
                    onClick={() => copy(coverLetter)}
                    className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    <Copy className="w-3 h-3" />
                    Copy
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto p-4 border-t border-zinc-800">
                  <pre className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap font-mono">
                    {coverLetter}
                  </pre>
                </div>
              </>
            )}

            <div className="p-4 border-t border-zinc-800">
              <button
                onClick={reset}
                className="w-full py-2 rounded border border-zinc-800 hover:border-zinc-600 text-zinc-400 hover:text-zinc-200 text-xs transition-colors"
              >
                Start over
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
