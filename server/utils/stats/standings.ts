import { and, eq } from 'drizzle-orm'
import { match } from '../../../db/schema'
import type { AppDatabase } from '../../../db/types'
import { CLASSIC, type Criterion } from './tiebreakers'

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

function h2hValue(h: H2H, crit: Criterion): number {
  if (crit === 'h2h-points') return h.points
  if (crit === 'h2h-gd') return h.gf - h.ga
  return h.gf // h2h-gf
}

// Split a set into ordered buckets of equal value (highest first).
function bucketByValue(teams: StandingRow[], valueOf: (t: StandingRow) => number): StandingRow[][] {
  const sorted = [...teams].sort((a, b) => valueOf(b) - valueOf(a))
  const buckets: StandingRow[][] = []
  for (const t of sorted) {
    const last = buckets[buckets.length - 1]
    if (last && valueOf(last[0]) === valueOf(t)) last.push(t)
    else buckets.push([t])
  }
  return buckets
}

// Order teams by the criteria list, following the regulations precisely:
//  - A run of head-to-head criteria is ONE block, evaluated among the "teams in
//    question" (the set entering the block, NOT progressively shrunk across a-c).
//  - If the block leaves a subset still level, the WHOLE block is re-applied to
//    that (smaller) subset only - the regs' "re-apply head-to-head to the still-
//    level teams" rule - with head-to-head recomputed among just them.
//  - An overall criterion (GD/GF/wins) splits the set and ranking CONTINUES with
//    the next criterion; head-to-head is never reintroduced once ranking has
//    descended into overall criteria.
// Exhausting the list leaves a true tie, broken deterministically by name.
function rankTied(
  teams: StandingRow[],
  matches: StandingsInputMatch[],
  includeLive: boolean,
  criteria: Criterion[],
): StandingRow[] {
  const applyFrom = (group: StandingRow[], idx: number): StandingRow[] => {
    if (group.length <= 1) return group
    if (idx >= criteria.length) return [...group].sort((a, b) => a.name.localeCompare(b.name))

    if (isH2H(criteria[idx])) {
      let end = idx
      while (end < criteria.length && isH2H(criteria[end])) end++
      // Head-to-head among this exact set, held constant across the block (a-c).
      const h = h2hStats(new Set(group.map((t) => t.name)), matches, includeLive)
      let parts: StandingRow[][] = [group]
      for (let i = idx; i < end; i++) {
        parts = parts.flatMap((p) => bucketByValue(p, (t) => h2hValue(h.get(t.name)!, criteria[i])))
      }
      // The block separated no one: fall through to the overall criteria.
      if (parts.length === 1) return applyFrom(group, end)
      // Re-apply the whole list from the block start to any still-level subset
      // (head-to-head recomputed among the smaller set); singletons stay put.
      return parts.flatMap((p) => (p.length > 1 ? applyFrom(p, idx) : p))
    }

    // Overall criterion: split, then continue with the NEXT criterion.
    const parts = bucketByValue(group, (t) => overallValue(t, criteria[idx]))
    return parts.flatMap((p) => (p.length > 1 ? applyFrom(p, idx + 1) : p))
  }
  return applyFrom(teams, 0)
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

  return rankTied([...table.values()], matches, !!opts.includeLive, opts.tiebreakers ?? CLASSIC)
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

export type GroupStandingsRow = StandingsInputMatch & { group: string | null }

// The exact projection feeding computeAllGroupStandings for a competition's group
// stage. Single source so the fixtures-page table, the bracket projection and any
// other group-standings consumer can't drift on columns or filter.
export async function selectGroupStandingsRows(db: AppDatabase, competitionId: string): Promise<GroupStandingsRow[]> {
  return db
    .select({
      group: match.groupName,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeTeamCode: match.homeTeamCode,
      awayTeamCode: match.awayTeamCode,
      status: match.status,
      fullTimeHome: match.fullTimeHome,
      fullTimeAway: match.fullTimeAway,
    })
    .from(match)
    .where(and(eq(match.competitionId, competitionId), eq(match.stage, 'GROUP')))
}
