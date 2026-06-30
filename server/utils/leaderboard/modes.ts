import { and, asc, eq, inArray, isNotNull, or } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { leaguePrediction, match, prediction, round, user } from '../../../db/schema'
import { leagueMember } from '../../../db/schema'
import { outcomeOf, type Outcome, type Scoreline } from '../scoring/tiers'
import { getScoringConfigFor } from '../scoring/store'
import { closingOddsForOutcome } from '../odds/store'
import {
  hardcoreSurvives,
  modePoints,
  type EffectivePick,
  type LeagueMode,
  type ModeScoreContext,
} from '../leagues/modes'
import { compareLeaderboardRows } from './service'

interface BoardMember {
  userId: string
  displayName: string
  image: string | null
}

interface BoardOptions {
  includeHidden?: boolean
  includePrivate?: boolean
  alwaysIncludeUserId?: string
}

// League members visible on a board, mirroring getLeaderboard's visibility rules
// (admin-hidden out, private profiles out unless entitled, the viewer always in).
async function loadVisibleMembers(db: AppDatabase, leagueId: string, opts: BoardOptions): Promise<BoardMember[]> {
  const visible = and(
    ...(opts.includeHidden ? [] : [eq(user.hiddenFromLeaderboard, false)]),
    ...(opts.includePrivate ? [] : [eq(user.profilePrivate, false)]),
  )
  return db
    .select({ userId: user.id, displayName: user.name, image: user.image })
    .from(leagueMember)
    .innerJoin(user, eq(user.id, leagueMember.userId))
    .where(
      and(
        eq(leagueMember.leagueId, leagueId),
        opts.alwaysIncludeUserId ? or(eq(user.id, opts.alwaysIncludeUserId), visible) : visible,
      ),
    )
}

interface ScoredMatch {
  matchId: string
  roundLabel: string
  actual: Scoreline
  actualOutcome: Outcome
  actualOdds: number | null
}

// Scored matches of a competition in chronological order, each with its final
// scoreline, outcome and the closing odds of that outcome (for EASY payouts).
async function loadScoredMatches(db: AppDatabase, competitionId: string): Promise<ScoredMatch[]> {
  const rows = await db
    .select({
      matchId: match.id,
      roundLabel: round.label,
      kickoffTime: match.kickoffTime,
      home: match.fullTimeHome,
      away: match.fullTimeAway,
    })
    .from(match)
    .innerJoin(round, eq(round.id, match.roundId))
    .where(
      and(
        eq(match.competitionId, competitionId),
        eq(match.scoringState, 'SCORED'),
        isNotNull(match.fullTimeHome),
        isNotNull(match.fullTimeAway),
      ),
    )
    .orderBy(asc(match.kickoffTime), asc(match.id))

  const out: ScoredMatch[] = []
  for (const r of rows) {
    const actual: Scoreline = { home: r.home as number, away: r.away as number }
    const actualOutcome = outcomeOf(actual)
    const actualOdds = await closingOddsForOutcome(db, r.matchId, r.kickoffTime, actualOutcome)
    out.push({ matchId: r.matchId, roundLabel: r.roundLabel, actual, actualOutcome, actualOdds })
  }
  return out
}

function toPick(row: { homeGoals: number; awayGoals: number; isOutcomeOnly: boolean; wager: number | null; isJoker: boolean }): EffectivePick {
  return { home: row.homeGoals, away: row.awayGoals, isOutcomeOnly: row.isOutcomeOnly, wager: row.wager, isJoker: row.isJoker }
}

// Effective picks (override ?? base) per member per match for one league.
async function loadEffectivePicks(
  db: AppDatabase,
  leagueId: string,
  userIds: string[],
  matchIds: string[],
): Promise<Map<string, Map<string, EffectivePick>>> {
  const map = new Map<string, Map<string, EffectivePick>>()
  if (userIds.length === 0 || matchIds.length === 0) return map

  const bases = await db
    .select({
      userId: prediction.userId,
      matchId: prediction.matchId,
      homeGoals: prediction.homeGoals,
      awayGoals: prediction.awayGoals,
      isOutcomeOnly: prediction.isOutcomeOnly,
      wager: prediction.wager,
      isJoker: prediction.isJoker,
    })
    .from(prediction)
    .where(and(inArray(prediction.userId, userIds), inArray(prediction.matchId, matchIds)))
  for (const b of bases) {
    if (!map.has(b.userId)) map.set(b.userId, new Map())
    map.get(b.userId)!.set(b.matchId, toPick(b))
  }

  const overrides = await db
    .select({
      userId: leaguePrediction.userId,
      matchId: leaguePrediction.matchId,
      homeGoals: leaguePrediction.homeGoals,
      awayGoals: leaguePrediction.awayGoals,
      isOutcomeOnly: leaguePrediction.isOutcomeOnly,
      wager: leaguePrediction.wager,
      isJoker: leaguePrediction.isJoker,
    })
    .from(leaguePrediction)
    .where(
      and(
        eq(leaguePrediction.leagueId, leagueId),
        inArray(leaguePrediction.userId, userIds),
        inArray(leaguePrediction.matchId, matchIds),
      ),
    )
  for (const o of overrides) {
    if (!map.has(o.userId)) map.set(o.userId, new Map())
    map.get(o.userId)!.set(o.matchId, toPick(o))
  }
  return map
}

export interface ModePointsRow {
  rank: number
  userId: string
  displayName: string
  image: string | null
  points: number
  exactCount: number
  outcomeCount: number
}

function buildPointsBoard(
  members: BoardMember[],
  scored: ScoredMatch[],
  picks: Map<string, Map<string, EffectivePick>>,
  mode: LeagueMode,
  ctx: ModeScoreContext,
): ModePointsRow[] {
  const rows = members.map((mem) => {
    const userPicks = picks.get(mem.userId)
    let points = 0
    let exactCount = 0
    let outcomeCount = 0
    for (const sm of scored) {
      const pick = userPicks?.get(sm.matchId)
      if (!pick) continue
      points += modePoints(mode, pick, sm.actual, sm.actualOdds, ctx)
      if (pick.home === sm.actual.home && pick.away === sm.actual.away) exactCount += 1
      if (outcomeOf({ home: pick.home, away: pick.away }) === sm.actualOutcome) outcomeCount += 1
    }
    return { ...mem, points, exactCount, outcomeCount, rank: 0 }
  })

  rows.sort((a, b) =>
    compareLeaderboardRows(
      { totalPoints: a.points, exactCount: a.exactCount, outcomeCount: a.outcomeCount, gdCount: 0, userId: a.userId },
      { totalPoints: b.points, exactCount: b.exactCount, outcomeCount: b.outcomeCount, gdCount: 0, userId: b.userId },
    ),
  )
  let rank = 0
  let prevKey: string | null = null
  rows.forEach((r, i) => {
    const key = `${r.points}|${r.exactCount}|${r.outcomeCount}`
    if (key !== prevKey) {
      rank = i + 1
      prevKey = key
    }
    r.rank = rank
  })
  return rows
}

export interface SurvivalRow {
  rank: number
  userId: string
  displayName: string
  image: string | null
  alive: boolean
  livesLeft: number
  survived: number
  eliminatedRoundLabel: string | null
}

// Last-man-standing: walk scored matches in order, burn a life on each wrong (or
// missing) outcome, eliminate at zero. Survivors are co-winners (all rank 1);
// the eliminated rank by how far they got (later elimination = better), with a
// shared rank for everyone knocked out at the same match.
function buildSurvivalBoard(
  members: BoardMember[],
  scored: ScoredMatch[],
  picks: Map<string, Map<string, EffectivePick>>,
  startingLives: number,
): SurvivalRow[] {
  const state = members.map((mem) => ({
    ...mem,
    livesLeft: startingLives,
    survived: 0,
    alive: true,
    eliminatedIndex: scored.length,
    eliminatedRoundLabel: null as string | null,
  }))

  scored.forEach((sm, i) => {
    for (const s of state) {
      if (!s.alive) continue
      const pick = picks.get(s.userId)?.get(sm.matchId) ?? null
      if (hardcoreSurvives(pick, sm.actual)) {
        s.survived += 1
      } else {
        s.livesLeft -= 1
        if (s.livesLeft <= 0) {
          s.alive = false
          s.eliminatedIndex = i
          s.eliminatedRoundLabel = sm.roundLabel
        }
      }
    }
  })

  state.sort(
    (a, b) =>
      b.eliminatedIndex - a.eliminatedIndex ||
      b.survived - a.survived ||
      b.livesLeft - a.livesLeft ||
      (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
  )

  let rank = 0
  let prevKey: string | null = null
  return state.map((s, i) => {
    // Survivors share rank 1; the eliminated tie by the match they fell at.
    const key = s.alive ? 'ALIVE' : `OUT|${s.eliminatedIndex}`
    if (key !== prevKey) {
      rank = i + 1
      prevKey = key
    }
    return {
      rank,
      userId: s.userId,
      displayName: s.displayName,
      image: s.image,
      alive: s.alive,
      livesLeft: Math.max(0, s.livesLeft),
      survived: s.survived,
      eliminatedRoundLabel: s.eliminatedRoundLabel,
    }
  })
}

export type LeagueModeBoard =
  | { kind: 'points'; mode: LeagueMode; rows: ModePointsRow[] }
  | { kind: 'survival'; mode: 'HARDCORE'; rows: SurvivalRow[] }

export interface LeagueModeBoardOptions extends BoardOptions {
  leagueId: string
  mode: LeagueMode
  competitionId: string
  lives?: number | null
}

// Read-time board for a moded league. EASY/HARD produce a points board scored
// from effective picks (no champion/best-scorer/crowd/live - moded leagues score
// self-contained); HARDCORE produces a survival board.
export async function getLeagueModeBoard(db: AppDatabase, opts: LeagueModeBoardOptions): Promise<LeagueModeBoard> {
  const members = await loadVisibleMembers(db, opts.leagueId, opts)
  const scored = await loadScoredMatches(db, opts.competitionId)
  const picks = await loadEffectivePicks(
    db,
    opts.leagueId,
    members.map((m) => m.userId),
    scored.map((s) => s.matchId),
  )

  if (opts.mode === 'HARDCORE') {
    return { kind: 'survival', mode: 'HARDCORE', rows: buildSurvivalBoard(members, scored, picks, opts.lives ?? 1) }
  }

  const { rules } = await getScoringConfigFor(db, opts.competitionId)
  const ctx: ModeScoreContext = { base: rules.base, jokerMultiplier: rules.jokerMultiplier, oddsTiers: rules.oddsTiers }
  return { kind: 'points', mode: opts.mode, rows: buildPointsBoard(members, scored, picks, opts.mode, ctx) }
}
