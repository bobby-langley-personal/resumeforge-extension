import { scrapeCurrentPage } from '../lib/scraper'
import type { MessageRequest, MessageResponse } from '../types'

chrome.runtime.onMessage.addListener(
  (message: MessageRequest, _sender, sendResponse: (response: MessageResponse) => void) => {
    if (message.type === 'SCRAPE_JOB') {
      const job = scrapeCurrentPage()
      sendResponse({ job })
    }
    return true // keep channel open for async response
  }
)
