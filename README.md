# ResumeForge Chrome Extension

A Chrome extension that lets you tailor your resume to any job posting without leaving your browser. Open a job listing, click the ResumeForge icon, and the extension reads the page and hands the job details directly to the ResumeForge web app.

Built against the [ResumeForge](https://github.com/bobby-langley-personal/ResumeForge) Vercel backend.

---

## What it does

- Reads job title, company, and description from any job posting page
- Supports LinkedIn Jobs, Greenhouse, Lever, and Workday with site-specific selectors — generic fallback for everything else
- Opens a side panel (Chrome Side Panel API) so you stay on the job page while reviewing
- Hands scraped data to the ResumeForge web app with one click

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
    ├── background/index.ts     Service worker — opens side panel on icon click
    ├── content/index.ts        Content script — listens for SCRAPE_JOB messages
    ├── sidepanel/
    │   ├── App.tsx             Main side panel UI
    │   ├── index.tsx           React entry point
    │   ├── index.html
    │   └── styles.css
    ├── popup/
    │   ├── App.tsx             Minimal popup (side panel opens on icon click)
    │   ├── index.tsx
    │   ├── index.html
    │   └── styles.css
    ├── lib/
    │   ├── api.ts              ResumeForge backend API client
    │   ├── auth.ts             Chrome storage auth token helpers
    │   └── scraper.ts          DOM scraping with site-specific selectors
    └── types/
        └── index.ts            Shared TypeScript types
```

---

## Environment

The API base URL is set in `src/lib/api.ts`:

```typescript
const API_BASE = 'https://resume-forge-rho.vercel.app'
```

Change this to `http://localhost:3000` for local ResumeForge development.

---

## Related

- [ResumeForge web app](https://github.com/bobby-langley-personal/ResumeForge)
