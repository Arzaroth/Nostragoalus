import { describe, it, expect } from 'vitest'
import type { SquadPlayer, TeamLineup } from '#shared/types/match'
import { applyCoords, deriveSofascorePositions, type Coord, type SidePlacement, type SofaLineupSide } from './sofascore-positions'

const pl = (shirtNumber: number | string | null, position: string, substitute = false) => ({ shirtNumber, position, substitute })
// 1 GK + 10 outfield in formation-grid order.
const side = (formation: string | null, over: Partial<SofaLineupSide> = {}): SofaLineupSide => ({
  formation,
  players: [
    pl(1, 'G'),
    pl(2, 'D'), pl(3, 'D'), pl(4, 'D'), pl(5, 'D'),
    pl(6, 'M'), pl(7, 'M'), pl(8, 'M'), pl(9, 'M'), pl(10, 'M'),
    pl(11, 'F'),
    pl(12, 'M', true), // bench - ignored
  ],
  ...over,
})

describe('deriveSofascorePositions', () => {
  it('places the XI from formation grid order, keeper to attack, right line first', () => {
    const { confirmed, home } = deriveSofascorePositions({ confirmed: true, home: side('4-2-3-1') })
    expect(confirmed).toBe(true)
    expect(home!.formation).toBe('4-2-3-1')
    expect(home!.coords.size).toBe(11)
    expect(home!.coords.get(1)).toEqual({ x: 50, y: 7 }) // keeper, centred at the back
    expect(home!.coords.get(2)).toEqual({ x: 80, y: 24 }) // back four, listed right-back first
    expect(home!.coords.get(5)).toEqual({ x: 20, y: 24 }) // back four, left-back last
    expect(home!.coords.get(11)).toEqual({ x: 50, y: 92 }) // lone striker, top centre
    // the 4 bands climb the pitch
    expect(home!.coords.get(6)!.y).toBeGreaterThan(home!.coords.get(2)!.y)
    expect(home!.coords.get(8)!.y).toBeGreaterThan(home!.coords.get(6)!.y)
  })

  it('honours a three-band formation too', () => {
    const { home } = deriveSofascorePositions({ home: side('4-3-3') })
    expect(home!.coords.size).toBe(11)
    expect(home!.coords.get(9)).toEqual({ x: 75, y: 92 }) // front three, right-winger first
  })

  it('returns null for a side it cannot place fully', () => {
    expect(deriveSofascorePositions({ home: side(null) }).home).toBeNull() // no formation
    expect(deriveSofascorePositions({ home: side('11') }).home).toBeNull() // single token
    expect(deriveSofascorePositions({ home: side('4-x-3') }).home).toBeNull() // NaN band
    expect(deriveSofascorePositions({ home: side('0-4-3') }).home).toBeNull() // non-positive band
    expect(deriveSofascorePositions({ home: side('4-4-3') }).home).toBeNull() // bands sum 11, only 10 outfield
  })

  it('returns null without a keeper or with a missing shirt number', () => {
    const noGk: SofaLineupSide = { formation: '4-3-3', players: side('4-3-3').players!.filter((p) => p.position !== 'G') }
    expect(deriveSofascorePositions({ home: noGk }).home).toBeNull()
    const gkNoShirt: SofaLineupSide = { formation: '4-2-3-1', players: [pl(null, 'G'), ...side('4-2-3-1').players!.slice(1)] }
    expect(deriveSofascorePositions({ home: gkNoShirt }).home).toBeNull()
    const fieldNoShirt: SofaLineupSide = { formation: '4-2-3-1', players: side('4-2-3-1').players!.map((p) => (p.shirtNumber === 7 ? pl('', 'M') : p)) }
    expect(deriveSofascorePositions({ home: fieldNoShirt }).home).toBeNull()
  })

  it('defaults confirmed to false and tolerates absent sides', () => {
    const res = deriveSofascorePositions({})
    expect(res.confirmed).toBe(false)
    expect(res.home).toBeNull()
    expect(res.away).toBeNull()
  })
})

describe('applyCoords', () => {
  const sp = (shirtNumber: number | null): SquadPlayer => ({ playerId: `p${shirtNumber}`, name: `P${shirtNumber}`, shirtNumber, position: 'MF', captain: false, pictureUrl: null })
  const team = (shirts: (number | null)[]): TeamLineup => ({ formation: '4-3-3', coach: null, startingXI: shirts.map(sp), bench: [] })
  const placement = (entries: [number, Coord][], formation = '3-4-3'): SidePlacement => ({ formation, coords: new Map(entries) })

  it('overlays coordinates by shirt and adopts the Sofascore formation', () => {
    const out = applyCoords(team([1, 2]), placement([[1, { x: 50, y: 7 }], [2, { x: 20, y: 24 }]]))
    expect(out.startingXI.map((p) => [p.shirtNumber, p.x, p.y])).toEqual([[1, 50, 7], [2, 20, 24]])
    expect(out.formation).toBe('3-4-3') // chip follows the placement
  })

  it('leaves the team untouched when placement is absent, partial, or a shirt is missing', () => {
    const base = team([1, 2])
    expect(applyCoords(base, null)).toBe(base)
    // shirt 2 has no coordinate -> incomplete -> untouched, keeps its own formation
    const partial = applyCoords(base, placement([[1, { x: 50, y: 7 }]]))
    expect(partial.startingXI.every((p) => p.x == null)).toBe(true)
    expect(partial.formation).toBe('4-3-3')
    // a starter with no shirt can't be matched -> untouched
    expect(applyCoords(team([1, null]), placement([[1, { x: 50, y: 7 }]])).startingXI.every((p) => p.x == null)).toBe(true)
  })
})
