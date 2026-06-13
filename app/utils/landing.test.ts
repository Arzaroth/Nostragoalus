import { describe, it, expect } from 'vitest'
import { pickNextMatch } from './landing'

const m = (status: string, kickoffTime: string) => ({ status, kickoffTime })

describe('pickNextMatch', () => {
  it('returns null when there are no matches', () => {
    expect(pickNextMatch([], 0)).toBeNull()
  })

  it('ignores non-scheduled matches and ones that already kicked off', () => {
    const now = Date.parse('2026-06-13T00:00:00Z')
    const list = [
      m('FINISHED', '2026-06-10T00:00:00Z'),
      m('LIVE', '2026-06-12T00:00:00Z'),
      m('SCHEDULED', '2026-06-11T00:00:00Z'), // scheduled but in the past
    ]
    expect(pickNextMatch(list, now)).toBeNull()
  })

  it('picks the soonest upcoming scheduled match regardless of list order', () => {
    const now = Date.parse('2026-06-13T00:00:00Z')
    const soonest = m('SCHEDULED', '2026-06-15T00:00:00Z')
    const list = [
      m('SCHEDULED', '2026-06-18T00:00:00Z'), // sets an initial best
      soonest, // beats it
      m('SCHEDULED', '2026-06-20T00:00:00Z'), // later than the best, ignored
      m('FINISHED', '2026-06-01T00:00:00Z'),
    ]
    expect(pickNextMatch(list, now)).toBe(soonest)
  })
})
