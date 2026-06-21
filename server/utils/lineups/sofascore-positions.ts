import type { TeamLineup } from '#shared/types/match'

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

export interface SidePlacement {
  formation: string
  coords: Map<number, Coord>
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
function sideCoords(side: SofaLineupSide | null | undefined): SidePlacement | null {
  const xi = (side?.players ?? []).filter((p) => !p.substitute)
  const gk = xi.filter((p) => p.position === 'G')
  const outfield = xi.filter((p) => p.position !== 'G')
  const formation = side?.formation
  const bands = parseBands(formation, outfield.length)
  if (!bands || gk.length === 0) return null
  const coords = new Map<number, Coord>()
  for (const g of gk) {
    const s = shirtOf(g)
    if (s == null) return null
    coords.set(s, { x: 50, y: GK_Y })
  }
  let idx = 0
  for (let b = 0; b < bands.length; b++) {
    const y = bandY(b, bands.length)
    for (let j = 0; j < bands[b]; j++) {
      const s = shirtOf(outfield[idx++])
      if (s == null) return null
      // Sofascore lists each line right-back first, so index 0 is the right side.
      coords.set(s, { x: 100 - spreadX(j, bands[b]), y })
    }
  }
  return { formation: formation as string, coords }
}

// Overlay a side's placement onto FIFA's XI by shirt. FIFA stays the source of
// truth for who plays; the placement (x/y AND the formation) comes from
// Sofascore, since both are its reading of the shape - showing FIFA's formation
// chip over Sofascore positions would contradict the pitch. All-or-nothing: if
// any starter is left unplaced the team is returned untouched, so the pitch
// never shows a half-placed XI and falls back to formation-band rows.
export function applyCoords(team: TeamLineup, placement: SidePlacement | null): TeamLineup {
  if (!placement) return team
  const placed = team.startingXI.map((p) => {
    const c = p.shirtNumber == null ? undefined : placement.coords.get(p.shirtNumber)
    return c ? { ...p, x: c.x, y: c.y } : p
  })
  if (placed.some((p) => p.x == null || p.y == null)) return team
  return { ...team, formation: placement.formation, startingXI: placed }
}

export function deriveSofascorePositions(resp: SofaLineupsResponse): {
  confirmed: boolean
  home: SidePlacement | null
  away: SidePlacement | null
} {
  return {
    confirmed: resp.confirmed === true,
    home: sideCoords(resp.home),
    away: sideCoords(resp.away),
  }
}
