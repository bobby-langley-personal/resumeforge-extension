# ResumeForge Chrome Extension

A Chrome extension that lets you tailor your resume to any job posting without leaving your browser. Open a job listing, click the ResumeForge icon, and the extension reads the page and hands the job details directly to the ResumeForge web app.

Built against the [ResumeForge](https://github.com/bobby-langley-personal/ResumeForge) Vercel backend.

---

## What it does

- Reads job title, company, and description from any job posting page (LinkedIn, Greenhouse, Lever, Workday, Indeed — generic fallback for everything else)
- Falls back to manual paste when scraping fails; auto-extracts company and title from pasted text via AI
- Opens a side panel (Chrome Side Panel API) so you stay on the job page while working
- Generates a tailored resume (and optional cover letter) via the ResumeForge backend with one click
- **Cover letter toggle** — opt-in before generating; download PDF when done
- **Summary section toggle** — opt-in before generating
- **Gap analysis** — Haiku fit analysis showing strengths, gaps, and what was improved
- **Follow-up questions** — enter up to 5 application questions post-generation and get AI-written answers with copy buttons
- **Cancel** — stop generation mid-stream and return to the confirm step
- **Elapsed timer** — shows seconds ticking during generation for reference
- Preview and download resume PDF directly from the side panel
- Saved to AI Resumes dashboard automatically after generation

---

## Tech stack

| Layer | Choice |
|---|---|
| Build | Vite 5 + `vite-plugin-web-extension` |
| UI | React 18 + TypeScript |
| Styling | Tailwind CSS |
| Icons | lucide-react |
| Extension | Manifest V3, Chrome Side Panel API |
| Storage | Chrome `storage.local` for auth token |

---

## Local development

### Prerequisites

- Node.js 18+
- Chrome (for testing)

### Setup

```bash
npm install
npm run dev
```

`npm run dev` runs `vite build --watch` — it rebuilds the `dist/` folder on every file change.

### Load unpacked in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle top right)
3. Click **Load unpacked**
4. Select the `dist/` folder in this repo

The extension will appear in your toolbar. After any code change, go back to `chrome://extensions` and click the reload icon next to ResumeForge.

---

## Production build

```bash
npm run build
```

Output goes to `dist/`. To package as a `.crx` or submit to the Chrome Web Store, use Chrome's pack extension tool from `chrome://extensions`.

---

## Type checking

```bash
npm run typecheck
```

---

## Project structure

```
resumeforge-extension/
├── manifest.json               MV3 manifest
├── vite.config.ts              Vite + web-extension plugin config
├── tailwind.config.ts
├── public/
│   └── icon*.png               Placeholder icons (replace before publishing)
└── src/
    ├── background/index.ts     Service worker — one-off message handlers (FETCH_ME, FETCH_RESUMES,
    │                           ANALYZE_FIT, PARSE_JOB, ANSWER_QUESTIONS, DOWNLOAD_PDF) +
    │                           persistent port handler for streaming resume generation
    ├── content/index.ts        Content script (minimal — scraping runs via executeScript)
    ├── sidepanel/
    │   ├── App.tsx             Main side panel UI — scrape → confirm → generating → done flow;
    │   │                       gap analysis sub-view, follow-up questions sub-view, cancel + elapsed timer
    │   ├── index.tsx           React entry point
    │   ├── index.html
    │   └── styles.css
    ├── popup/
    │   ├── App.tsx             Minimal popup (side panel opens on icon click)
    │   ├── index.tsx
    │   ├── index.html
    │   └── styles.css
    ├── preview/
    │   ├── App.tsx             PDF preview tab — reads base64 PDF from chrome.storage.local
    │   ├── index.tsx
    │   ├── index.html
    │   └── styles.css
    └── types/
        └── index.ts            Shared TypeScript types (BgMessage, PortInMessage, PortOutMessage,
                                GenerateRequest, ScrapedJob, ResumeItem, FitAnalysis, User)
```

---

## Environment

The API base URL is hardcoded at the top of `src/background/index.ts` and `src/sidepanel/App.tsx`:

```typescript
const API_BASE = 'https://resume-forge-rho.vercel.app'
```

Change this to `http://localhost:3000` for local ResumeForge development.

---

## Debugging

Chrome DevTools for an extension has two separate contexts — it's easy to look in the wrong place.

### Side panel DevTools (UI layer)
Right-click inside the side panel → **Inspect**. This shows:
- React state and component errors in the Console
- Network tab shows the side panel's own resource loads (JS/CSS bundles). These appear as `(invalid)` — that's normal, it's Chrome not knowing how to display `chrome-extension://` resource loads. Not errors.
- `chrome.runtime.sendMessage` and port messages do NOT appear here — they're IPC, not HTTP

### Service worker DevTools (API layer)
This is where the actual fetch calls to `resume-forge-rho.vercel.app` happen:
1. Go to `chrome://extensions`
2. Find ResumeForge → click **"Service Worker"** (the blue inspect link)
3. Open the **Network** tab

All API calls (`/api/resumes`, `/api/generate-documents`, `/api/download-pdf`) will appear here with their real status codes. This is the right place to debug auth failures (401), CORS issues, or API errors.

### Auth / 401 errors
The extension uses `credentials: 'include'` on all fetch calls from the service worker, which picks up the Clerk session cookie automatically. If you see 401:
1. Open `https://resume-forge-rho.vercel.app` in Chrome and sign in
2. Go back to `chrome://extensions` → click the **reload icon** on ResumeForge
3. Reopen the side panel

### After any code change
```
npm run build
```
Then go to `chrome://extensions` → click the **reload icon** on ResumeForge. The side panel will pick up the new build automatically on next open.

---

## Related

- [ResumeForge web app](https://github.com/bobby-langley-personal/ResumeForge)
