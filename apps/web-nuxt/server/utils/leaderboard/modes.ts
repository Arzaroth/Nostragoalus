import { and, asc, eq, inArray, isNotNull, or } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { bestScorerPick, championPick, leagueMember, leaguePrediction, match, prediction, round, user } from '../../../db/schema'
import { IN_PLAY_STATUSES } from '../../../shared/types/match'
import { outcomeOf, type Outcome, type Scoreline } from '../scoring/tiers'
import { getScoringConfigFor } from '../scoring/store'
import { closingOddsForOutcome } from '../odds/store'
import { buildHistogram, computeBonus, type Histogram } from '../scoring/engine'
import type { ScoringRules } from '../scoring/config'
import { hardcoreSurvives, modePoints, type EffectivePick, type LeagueMode, type ModeScoreContext } from '../leagues/modes'
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

interface BoardMatch {
  matchId: string
  roundLabel: string
  actual: Scoreline
  actualOutcome: Outcome
  // Closing odds of the actual outcome, resolved only when the configured bonus
  // source is ODDS (mirrors the engine).
  actualOdds: number | null
  // Global histogram of everyone's base picks for this match, for the crowd bonus
  // (the bonus is always measured against the whole field, not the league).
  histogram: Histogram
}

// Scored (finalized) and in-play matches of a competition, each with its
// scoreline, outcome, optional closing odds, and the global pick histogram. Live
// matches are scored provisionally at their current scoreline.
async function loadModeMatches(
  db: AppDatabase,
  competitionId: string,
  rules: ScoringRules,
): Promise<{ scored: BoardMatch[]; live: BoardMatch[] }> {
  const rows = await db
    .select({
      matchId: match.id,
      roundLabel: round.label,
      kickoffTime: match.kickoffTime,
      home: match.fullTimeHome,
      away: match.fullTimeAway,
      scoringState: match.scoringState,
    })
    .from(match)
    .innerJoin(round, eq(round.id, match.roundId))
    .where(
      and(
        eq(match.competitionId, competitionId),
        isNotNull(match.fullTimeHome),
        isNotNull(match.fullTimeAway),
        or(eq(match.scoringState, 'SCORED'), inArray(match.status, IN_PLAY_STATUSES)),
      ),
    )
    .orderBy(asc(match.kickoffTime), asc(match.id))

  const matchIds = rows.map((r) => r.matchId)
  const allPreds = matchIds.length
    ? await db
        .select({ matchId: prediction.matchId, home: prediction.homeGoals, away: prediction.awayGoals })
        .from(prediction)
        .where(inArray(prediction.matchId, matchIds))
    : []
  const predsByMatch = new Map<string, { home: number; away: number }[]>()
  for (const p of allPreds) {
    const list = predsByMatch.get(p.matchId)
    if (list) list.push(p)
    else predsByMatch.set(p.matchId, [p])
  }

  const scored: BoardMatch[] = []
  const live: BoardMatch[] = []
  for (const r of rows) {
    const actual: Scoreline = { home: r.home as number, away: r.away as number }
    const actualOutcome = outcomeOf(actual)
    const actualOdds =
      rules.bonusSource === 'ODDS' ? await closingOddsForOutcome(db, r.matchId, r.kickoffTime, actualOutcome) : null
    const field = (predsByMatch.get(r.matchId) ?? []).map((p, i) => ({ id: String(i), home: p.home, away: p.away, isJoker: false }))
    const histogram = buildHistogram(actual, field)
    const bm: BoardMatch = { matchId: r.matchId, roundLabel: r.roundLabel, actual, actualOutcome, actualOdds, histogram }
    if (r.scoringState === 'SCORED') scored.push(bm)
    else live.push(bm)
  }
  return { scored, live }
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

// Sum of a competition's champion (or best-scorer) awarded points per user.
async function loadAwardPoints(
  db: AppDatabase,
  competitionId: string,
  table: typeof championPick | typeof bestScorerPick,
): Promise<Map<string, number>> {
  const rows = await db
    .select({ userId: table.userId, points: table.awardedPoints })
    .from(table)
    .where(eq(table.competitionId, competitionId))
  const map = new Map<string, number>()
  for (const r of rows) map.set(r.userId, (map.get(r.userId) ?? 0) + (r.points ?? 0))
  return map
}

interface PickTally {
  points: number
  exact: number
  outcome: number
}

// Score one member's picks over a set of matches (scored or live). EASY adds the
// competition's configured bonus (crowd/odds); HARD is pure stake; HARDCORE is
// scored separately (survival).
function tally(
  userPicks: Map<string, EffectivePick> | undefined,
  matches: BoardMatch[],
  mode: LeagueMode,
  ctx: ModeScoreContext,
  rules: ScoringRules,
): PickTally {
  let points = 0
  let exact = 0
  let outcome = 0
  for (const bm of matches) {
    const pick = userPicks?.get(bm.matchId)
    if (!pick) continue
    const bonus =
      mode === 'EASY' ? computeBonus({ home: pick.home, away: pick.away }, bm.actual, rules, bm.histogram, bm.actualOdds).bonus : 0
    points += modePoints(mode, pick, bm.actual, bonus, ctx)
    if (pick.home === bm.actual.home && pick.away === bm.actual.away) exact += 1
    if (outcomeOf({ home: pick.home, away: pick.away }) === bm.actualOutcome) outcome += 1
  }
  return { points, exact, outcome }
}

export interface ModePointsRow {
  rank: number
  userId: string
  displayName: string
  image: string | null
  points: number
  livePoints: number
  exactCount: number
  outcomeCount: number
}

function buildPointsBoard(
  members: BoardMember[],
  scored: BoardMatch[],
  live: BoardMatch[],
  picks: Map<string, Map<string, EffectivePick>>,
  champion: Map<string, number>,
  bestScorer: Map<string, number>,
  mode: LeagueMode,
  ctx: ModeScoreContext,
  rules: ScoringRules,
): ModePointsRow[] {
  const merged = members.map((mem) => {
    const userPicks = picks.get(mem.userId)
    const sc = tally(userPicks, scored, mode, ctx, rules)
    const lv = tally(userPicks, live, mode, ctx, rules)
    // Champion + best-scorer are competition-wide awards, mode-independent.
    const points = sc.points + (champion.get(mem.userId) ?? 0) + (bestScorer.get(mem.userId) ?? 0)
    return {
      ...mem,
      points,
      livePoints: lv.points,
      exactCount: sc.exact,
      outcomeCount: sc.outcome,
      // Ranking is provisional: scored + live so in-progress points move players.
      rankTotal: points + lv.points,
      rankExact: sc.exact + lv.exact,
      rankOutcome: sc.outcome + lv.outcome,
      rank: 0,
    }
  })

  merged.sort((a, b) =>
    compareLeaderboardRows(
      { totalPoints: a.rankTotal, exactCount: a.rankExact, outcomeCount: a.rankOutcome, gdCount: 0, userId: a.userId },
      { totalPoints: b.rankTotal, exactCount: b.rankExact, outcomeCount: b.rankOutcome, gdCount: 0, userId: b.userId },
    ),
  )
  let rank = 0
  let prevKey: string | null = null
  merged.forEach((r, i) => {
    const key = `${r.rankTotal}|${r.rankExact}|${r.rankOutcome}`
    if (key !== prevKey) {
      rank = i + 1
      prevKey = key
    }
    r.rank = rank
  })
  return merged.map((r) => ({
    rank: r.rank,
    userId: r.userId,
    displayName: r.displayName,
    image: r.image,
    points: r.points,
    livePoints: r.livePoints,
    exactCount: r.exactCount,
    outcomeCount: r.outcomeCount,
  }))
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
// shared rank for everyone knocked out at the same match. Elimination is on
// finalized matches only - no provisional live elimination (see TODO.md).
function buildSurvivalBoard(
  members: BoardMember[],
  scored: BoardMatch[],
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
  | { kind: 'points'; mode: LeagueMode; rows: ModePointsRow[]; live: boolean }
  | { kind: 'survival'; mode: 'HARDCORE'; rows: SurvivalRow[]; live: boolean }

export interface LeagueModeBoardOptions extends BoardOptions {
  leagueId: string
  mode: LeagueMode
  competitionId: string
  lives?: number | null
}

// Read-time board for a moded league. EASY/HARD produce a points board re-scored
// from effective picks, including the configured per-pick bonus, champion +
// best-scorer awards, and provisional live points. HARDCORE produces a survival
// board (no points - champion/best-scorer/live/crowd don't apply).
export async function getLeagueModeBoard(db: AppDatabase, opts: LeagueModeBoardOptions): Promise<LeagueModeBoard> {
  const members = await loadVisibleMembers(db, opts.leagueId, opts)
  const { rules } = await getScoringConfigFor(db, opts.competitionId)
  const { scored, live } = await loadModeMatches(db, opts.competitionId, rules)
  const picks = await loadEffectivePicks(
    db,
    opts.leagueId,
    members.map((m) => m.userId),
    [...scored, ...live].map((m) => m.matchId),
  )

  if (opts.mode === 'HARDCORE') {
    return { kind: 'survival', mode: 'HARDCORE', live: live.length > 0, rows: buildSurvivalBoard(members, scored, picks, opts.lives ?? 1) }
  }

  const [champion, bestScorer] = await Promise.all([
    loadAwardPoints(db, opts.competitionId, championPick),
    loadAwardPoints(db, opts.competitionId, bestScorerPick),
  ])
  const ctx: ModeScoreContext = { base: rules.base, jokerMultiplier: rules.jokerMultiplier }
  return {
    kind: 'points',
    mode: opts.mode,
    live: live.length > 0,
    rows: buildPointsBoard(members, scored, live, picks, champion, bestScorer, opts.mode, ctx, rules),
  }
}
