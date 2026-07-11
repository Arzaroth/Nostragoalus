import { describe, it, expect } from 'vitest'
import { seedLiveScore, reconcileLiveScore, type LiveScoreState } from './live-score'

describe('seedLiveScore', () => {
  it('takes the higher of ws and feed so a match already in play does not under-report', () => {
    expect(seedLiveScore({ ws: 2, feed: 1, feedReady: true })).toEqual({ value: 2, ws: 2, feed: 1 })
    expect(seedLiveScore({ ws: 1, feed: 2, feedReady: true })).toEqual({ value: 2, ws: 1, feed: 2 })
  })

  it('treats a null ws as zero', () => {
    expect(seedLiveScore({ ws: null, feed: 1, feedReady: true })).toEqual({ value: 1, ws: 0, feed: 1 })
  })

  it('ignores the feed until it is ready', () => {
    expect(seedLiveScore({ ws: 1, feed: 3, feedReady: false })).toEqual({ value: 1, ws: 1, feed: 0 })
  })
})

describe('reconcileLiveScore', () => {
  const seed: LiveScoreState = { value: 2, ws: 2, feed: 2 }

  it('drops the score when VAR removes a goal from the feed while ws is still stale-high', () => {
    // The disallow lands on the 45 s feed first; ws is unchanged at 2.
    const after = reconcileLiveScore(seed, { ws: 2, feed: 1, feedReady: true })
    expect(after.value).toBe(1)
    // ws poll later catches up to 1 - no change, stays 1.
    expect(reconcileLiveScore(after, { ws: 1, feed: 1, feedReady: true }).value).toBe(1)
  })

  it('leads a fresh goal on the feed before the ws poll catches up', () => {
    const state: LiveScoreState = { value: 1, ws: 1, feed: 1 }
    expect(reconcileLiveScore(state, { ws: 1, feed: 2, feedReady: true }).value).toBe(2)
  })

  it('leads a fresh goal on ws when the feed has not parsed the scorer yet', () => {
    const state: LiveScoreState = { value: 1, ws: 1, feed: 1 }
    expect(reconcileLiveScore(state, { ws: 2, feed: 1, feedReady: true }).value).toBe(2)
  })

  it('prefers the faster feed when both move in the same tick', () => {
    const state: LiveScoreState = { value: 1, ws: 1, feed: 1 }
    // ws jumps to 3 (a stale double-poll) while the feed says 2 - trust the feed.
    expect(reconcileLiveScore(state, { ws: 3, feed: 2, feedReady: true }).value).toBe(2)
  })

  it('holds steady when neither source changed', () => {
    expect(reconcileLiveScore(seed, { ws: 2, feed: 2, feedReady: true })).toEqual(seed)
  })

  it('holds a null ws at its last reading', () => {
    const state: LiveScoreState = { value: 2, ws: 2, feed: 2 }
    expect(reconcileLiveScore(state, { ws: null, feed: 2, feedReady: true })).toEqual(state)
  })

  it('ignores a transient unready feed so a fetch gap cannot flicker the score to zero', () => {
    const state: LiveScoreState = { value: 2, ws: 2, feed: 2 }
    expect(reconcileLiveScore(state, { ws: 2, feed: 0, feedReady: false })).toEqual(state)
  })
})
