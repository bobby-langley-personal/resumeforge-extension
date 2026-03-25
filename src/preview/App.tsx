import { useState, useEffect } from 'react'

export default function PreviewApp() {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    chrome.storage.local.get('resumeforge_pdf_preview', (result) => {
      const b64 = result.resumeforge_pdf_preview as string | undefined
      if (!b64) { setLoading(false); return }
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: 'application/pdf' })
      setPdfUrl(URL.createObjectURL(blob))
      setLoading(false)
    })
    return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl) }
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif', color: '#9ca3af', fontSize: '14px' }}>
        Loading preview…
      </div>
    )
  }

  if (!pdfUrl) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif', color: '#9ca3af', fontSize: '14px' }}>
        Preview not available. Try downloading the PDF instead.
      </div>
    )
  }

  return (
    <iframe
      src={pdfUrl}
      style={{ display: 'block', width: '100%', height: '100vh', border: 'none' }}
      title="Resume Preview"
    />
  )
}
