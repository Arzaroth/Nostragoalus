import { describe, it, expect } from 'vitest'
import { isMatchPickable, countOutstandingPicks, firstOutstandingPickId, type PickableMatch } from './outstanding-picks'

const m = (over: Partial<PickableMatch> & { id: string }): PickableMatch => ({
  isLocked: false,
  homeTeamCode: 'FRA',
  awayTeamCode: 'BRA',
  ...over,
})

describe('isMatchPickable', () => {
  it('is pickable only when open and both teams are known', () => {
    expect(isMatchPickable(m({ id: '1' }))).toBe(true)
    expect(isMatchPickable(m({ id: '2', isLocked: true }))).toBe(false)
    expect(isMatchPickable(m({ id: '3', homeTeamCode: null }))).toBe(false)
    expect(isMatchPickable(m({ id: '4', awayTeamCode: null }))).toBe(false)
    expect(isMatchPickable(m({ id: '5', homeTeamCode: '' }))).toBe(false)
  })
})

describe('countOutstandingPicks', () => {
  it('counts open, both-teams-known matches the user has not predicted', () => {
    const matches = [
      m({ id: 'open-unpicked' }),
      m({ id: 'open-picked' }),
      m({ id: 'locked', isLocked: true }),
      m({ id: 'no-teams', homeTeamCode: null, awayTeamCode: null }),
    ]
    const predicted = new Set(['open-picked'])
    expect(countOutstandingPicks(matches, predicted)).toBe(1)
  })

  it('is zero when everything open is already predicted', () => {
    const matches = [m({ id: 'a' }), m({ id: 'b' })]
    expect(countOutstandingPicks(matches, new Set(['a', 'b']))).toBe(0)
  })

  it('is zero for an empty list', () => {
    expect(countOutstandingPicks([], new Set())).toBe(0)
  })
})

describe('firstOutstandingPickId', () => {
  it('returns the first pickable, unpredicted id in list order', () => {
    const matches = [
      m({ id: 'locked', isLocked: true }),
      m({ id: 'picked' }),
      m({ id: 'first-open' }),
      m({ id: 'second-open' }),
    ]
    expect(firstOutstandingPickId(matches, new Set(['picked']))).toBe('first-open')
  })

  it('returns null when nothing is outstanding', () => {
    expect(firstOutstandingPickId([m({ id: 'a' })], new Set(['a']))).toBe(null)
    expect(firstOutstandingPickId([], new Set())).toBe(null)
  })
})
