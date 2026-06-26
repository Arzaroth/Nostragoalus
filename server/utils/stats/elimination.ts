import { tiebreakersForCompetition } from './tiebreakers'

// Teams that are out of the tournament beyond any doubt, for greying them on the
// world map. Three certain signals, never a "probably out" guess:
//   1. lost a finished knockout match (a semi-final loser is spared - they still
//      play the third-place game),
//   2. once the group stage is over and the knockout slots carry real codes, a
//      group team absent from the knockout (covers a third that missed the cut),
//   3. mid-group: a team that cannot reach a qualifying-eligible group rank in ANY
//      combination of its group's remaining results (brute-forced, points-level so
//      ties are resolved in the team's favour - sound, never a false positive).

export interface ElimMatch {
  stage: string
  group: string | null
  homeTeamCode: string | null
  awayTeamCode: string | null
  status: string
  fullTimeHome: number | null
  fullTimeAway: number | null
  winner: 'HOME' | 'AWAY' | 'DRAW' | null
}

const isFinished = (s: string): boolean => s === 'FINISHED' || s === 'AWARDED'
// Only a voided match is truly off the board; everything else not yet finished
// (scheduled, live, paused, postponed, suspended, interrupted) is still a winnable
// game, so it must be enumerated rather than dropped (dropping it would under-count
// a team's possible points and could falsely eliminate it).
const isVoid = (s: string): boolean => s === 'CANCELLED'

export function computeEliminatedTeams(matches: ElimMatch[], competitionSlug: string | null | undefined): string[] {
  const tb = tiebreakersForCompetition(competitionSlug)
  const eliminated = new Set<string>()

  // 1. Knockout losers (skip semi-finals: their losers go to the third-place game).
  for (const m of matches) {
    if (m.stage === 'GROUP' || m.stage === 'SF') continue
    if (!isFinished(m.status)) continue
    if (m.winner !== 'HOME' && m.winner !== 'AWAY') continue
    const loser = m.winner === 'HOME' ? m.awayTeamCode : m.homeTeamCode
    if (loser) eliminated.add(loser)
  }

  const groupMatches = matches.filter((m) => m.stage === 'GROUP')

  // 2. Cross-group non-qualifiers, once every group match is finished AND the
  // knockout slots carry every qualifier's real code. The full-coverage guard
  // matters because a provider may fill knockout codes incrementally: a half-
  // populated bracket would otherwise grey advancing teams as "non-qualifiers".
  const groupDone = groupMatches.length > 0 && groupMatches.every((m) => isFinished(m.status))
  const groupLetters = new Set<string>()
  for (const m of groupMatches) if (m.group) groupLetters.add(m.group)
  const expectedQualifiers = groupLetters.size * tb.advancePerGroup + tb.bestThirds
  const knockoutCodes = new Set<string>()
  for (const m of matches) {
    if (m.stage === 'GROUP') continue
    if (m.homeTeamCode) knockoutCodes.add(m.homeTeamCode)
    if (m.awayTeamCode) knockoutCodes.add(m.awayTeamCode)
  }
  if (groupDone && expectedQualifiers > 0 && knockoutCodes.size >= expectedQualifiers) {
    for (const m of groupMatches) {
      for (const code of [m.homeTeamCode, m.awayTeamCode]) {
        if (code && !knockoutCodes.has(code)) eliminated.add(code)
      }
    }
  }

  // 3. Mid-group brute-force. A 3rd place may still advance as a best third, so
  // for best-third formats the qualifying-eligible cutoff is rank 3, else rank 2.
  const eligibleRank = tb.advancePerGroup + (tb.bestThirds > 0 ? 1 : 0)
  // Whether this competition ranks a points-tie by head-to-head first (the run of
  // head-to-head criteria opens the within-group list). When it does, head-to-head
  // points are decided by the enumerated win/draw/loss results, so a tie can be
  // broken soundly without knowing the goals.
  const h2hFirst = tb.withinGroup[1] === 'h2h-points'
  const byGroup = new Map<string, ElimMatch[]>()
  for (const m of groupMatches) {
    if (!m.group) continue
    const list = byGroup.get(m.group)
    if (list) list.push(m)
    else byGroup.set(m.group, [m])
  }
  for (const list of byGroup.values()) {
    for (const code of midGroupEliminated(list, eligibleRank, h2hFirst)) eliminated.add(code)
  }

  return [...eliminated]
}

// 0 = home win, 1 = draw, 2 = away win. A scenario fixes one of these for every
// match (finished results are fixed; remaining ones are enumerated).
interface MatchResult {
  home: string
  away: string
  r: 0 | 1 | 2
}

function midGroupEliminated(matches: ElimMatch[], eligibleRank: number, h2hFirst: boolean): string[] {
  const codes = new Set<string>()
  for (const m of matches) {
    if (m.homeTeamCode) codes.add(m.homeTeamCode)
    if (m.awayTeamCode) codes.add(m.awayTeamCode)
  }

  const finished: MatchResult[] = []
  const remaining: { home: string; away: string }[] = []
  for (const m of matches) {
    if (!m.homeTeamCode || !m.awayTeamCode) continue // a TBD team can't be reasoned about
    if (isFinished(m.status)) {
      if (m.fullTimeHome == null || m.fullTimeAway == null) continue
      const r = m.fullTimeHome > m.fullTimeAway ? 0 : m.fullTimeHome < m.fullTimeAway ? 2 : 1
      finished.push({ home: m.homeTeamCode, away: m.awayTeamCode, r })
    } else if (!isVoid(m.status)) {
      // Not finished and not voided: a still-winnable game (incl. postponed /
      // suspended / interrupted) - enumerate its outcomes.
      remaining.push({ home: m.homeTeamCode, away: m.awayTeamCode })
    }
  }

  const teams = [...codes]
  const n = remaining.length
  // A 4-team round robin has at most 6 remaining; cap defensively and claim no
  // elimination beyond it rather than enumerate an absurd space.
  if (n > 8) return []

  const alive = new Set<string>()
  const combos = 3 ** n
  for (let mask = 0; mask < combos; mask++) {
    // Materialise this scenario's result for every match, then its group points.
    const results: MatchResult[] = finished.slice()
    let x = mask
    for (const g of remaining) {
      const r = (x % 3) as 0 | 1 | 2
      x = Math.floor(x / 3)
      results.push({ home: g.home, away: g.away, r })
    }
    const pts = pointsFrom(results, codes)
    for (const t of teams) {
      if (alive.has(t)) continue
      const tp = pts.get(t)!
      let above = 0
      for (const o of teams) if (o !== t && pts.get(o)! > tp) above++
      // Break the points-tie by head-to-head where the competition ranks it first
      // (head-to-head opens the within-group list). Head-to-head points are fixed
      // by the enumerated win/draw/loss results, so a tied team with strictly more
      // of them is certainly above t this scenario. Deeper criteria (goal
      // difference) hinge on goals we don't enumerate, so we stay optimistic past
      // head-to-head - never a false elimination.
      if (h2hFirst) {
        const tied = teams.filter((o) => pts.get(o)! === tp)
        if (tied.length > 1) {
          const h2h = pointsFrom(results, new Set(tied))
          const myH2h = h2h.get(t)!
          for (const o of tied) if (o !== t && h2h.get(o)! > myH2h) above++
        }
      }
      // A team needs FEWER than `eligibleRank` teams certainly above it to still
      // reach a qualifying spot in this scenario.
      if (above < eligibleRank) alive.add(t)
    }
    if (alive.size === teams.length) break
  }

  return teams.filter((t) => !alive.has(t))
}

// Points among a set of teams from win/draw/loss results, counting only matches
// whose BOTH teams are in `members` - so the full group set yields the group
// table, and a tied subset yields its head-to-head mini-table. 3 for a win, 1 each
// for a draw.
function pointsFrom(results: MatchResult[], members: Set<string>): Map<string, number> {
  const pts = new Map<string, number>()
  for (const c of members) pts.set(c, 0)
  for (const m of results) {
    if (!members.has(m.home) || !members.has(m.away)) continue
    if (m.r === 0) pts.set(m.home, pts.get(m.home)! + 3)
    else if (m.r === 2) pts.set(m.away, pts.get(m.away)! + 3)
    else {
      pts.set(m.home, pts.get(m.home)! + 1)
      pts.set(m.away, pts.get(m.away)! + 1)
    }
  }
  return pts
}
