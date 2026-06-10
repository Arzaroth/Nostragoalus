import { describe, it, expect } from 'vitest'
import { showOddsEnabled } from './prefs'

describe('showOddsEnabled', () => {
  it('defaults to disabled when unset or signed out (opt-in)', () => {
    expect(showOddsEnabled(undefined)).toBe(false)
    expect(showOddsEnabled(null)).toBe(false)
    expect(showOddsEnabled({})).toBe(false)
    expect(showOddsEnabled({ showOdds: null })).toBe(false)
  })

  it('shows odds only on an explicit opt-in', () => {
    expect(showOddsEnabled({ showOdds: true })).toBe(true)
    expect(showOddsEnabled({ showOdds: false })).toBe(false)
  })
})
