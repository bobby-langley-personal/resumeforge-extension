import { useState, useEffect } from 'react'

interface PreviewData {
  resumeText: string
  coverLetterText?: string
  company?: string
  jobTitle?: string
}

function DocumentRenderer({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="font-sans text-[13px] leading-relaxed text-gray-900">
      {lines.map((line, i) => {
        const t = line.trim()
        if (!t) return <div key={i} className="h-2" />
        // Section headers: all-caps, short, no bullet
        if (/^[A-Z][A-Z\s&/]+$/.test(t) && t.length <= 40 && !t.startsWith('•')) {
          return (
            <p key={i} className="font-bold text-gray-900 border-b border-gray-300 pb-0.5 mt-5 mb-1.5 text-[11px] tracking-widest uppercase">
              {t}
            </p>
          )
        }
        // Bullet points
        if (t.startsWith('•')) {
          return <p key={i} className="text-gray-700 pl-4 leading-snug mb-0.5">{t}</p>
        }
        // Pipe-separated lines (company | location, role | dates)
        if (t.includes(' | ')) {
          return <p key={i} className="text-gray-900 font-semibold">{t}</p>
        }
        return <p key={i} className="text-gray-700">{t}</p>
      })}
    </div>
  )
}

export default function PreviewApp() {
  const [data, setData] = useState<PreviewData | null>(null)
  const [activeTab, setActiveTab] = useState<'resume' | 'cover'>('resume')

  useEffect(() => {
    chrome.storage.local.get('resumeforge_preview', (result) => {
      if (result.resumeforge_preview) {
        setData(result.resumeforge_preview as PreviewData)
      }
    })
  }, [])

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading preview...</p>
      </div>
    )
  }

  const hasCoverLetter = !!data.coverLetterText
  const content = activeTab === 'resume' ? data.resumeText : (data.coverLetterText ?? '')

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <span className="text-sm font-semibold text-gray-900">ResumeForge</span>
        {data.company && (
          <span className="text-xs text-gray-400">
            {[data.jobTitle, data.company].filter(Boolean).join(' · ')}
          </span>
        )}
        {hasCoverLetter && (
          <div className="flex ml-auto gap-1">
            {(['resume', 'cover'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  activeTab === tab
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                {tab === 'resume' ? 'Resume' : 'Cover Letter'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Document page */}
      <div className="max-w-2xl mx-auto my-10 mb-16">
        <div className="bg-white shadow rounded-sm border border-gray-200 px-14 py-12">
          <DocumentRenderer text={content} />
        </div>
      </div>
    </div>
  )
}
