import { describe, expect, it } from 'vitest'
import { isPinStale, resolvePinnedRoom, type ChatPin } from './chat-pin'

const pin: ChatPin = { competition: 'euro-2024', leagueId: 'l1', matchId: null }

describe('resolvePinnedRoom', () => {
  it('follows the page selection when there is no pin', () => {
    expect(resolvePinnedRoom(null, 'l9', 'm9')).toEqual({ leagueId: 'l9', matchId: 'm9' })
  })

  it('keeps the pinned room whatever the page selects', () => {
    expect(resolvePinnedRoom(pin, 'l9', 'm9')).toEqual({ leagueId: 'l1', matchId: null })
  })

  it('keeps a pinned match thread', () => {
    expect(resolvePinnedRoom({ ...pin, matchId: 'm1' }, null, null)).toEqual({ leagueId: 'l1', matchId: 'm1' })
  })
})

describe('isPinStale', () => {
  it('is never stale without a pin', () => {
    expect(isPinStale(null, 'euro-2024', [])).toBe(false)
  })

  it('is stale once the pinned league is gone from its own competition', () => {
    expect(isPinStale(pin, 'euro-2024', ['l2'])).toBe(true)
  })

  it('is not stale while the pinned league is still joined', () => {
    expect(isPinStale(pin, 'euro-2024', ['l1', 'l2'])).toBe(false)
  })

  it('cannot judge a pin from another competition', () => {
    expect(isPinStale(pin, 'wc-2026', ['l2'])).toBe(false)
  })
})
