import { describe, expect, it } from 'vitest'
import { asChatPin, isPinStale, type ChatPin } from './chat-pin'

const pin: ChatPin = { userId: 'U1', competition: 'euro-2024', leagueId: 'l1', matchId: null }

describe('asChatPin', () => {
  it('accepts a well-formed pin', () => {
    expect(asChatPin({ ...pin })).toEqual(pin)
    expect(asChatPin({ ...pin, matchId: 'm1' })).toEqual({ ...pin, matchId: 'm1' })
  })

  it('drops the extras a hand-edited value may carry', () => {
    expect(asChatPin({ ...pin, rogue: 'x' })).toEqual(pin)
  })

  it('refuses anything that is not a pin', () => {
    expect(asChatPin(null)).toBeNull()
    expect(asChatPin(42)).toBeNull()
    expect(asChatPin('l1')).toBeNull()
    expect(asChatPin({})).toBeNull()
  })

  it('refuses a pin missing or mistyping a field', () => {
    expect(asChatPin({ ...pin, userId: undefined })).toBeNull()
    expect(asChatPin({ ...pin, competition: 1 })).toBeNull()
    expect(asChatPin({ ...pin, leagueId: null })).toBeNull()
    expect(asChatPin({ ...pin, matchId: 7 })).toBeNull()
  })
})

describe('isPinStale', () => {
  it('is never stale without a pin', () => {
    expect(isPinStale(null, 'U1', 'euro-2024', [])).toBe(false)
  })

  it('is stale for anyone but the account that made it', () => {
    expect(isPinStale(pin, 'U2', 'euro-2024', ['l1'])).toBe(true)
    expect(isPinStale(pin, null, 'euro-2024', ['l1'])).toBe(true)
  })

  it('is stale once the pinned league is gone from its own competition', () => {
    expect(isPinStale(pin, 'U1', 'euro-2024', ['l2'])).toBe(true)
  })

  it('is not stale while the pinned league is still joined with chat on', () => {
    expect(isPinStale(pin, 'U1', 'euro-2024', ['l1', 'l2'])).toBe(false)
  })

  it('cannot judge a pin from another competition', () => {
    expect(isPinStale(pin, 'U1', 'wc-2026', ['l2'])).toBe(false)
  })
})
