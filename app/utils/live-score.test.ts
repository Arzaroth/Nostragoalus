import { describe, it, expect } from 'vitest'
import { liveHeaderScore } from './live-score'

describe('liveHeaderScore', () => {
  it('uses the goal feed count once the feed has landed', () => {
    expect(liveHeaderScore(2, 2, true)).toBe(2)
    // A 0-0 with the feed present reads 0, not the fallback.
    expect(liveHeaderScore(0, 0, true)).toBe(0)
  })

  it('drops with the feed when VAR disallows a goal, ignoring a stale-high ws score', () => {
    // The feed has corrected to 1; the WS/football-data score still trails at 2.
    expect(liveHeaderScore(1, 2, true)).toBe(1)
  })

  it('leads a fresh goal the WS score has not caught yet', () => {
    expect(liveHeaderScore(2, 1, true)).toBe(2)
  })

  it('falls back to the WS/stored score before the feed is ready', () => {
    expect(liveHeaderScore(0, 2, false)).toBe(2)
    // A not-yet-fetched feed reads 0, but feedReady=false means it is ignored.
    expect(liveHeaderScore(0, 0, false)).toBe(0)
  })

  it('falls back to 0 when the feed is unready and there is no WS score yet', () => {
    expect(liveHeaderScore(0, null, false)).toBe(0)
  })
})
