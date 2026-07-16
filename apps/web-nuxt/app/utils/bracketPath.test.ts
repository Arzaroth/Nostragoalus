import { describe, expect, it } from 'vitest'
import { bracketJourneyHops, type PathBox } from './bracketPath'

const ORIGIN = { left: 0, top: 0 }

function box(left: number, top: number): PathBox {
  return { left, right: left + 100, top, bottom: top + 40 }
}

describe('bracketJourneyHops', () => {
  it('returns nothing for a team with no hop to draw', () => {
    expect(bracketJourneyHops([], 0, ORIGIN)).toEqual([])
    expect(bracketJourneyHops([box(0, 0)], 0, ORIGIN)).toEqual([])
  })

  it('bends at the stub x so the road overlays the connector, not beside it', () => {
    // A at x 0..100 (mid y 20), B further right at x 200..300 (mid y 100). The
    // vertical turn sits 12px (0.75rem) out of A, matching the static elbow.
    const [hop] = bracketJourneyHops([box(0, 0), box(200, 80)], 0, ORIGIN)
    expect(hop!.d).toBe('M100.0,20.0L112.0,20.0L112.0,100.0L200.0,100.0')
    expect(hop!.delay).toBe(0)
  })

  it('mirrors the bend when the next card sits to the left', () => {
    const [hop] = bracketJourneyHops([box(200, 80), box(0, 0)], 0, ORIGIN)
    expect(hop!.d).toBe('M200.0,100.0L188.0,100.0L188.0,20.0L100.0,20.0')
  })

  it('reverses a hop before the hovered card so it draws from the hovered end', () => {
    // Same two cards, but the hovered card is the second one: the stroke has to
    // start at it and grow back toward the first.
    const [hop] = bracketJourneyHops([box(0, 0), box(200, 80)], 1, ORIGIN)
    expect(hop!.d).toBe('M200.0,100.0L112.0,100.0L112.0,20.0L100.0,20.0')
    expect(hop!.delay).toBe(0)
  })

  it('emits one hop per gap, with the delay growing away from the hovered card', () => {
    // Hover the middle card: one hop reaches back, one reaches forward, both a
    // single step out, so both draw first (delay 0).
    const hops = bracketJourneyHops([box(0, 0), box(200, 80), box(400, 160)], 1, ORIGIN)
    expect(hops.map(h => h.delay)).toEqual([0, 0])
    // Hover the first card: the two forward hops draw one after the other.
    const forward = bracketJourneyHops([box(0, 0), box(200, 80), box(400, 160)], 0, ORIGIN)
    expect(forward.map(h => h.delay)).toEqual([0, 1])
    // Hover the last card: the two backward hops draw one after the other.
    const backward = bracketJourneyHops([box(0, 0), box(200, 80), box(400, 160)], 2, ORIGIN)
    expect(backward.map(h => h.delay)).toEqual([1, 0])
  })

  it('is relative to the overlay origin, not the viewport', () => {
    const [hop] = bracketJourneyHops([box(50, 30), box(250, 110)], 0, { left: 50, top: 30 })
    expect(hop!.d).toBe('M100.0,20.0L112.0,20.0L112.0,100.0L200.0,100.0')
  })

  it('treats an exactly-aligned next card as forward', () => {
    // Equal centreX must take the forward branch (>=, not >), or a vertically
    // stacked pair would route the wrong way.
    const [hop] = bracketJourneyHops([box(0, 0), box(0, 80)], 0, ORIGIN)
    expect(hop!.d).toBe('M100.0,20.0L112.0,20.0L112.0,100.0L0.0,100.0')
  })
})
