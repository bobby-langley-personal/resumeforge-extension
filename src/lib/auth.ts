export async function getAuthToken(): Promise<string | null> {
  const result = await chrome.storage.local.get('auth_token')
  return (result.auth_token as string) || null
}

export async function setAuthToken(token: string): Promise<void> {
  await chrome.storage.local.set({ auth_token: token })
}

export async function clearAuthToken(): Promise<void> {
  await chrome.storage.local.remove('auth_token')
}
