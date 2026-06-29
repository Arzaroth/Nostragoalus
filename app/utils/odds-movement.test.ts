import { describe, it, expect } from 'vitest'
import { oddsMovement } from './odds-movement'

describe('oddsMovement', () => {
  it('reports shortened, drifted and flat per outcome', () => {
    const m = oddsMovement(
      { home: 2.2, draw: 3.3, away: 3.5 },
      { home: 1.8, draw: 3.3, away: 4.2 },
    )
    expect(m.hasInitial).toBe(true)
    expect(m.home).toEqual({ direction: 'in', delta: -0.4 })
    expect(m.draw).toEqual({ direction: 'flat', delta: 0 })
    expect(m.away).toEqual({ direction: 'out', delta: 0.7 })
  })

  it('treats a missing opening price as flat with no comparison', () => {
    const current = { home: 2, draw: 3, away: 4 }
    for (const initial of [null, undefined] as const) {
      const m = oddsMovement(initial, current)
      expect(m.hasInitial).toBe(false)
      expect(m.home).toEqual({ direction: 'flat', delta: 0 })
      expect(m.draw).toEqual({ direction: 'flat', delta: 0 })
      expect(m.away).toEqual({ direction: 'flat', delta: 0 })
    }
  })

  it('rounds drift to two decimals and reads a sub-cent wobble as flat', () => {
    const m = oddsMovement(
      { home: 2.0, draw: 3.0, away: 4.0 },
      { home: 2.002, draw: 2.987, away: 4.026 },
    )
    // +0.002 rounds to 0.00 -> flat; -0.013 -> -0.01 in; +0.026 -> +0.03 out.
    expect(m.home).toEqual({ direction: 'flat', delta: 0 })
    expect(m.draw).toEqual({ direction: 'in', delta: -0.01 })
    expect(m.away).toEqual({ direction: 'out', delta: 0.03 })
  })

  it('returns fresh outcome objects (no shared mutable flat reference)', () => {
    const m = oddsMovement({ home: 2, draw: 3, away: 4 }, { home: 2, draw: 3, away: 4 })
    expect(m.home).not.toBe(m.draw)
    m.home.delta = 99
    expect(m.draw.delta).toBe(0)
  })
})
