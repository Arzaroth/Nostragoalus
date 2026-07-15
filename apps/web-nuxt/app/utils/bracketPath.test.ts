import { describe, expect, it } from 'vitest'
import { bracketJourneyPath, type PathBox } from './bracketPath'

const ORIGIN = { left: 0, top: 0 }

function box(left: number, top: number): PathBox {
  return { left, right: left + 100, top, bottom: top + 40 }
}

describe('bracketJourneyPath', () => {
  it('returns nothing for a team with no hop to draw', () => {
    expect(bracketJourneyPath([], ORIGIN)).toBe('')
    expect(bracketJourneyPath([box(0, 0)], ORIGIN)).toBe('')
  })

  it('elbows out of the facing edge, across, then onto the next midline', () => {
    // A at x 0..100 (mid y 20), B further right at x 200..300 (mid y 100).
    expect(bracketJourneyPath([box(0, 0), box(200, 80)], ORIGIN)).toBe('M100.0,20.0L200.0,20.0L200.0,100.0')
  })

  it('mirrors the elbow when the next card sits to the left', () => {
    expect(bracketJourneyPath([box(200, 80), box(0, 0)], ORIGIN)).toBe('M200.0,100.0L100.0,100.0L100.0,20.0')
  })

  it('emits one subpath per hop so cards are skipped, not crossed', () => {
    const d = bracketJourneyPath([box(0, 0), box(200, 80), box(400, 160)], ORIGIN)
    expect(d.match(/M/g)).toHaveLength(2)
    expect(d).toBe('M100.0,20.0L200.0,20.0L200.0,100.0M300.0,100.0L400.0,100.0L400.0,180.0')
  })

  it('is relative to the overlay origin, not the viewport', () => {
    expect(bracketJourneyPath([box(50, 30), box(250, 110)], { left: 50, top: 30 })).toBe('M100.0,20.0L200.0,20.0L200.0,100.0')
  })

  it('treats an exactly-aligned next card as forward', () => {
    expect(bracketJourneyPath([box(0, 0), box(0, 80)], ORIGIN)).toBe('M100.0,20.0L0.0,20.0L0.0,100.0')
  })
})
