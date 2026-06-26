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
const isUndecided = (s: string): boolean => s === 'SCHEDULED' || s === 'LIVE' || s === 'PAUSED'

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

  // 2. Cross-group non-qualifiers, once every group match is finished and the
  // knockout slots carry real team codes.
  const groupDone = groupMatches.length > 0 && groupMatches.every((m) => isFinished(m.status))
  const knockoutCodes = new Set<string>()
  for (const m of matches) {
    if (m.stage === 'GROUP') continue
    if (m.homeTeamCode) knockoutCodes.add(m.homeTeamCode)
    if (m.awayTeamCode) knockoutCodes.add(m.awayTeamCode)
  }
  if (groupDone && knockoutCodes.size > 0) {
    for (const m of groupMatches) {
      for (const code of [m.homeTeamCode, m.awayTeamCode]) {
        if (code && !knockoutCodes.has(code)) eliminated.add(code)
      }
    }
  }

  // 3. Mid-group brute-force. A 3rd place may still advance as a best third, so
  // for best-third formats the qualifying-eligible cutoff is rank 3, else rank 2.
  const eligibleRank = tb.advancePerGroup + (tb.bestThirds > 0 ? 1 : 0)
  const byGroup = new Map<string, ElimMatch[]>()
  for (const m of groupMatches) {
    if (!m.group) continue
    const list = byGroup.get(m.group)
    if (list) list.push(m)
    else byGroup.set(m.group, [m])
  }
  for (const list of byGroup.values()) {
    for (const code of midGroupEliminated(list, eligibleRank)) eliminated.add(code)
  }

  return [...eliminated]
}

function midGroupEliminated(matches: ElimMatch[], eligibleRank: number): string[] {
  const codes = new Set<string>()
  for (const m of matches) {
    if (m.homeTeamCode) codes.add(m.homeTeamCode)
    if (m.awayTeamCode) codes.add(m.awayTeamCode)
  }

  const base = new Map<string, number>()
  for (const c of codes) base.set(c, 0)
  const remaining: { home: string; away: string }[] = []
  for (const m of matches) {
    if (!m.homeTeamCode || !m.awayTeamCode) continue // a TBD team can't be reasoned about
    if (isFinished(m.status)) {
      if (m.fullTimeHome == null || m.fullTimeAway == null) continue
      if (m.fullTimeHome > m.fullTimeAway) base.set(m.homeTeamCode, base.get(m.homeTeamCode)! + 3)
      else if (m.fullTimeHome < m.fullTimeAway) base.set(m.awayTeamCode, base.get(m.awayTeamCode)! + 3)
      else {
        base.set(m.homeTeamCode, base.get(m.homeTeamCode)! + 1)
        base.set(m.awayTeamCode, base.get(m.awayTeamCode)! + 1)
      }
    } else if (isUndecided(m.status)) {
      // A live match isn't final either - treat it as an open outcome.
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
    const pts = new Map(base)
    let x = mask
    for (const g of remaining) {
      const r = x % 3
      x = Math.floor(x / 3)
      if (r === 0) pts.set(g.home, pts.get(g.home)! + 3)
      else if (r === 1) {
        pts.set(g.home, pts.get(g.home)! + 1)
        pts.set(g.away, pts.get(g.away)! + 1)
      } else pts.set(g.away, pts.get(g.away)! + 3)
    }
    for (const t of teams) {
      if (alive.has(t)) continue
      const tp = pts.get(t)!
      let above = 0
      for (const o of teams) if (o !== t && pts.get(o)! > tp) above++
      // Optimistic on ties: a team only needs FEWER than `eligibleRank` teams
      // strictly above it to possibly reach a qualifying spot in this scenario.
      if (above < eligibleRank) alive.add(t)
    }
    if (alive.size === teams.length) break
  }

  return teams.filter((t) => !alive.has(t))
}
