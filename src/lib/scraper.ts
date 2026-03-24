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

  // Greenhouse
  if (url.includes('greenhouse.io')) {
    return {
      title: document.querySelector('h1.app-title')?.textContent?.trim(),
      company: document.querySelector('.company-name')?.textContent?.trim(),
      description: document.querySelector('#content')?.textContent?.trim(),
      url,
    }
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
