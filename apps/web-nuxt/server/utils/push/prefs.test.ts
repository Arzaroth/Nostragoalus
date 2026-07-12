import { describe, it, expect } from 'vitest'
import { PUSH_CATEGORIES, PUSH_DEFAULTS, categoryForType, isPushEnabled, type PushPrefs } from './prefs'

const allNull: PushPrefs = {
  pushReminders: null,
  pushKickoff: null,
  pushGoals: null,
  pushMatchResults: null,
  pushTournament: null,
  pushLeague: null,
}

describe('isPushEnabled', () => {
  it('falls back to the category default when the column is null/undefined', () => {
    expect(isPushEnabled(allNull, 'reminders')).toBe(true)
    expect(isPushEnabled(allNull, 'league')).toBe(false)
    expect(isPushEnabled(null, 'goals')).toBe(true)
    expect(isPushEnabled(undefined, 'league')).toBe(false)
  })

  it('honors an explicit toggle over the default', () => {
    expect(isPushEnabled({ ...allNull, pushReminders: false }, 'reminders')).toBe(false)
    expect(isPushEnabled({ ...allNull, pushLeague: true }, 'league')).toBe(true)
  })

  it('every category has a boolean default', () => {
    for (const c of PUSH_CATEGORIES) expect(typeof PUSH_DEFAULTS[c]).toBe('boolean')
  })
})

describe('categoryForType', () => {
  it('maps every stored notification type to a category', () => {
    expect(categoryForType('PICK_REMINDER')).toBe('reminders')
    expect(categoryForType('MATCH_RESULT')).toBe('matchResults')
    expect(categoryForType('CHAMPION_RESULT')).toBe('tournament')
    expect(categoryForType('BEST_SCORER_RESULT')).toBe('tournament')
    expect(categoryForType('LEAGUE_JOIN')).toBe('league')
    expect(categoryForType('LEAGUE_ROLE')).toBe('league')
    expect(categoryForType('LEAGUE_REMOVED')).toBe('league')
  })
})
