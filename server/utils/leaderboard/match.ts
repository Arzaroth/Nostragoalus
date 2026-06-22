import { and, eq, isNotNull, or } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { leagueMember, match, prediction, user } from '../../../db/schema'
import { countsDouble, matchHasStarted } from '../../../shared/types/match'
import { closingOddsForOutcome } from '../odds/store'
import { getScoringConfigFor } from '../scoring/store'
import type { ScoringRules } from '../scoring/config'
import { scorePredictions } from '../scoring/engine'
import { outcomeOf, type BaseTier } from '../scoring/tiers'
import { compareLeaderboardRows } from './service'

export interface MatchStandingRow {
  rank: number
  userId: string
  displayName: string
  image: string | null
  homeGoals: number
  awayGoals: number
  isJoker: boolean
  points: number
  baseTier: BaseTier | null
}

export type MatchStandingsScope = 'upcoming' | 'live' | 'final'

export interface MatchLeagueStandings {
  scope: MatchStandingsScope
  rows: MatchStandingRow[]
  // League members with no (locked) pick on this match - shown as a muted footer.
  notPredicted: number
}

function tierCounts(tier: BaseTier | null): { exact: number; outcome: number; gd: number } {
  return {
    exact: tier === 'EXACT' ? 1 : 0,
    outcome: tier === 'EXACT' || tier === 'DIFF' || tier === 'OUTCOME' ? 1 : 0,
    gd: tier === 'EXACT' || tier === 'DIFF' ? 1 : 0,
  }
}

// One match's standings, ranked by the points each pick earns on this match. A
// live match scores at its current scoreline (same engine as finalize, not
// persisted); a finished match uses the persisted points. Picks are never
// revealed before kickoff. With `leagueId`, ranks that league's members; without
// it, ranks every visible user who picked (the public per-match ranking).
export async function getMatchLeagueStandings(
  db: AppDatabase,
  opts: {
    matchId: string
    leagueId?: string
    competitionId: string
    viewerId: string
    includePrivate?: boolean
    includeHidden?: boolean
    rules?: ScoringRules
  },
): Promise<MatchLeagueStandings> {
  // Scope the match to the league's own competition: a member of one league must
  // not be able to read picks for a match in another competition by passing its
  // id (the league/prediction join is keyed only on matchId otherwise).
  const [m] = await db
    .select({
      id: match.id,
      stage: match.stage,
      status: match.status,
      kickoffTime: match.kickoffTime,
      fullTimeHome: match.fullTimeHome,
      fullTimeAway: match.fullTimeAway,
    })
    .from(match)
    .where(and(eq(match.id, opts.matchId), eq(match.competitionId, opts.competitionId)))
    .limit(1)
  // Copy-protection: other members' picks stay hidden until the match is under
  // way, so the board has nothing to show (and nothing to score) before kickoff.
  if (!m || !matchHasStarted(m.status)) return { scope: 'upcoming', rows: [], notPredicted: 0 }
  // Under way but not yet final (LIVE/PAUSED/SUSPENDED/INTERRUPTED): rank
  // provisionally and keep the board on the live scope so it refreshes.
  const live = m.status !== 'FINISHED'

  // Visibility, same rule as the leaderboard: admin-hidden dropped, private
  // profiles shown only when entitled - but the viewer is always kept on top of
  // the visible set. (No filter at all = member/admin view, everyone shown.)
  const visibility = and(
    ...(opts.includePrivate ? [] : [eq(user.profilePrivate, false)]),
    ...(opts.includeHidden ? [] : [eq(user.hiddenFromLeaderboard, false)]),
  )
  const viewerOrVisible = visibility ? or(eq(user.id, opts.viewerId), visibility) : undefined
  // The roster to rank: a league's members, or - with no league - every visible
  // user who locked a pick on this match (the public per-match ranking).
  const members = opts.leagueId
    ? await db
        .select({ userId: leagueMember.userId, name: user.name, image: user.image })
        .from(leagueMember)
        .innerJoin(user, eq(user.id, leagueMember.userId))
        .where(and(eq(leagueMember.leagueId, opts.leagueId), viewerOrVisible))
    : await db
        .select({ userId: user.id, name: user.name, image: user.image })
        .from(user)
        .innerJoin(prediction, eq(prediction.userId, user.id))
        .where(and(eq(prediction.matchId, m.id), isNotNull(prediction.lockedAt), viewerOrVisible))
  const memberById = new Map(members.map((mem) => [mem.userId, mem]))

  // Every locked prediction for the match feeds the crowd-rarity histogram: the
  // bonus is always measured against the whole field, never just the league.
  const field = await db
    .select({
      id: prediction.id,
      userId: prediction.userId,
      homeGoals: prediction.homeGoals,
      awayGoals: prediction.awayGoals,
      isJoker: prediction.isJoker,
      totalPoints: prediction.totalPoints,
      baseTier: prediction.baseTier,
    })
    .from(prediction)
    .where(and(eq(prediction.matchId, m.id), isNotNull(prediction.lockedAt)))

  const hasScore = m.fullTimeHome !== null && m.fullTimeAway !== null
  // Score provisionally while live, or when a finished match hasn't been
  // finalized yet (a member's pick still has null points): same engine, same
  // rules as finalize, just not persisted.
  const needsProvisional =
    hasScore && (live || field.some((p) => memberById.has(p.userId) && p.totalPoints === null))
  let provisional: Map<string, { points: number; tier: BaseTier }> | null = null
  if (needsProvisional) {
    const rules = opts.rules ?? (await getScoringConfigFor(db, opts.competitionId)).rules
    const actual = { home: m.fullTimeHome as number, away: m.fullTimeAway as number }
    const actualOutcomeOdds =
      rules.bonusSource === 'ODDS' ? await closingOddsForOutcome(db, m.id, m.kickoffTime, outcomeOf(actual)) : null
    const scores = scorePredictions({
      actual,
      rules,
      predictions: field.map((p) => ({ id: p.id, home: p.homeGoals, away: p.awayGoals, isJoker: p.isJoker })),
      actualOutcomeOdds,
      forceJoker: countsDouble(m.stage),
    })
    provisional = new Map(scores.map((s) => [s.id, { points: s.totalPoints, tier: s.baseTier }]))
  }

  type Scored = MatchStandingRow & { exact: number; outcome: number; gd: number }
  const scored: Scored[] = []
  for (const p of field) {
    const mem = memberById.get(p.userId)
    if (!mem) continue
    const prov = provisional?.get(p.id)
    const baseTier = (prov ? prov.tier : p.baseTier) as BaseTier | null
    scored.push({
      rank: 0,
      userId: p.userId,
      displayName: mem.name,
      image: mem.image,
      homeGoals: p.homeGoals,
      awayGoals: p.awayGoals,
      isJoker: p.isJoker,
      points: prov ? prov.points : p.totalPoints ?? 0,
      baseTier,
      ...tierCounts(baseTier),
    })
  }

  scored.sort((a, b) =>
    compareLeaderboardRows(
      { totalPoints: a.points, exactCount: a.exact, outcomeCount: a.outcome, gdCount: a.gd, userId: a.userId },
      { totalPoints: b.points, exactCount: b.exact, outcomeCount: b.outcome, gdCount: b.gd, userId: b.userId },
    ),
  )

  // Standard competition ranking ("1224"): ties share a rank, the next distinct
  // row skips ahead.
  let rank = 0
  let prevKey: string | null = null
  scored.forEach((r, i) => {
    const key = `${r.points}|${r.exact}|${r.outcome}|${r.gd}`
    if (key !== prevKey) {
      rank = i + 1
      prevKey = key
    }
    r.rank = rank
  })

  return {
    scope: live ? 'live' : 'final',
    rows: scored.map((r) => ({
      rank: r.rank,
      userId: r.userId,
      displayName: r.displayName,
      image: r.image,
      homeGoals: r.homeGoals,
      awayGoals: r.awayGoals,
      isJoker: r.isJoker,
      points: r.points,
      baseTier: r.baseTier,
    })),
    notPredicted: members.length - scored.length,
  }
}
