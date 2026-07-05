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

// The classic FIFA ladder: overall points, then goal difference, then goals for.
// The default within-group / best-third order when nothing more specific applies.
// Shared (never mutated) so the ~5 sites that fall back to it can't drift.
export const CLASSIC: Criterion[] = ['points', 'gd', 'gf']

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
  // Whether the knockout format plays a third-place game. When it does, a semi-final
  // loser is still alive (that match decides who is out); the Euro plays none, so
  // its semi-final losers are eliminated at the semi-final itself.
  thirdPlace: boolean
}

const H2H_FIRST: Criterion[] = ['points', 'h2h-points', 'h2h-gd', 'h2h-gf', 'gd', 'gf']
const GD_FIRST: Criterion[] = ['points', 'gd', 'gf', 'h2h-points', 'h2h-gd', 'h2h-gf']

const WORLD_CUP_2026: Tiebreakers = {
  withinGroup: H2H_FIRST,
  bestThird: CLASSIC,
  advancePerGroup: 2,
  bestThirds: 8,
  thirdPlace: true,
}
const EURO_2024: Tiebreakers = {
  withinGroup: H2H_FIRST,
  bestThird: [...CLASSIC, 'wins'],
  advancePerGroup: 2,
  bestThirds: 4,
  thirdPlace: false,
}
const WORLD_CUP_2022: Tiebreakers = {
  withinGroup: GD_FIRST,
  bestThird: [],
  advancePerGroup: 2,
  bestThirds: 0,
  thirdPlace: true,
}

// Unknown competitions fall back to the classic FIFA order (GD first), top two up.
// thirdPlace defaults true so an unknown format never falsely greys a semi-final
// loser (a false elimination is worse than a missed one).
const DEFAULT_TIEBREAKERS: Tiebreakers = {
  withinGroup: CLASSIC,
  bestThird: CLASSIC,
  advancePerGroup: 2,
  bestThirds: 0,
  thirdPlace: true,
}

const BY_SLUG: Record<string, Tiebreakers> = {
  'world-cup-2026': WORLD_CUP_2026,
  'euro-2024': EURO_2024,
  'world-cup-2022': WORLD_CUP_2022,
}

export function tiebreakersForCompetition(slug: string | null | undefined): Tiebreakers {
  return (slug ? BY_SLUG[slug] : undefined) ?? DEFAULT_TIEBREAKERS
}
