# Easy Apply Extension — Claude Development Guide

Chrome extension companion for [Easy Apply AI](https://easy-apply.ai).

---

## Project Overview

| Field | Value |
|-------|-------|
| Extension name | Easy Apply |
| Current version | `0.3.1` (in `manifest.json`) |
| Manifest version | MV3 |
| Build tool | Vite + `vite-plugin-web-extension` |
| Framework | React 18, TypeScript, Tailwind CSS v3 |
| API target | `https://easy-apply.ai` (hardcoded in `src/background/index.ts` and `src/lib/api.ts`) |

---

## Structure

```
src/
  background/index.ts     — Service worker: all API calls (one-off messages + streaming port)
  content/index.ts        — Content script: stamps data-easy-apply-ext attribute on <html>
  popup/                  — Toolbar icon popup (small React app)
  sidepanel/              — Main UI (React app — opens as Chrome side panel)
  preview/                — PDF preview page (React app, web_accessible_resource)
  lib/
    api.ts                — fetch helpers (generateDocuments, getResumes)
    auth.ts               — Clerk auth token helpers
    scraper.ts            — Job page scraping logic
  types/index.ts          — Shared TypeScript types
```

---

## Build

```bash
npm run build       # production build → dist/
npm run dev         # watch mode
npm run typecheck   # tsc --noEmit
```

After building, load `dist/` as an unpacked extension in `chrome://extensions` (Developer mode on).

**After every code change: run `npm run build` and reload the extension in `chrome://extensions`.**

---

## Version Bumping

Version is defined in `manifest.json` → `"version"` field. Bump it manually before pushing a release.
Use semver: `0.3.0` → `0.3.1` (patch), `0.4.0` (minor), `1.0.0` (major).

The content script exposes the version to the webapp via:
```ts
document.documentElement.setAttribute('data-easy-apply-ext', chrome.runtime.getManifest().version);
```
The Easy Apply webapp footer reads this attribute to display `ext vX.X.X`. **Always rebuild after bumping the version.**

---

## Communication Architecture

| Channel | Direction | Usage |
|---------|-----------|-------|
| `chrome.runtime.sendMessage` | Sidepanel → Background | One-off API calls (FETCH_ME, FETCH_RESUMES, ANALYZE_FIT, PARSE_JOB, ANSWER_QUESTIONS, DOWNLOAD_PDF, FETCH_BILLING_STATUS) |
| `chrome.runtime.connect({ name: 'generate' })` | Sidepanel → Background | Streaming SSE generation (START message → chunk/done/error messages back) |
| `chrome.scripting.executeScript` | Background/Sidepanel → Active tab | Job page scraping (not content script) |
| DOM attribute `data-easy-apply-ext` | Content script → Webapp | Version detection on easy-apply.ai |

---

## API Integration

All API calls go through the background service worker.

**Auth (v0.3.1+):** `chrome.cookies.get` reads the `__session` Clerk JWT and passes it as `Authorization: Bearer <token>`. Falls back to `credentials: 'include'` if the cookie is unavailable. This bypasses Clerk's CSRF origin check which rejected extension requests in older versions.

- 401 responses → show "sign in" prompt in sidepanel
- 402 responses → paywall (free tier limit reached)
- 403/404 on a known route → treated as likely session expiry; `silentAuthCheck()` re-probes auth and transitions to sign-in screen if session is gone

## Backwards Compatibility with the Webapp

The Chrome Web Store approval process takes days. Always assume users are running an older approved extension version against the live webapp.

**As an extension developer:** only call endpoints that are documented in the webapp's `CLAUDE.md`. Never rely on undocumented response fields. Handle gracefully if a new field is missing (old webapp serving new extension) or if a field disappears (unlikely but defensive).

**Webapp must never:** remove or rename the extension's API endpoints, remove response fields the extension reads, or change HTTP status code semantics (401/402/400) without a coordinated extension + webapp release.

**Version history:**

| Version | Key change | Store status |
|---------|-----------|-------------|
| v0.2.0 | Initial paywall-free release | Likely approved |
| v0.3.0 | Stripe paywall enforcement | Submitted / pending |
| v0.3.1 | **Fix auth**: Bearer token from cookies; session-expiry error handling | **Submit immediately** |

v0.3.1 fixes a critical auth regression affecting all users on v0.3.0 and earlier — the `credentials: 'include'` mechanism was being rejected by Clerk's CSRF check. Prioritize getting this approved.

---

## Definition of Done

Every change is not complete until:
1. `npm run build` succeeds with no errors
2. `npm run typecheck` passes
3. Extension reloaded in `chrome://extensions` and manually tested
4. `manifest.json` version bumped if it's a user-facing change
5. **This `CLAUDE.md` updated** if architecture or version changes
6. Committed and pushed to `main`
