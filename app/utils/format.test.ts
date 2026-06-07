import { describe, it, expect } from 'vitest'
import { flagUrl, isLocked, matchStatusLabel, pensResult, statusSeverity, tierLabel } from './format'
import type { MatchStatus } from '../../shared/types/match'

const STATUSES: MatchStatus[] = [
  'SCHEDULED',
  'LIVE',
  'PAUSED',
  'FINISHED',
  'POSTPONED',
  'CANCELLED',
  'SUSPENDED',
  'AWARDED',
]

describe('matchStatusLabel & statusSeverity', () => {
  it('returns a label and a severity for every status', () => {
    for (const status of STATUSES) {
      expect(matchStatusLabel(status)).toBeTruthy()
      expect(['success', 'info', 'warn', 'danger', 'secondary']).toContain(statusSeverity(status))
    }
  })

  it('maps representative statuses', () => {
    expect(matchStatusLabel('FINISHED')).toBe('Full-time')
    expect(statusSeverity('LIVE')).toBe('danger')
    expect(statusSeverity('SCHEDULED')).toBe('info')
    expect(statusSeverity('CANCELLED')).toBe('secondary')
    expect(statusSeverity('POSTPONED')).toBe('warn')
  })
})

describe('tierLabel', () => {
  it('labels each tier and handles null', () => {
    expect(tierLabel('EXACT')).toBe('Exact score')
    expect(tierLabel('DIFF')).toBe('Goal difference')
    expect(tierLabel('OUTCOME')).toBe('Right result')
    expect(tierLabel('MISS')).toBe('Missed')
    expect(tierLabel(null)).toBe('')
    expect(tierLabel(undefined)).toBe('')
  })
})

describe('isLocked', () => {
  it('is true once kickoff has passed', () => {
    const kickoff = '2026-06-11T16:00:00Z'
    expect(isLocked(kickoff, new Date('2026-06-11T16:00:01Z').getTime())).toBe(true)
    expect(isLocked(kickoff, new Date('2026-06-11T15:59:59Z').getTime())).toBe(false)
  })
})

describe('flagUrl', () => {
  it('builds a FIFA flag url or returns null', () => {
    expect(flagUrl('MEX')).toContain('/flags-sq-3/MEX')
    expect(flagUrl(null)).toBeNull()
    expect(flagUrl(undefined)).toBeNull()
  })
})

describe('pensResult', () => {
  it('formats real shootouts and hides artifacts', () => {
    expect(pensResult({ penaltiesHome: 4, penaltiesAway: 2 })).toBe('4–2')
    expect(pensResult({ penaltiesHome: 0, penaltiesAway: 0 })).toBeNull()
    expect(pensResult({ penaltiesHome: null, penaltiesAway: null })).toBeNull()
    expect(pensResult({})).toBeNull()
  })
})
