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

export interface FitPoint {
  point: string
  source?: string
}

export interface FitAnalysis {
  overallFit: 'Strong Fit' | 'Good Fit' | 'Stretch Role'
  strengths: FitPoint[]
  gaps: FitPoint[]
  suggestions: FitPoint[]
  plannedImprovements: string[]
  roleType: 'technical' | 'management' | 'sales' | 'customer_success' | 'research' | 'other'
}

export interface User {
  id: string
  name: string
  email: string
  imageUrl: string | null
}

// Background message types
export type BgMessage =
  | { type: 'FETCH_ME' }
  | { type: 'FETCH_RESUMES' }
  | { type: 'DOWNLOAD_PDF'; payload: { applicationId: string } }
  | { type: 'ANALYZE_FIT'; payload: { company: string; jobTitle: string; jobDescription: string; backgroundExperience: string; additionalContext?: { title: string; type: string; text: string }[] } }

export type BgResponse<T = unknown> =
  | { data: T }
  | { error: number | string }

// Port message types (streaming generation)
export type PortInMessage = { type: 'START'; payload: GenerateRequest }
export interface StreamEvent {
  type: string
  content?: string
  resumeText?: string
  coverLetterText?: string
  applicationId?: string
}

export type PortOutMessage =
  | { type: 'chunk'; event: StreamEvent }
  | { type: 'done' }
  | { type: 'error'; status?: number; message?: string }
