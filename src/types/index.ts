export interface GenerateRequest {
  company: string
  jobTitle: string
  jobDescription: string
  backgroundExperience: string
  includeCoverLetter?: boolean
  includeSummary?: boolean
  additionalContext?: { title: string; type: string; text: string }[]
  questions?: string[]
}

export interface ScrapedJob {
  title?: string
  company?: string
  description?: string
  url: string
}

export interface ResumeItem {
  id: string
  title: string
  item_type: 'resume' | 'cover_letter' | 'portfolio' | 'other'
  is_default: boolean
  content: { text: string; fileName?: string }
}

// Background message types
export type BgMessage =
  | { type: 'FETCH_RESUMES' }
  | { type: 'DOWNLOAD_PDF'; payload: { resumeContent: string; company: string; jobTitle: string } }

export type BgResponse<T = unknown> =
  | { data: T }
  | { error: number | string }

// Port message types (streaming generation)
export type PortInMessage = { type: 'START'; payload: GenerateRequest }
export type PortOutMessage =
  | { type: 'chunk'; event: { event: string; content?: string } }
  | { type: 'done' }
  | { type: 'error'; status?: number; message?: string }
