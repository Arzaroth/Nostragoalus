// Per-competition group-stage tiebreaker rules. The criteria here are the ones we
// can actually compute from match data; the regulations' trailing separators
// (fair-play / disciplinary points, FIFA/UEFA ranking, drawing of lots) are
// omitted, so a tie that reaches them falls through to a deterministic name sort.
//
// Sources (official FIFA/UEFA regulations, via the tournament Wikipedia pages):
//   - WC 2026 : head-to-head FIRST, then overall GD - a deliberate 2026 change.
//   - WC 2022 : overall GD first, then head-to-head (classic FIFA order).
//   - Euro 2024: head-to-head first (standard UEFA order).
// Best-third ranking is cross-group, so head-to-head is impossible there; it uses
// a separate list (Euro inserts "number of wins", FIFA does not).

export type Criterion = 'points' | 'gd' | 'gf' | 'wins' | 'h2h-points' | 'h2h-gd' | 'h2h-gf'

export interface Tiebreakers {
  // Within-group ranking (head-to-head criteria operate on the matches between the
  // tied teams only). Always starts with 'points'.
  withinGroup: Criterion[]
  // Cross-group ranking of third-placed teams (no head-to-head).
  bestThird: Criterion[]
  // How many teams advance directly from each group, and how many best-third-placed
  // teams advance overall (0 = no best-third lifeline).
  advancePerGroup: number
  bestThirds: number
}

const H2H_FIRST: Criterion[] = ['points', 'h2h-points', 'h2h-gd', 'h2h-gf', 'gd', 'gf']
const GD_FIRST: Criterion[] = ['points', 'gd', 'gf', 'h2h-points', 'h2h-gd', 'h2h-gf']

const WORLD_CUP_2026: Tiebreakers = {
  withinGroup: H2H_FIRST,
  bestThird: ['points', 'gd', 'gf'],
  advancePerGroup: 2,
  bestThirds: 8,
}
const EURO_2024: Tiebreakers = {
  withinGroup: H2H_FIRST,
  bestThird: ['points', 'gd', 'gf', 'wins'],
  advancePerGroup: 2,
  bestThirds: 4,
}
const WORLD_CUP_2022: Tiebreakers = {
  withinGroup: GD_FIRST,
  bestThird: [],
  advancePerGroup: 2,
  bestThirds: 0,
}

// Unknown competitions fall back to the classic FIFA order (GD first), top two up.
const DEFAULT_TIEBREAKERS: Tiebreakers = {
  withinGroup: ['points', 'gd', 'gf'],
  bestThird: ['points', 'gd', 'gf'],
  advancePerGroup: 2,
  bestThirds: 0,
}

const BY_SLUG: Record<string, Tiebreakers> = {
  'world-cup-2026': WORLD_CUP_2026,
  'euro-2024': EURO_2024,
  'world-cup-2022': WORLD_CUP_2022,
}

export function tiebreakersForCompetition(slug: string | null | undefined): Tiebreakers {
  return (slug ? BY_SLUG[slug] : undefined) ?? DEFAULT_TIEBREAKERS
}
