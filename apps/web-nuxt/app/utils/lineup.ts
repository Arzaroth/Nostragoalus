import type { SquadPlayer, TeamLineup } from '#shared/types/match'

export interface PitchRow {
  pos: string
  players: SquadPlayer[]
}

const ROWS = ['FW', 'MF', 'DF', 'GK'] as const

// Group the XI by each player's own position category - the fallback when there
// is no usable formation string. A player with an unknown position joins the
// midfield row so the pitch never renders a stray empty line.
function positionRows(startingXI: SquadPlayer[]): PitchRow[] {
  const buckets: Record<string, SquadPlayer[]> = { GK: [], DF: [], MF: [], FW: [] }
  for (const p of startingXI) (buckets[p.position ?? 'MF'] ?? buckets.MF).push(p)
  return ROWS.map((pos) => ({ pos, players: buckets[pos] })).filter((r) => r.players.length)
}

// Defence-first ordering for the outfield, so band-slicing fills from the back.
// Self-contained rather than trusting the caller's order: the FIFA provider
// already sorts this way, but a feed that delivered the XI in shirt order would
// otherwise scatter players across the bands while still showing the right shape.
const OUTFIELD_ORDER: Record<string, number> = { DF: 0, MF: 1, FW: 2 }
const lineRank = (p: SquadPlayer) => OUTFIELD_ORDER[p.position ?? ''] ?? 3
const shirtRank = (p: SquadPlayer) => p.shirtNumber ?? 99
const byLine = (a: SquadPlayer, b: SquadPlayer) => lineRank(a) - lineRank(b) || shirtRank(a) - shirtRank(b)

// Outfield band sizes from a formation string ("3-4-3" -> [3, 4, 3], defence
// first). Null unless it is a clean run of two or more positive integers.
function parseFormation(formation: string | null | undefined): number[] | null {
  if (!formation) return null
  const bands = formation.trim().split('-').map((n) => Number(n))
  if (bands.length < 2 || bands.some((n) => !Number.isInteger(n) || n <= 0)) return null
  return bands
}

// Lay the XI out as pitch rows, top (attack) to bottom (keeper). When the
// formation string accounts for exactly the ten outfield players, place them in
// its bands so the pitch matches the formation chip; otherwise fall back to
// grouping by each player's own position category. The feed's per-player
// category often disagrees with the declared shape - wing-backs read as
// midfielders, a back three as a back four - so bucketing alone renders a pitch
// that contradicts the chip beside it.
export function pitchRows(team: TeamLineup): PitchRow[] {
  const gk = team.startingXI.filter((p) => p.position === 'GK')
  const outfield = team.startingXI.filter((p) => p.position !== 'GK').sort(byLine)
  const bands = parseFormation(team.formation)
  if (!bands || bands.reduce((sum, n) => sum + n, 0) !== outfield.length) return positionRows(team.startingXI)
  let offset = 0
  const rows: PitchRow[] = bands.map((size, idx) => {
    const players = outfield.slice(offset, offset + size)
    offset += size
    return { pos: `band${idx}`, players }
  })
  rows.reverse() // bands are defence-first; the pitch wants attack on top
  if (gk.length) rows.push({ pos: 'GK', players: gk })
  return rows
}
