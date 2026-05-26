import type { ScrapedJob } from '../types'

export function scrapeCurrentPage(): ScrapedJob {
  const url = window.location.href

  // LinkedIn Jobs
  if (url.includes('linkedin.com/jobs')) {
    return {
      title: document.querySelector('.job-details-jobs-unified-top-card__job-title')?.textContent?.trim(),
      company: document.querySelector('.job-details-jobs-unified-top-card__company-name')?.textContent?.trim(),
      description: document.querySelector('.jobs-description__content')?.textContent?.trim(),
      url,
    }
  }

  // Greenhouse (handles both boards.greenhouse.io and job-boards.greenhouse.io)
  if (url.includes('greenhouse.io')) {
    const title =
      document.querySelector('h1.app-title')?.textContent?.trim() ||
      document.querySelector('h1')?.textContent?.trim()
    const company =
      document.querySelector('.company-name')?.textContent?.trim() ||
      document.querySelector('[class*="company"]')?.textContent?.trim() ||
      document.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ||
      undefined
    const description =
      document.querySelector('#content')?.textContent?.trim() ||
      document.querySelector('[class*="job-description"]')?.textContent?.trim() ||
      document.querySelector('[class*="description"]')?.textContent?.trim() ||
      document.querySelector('main')?.textContent?.trim()
    return { title, company, description, url }
  }

  // Lever
  if (url.includes('jobs.lever.co')) {
    return {
      title: document.querySelector('.posting-headline h2')?.textContent?.trim(),
      company: document.querySelector('.posting-headline .company-name')?.textContent?.trim(),
      description: document.querySelector('.posting-description')?.textContent?.trim(),
      url,
    }
  }

  // Workday
  if (url.includes('myworkdayjobs.com') || url.includes('workday.com')) {
    return {
      title: document.querySelector('[data-automation-id="jobPostingHeader"]')?.textContent?.trim(),
      description: document.querySelector('[data-automation-id="job-posting-details"]')?.textContent?.trim(),
      url,
    }
  }

  // Generic fallback — grab largest text block
  return {
    title: document.title,
    description: document.body.innerText.slice(0, 5000),
    url,
  }
}
