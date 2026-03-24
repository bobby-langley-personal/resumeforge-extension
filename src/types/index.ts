export interface GenerateRequest {
  company: string
  jobTitle: string
  jobDescription: string
  backgroundExperience: string
  includeCoverLetter?: boolean
  includeSummary?: boolean
  questions?: string[]
}

export interface ScrapedJob {
  title?: string
  company?: string
  description?: string
  url: string
}

export interface MessageRequest {
  type: 'SCRAPE_JOB'
}

export interface MessageResponse {
  job: ScrapedJob
}
