import type { BgMessage, PortInMessage } from '../types'

const API_BASE = 'https://www.easy-apply.ai'
// Match both www and non-www for tab detection (non-www redirects to www)
const APP_ORIGINS = [API_BASE, 'https://easy-apply.ai']

// Open side panel on icon click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error)

/**
 * Run a fetch call from inside an open easy-apply.ai tab using executeScript.
 * Because the code runs in the page's JS context, the request origin is
 * easy-apply.ai and all session cookies are included — Clerk's CSRF check passes.
 * Returns null if no easy-apply.ai tab is open or the script fails.
 */
async function fetchFromTab(
  path: string,
  options: { method?: string; body?: string } = {}
): Promise<unknown | null> {
  try {
    const allTabs = await chrome.tabs.query({})
    const tabs = allTabs.filter(t => APP_ORIGINS.some(o => t.url?.startsWith(o)))
    const tab = tabs.find(t => t.id != null)
    if (tab?.id == null) {
      return null
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: async (targetPath: string, opts: { method?: string; body?: string }) => {
        const res = await fetch(targetPath, {
          method: opts.method ?? 'GET',
          headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
          body: opts.body,
          credentials: 'same-origin',
        })
        if (!res.ok) return { __error: res.status }
        return res.json()
      },
      args: [path, options],
    })

    return results[0]?.result ?? null
  } catch (err) {
    console.error(`[EasyApply] fetchFromTab(${path}) threw:`, err)
    return null
  }
}

/**
 * Get a fresh Clerk session JWT for streaming calls (generate-documents) that
 * must run directly from the background worker and can't use fetchFromTab.
 *
 * Strategy:
 * 1. Run window.Clerk.session.getToken() via executeScript (main world, fresh token).
 * 2. Fall back to chrome.cookies __session (if not HttpOnly).
 * 3. Return null → caller sends credentials: 'include' only.
 */
async function getClerkToken(): Promise<string | null> {
  try {
    const allTabsForToken = await chrome.tabs.query({})
    const tabs = allTabsForToken.filter(t => APP_ORIGINS.some(o => t.url?.startsWith(o)))
    const tab = tabs.find(t => t.id != null)
    if (tab?.id != null) {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const clerk = (window as any).Clerk
          if (!clerk) return null
          if (!clerk.session) {
            await new Promise(r => setTimeout(r, 2000))
          }
          try {
            return (await clerk.session?.getToken?.()) ?? null
          } catch {
            return null
          }
        },
      })
      const token = results[0]?.result
      if (token) return token
    }
  } catch { /* no tab or scripting failed */ }

  try {
    const cookie = await chrome.cookies.get({ url: API_BASE, name: '__session' })
    if (cookie?.value) return cookie.value
  } catch { /* cookies API unavailable */ }

  return null
}

async function getBgHeaders(extra: Record<string, string> = {}): Promise<HeadersInit> {
  const token = await getClerkToken()
  if (token) return { 'Content-Type': 'application/json', ...extra, Authorization: `Bearer ${token}` }
  return { 'Content-Type': 'application/json', ...extra }
}

// ── One-off requests ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: BgMessage, _sender, sendResponse) => {

  if (message.type === 'FETCH_ME') {
    fetchFromTab('/api/me')
      .then(result => {
        if (result == null) {
          // No open tab — fall back to direct fetch (may fail due to CSRF)
          return fetch(`${API_BASE}/api/me`, { credentials: 'include' })
            .then(async r => r.ok ? sendResponse({ data: await r.json() }) : sendResponse({ error: r.status }))
            .catch((e: Error) => sendResponse({ error: e.message }))
        }
        const r = result as Record<string, unknown>
        if ('__error' in r) return sendResponse({ error: r.__error })
        // Fire-and-forget: mark user as having used the extension
        getBgHeaders().then(headers =>
          fetch(`${API_BASE}/api/ping-extension`, { method: 'POST', headers, credentials: 'include' })
            .catch(() => { /* non-critical */ })
        )
        sendResponse({ data: result })
      })
      .catch((e: Error) => sendResponse({ error: e.message }))
    return true
  }

  if (message.type === 'FETCH_BILLING_STATUS') {
    fetchFromTab('/api/billing/status')
      .then(result => {
        if (result == null) {
          return fetch(`${API_BASE}/api/billing/status`, { credentials: 'include' })
            .then(async r => r.ok ? sendResponse({ data: await r.json() }) : sendResponse({ error: r.status }))
            .catch((e: Error) => sendResponse({ error: e.message }))
        }
        const r = result as Record<string, unknown>
        if ('__error' in r) return sendResponse({ error: r.__error })
        sendResponse({ data: result })
      })
      .catch((e: Error) => sendResponse({ error: e.message }))
    return true
  }

  if (message.type === 'FETCH_RESUMES') {
    fetchFromTab('/api/resumes')
      .then(result => {
        if (result == null) {
          return fetch(`${API_BASE}/api/resumes`, { credentials: 'include' })
            .then(async r => {
              if (r.status === 401) return sendResponse({ error: 401 })
              sendResponse({ data: await r.json() })
            })
            .catch((e: Error) => sendResponse({ error: e.message }))
        }
        const r = result as Record<string, unknown>
        if ('__error' in r) return sendResponse({ error: r.__error })
        sendResponse({ data: result })
      })
      .catch((e: Error) => sendResponse({ error: e.message }))
    return true
  }

  if (message.type === 'ANALYZE_FIT') {
    fetchFromTab('/api/analyze-fit', { method: 'POST', body: JSON.stringify(message.payload) })
      .then(result => {
        if (result == null) {
          return getBgHeaders().then(headers =>
            fetch(`${API_BASE}/api/analyze-fit`, { method: 'POST', headers, credentials: 'include', body: JSON.stringify(message.payload) })
              .then(async r => {
                if (r.status === 401) return sendResponse({ error: 401 })
                if (!r.ok) return sendResponse({ error: r.status })
                sendResponse({ data: await r.json() })
              })
              .catch((e: Error) => sendResponse({ error: e.message }))
          )
        }
        const r = result as Record<string, unknown>
        if ('__error' in r) return sendResponse({ error: r.__error })
        sendResponse({ data: result })
      })
      .catch((e: Error) => sendResponse({ error: e.message }))
    return true
  }

  if (message.type === 'PARSE_JOB') {
    fetchFromTab('/api/parse-job-details', { method: 'POST', body: JSON.stringify(message.payload) })
      .then(result => {
        if (result == null) {
          return getBgHeaders().then(headers =>
            fetch(`${API_BASE}/api/parse-job-details`, { method: 'POST', headers, credentials: 'include', body: JSON.stringify(message.payload) })
              .then(async r => {
                if (r.status === 401) return sendResponse({ error: 401 })
                if (!r.ok) return sendResponse({ error: r.status })
                sendResponse({ data: await r.json() })
              })
              .catch((e: Error) => sendResponse({ error: e.message }))
          )
        }
        const r = result as Record<string, unknown>
        if ('__error' in r) return sendResponse({ error: r.__error })
        sendResponse({ data: result })
      })
      .catch((e: Error) => sendResponse({ error: e.message }))
    return true
  }

  if (message.type === 'ANSWER_QUESTIONS') {
    fetchFromTab('/api/answer-questions', { method: 'POST', body: JSON.stringify(message.payload) })
      .then(result => {
        if (result == null) {
          return getBgHeaders().then(headers =>
            fetch(`${API_BASE}/api/answer-questions`, { method: 'POST', headers, credentials: 'include', body: JSON.stringify(message.payload) })
              .then(async r => {
                if (r.status === 401) return sendResponse({ error: 401 })
                if (!r.ok) return sendResponse({ error: r.status })
                sendResponse({ data: await r.json() })
              })
              .catch((e: Error) => sendResponse({ error: e.message }))
          )
        }
        const r = result as Record<string, unknown>
        if ('__error' in r) return sendResponse({ error: r.__error })
        sendResponse({ data: result })
      })
      .catch((e: Error) => sendResponse({ error: e.message }))
    return true
  }

  if (message.type === 'SUBMIT_FEEDBACK') {
    getBgHeaders().then(headers =>
      fetch(`${API_BASE}/api/feedback`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(message.payload),
      })
        .then(async r => r.ok ? sendResponse({ data: await r.json() }) : sendResponse({ error: r.status }))
        .catch((e: Error) => sendResponse({ error: e.message }))
    )
    return true
  }

  if (message.type === 'DOWNLOAD_PDF') {
    const { applicationId, docType = 'resume' } = message.payload
    getBgHeaders()
      .then(headers =>
        fetch(`${API_BASE}/api/download-pdf/${docType}`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ applicationId }),
        })
      )
      .then(async res => {
        if (!res.ok) return sendResponse({ error: res.status })
        const filename = res.headers.get('Content-Disposition')?.match(/filename="(.+?)"/)?.[1] ?? 'Resume.pdf'
        const buffer = await res.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        let binary = ''
        bytes.forEach(b => (binary += String.fromCharCode(b)))
        sendResponse({ data: btoa(binary), filename })
      })
      .catch((e: Error) => sendResponse({ error: e.message }))
    return true
  }
})

// ── Streaming generation ────────────────────────────────────────────────────

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'generate') return

  let connected = true
  port.onDisconnect.addListener(() => { connected = false })

  port.onMessage.addListener(async (message: PortInMessage) => {
    if (message.type !== 'START') return

    try {
      const headers = await getBgHeaders()
      const response = await fetch(`${API_BASE}/api/generate-documents`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(message.payload),
      })

      if (!connected) return

      if (response.status === 401) { port.postMessage({ type: 'error', status: 401 }); return }
      if (!response.ok) { port.postMessage({ type: 'error', status: response.status }); return }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done || !connected) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!connected) break
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw || raw === '[DONE]') continue
          try {
            const event = JSON.parse(raw) as { type: string; content?: string; resumeText?: string; coverLetterText?: string; applicationId?: string }
            port.postMessage({ type: 'chunk', event })
          } catch { /* non-JSON line */ }
        }
      }

      if (connected) port.postMessage({ type: 'done' })
    } catch (err) {
      if (connected) port.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : 'Generation failed',
      })
    }
  })
})
