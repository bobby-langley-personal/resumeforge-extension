import { getAuthToken } from './auth'
import type { GenerateRequest } from '../types'

const API_BASE = 'https://easy-apply.ai'

export async function generateDocuments(payload: GenerateRequest): Promise<Response> {
  const token = await getAuthToken()
  return fetch(`${API_BASE}/api/generate-documents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  })
}

export async function getResumes(): Promise<Response> {
  const token = await getAuthToken()
  return fetch(`${API_BASE}/api/resumes`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
}
