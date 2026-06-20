// Sofascore lists the starting XI in formation-grid order (keeper first, then
// each line from defence to attack). We don't trust it for who is playing - FIFA
// is the source of truth - only for WHERE each shirt sits, to refine FIFA's
// coarse position buckets into a real pitch placement.

export interface SofaLineupPlayer {
  shirtNumber?: number | string | null
  position?: string | null // 'G' | 'D' | 'M' | 'F'
  substitute?: boolean | null
}
export interface SofaLineupSide {
  players?: SofaLineupPlayer[] | null
  formation?: string | null
}
export interface SofaLineupsResponse {
  confirmed?: boolean | null
  home?: SofaLineupSide | null
  away?: SofaLineupSide | null
}

export interface Coord {
  x: number
  y: number
}

// 0-100 pitch, y from own goal (keeper) to the attacking end, matching UEFA.
const GK_Y = 7
const DEFENCE_Y = 24
const ATTACK_Y = 92

function parseBands(formation: string | null | undefined, outfield: number): number[] | null {
  if (!formation) return null
  const bands = formation.trim().split('-').map((n) => Number(n))
  if (bands.length < 2 || bands.some((n) => !Number.isInteger(n) || n <= 0)) return null
  if (bands.reduce((sum, n) => sum + n, 0) !== outfield) return null
  return bands
}

// total is always >= 2 (parseBands rejects a single-band formation), so the
// denominator is never zero.
const bandY = (band: number, total: number): number => DEFENCE_Y + (band * (ATTACK_Y - DEFENCE_Y)) / (total - 1)

// Spread a line of n players evenly across the width (a back four -> 20/40/60/80).
const spreadX = (index: number, n: number): number => ((index + 1) / (n + 1)) * 100

const shirtOf = (p: SofaLineupPlayer): number | null => {
  if (p.shirtNumber == null || p.shirtNumber === '') return null
  const n = Number(p.shirtNumber)
  return Number.isNaN(n) ? null : n
}

// One side's shirt -> coordinate map, or null when it can't be placed fully (no
// or garbled formation, a line that doesn't fit the XI, or a missing shirt). The
// caller then leaves that team to its formation-band fallback rather than show a
// half-placed pitch.
function sideCoords(side: SofaLineupSide | null | undefined): Map<number, Coord> | null {
  const xi = (side?.players ?? []).filter((p) => !p.substitute)
  const gk = xi.filter((p) => p.position === 'G')
  const outfield = xi.filter((p) => p.position !== 'G')
  const bands = parseBands(side?.formation, outfield.length)
  if (!bands || gk.length === 0) return null
  const map = new Map<number, Coord>()
  for (const g of gk) {
    const s = shirtOf(g)
    if (s == null) return null
    map.set(s, { x: 50, y: GK_Y })
  }
  let idx = 0
  for (let b = 0; b < bands.length; b++) {
    const y = bandY(b, bands.length)
    for (let j = 0; j < bands[b]; j++) {
      const s = shirtOf(outfield[idx++])
      if (s == null) return null
      map.set(s, { x: spreadX(j, bands[b]), y })
    }
  }
  return map
}

export function deriveSofascorePositions(resp: SofaLineupsResponse): {
  confirmed: boolean
  home: Map<number, Coord> | null
  away: Map<number, Coord> | null
} {
  return {
    confirmed: resp.confirmed === true,
    home: sideCoords(resp.home),
    away: sideCoords(resp.away),
  }
}
