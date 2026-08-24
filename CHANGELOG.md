# Changelog — Easy Apply Chrome Extension

All notable changes to the Easy Apply Chrome Extension are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

Chrome Web Store release notes are pulled from the most recent version section below.
Paste the **"What's new"** block for each version into the Store listing's "What's new in this version" field on the Developer Dashboard.

---

## [0.3.5] — 2026-06-16

> **What's new in this version (Chrome Web Store)**
> - LinkedIn job title and company now extract correctly on the split-pane search results page (fixes blank title / wrong company like "Amazon.com Services")
> - "Reload tab & retry" now shows a confirmation modal so you can choose to reload or cancel instead of the tab reloading immediately
> - Follow-up Questions view now has a footer with "Back" and "New questions" buttons — no more hunting for the tiny arrow when scrolled down through answers

### Fixed
- **LinkedIn scraper** — job title and company were missing or wrong on the `/jobs/search` split-pane view (`currentJobId` param). Root causes fixed:
  - Page title parsing switched from `at`-regex to `|`-split to match LinkedIn's actual format (`"Job Title | Company | LinkedIn"`)
  - Removed generic `h2` selectors that matched "Are these results helpful?" from the search results list instead of the detail panel
  - Added `a[href*="/jobs/view/"]` as a stable fallback selector for the job title link (resilient to LinkedIn's obfuscated class names)

### Added
- **Reload confirm modal** — clicking "Reload tab & retry" in the error banner now shows a modal with Reload / Cancel buttons instead of immediately reloading the tab
- Sticky footer in the Follow-up Questions view with "← Back" (returns to main résumé view) and "New questions" (clears answers and input to start fresh) buttons

### Changed
- Scraping hint below "Read job from this page" upgraded from tiny grey text to an amber-bordered warning banner, centered and visible halfway down the screen

---

## [0.3.4] — 2026-06-16

> **What's new in this version (Chrome Web Store)**
> - Corrected spelling of "résumé" throughout the extension (proper accent marks)
> - Extension version is now forwarded to Easy Apply's API logs, making it easier to diagnose issues tied to specific builds

### Changed
- All user-facing instances of "resume" updated to "résumé" with correct accent marks — sign-in screen, paywall, generating screen, success screen, and free-tier counter
- Manifest description updated to use "résumé"

### Added
- `X-Extension-Version` header sent on every API call so the webapp can log which extension version was active when a request was made — visible in the admin logs panel

---

## [0.3.3] — 2026-04-15

> **What's new in this version (Chrome Web Store)**
> - New feedback form — report a bug or send feedback directly from the extension, with an option to submit anonymously
> - Extension now registers itself with your Easy Apply account so you won't receive "try the extension" nudge emails after installing

### Added
- **In-app feedback form** — Bug report / General toggle, message textarea, anonymous option; submits directly to Easy Apply AI; shows a link to the auto-created GitHub issue on success
- Feedback button now shows "Feedback" label alongside the icon for better discoverability
- Extension pings `POST /api/ping-extension` after first successful auth so the webapp knows the user has installed and used the extension

---

## [0.3.2] — 2026-04-14

> **What's new in this version (Chrome Web Store)**
> - Auto-detects application questions from scraped job pages and fills them in for you
> - Improved sign-in experience with step-by-step instructions and auto-retry
> - Refresh button in the header re-syncs your session without reopening the panel
> - Greenhouse job board (job-boards.greenhouse.io) scraping fixed
> - Profile avatar now opens your account page directly
> - Version number shown in the footer so you always know which build you're running

### Added
- Auto-detects and pre-fills written application questions from scraped job pages
- Step-by-step "How to connect" instructions on the sign-in screen
- Refresh button (top-left header) to re-sync auth session; spins while refreshing
- Auto-retry auth once after 2 seconds before showing the unauthenticated screen
- Auto-reload current tab when a known job board returns an empty scrape result
- Version badge in the side panel footer
- Profile avatar opens Clerk account page in a new tab

### Fixed
- **Greenhouse job board scraping** (`job-boards.greenhouse.io`) — new format uses plain `<h1>` and `<main>` instead of legacy CSS selectors; company name extracted from page title (`"Title at Company"` pattern) and logo alt text fallback
- Content script timing changed to `run_at: document_start` so the extension version attribute is stamped before the page finishes loading
- Extension version now stamped on the webapp via content script (`data-easy-apply-ext` attribute on `<html>`)

---

## [0.3.1] — 2026-04-13

> **What's new in this version (Chrome Web Store)**
> - Fixed a sign-in issue affecting all users — the extension can now authenticate reliably with your Easy Apply AI account
> - Fixed resume generation returning 404 for some users
> - Both `easy-apply.ai` and `www.easy-apply.ai` tab URLs are now detected correctly

### Fixed
- **Critical auth fix** — Clerk's CSRF check was rejecting extension-origin requests; solved by running the Clerk token fetch via `executeScript` in the page's `MAIN` world so it passes as a same-origin request
- `API_BASE` changed to `https://www.easy-apply.ai` to prevent POST→GET redirect (301 redirect was stripping the request body and causing 404 on `/api/generate-documents`)
- Tab detection now matches both `easy-apply.ai` and `www.easy-apply.ai` URLs

---

## [0.3.0] — 2026-04-09

> **What's new in this version (Chrome Web Store)**
> - Free tier: generate up to 3 tailored resumes for free
> - Upgrade to Pro for unlimited resumes — directly from the extension
> - Paywall prompt shown inline when free limit is reached

### Added
- Stripe paywall enforcement — mirrors the web app's free/pro tiers
- Paywall prompt with upgrade CTA shown when the 3-resume free limit is reached
- Billing status fetched on launch to gate generation for free users

---

## [0.2.0] — 2026-04-07

> **What's new in this version (Chrome Web Store)**
> - Cover letter download added alongside resume download
> - Optional professional summary toggle
> - Cancel button to stop generation mid-stream
> - Elapsed time counter during generation
> - Follow-up questions: paste application questions and get AI-written answers
> - Improved error handling and auth failure messages

### Added
- Cover letter download button (shown when cover letter was generated)
- Professional summary toggle (include/exclude in generated resume)
- Cancel button — stops the SSE generation stream mid-flight
- Elapsed time counter displayed during generation
- **Follow-up questions** — paste written application questions from the job posting; get AI-written answers grounded in your experience
- Scraping failure fallback — shows manual paste option when auto-scrape fails

### Fixed
- Auth error handling improved — clearer messaging on session expiry
- "I've signed in — refresh" button made more visible on the sign-in screen

---

## [0.1.0] — 2026-03-25

> **What's new in this version (Chrome Web Store)**
> - Initial release of Easy Apply — one-click tailored resume generation from any job board
> - Reads the job description from the current tab automatically
> - Streams your tailored resume in ~30 seconds
> - Download as PDF directly from the extension
> - Full resume preview before downloading
> - Fit analysis shows your strengths, gaps, and suggestions for each role

### Added
- Side panel UI — opens alongside any job board tab
- Auto-scrapes job title, company, and description from the active tab
- Streams tailored resume generation via SSE (`/api/generate-documents`)
- Download as PDF via `/api/download-pdf/resume`
- Full-page PDF preview in extension
- Fit analysis (gap analysis) panel — strengths, gaps, suggestions, overall fit rating
- Auth gate with sign-in screen and profile avatar
- Background service worker handles all API calls with Clerk session auth

---

## How to use this changelog

### GitHub Releases
1. Tag the commit: `git tag v0.3.2 && git push origin v0.3.2`
2. Go to **Releases → Draft a new release** on GitHub
3. Select the tag, set the title to `v0.3.2`, paste the version section as the release body

### Chrome Web Store
1. Go to [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Select **Easy Apply → Package → Upload new package** → upload `dist.zip`
3. Under **Store listing → Detailed description**, paste the "What's new in this version" block from the relevant version section above
4. Submit for review

### Building the zip for submission
```bash
npm run build
cd dist && zip -r ../easy-apply-v0.3.2.zip . && cd ..
```
