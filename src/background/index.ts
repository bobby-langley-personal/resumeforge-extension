import type { BgMessage, PortInMessage } from '../types'

const API_BASE = 'https://resume-forge-rho.vercel.app'

// Open side panel on icon click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error)

// One-off requests: fetch resumes, download PDF
chrome.runtime.onMessage.addListener((message: BgMessage, _sender, sendResponse) => {
  if (message.type === 'FETCH_RESUMES') {
    fetch(`${API_BASE}/api/resumes`, { credentials: 'include' })
      .then(async (res) => {
        if (res.status === 401) return sendResponse({ error: 401 })
        const data = await res.json()
        sendResponse({ data })
      })
      .catch((err: Error) => sendResponse({ error: err.message }))
    return true
  }

  if (message.type === 'ANALYZE_FIT') {
    fetch(`${API_BASE}/api/analyze-fit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(message.payload),
    })
      .then(async (res) => {
        if (res.status === 401) return sendResponse({ error: 401 })
        if (!res.ok) return sendResponse({ error: res.status })
        const data = await res.json()
        sendResponse({ data })
      })
      .catch((err: Error) => sendResponse({ error: err.message }))
    return true
  }

  if (message.type === 'DOWNLOAD_PDF') {
    const { applicationId } = message.payload
    fetch(`${API_BASE}/api/download-pdf/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ applicationId }),
    })
      .then(async (res) => {
        if (!res.ok) return sendResponse({ error: res.status })
        const buffer = await res.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        let binary = ''
        bytes.forEach((b) => (binary += String.fromCharCode(b)))
        sendResponse({ data: btoa(binary) })
      })
      .catch((err: Error) => sendResponse({ error: err.message }))
    return true
  }
})

// Streaming generation via persistent port
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'generate') return

  port.onMessage.addListener(async (message: PortInMessage) => {
    if (message.type !== 'START') return

    try {
      const response = await fetch(`${API_BASE}/api/generate-documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(message.payload),
      })

      if (response.status === 401) {
        port.postMessage({ type: 'error', status: 401 })
        return
      }
      if (!response.ok) {
        port.postMessage({ type: 'error', status: response.status })
        return
      }

      const reader = response.body!.getReader()
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
            const event = JSON.parse(raw) as { type: string; content?: string; resumeText?: string; coverLetterText?: string; applicationId?: string }
            port.postMessage({ type: 'chunk', event })
          } catch {
            // non-JSON line, skip
          }
        }
      }

      port.postMessage({ type: 'done' })
    } catch (err) {
      port.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : 'Generation failed',
      })
    }
  })
})
