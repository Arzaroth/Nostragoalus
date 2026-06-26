import { describe, it, expect } from 'vitest'
import { computeTeamLean, leanColor, type CrowdTotals, type LeanMatch } from './crowd-lean'

function m(over: Partial<LeanMatch>): LeanMatch {
  return {
    id: 'x',
    homeTeamCode: 'FRA',
    awayTeamCode: 'BRA',
    kickoffTime: '2026-06-28T18:00:00Z',
    status: 'SCHEDULED',
    ...over,
  }
}

describe('computeTeamLean', () => {
  it('leans each side of a match by the crowd goal balance, signed toward the team', () => {
    const matches = [m({ id: 'a' })]
    const totals: CrowdTotals = { a: { home: 30, away: 10, count: 20 } }
    const lean = computeTeamLean(matches, totals)
    expect(lean.FRA).toBeCloseTo(0.5) // (30-10)/40
    expect(lean.BRA).toBeCloseTo(-0.5)
  })

  it('prefers a live match over an upcoming one for the same team', () => {
    const matches = [
      m({ id: 'next', homeTeamCode: 'FRA', awayTeamCode: 'GER', status: 'SCHEDULED', kickoffTime: '2026-07-01T18:00:00Z' }),
      m({ id: 'live', homeTeamCode: 'FRA', awayTeamCode: 'BRA', status: 'LIVE', kickoffTime: '2026-06-28T18:00:00Z' }),
    ]
    const totals: CrowdTotals = { next: { home: 5, away: 5, count: 5 }, live: { home: 40, away: 0, count: 10 } }
    expect(computeTeamLean(matches, totals).FRA).toBeCloseTo(1) // from the live match
  })

  it('keeps the live match when an upcoming one for the team is seen afterwards', () => {
    const matches = [
      m({ id: 'live', homeTeamCode: 'FRA', awayTeamCode: 'BRA', status: 'LIVE', kickoffTime: '2026-06-28T18:00:00Z' }),
      m({ id: 'next', homeTeamCode: 'FRA', awayTeamCode: 'GER', status: 'SCHEDULED', kickoffTime: '2026-07-01T18:00:00Z' }),
    ]
    const totals: CrowdTotals = { live: { home: 0, away: 40, count: 10 }, next: { home: 5, away: 5, count: 5 } }
    expect(computeTeamLean(matches, totals).FRA).toBeCloseTo(-1) // still from the live match
  })

  it('treats a suspended/interrupted match as in-play, not skipped for a future fixture', () => {
    const matches = [
      m({ id: 'halted', homeTeamCode: 'FRA', awayTeamCode: 'BRA', status: 'SUSPENDED', kickoffTime: '2026-06-28T18:00:00Z' }),
      m({ id: 'next', homeTeamCode: 'FRA', awayTeamCode: 'GER', status: 'SCHEDULED', kickoffTime: '2026-07-01T18:00:00Z' }),
    ]
    const totals: CrowdTotals = { halted: { home: 30, away: 10, count: 20 }, next: { home: 5, away: 5, count: 5 } }
    expect(computeTeamLean(matches, totals).FRA).toBeCloseTo(0.5) // from the halted (in-play) match
  })

  it('picks the earliest upcoming match when none are live', () => {
    const matches = [
      m({ id: 'later', homeTeamCode: 'FRA', awayTeamCode: 'GER', kickoffTime: '2026-07-05T18:00:00Z' }),
      m({ id: 'sooner', homeTeamCode: 'FRA', awayTeamCode: 'BRA', kickoffTime: '2026-06-28T18:00:00Z' }),
    ]
    const totals: CrowdTotals = { later: { home: 1, away: 9, count: 10 }, sooner: { home: 9, away: 1, count: 10 } }
    expect(computeTeamLean(matches, totals).FRA).toBeCloseTo(0.8) // from the sooner match
  })

  it('ignores finished matches, missing codes, zero counts and empty totals', () => {
    const matches = [
      m({ id: 'done', status: 'FINISHED' }),
      m({ id: 'tbd', homeTeamCode: null, awayTeamCode: 'BRA', status: 'SCHEDULED' }),
      m({ id: 'nocrowd', homeTeamCode: 'ARG', awayTeamCode: 'CHI', status: 'SCHEDULED' }),
      m({ id: 'zero', homeTeamCode: 'ESP', awayTeamCode: 'ITA', status: 'SCHEDULED' }),
    ]
    const totals: CrowdTotals = { zero: { home: 0, away: 0, count: 0 } }
    // done is finished (skipped); tbd/nocrowd have no crowd row; zero has count 0
    // - every team is omitted.
    expect(computeTeamLean(matches, totals)).toEqual({})
  })

  it('omits a team whose current match has no crowd row', () => {
    const matches = [m({ id: 'a', homeTeamCode: 'ARG', awayTeamCode: 'CHI', status: 'SCHEDULED' })]
    expect(computeTeamLean(matches, {})).toEqual({})
  })

  it('omits a match where the crowd has predictions but they sum to zero goals', () => {
    const matches = [m({ id: 'a', homeTeamCode: 'ARG', awayTeamCode: 'CHI', status: 'SCHEDULED' })]
    const totals: CrowdTotals = { a: { home: 0, away: 0, count: 6 } }
    expect(computeTeamLean(matches, totals)).toEqual({})
  })
})

describe('leanColor', () => {
  it('returns a blue tint for a favoured team and red for an underdog', () => {
    expect(leanColor(1)).toBe('hsl(212, 90%, 46%)')
    expect(leanColor(-1)).toBe('hsl(6, 90%, 46%)')
  })

  it('is pale and neutral near zero, and clamps out-of-range input', () => {
    expect(leanColor(0)).toBe('hsl(212, 20%, 82%)')
    expect(leanColor(5)).toBe(leanColor(1))
    expect(leanColor(-5)).toBe(leanColor(-1))
  })
})
