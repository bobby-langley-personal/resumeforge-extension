/**
 * Unit tests for the billing countdown formatting logic.
 * Extracted from the CountdownLabel component in App.tsx.
 */
import { describe, it, expect } from 'vitest'

/** Mirror of the compute() logic in CountdownLabel */
function formatCountdown(endsAt: string): string {
  const diff = new Date(endsAt).getTime() - Date.now()
  if (diff <= 0) return ''
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function futureDate(ms: number): string {
  return new Date(Date.now() + ms).toISOString()
}

describe('formatCountdown', () => {
  it('returns empty string when date is in the past', () => {
    expect(formatCountdown(new Date(Date.now() - 1000).toISOString())).toBe('')
  })

  it('returns minutes-only when under 1 hour', () => {
    const label = formatCountdown(futureDate(25 * 60 * 1000)) // 25 min
    expect(label).toBe('25m')
  })

  it('returns hours and minutes when under 1 day', () => {
    const label = formatCountdown(futureDate(3 * 3600000 + 30 * 60000)) // 3h 30m
    expect(label).toBe('3h 30m')
  })

  it('returns days, hours, and minutes for multi-day windows', () => {
    const label = formatCountdown(futureDate(6 * 86400000 + 14 * 3600000 + 11 * 60000))
    expect(label).toBe('6d 14h 11m')
  })

  it('handles exactly 1 day remaining', () => {
    const label = formatCountdown(futureDate(1 * 86400000 + 2 * 60000))
    expect(label).toBe('1d 0h 2m')
  })

  it('handles exactly 7 days (full weekly window)', () => {
    const label = formatCountdown(futureDate(7 * 86400000))
    expect(label).toMatch(/^7d/)
  })
})
