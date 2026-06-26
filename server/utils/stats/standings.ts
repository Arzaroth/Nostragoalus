import type { Criterion } from './tiebreakers'

export interface StandingsInputMatch {
  homeTeam: string
  awayTeam: string
  homeTeamCode: string | null
  awayTeamCode: string | null
  status: string
  fullTimeHome: number | null
  fullTimeAway: number | null
}

export interface StandingRow {
  code: string | null
  name: string
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  gd: number
  points: number
}

const DEFAULT_CRITERIA: Criterion[] = ['points', 'gd', 'gf']

function matchCounts(m: StandingsInputMatch, includeLive: boolean): boolean {
  if (m.fullTimeHome == null || m.fullTimeAway == null) return false
  return m.status === 'FINISHED' || (includeLive && (m.status === 'LIVE' || m.status === 'PAUSED'))
}

interface H2H {
  points: number
  gf: number
  ga: number
}

// Mini-table among a tied subset, from the matches played BETWEEN those teams only.
function h2hStats(names: Set<string>, matches: StandingsInputMatch[], includeLive: boolean): Map<string, H2H> {
  const stats = new Map<string, H2H>()
  for (const n of names) stats.set(n, { points: 0, gf: 0, ga: 0 })
  for (const m of matches) {
    if (!names.has(m.homeTeam) || !names.has(m.awayTeam)) continue
    if (!matchCounts(m, includeLive)) continue
    const h = stats.get(m.homeTeam)!
    const a = stats.get(m.awayTeam)!
    h.gf += m.fullTimeHome!
    h.ga += m.fullTimeAway!
    a.gf += m.fullTimeAway!
    a.ga += m.fullTimeHome!
    if (m.fullTimeHome! > m.fullTimeAway!) h.points += 3
    else if (m.fullTimeHome! < m.fullTimeAway!) a.points += 3
    else {
      h.points += 1
      a.points += 1
    }
  }
  return stats
}

const isH2H = (c: Criterion): boolean => c === 'h2h-points' || c === 'h2h-gd' || c === 'h2h-gf'

function overallValue(row: StandingRow, crit: Criterion): number {
  switch (crit) {
    case 'points':
      return row.points
    case 'gd':
      return row.gd
    case 'gf':
      return row.gf
    case 'wins':
      return row.won
    default:
      return 0
  }
}

function h2hValue(h: H2H | undefined, crit: Criterion): number {
  if (!h) return 0
  if (crit === 'h2h-points') return h.points
  if (crit === 'h2h-gd') return h.gf - h.ga
  return h.gf // h2h-gf
}

// Order a set of teams level on points by the criteria list. Head-to-head criteria
// are recomputed among the *current* subset, so when a criterion splits the set the
// subsets are ranked from the top of the list again (this is the regulations'
// "re-apply head-to-head to the still-level teams" rule). When nothing separates
// them, fall back to a deterministic name sort.
function rankCluster(
  teams: StandingRow[],
  matches: StandingsInputMatch[],
  includeLive: boolean,
  criteria: Criterion[],
): StandingRow[] {
  if (teams.length <= 1) return teams.slice()
  const names = new Set(teams.map((t) => t.name))
  for (const crit of criteria) {
    let valueOf: (t: StandingRow) => number
    if (isH2H(crit)) {
      const h = h2hStats(names, matches, includeLive)
      valueOf = (t) => h2hValue(h.get(t.name), crit)
    } else {
      valueOf = (t) => overallValue(t, crit)
    }
    const sorted = [...teams].sort((a, b) => valueOf(b) - valueOf(a))
    const buckets: StandingRow[][] = []
    for (const t of sorted) {
      const last = buckets[buckets.length - 1]
      if (last && valueOf(last[0]) === valueOf(t)) last.push(t)
      else buckets.push([t])
    }
    if (buckets.length > 1) {
      return buckets.flatMap((b) => rankCluster(b, matches, includeLive, criteria))
    }
  }
  return [...teams].sort((a, b) => a.name.localeCompare(b.name))
}

// A comparator over overall stats only (no head-to-head), for ranking teams that
// never met - i.e. third-placed teams across different groups.
export function compareByCriteria(criteria: Criterion[]): (a: StandingRow, b: StandingRow) => number {
  return (a, b) => {
    for (const crit of criteria) {
      const d = overallValue(b, crit) - overallValue(a, crit)
      if (d) return d
    }
    return 0
  }
}

export interface StandingsOpts {
  includeLive?: boolean
  // Within-group criteria after points; defaults to overall GD then GF (classic FIFA).
  tiebreakers?: Criterion[]
}

// Compute a group table from its matches. Unplayed teams still appear (0 across),
// so the full group is shown before kickoff. With includeLive, in-progress
// matches count at their current scoreline (provisional table for the live view).
export function computeGroupStandings(matches: StandingsInputMatch[], opts: StandingsOpts = {}): StandingRow[] {
  const table = new Map<string, StandingRow>()

  const ensure = (name: string, code: string | null): StandingRow => {
    let row = table.get(name)
    if (!row) {
      row = { code, name, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 }
      table.set(name, row)
    }
    return row
  }

  for (const m of matches) {
    const home = ensure(m.homeTeam, m.homeTeamCode)
    const away = ensure(m.awayTeam, m.awayTeamCode)
    if (!matchCounts(m, !!opts.includeLive)) continue

    home.played += 1
    away.played += 1
    home.gf += m.fullTimeHome!
    home.ga += m.fullTimeAway!
    away.gf += m.fullTimeAway!
    away.ga += m.fullTimeHome!

    if (m.fullTimeHome! > m.fullTimeAway!) {
      home.won += 1
      away.lost += 1
      home.points += 3
    } else if (m.fullTimeHome! < m.fullTimeAway!) {
      away.won += 1
      home.lost += 1
      away.points += 3
    } else {
      home.drawn += 1
      away.drawn += 1
      home.points += 1
      away.points += 1
    }
  }

  for (const row of table.values()) row.gd = row.gf - row.ga

  return rankCluster([...table.values()], matches, !!opts.includeLive, opts.tiebreakers ?? DEFAULT_CRITERIA)
}

export interface GroupStandings {
  group: string
  rows: StandingRow[]
}

// Split a competition's group-stage matches by their group letter and build a
// table per group, in letter order. Matches without a group (knockout) drop out,
// so a knockout-only tournament yields an empty list.
export function computeAllGroupStandings(
  matches: (StandingsInputMatch & { group: string | null })[],
  opts: StandingsOpts = {},
): GroupStandings[] {
  const byGroup = new Map<string, StandingsInputMatch[]>()
  for (const m of matches) {
    if (!m.group) continue
    const list = byGroup.get(m.group)
    if (list) list.push(m)
    else byGroup.set(m.group, [m])
  }
  return [...byGroup.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, ms]) => ({ group, rows: computeGroupStandings(ms, opts) }))
}
