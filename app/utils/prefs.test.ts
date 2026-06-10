import { describe, it, expect } from 'vitest'
import { showOddsEnabled } from './prefs'

describe('showOddsEnabled', () => {
  it('defaults to enabled when unset or signed out', () => {
    expect(showOddsEnabled(undefined)).toBe(true)
    expect(showOddsEnabled(null)).toBe(true)
    expect(showOddsEnabled({})).toBe(true)
    expect(showOddsEnabled({ showOdds: null })).toBe(true)
  })

  it('respects an explicit opt-out and opt-in', () => {
    expect(showOddsEnabled({ showOdds: false })).toBe(false)
    expect(showOddsEnabled({ showOdds: true })).toBe(true)
  })
})
