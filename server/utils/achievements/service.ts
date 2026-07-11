import { and, eq, gt, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import {
  bestScorerPick,
  championPick,
  competitionAward,
  match,
  prediction,
  predictionCommitment,
  userAchievement,
} from '../../../db/schema'
import { isSingleMatchStage } from '../../../shared/types/match'
import type { AchievementTier } from '#shared/types/achievements'
import { getLeaderboard } from '../leaderboard/service'
import { hasDecidedFinal } from '../awards/service'
import {
  ACHIEVEMENTS,
  type AchievementDef,
  type AchievementMetric,
  COLLECTABLE_ACHIEVEMENTS,
  COLLECTOR_ACHIEVEMENT_KEY,
  isCollectable,
  tierForValue,
  type UserAchievementStats,
} from './catalog'

// Pick-time windows, shared by the batch aggregate and the save-time grant so the
// two never drift. sql.raw only ever interpolates these numeric constants (never
// user input), so there is no injection surface.
const EARLY_BIRD_HOURS = 24
const DEADLINE_MINUTES = 5
const NIGHT_OWL_UTC_HOUR = 4
const earlyBirdCount = () =>
  sql<number>`count(*) filter (where ${prediction.createdAt} <= ${match.kickoffTime} - ${sql.raw(`interval '${EARLY_BIRD_HOURS} hours'`)})`.mapWith(
    Number,
  )
const nightOwlCount = () =>
  sql<number>`count(*) filter (where extract(hour from ${prediction.createdAt} at time zone 'UTC') < ${NIGHT_OWL_UTC_HOUR})`.mapWith(
    Number,
  )
const deadlineDancerCount = () =>
  sql<number>`count(*) filter (where ${prediction.createdAt} >= ${match.kickoffTime} - ${sql.raw(`interval '${DEADLINE_MINUTES} minutes'`)})`.mapWith(
    Number,
  )

// The behavioral badges earned by the ACT of saving a pick (not by any match
// result): grant them at save time, not just at finalize. Their keys and metrics.
const PICK_TIME_BADGES = ['early-bird', 'night-owl', 'deadline-dancer'] as const

// Wooden Spoon only judges players who saw the tournament through: you must have
// predicted at least this share of its matches to be eligible for "dead last".
// Someone who gave up after a game or two is a quitter, not the loser of the contest.
const WOODEN_SPOON_MIN_SHARE = 0.5

const TIER_RANK: Record<AchievementTier, number> = { BRONZE: 1, SILVER: 2, GOLD: 3, DIAMOND: 4 }
const tierRank = (t: AchievementTier | null): number => (t ? TIER_RANK[t] : 0)

// The stats map value: every badge metric, plus the current (ongoing) streak
// values the cabinet renders next to the best. The cur* fields are display-only
// (no badge grades on them), so they live here rather than in the metric union.
export interface AchievementStats extends UserAchievementStats {
  curExactStreak: number
  curScoringStreak: number
  curMissStreak: number
}

const ZERO_STATS: AchievementStats = {
  predictions: 0,
  exact: 0,
  points: 0,
  crowdHits: 0,
  jokerExact: 0,
  earlyBird: 0,
  nightOwl: 0,
  deadlineDancer: 0,
  exactStreak: 0,
  scoringStreak: 0,
  missStreak: 0,
  perfectRounds: 0,
  openingAct: 0,
  finalExact: 0,
  boreDraw: 0,
  goalRush: 0,
  bogeyTeam: 0,
  setAndForget: 0,
  completed: 0,
  championOracle: 0,
  goldenTouch: 0,
  underdog: 0,
  loneWolf: 0,
  trophies: 0,
  podium: 0,
  woodenSpoon: 0,
  teamsRead: 0,
  championPath: 0,
  groupPerfect: 0,
  curExactStreak: 0,
  curScoringStreak: 0,
  curMissStreak: 0,
}

// Longest run of consecutive EXACT / non-MISS / MISS predictions, over the user's
// scored picks in kickoff order. The MISS run backs the "bad" cold-streak badge.
// Also returns the CURRENT (trailing) run of each - the ongoing streak the player
// is on right now - which the cabinet shows alongside the best while a streak badge
// is still climbing.
export interface StreakResult {
  exactStreak: number
  scoringStreak: number
  missStreak: number
  curExactStreak: number
  curScoringStreak: number
  curMissStreak: number
}
function streaks(rows: { tier: string; kickoff: Date; matchId: string }[]): StreakResult {
  // Tiebreak equal kickoffs by matchId so simultaneous fixtures give a stable streak.
  const ordered = [...rows].sort(
    (a, b) => a.kickoff.getTime() - b.kickoff.getTime() || (a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0),
  )
  let exact = 0
  let scoring = 0
  let miss = 0
  let bestExact = 0
  let bestScoring = 0
  let bestMiss = 0
  for (const r of ordered) {
    exact = r.tier === 'EXACT' ? exact + 1 : 0
    scoring = r.tier === 'MISS' ? 0 : scoring + 1
    miss = r.tier === 'MISS' ? miss + 1 : 0
    bestExact = Math.max(bestExact, exact)
    bestScoring = Math.max(bestScoring, scoring)
    bestMiss = Math.max(bestMiss, miss)
  }
  // The loop's trailing counters ARE the current ongoing runs.
  return {
    exactStreak: bestExact,
    scoringStreak: bestScoring,
    missStreak: bestMiss,
    curExactStreak: exact,
    curScoringStreak: scoring,
    curMissStreak: miss,
  }
}

// Rounds where the user called every match in the round EXACT. Only fully-scored
// (complete) rounds count: mid-tournament a round has just its early matches
// scored, and one exact of those would falsely read as "perfect" before the rest
// are even played (see completeRounds in computeAchievementStats). The final and
// third-place are one-match rounds - a "perfect round" there is just a single
// exact (grand-finale already rewards the final), so they are excluded from Flawless.
function perfectRounds(
  rows: { roundId: string; tier: string; stage: string }[],
  roundScored: Map<string, number>,
  completeRounds: Set<string>,
): number {
  const byRound = new Map<string, { scored: number; exact: number; stage: string }>()
  for (const r of rows) {
    const agg = byRound.get(r.roundId) ?? { scored: 0, exact: 0, stage: r.stage }
    agg.scored += 1
    if (r.tier === 'EXACT') agg.exact += 1
    byRound.set(r.roundId, agg)
  }
  let count = 0
  for (const [roundId, agg] of byRound) {
    if (isSingleMatchStage(agg.stage)) continue
    if (!completeRounds.has(roundId)) continue
    if (agg.scored > 0 && agg.scored === agg.exact && agg.scored === (roundScored.get(roundId) ?? 0)) count += 1
  }
  return count
}

// Set and Forget: predicted every match of a complete multi-match round and never
// edited any of those picks (each has a single commitment-ledger entry). Discipline,
// not accuracy. Only complete rounds count (same partial-round guard as Flawless);
// single-match rounds are excluded (one untouched pick is no feat).
function untouchedRound(
  rows: { roundId: string; stage: string; predictionId: string }[],
  roundScored: Map<string, number>,
  completeRounds: Set<string>,
  untouched: Set<string>,
): number {
  const byRound = new Map<string, { ids: string[]; stage: string }>()
  for (const r of rows) {
    const g = byRound.get(r.roundId) ?? { ids: [], stage: r.stage }
    g.ids.push(r.predictionId)
    byRound.set(r.roundId, g)
  }
  for (const [roundId, g] of byRound) {
    if (isSingleMatchStage(g.stage)) continue
    if (!completeRounds.has(roundId)) continue
    const total = roundScored.get(roundId) ?? 0
    if (total > 0 && g.ids.length === total && g.ids.every((id) => untouched.has(id))) return 1
  }
  return 0
}

// Nemesis: the most EXACT calls landed on any single team's matches (a team is
// counted for both the home and away sides of each exact pick).
function bogeyTeam(rows: { tier: string; homeTeamCode: string | null; awayTeamCode: string | null }[]): number {
  const byTeam = new Map<string, number>()
  for (const r of rows) {
    if (r.tier !== 'EXACT') continue
    for (const code of [r.homeTeamCode, r.awayTeamCode]) {
      if (!code) continue
      byTeam.set(code, (byTeam.get(code) ?? 0) + 1)
    }
  }
  let max = 0
  for (const n of byTeam.values()) max = Math.max(max, n)
  return max
}

// Form Reader: how many distinct teams the user called the OUTCOME of (non-MISS:
// EXACT, DIFF or OUTCOME) at least OUTCOMES_PER_TEAM times, counting a team for both
// the home and away side of each of its matches (mirrors nemesis). Grades 3/5/7 teams.
const OUTCOMES_PER_TEAM = 5
function teamsRead(rows: { tier: string; homeTeamCode: string | null; awayTeamCode: string | null }[]): number {
  const byTeam = new Map<string, number>()
  for (const r of rows) {
    if (r.tier === 'MISS') continue
    for (const code of [r.homeTeamCode, r.awayTeamCode]) {
      if (!code) continue
      byTeam.set(code, (byTeam.get(code) ?? 0) + 1)
    }
  }
  let n = 0
  for (const c of byTeam.values()) if (c >= OUTCOMES_PER_TEAM) n += 1
  return n
}

// Group Guru: 1 if the user called the OUTCOME (non-MISS) of every match in at least
// one COMPLETE group. completeGroups maps a fully-scored group's name to its match
// count; the user qualifies when their non-MISS group picks cover all of them (a
// missing pick or a MISS drops the count below the total). Incomplete groups are
// excluded so a group with games still to play can't read as perfect off its early
// results (the group analog of the perfect-round completeRounds guard).
function groupPerfect(
  rows: { stage: string; groupName: string | null; tier: string }[],
  completeGroups: Map<string, number>,
): number {
  const byGroup = new Map<string, number>()
  for (const r of rows) {
    if (r.stage !== 'GROUP' || !r.groupName || r.tier === 'MISS') continue
    byGroup.set(r.groupName, (byGroup.get(r.groupName) ?? 0) + 1)
  }
  // Count how many complete groups the user called in full - the graded tiers
  // reward reading two or three whole groups, not just one.
  let count = 0
  for (const [g, total] of completeGroups) if ((byGroup.get(g) ?? 0) === total) count += 1
  return count
}

// The champion's whole run: 1 (Gold) = every one of the champion's scored matches
// is covered by a non-MISS pick; 2 (Diamond) = every one is EXACT. Any missing
// pick, any MISS, or no champion set at all = 0.
function championPath(
  rows: { matchId: string; tier: string }[],
  championMatchIds: Set<string>,
  championMatchCount: number,
): number {
  if (championMatchCount === 0) return 0
  const champ = rows.filter((r) => championMatchIds.has(r.matchId))
  const nonMiss = champ.filter((r) => r.tier !== 'MISS').length
  if (nonMiss !== championMatchCount) return 0
  return champ.filter((r) => r.tier === 'EXACT').length === championMatchCount ? 2 : 1
}

// Derive every user's achievement metrics for a competition from the settled
// prediction/leaderboard/pick state. Pure read; the evaluation writes.
export async function computeAchievementStats(
  db: AppDatabase,
  competitionId: string,
): Promise<Map<string, AchievementStats>> {
  const inComp = and(eq(match.id, prediction.matchId), eq(match.competitionId, competitionId))

  // Final-standing badges (completionist, podium, wooden-spoon) only settle once the
  // tournament is actually over - the same decided-FINAL gate the trophies use.
  // Without this, "predicted every match" fires mid-tournament off the matches
  // scored so far, and "finished last" would flip every finalize tick.
  const tournamentDone = await hasDecidedFinal(db, competitionId)

  // The tournament opener: the earliest-kickoff match that has been scored. Calling
  // it EXACT earns opening-act (min match id breaks a same-kickoff tie, matching the
  // streak ordering).
  const [opener] = await db
    .select({ id: match.id })
    .from(match)
    .where(and(eq(match.competitionId, competitionId), eq(match.scoringState, 'SCORED')))
    .orderBy(match.kickoffTime, match.id)
    .limit(1)
  const openerId = opener?.id ?? null

  const agg = await db
    .select({
      userId: prediction.userId,
      predictions: sql<number>`count(*)`.mapWith(Number),
      exact: sql<number>`count(*) filter (where ${prediction.baseTier} = 'EXACT')`.mapWith(Number),
      points: sql<number>`coalesce(sum(${prediction.totalPoints}), 0)`.mapWith(Number),
      crowdHits: sql<number>`count(*) filter (where ${prediction.bonusPoints} > 0)`.mapWith(Number),
      jokerExact: sql<number>`count(*) filter (where ${prediction.isJoker} and ${prediction.baseTier} = 'EXACT')`.mapWith(
        Number,
      ),
      earlyBird: earlyBirdCount(),
      nightOwl: nightOwlCount(),
      deadlineDancer: deadlineDancerCount(),
      finalExact:
        sql<number>`count(*) filter (where ${prediction.baseTier} = 'EXACT' and ${match.stage} = 'FINAL')`.mapWith(Number),
      boreDraw:
        sql<number>`count(*) filter (where ${prediction.baseTier} = 'EXACT' and ${prediction.homeGoals} = 0 and ${prediction.awayGoals} = 0)`.mapWith(
          Number,
        ),
      goalRush:
        sql<number>`count(*) filter (where ${prediction.baseTier} = 'EXACT' and ${prediction.homeGoals} + ${prediction.awayGoals} >= 5)`.mapWith(
          Number,
        ),
    })
    .from(prediction)
    .innerJoin(match, inComp)
    .groupBy(prediction.userId)

  const scoredRows = await db
    .select({
      predictionId: prediction.id,
      userId: prediction.userId,
      matchId: prediction.matchId,
      roundId: prediction.roundId,
      tier: prediction.baseTier,
      kickoff: match.kickoffTime,
      stage: match.stage,
      groupName: match.groupName,
      homeTeamCode: match.homeTeamCode,
      awayTeamCode: match.awayTeamCode,
    })
    .from(prediction)
    .innerJoin(match, inComp)
    .where(isNotNull(prediction.baseTier))
    .orderBy(match.kickoffTime, prediction.matchId)

  // Per round: how many matches it has, and how many are scored. One grouped scan
  // yields both the scored counts (Flawless / Set-and-Forget need every scored match
  // of a round predicted) and which rounds are "complete" - every match scored.
  // Completeness is the guard that keeps a partially-played round from counting off
  // its early matches alone: mid-tournament a knockout round has one match scored and
  // the rest still scheduled, and a lone exact there must not read as a perfect round.
  // (A match that never scores - voided - keeps its round from ever completing;
  // acceptable for these rare high-bar badges.)
  const roundTotals = await db
    .select({
      roundId: match.roundId,
      total: sql<number>`count(*)`.mapWith(Number),
      scored: sql<number>`count(*) filter (where ${match.scoringState} = 'SCORED')`.mapWith(Number),
    })
    .from(match)
    .where(eq(match.competitionId, competitionId))
    .groupBy(match.roundId)
  const roundScored = new Map(roundTotals.filter((r) => r.scored > 0).map((r) => [r.roundId, r.scored]))
  const totalScored = roundTotals.reduce((s, r) => s + r.scored, 0)
  const completeRounds = new Set(roundTotals.filter((r) => r.scored === r.total).map((r) => r.roundId))

  // Complete groups (Group Guru): a named group whose every match is scored, and how
  // many matches it holds. Only complete groups can be "perfect" - see groupPerfect.
  const groupTotals = await db
    .select({
      groupName: match.groupName,
      total: sql<number>`count(*)`.mapWith(Number),
      scored: sql<number>`count(*) filter (where ${match.scoringState} = 'SCORED')`.mapWith(Number),
    })
    .from(match)
    .where(and(eq(match.competitionId, competitionId), eq(match.stage, 'GROUP'), isNotNull(match.groupName)))
    .groupBy(match.groupName)
  // groupTotals only holds named GROUP rows (isNotNull filter), each with >=1 match,
  // so a group is complete exactly when every one of its matches is scored.
  const completeGroups = new Map(
    groupTotals.filter((r) => r.scored === r.total).map((r) => [r.groupName as string, r.total]),
  )

  // The tournament champion (Champion's Path): the winner of the decided, scored final.
  // Its whole set of scored matches is the denominator - a user earns the badge by
  // calling the outcome (non-MISS) of every one of them. The final itself must be
  // SCORED, not merely FINISHED-with-winner: the denominator below filters on
  // scoringState='SCORED', so resolving the champion in the sync -> finalize window
  // (winner written, final not yet scored - tournamentDone is already true there) would
  // drop the final from the denominator and grant the badge without the final being
  // called. Requiring the final scored keeps it in the set. Empty until then.
  const [finalMatch] = tournamentDone
    ? await db
        .select({ winner: match.winner, home: match.homeTeamCode, away: match.awayTeamCode })
        .from(match)
        .where(
          and(
            eq(match.competitionId, competitionId),
            eq(match.stage, 'FINAL'),
            eq(match.scoringState, 'SCORED'),
            inArray(match.winner, ['HOME', 'AWAY']),
          ),
        )
        .orderBy(match.id)
        .limit(1)
    : []
  const championCode = finalMatch ? (finalMatch.winner === 'HOME' ? finalMatch.home : finalMatch.away) : null
  const championMatchIds = new Set<string>()
  if (championCode) {
    const champMatches = await db
      .select({ id: match.id })
      .from(match)
      .where(
        and(
          eq(match.competitionId, competitionId),
          eq(match.scoringState, 'SCORED'),
          or(eq(match.homeTeamCode, championCode), eq(match.awayTeamCode, championCode)),
        ),
      )
    for (const m of champMatches) championMatchIds.add(m.id)
  }
  const championMatchCount = championMatchIds.size

  // How many commitment-ledger entries each prediction in this competition has: one
  // entry = never edited (backs set-and-forget). The ledger appends only on a real
  // pick change, so a single entry means the pick was placed once and left alone.
  const commitCounts = await db
    .select({ predictionId: predictionCommitment.predictionId, n: sql<number>`count(*)`.mapWith(Number) })
    .from(predictionCommitment)
    .innerJoin(prediction, eq(prediction.id, predictionCommitment.predictionId))
    .innerJoin(match, inComp)
    .groupBy(predictionCommitment.predictionId)
  const untouched = new Set(commitCounts.filter((c) => c.n === 1).map((c) => c.predictionId))

  // Matches with a single EXACT prediction: that lone user gets loneWolf credit.
  const lone = await db
    .select({ userId: sql<string>`min(${prediction.userId})` })
    .from(prediction)
    .innerJoin(match, inComp)
    .where(eq(prediction.baseTier, 'EXACT'))
    .groupBy(prediction.matchId)
    .having(sql`count(*) = 1`)

  const champs = await db
    .select({ userId: championPick.userId, rank: championPick.fifaRank })
    .from(championPick)
    .where(and(eq(championPick.competitionId, competitionId), gt(championPick.awardedPoints, 0)))

  const bests = await db
    .select({ userId: bestScorerPick.userId })
    .from(bestScorerPick)
    .where(and(eq(bestScorerPick.competitionId, competitionId), gt(bestScorerPick.awardedPoints, 0)))

  const trophyRows = await db
    .select({ userId: competitionAward.userId, n: sql<number>`count(*)`.mapWith(Number) })
    .from(competitionAward)
    .where(eq(competitionAward.competitionId, competitionId))
    .groupBy(competitionAward.userId)

  const board = await getLeaderboard(db, { competitionId, includeHidden: true, includePrivate: true, limit: 100_000 })
  const podiumUsers = new Set(board.filter((r) => r.rank <= 3 && r.totalPoints > 0).map((r) => r.userId))
  // Dead last: the worst rank AMONG PLAYERS WHO ACTUALLY PLAYED. getLeaderboard scans
  // the whole user table, so every non-participant sits at 0 points on the bottom rank;
  // and someone who bailed after a game or two is a quitter, not the wooden-spoon loser.
  // So qualify on "predicted at least WOODEN_SPOON_MIN_SHARE of the tournament", then
  // take the worst rank among the qualified (computed over them, not all participants,
  // so a quitter ranked below the genuine last-placer doesn't steal - and void - the
  // badge). Require more than one qualifier for a real contest. Gated on tournamentDone
  // below so it settles once, at the end.
  // Count each user's SCORED predictions, not every prediction they entered, so the
  // eligibility numerator and the totalScored denominator both range over matches that
  // actually counted - consistent even if some matches never scored (voided/abandoned)
  // by the time the final is decided.
  const scoredCount = new Map<string, number>()
  for (const r of scoredRows) scoredCount.set(r.userId, (scoredCount.get(r.userId) ?? 0) + 1)
  const minPredictions = totalScored * WOODEN_SPOON_MIN_SHARE
  const qualified = new Set([...scoredCount].filter(([, n]) => n >= minPredictions).map(([id]) => id))
  const qualifiedRanks = board.filter((r) => qualified.has(r.userId))
  const lastRank = qualifiedRanks.reduce((m, r) => Math.max(m, r.rank), 0)
  const woodenSpoonUsers = new Set(
    qualifiedRanks.length > 1 ? qualifiedRanks.filter((r) => r.rank === lastRank).map((r) => r.userId) : [],
  )

  // Fold the per-user, per-row work in JS.
  type ScoredRow = {
    predictionId: string
    roundId: string
    tier: string
    kickoff: Date
    matchId: string
    stage: string
    groupName: string | null
    homeTeamCode: string | null
    awayTeamCode: string | null
  }
  const scoredByUser = new Map<string, ScoredRow[]>()
  for (const r of scoredRows) {
    const arr = scoredByUser.get(r.userId) ?? []
    arr.push({
      predictionId: r.predictionId,
      roundId: r.roundId,
      tier: r.tier as string,
      kickoff: r.kickoff as Date,
      matchId: r.matchId,
      stage: r.stage as string,
      groupName: r.groupName,
      homeTeamCode: r.homeTeamCode,
      awayTeamCode: r.awayTeamCode,
    })
    scoredByUser.set(r.userId, arr)
  }
  const loneByUser = new Map<string, number>()
  for (const r of lone) loneByUser.set(r.userId, (loneByUser.get(r.userId) ?? 0) + 1)

  const ids = new Set<string>()
  for (const r of agg) ids.add(r.userId)
  for (const r of champs) ids.add(r.userId)
  for (const r of bests) ids.add(r.userId)
  for (const r of trophyRows) ids.add(r.userId)
  for (const id of podiumUsers) ids.add(id)

  const aggByUser = new Map(agg.map((r) => [r.userId, r]))
  const trophyByUser = new Map(trophyRows.map((r) => [r.userId, r.n]))
  const championByUser = new Map(champs.map((r) => [r.userId, r.rank]))
  const bestSet = new Set(bests.map((r) => r.userId))

  const out = new Map<string, AchievementStats>()
  for (const userId of ids) {
    const a = aggByUser.get(userId)
    const scored = scoredByUser.get(userId) ?? []
    const { exactStreak, scoringStreak, missStreak, curExactStreak, curScoringStreak, curMissStreak } = streaks(scored)
    const isChampion = championByUser.has(userId)
    const rank = championByUser.get(userId) ?? null
    out.set(userId, {
      ...ZERO_STATS,
      predictions: a?.predictions ?? 0,
      exact: a?.exact ?? 0,
      points: a?.points ?? 0,
      crowdHits: a?.crowdHits ?? 0,
      jokerExact: a?.jokerExact ?? 0,
      earlyBird: a?.earlyBird ?? 0,
      nightOwl: a?.nightOwl ?? 0,
      deadlineDancer: a?.deadlineDancer ?? 0,
      finalExact: a?.finalExact ?? 0,
      boreDraw: a?.boreDraw ?? 0,
      goalRush: a?.goalRush ?? 0,
      bogeyTeam: bogeyTeam(scored),
      setAndForget: untouchedRound(scored, roundScored, completeRounds, untouched),
      exactStreak,
      scoringStreak,
      missStreak,
      curExactStreak,
      curScoringStreak,
      curMissStreak,
      perfectRounds: perfectRounds(scored, roundScored, completeRounds),
      openingAct: openerId && scored.some((r) => r.matchId === openerId && r.tier === 'EXACT') ? 1 : 0,
      // Predicted every match, but only credited once the tournament is over.
      completed: tournamentDone && totalScored > 0 && scored.length === totalScored ? 1 : 0,
      championOracle: isChampion ? 1 : 0,
      goldenTouch: bestSet.has(userId) ? 1 : 0,
      // Underdog = a winning champion pick outside the FIFA top 15 (or an unranked
      // team that fell back to the flat bonus). A reachable long shot, not rank 41+.
      underdog: isChampion && (rank === null || rank >= 16) ? 1 : 0,
      loneWolf: loneByUser.get(userId) ?? 0,
      trophies: trophyByUser.get(userId) ?? 0,
      podium: tournamentDone && podiumUsers.has(userId) ? 1 : 0,
      // Dead last, once the tournament is over. Only for players who actually
      // predicted (a?.predictions), never someone who merely holds a champion pick.
      // Eligibility (played enough) is already baked into woodenSpoonUsers.
      woodenSpoon: tournamentDone && woodenSpoonUsers.has(userId) ? 1 : 0,
      teamsRead: teamsRead(scored),
      // Called the whole champion's run: 1 = every scored champion match covered by a
      // non-MISS pick (Gold), 2 = every one called EXACT (Diamond). 0 if any is missing,
      // a MISS, or there's no decided final yet.
      championPath: championPath(scored, championMatchIds, championMatchCount),
      groupPerfect: groupPerfect(scored, completeGroups),
    })
  }
  return out
}

export interface UnlockedAchievement {
  userId: string
  competitionId: string | null
  key: string
  tier: AchievementTier
}

// Grade one def for one user against the current metric value and upsert the row,
// pushing to `newly` when the badge is first earned or graded up. Idempotent: an
// unchanged value is a no-op, a lower value only refreshes progress (tier is a
// high-water mark). Shared by the finalize batch and the save-time pick-time grant.
type UserAchievementRow = typeof userAchievement.$inferSelect
async function applyAchievementTier(
  db: AppDatabase,
  ex: UserAchievementRow | undefined,
  userId: string,
  competitionId: string,
  def: AchievementDef,
  value: number,
  newly: UnlockedAchievement[],
): Promise<void> {
  const tier = tierForValue(def.tiers, value)
  if (!tier) {
    // Below every threshold. Normally nothing to do (an unearned badge has no row).
    // But a `revocable` badge reflects a current-state truth, not a lifetime peak: if
    // it no longer holds - mis-granted by a bug, or the state that earned it was undone
    // (a tournament rewound so its final is no longer decided) - the stale row is
    // deleted, so it self-heals on the next tick. Non-revocable badges (streaks,
    // cumulative counts) stay put, shielded from transient rescore dips. Losing a badge
    // is silent - no notification.
    if (def.revocable && ex) await db.delete(userAchievement).where(eq(userAchievement.id, ex.id))
    return
  }
  if (!ex) {
    await db.insert(userAchievement).values({ userId, competitionId, key: def.key, tier, progress: value })
    newly.push({ userId, competitionId, key: def.key, tier })
  } else if (tierRank(tier) > tierRank(ex.tier)) {
    await db.update(userAchievement).set({ tier, progress: value }).where(eq(userAchievement.id, ex.id))
    newly.push({ userId, competitionId, key: def.key, tier })
  } else if (def.revocable && tierRank(tier) < tierRank(ex.tier)) {
    // A revocable badge tracks a current-state truth (like the full revoke above),
    // so a rescore that drops the metric to a lower band demotes the tier too -
    // silently, no re-notification. Non-revocable badges keep their high-water tier.
    await db.update(userAchievement).set({ tier, progress: value }).where(eq(userAchievement.id, ex.id))
  } else if (ex.progress !== value) {
    // Otherwise tier is a high-water mark: a rescore that lowers the metric refreshes
    // progress but never demotes the badge (grading up is handled above).
    await db.update(userAchievement).set({ progress: value }).where(eq(userAchievement.id, ex.id))
  }
}

// Grant the pick-time behavioral badges (early-bird / night-owl / deadline-dancer)
// the instant a pick is saved, instead of waiting for the next scored finalize
// tick. These badges are earned by the act of predicting (createdAt vs kickoff),
// so they are known at save time - the finalize batch stays as the backfill.
// Idempotent and notify-safe: a badge already held is never re-granted.
export async function evaluatePickTimeAchievements(
  db: AppDatabase,
  competitionId: string,
  userId: string,
): Promise<UnlockedAchievement[]> {
  const [counts] = await db
    .select({
      'early-bird': earlyBirdCount(),
      'night-owl': nightOwlCount(),
      'deadline-dancer': deadlineDancerCount(),
    })
    .from(prediction)
    .innerJoin(match, and(eq(match.id, prediction.matchId), eq(match.competitionId, competitionId)))
    .where(eq(prediction.userId, userId))

  const existing = await db
    .select()
    .from(userAchievement)
    .where(
      and(
        eq(userAchievement.userId, userId),
        eq(userAchievement.competitionId, competitionId),
        inArray(userAchievement.key, [...PICK_TIME_BADGES]),
      ),
    )
  const exByKey = new Map(existing.map((e) => [e.key, e]))

  const newly: UnlockedAchievement[] = []
  for (const key of PICK_TIME_BADGES) {
    const def = ACHIEVEMENTS.find((d) => d.key === key)
    if (!def) continue
    await applyAchievementTier(db, exByKey.get(key), userId, competitionId, def, counts?.[key] ?? 0, newly)
  }
  return newly
}

// Idempotent: evaluate every batch achievement for a competition and upsert the
// user_achievement rows. Returns the badges newly earned (or graded up) this run,
// so the caller can notify. Safe on every finalize tick.
export async function evaluateAchievements(db: AppDatabase, competitionId: string): Promise<UnlockedAchievement[]> {
  const stats = await computeAchievementStats(db, competitionId)
  const existing = await db.select().from(userAchievement).where(eq(userAchievement.competitionId, competitionId))
  const exByKey = new Map(existing.map((e) => [`${e.userId}:${e.key}`, e]))

  const newly: UnlockedAchievement[] = []
  for (const [userId, s] of stats) {
    let heldCount = 0
    for (const def of ACHIEVEMENTS) {
      const value = s[def.metric as AchievementMetric]
      const ex = exByKey.get(`${userId}:${def.key}`)
      // Held if it currently qualifies, or a prior row survives this run. A tier is a
      // high-water mark so a non-revocable badge stays held on a rescore-down; a
      // revocable one whose metric no longer meets any tier is about to be deleted, so
      // its stale row does not count. Only collectable (non-SHAME) badges feed the secret.
      const held = tierForValue(def.tiers, value) || (ex && !def.revocable)
      if (held && isCollectable(def)) heldCount += 1
      await applyAchievementTier(db, ex, userId, competitionId, def, value, newly)
    }
    // The hidden "collector" secret: earned every non-secret badge. Granted
    // globally (competitionId null), once, idempotently.
    if (heldCount === COLLECTABLE_ACHIEVEMENTS.length) {
      const granted = await grantAchievement(db, {
        userId,
        competitionId: null,
        key: COLLECTOR_ACHIEVEMENT_KEY,
        tier: 'GOLD',
      })
      if (granted) newly.push({ userId, competitionId: null, key: COLLECTOR_ACHIEVEMENT_KEY, tier: 'GOLD' })
    }
  }

  // Users who dropped out of the stats entirely - e.g. a reset wiped every prediction
  // they had - are never visited by the loop above, so `applyAchievementTier` never
  // gets the chance to revoke their now-baseless rows. Clear their revocable badges
  // here (their metrics are all zero now); non-revocable badges stay, high-water.
  const revocableKeys = new Set(ACHIEVEMENTS.filter((d) => d.revocable).map((d) => d.key))
  for (const row of existing) {
    if (stats.has(row.userId) || !revocableKeys.has(row.key)) continue
    await db.delete(userAchievement).where(eq(userAchievement.id, row.id))
  }
  return newly
}

// Grant a single achievement directly, idempotently. Used by event-driven,
// non-batch badges (the secret pony unlock). competitionId null = a global badge.
// Returns true only when the row is created (so the caller notifies once).
export async function grantAchievement(
  db: AppDatabase,
  opts: { userId: string; competitionId: string | null; key: string; tier?: AchievementTier },
): Promise<boolean> {
  const existing = await db
    .select({ id: userAchievement.id })
    .from(userAchievement)
    .where(
      and(
        eq(userAchievement.userId, opts.userId),
        opts.competitionId === null
          ? isNull(userAchievement.competitionId)
          : eq(userAchievement.competitionId, opts.competitionId),
        eq(userAchievement.key, opts.key),
      ),
    )
    .limit(1)
  if (existing.length > 0) return false

  await db.insert(userAchievement).values({
    userId: opts.userId,
    competitionId: opts.competitionId,
    key: opts.key,
    tier: opts.tier ?? 'BRONZE',
    progress: 1,
  })
  return true
}
