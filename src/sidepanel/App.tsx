import { useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import type { ScrapedJob } from '../types'

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

export default function App() {
  const [job, setJob] = useState<ScrapedJob | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function scrapeJob() {
    setLoading(true)
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read page')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
        <FileText className="w-5 h-5 text-blue-400" />
        <span className="font-semibold text-sm">ResumeForge</span>
      </div>

      <div className="flex-1 p-4">
        {!job ? (
          <div className="flex flex-col items-center justify-center h-48 gap-4 text-center">
            <p className="text-zinc-400 text-sm">
              Open a job posting, then click below to pull the job details.
            </p>
            <button
              onClick={scrapeJob}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Reading page...
                </>
              ) : (
                'Read job from this page'
              )}
            </button>
            {error && <p className="text-red-400 text-xs">{error}</p>}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Job</p>
              <p className="text-sm font-medium">{job.title ?? 'Unknown title'}</p>
              {job.company && <p className="text-sm text-zinc-400">{job.company}</p>}
            </div>

            {job.description && (
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
                  Description preview
                </p>
                <p className="text-xs text-zinc-400 leading-relaxed line-clamp-6">
                  {job.description.slice(0, 400)}...
                </p>
              </div>
            )}

            <div className="pt-2 flex flex-col gap-2">
              <a
                href={`https://resume-forge-rho.vercel.app?jd=${encodeURIComponent(job.description ?? '')}&company=${encodeURIComponent(job.company ?? '')}&title=${encodeURIComponent(job.title ?? '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm font-medium transition-colors"
              >
                Tailor resume in ResumeForge ↗
              </a>
              <button
                onClick={() => setJob(null)}
                className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                Clear and start over
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
