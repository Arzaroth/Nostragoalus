import { and, eq, gt, isNotNull, isNull, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { bestScorerPick, championPick, competitionAward, match, prediction, userAchievement } from '../../../db/schema'
import type { AchievementTier } from '#shared/types/achievements'
import { getLeaderboard } from '../leaderboard/service'
import {
  ACHIEVEMENTS,
  type AchievementMetric,
  tierForValue,
  type UserAchievementStats,
} from './catalog'

const TIER_RANK: Record<AchievementTier, number> = { BRONZE: 1, SILVER: 2, GOLD: 3 }
const tierRank = (t: AchievementTier | null): number => (t ? TIER_RANK[t] : 0)

const ZERO_STATS: UserAchievementStats = {
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
  perfectRounds: 0,
  completed: 0,
  championOracle: 0,
  goldenTouch: 0,
  underdog: 0,
  loneWolf: 0,
  trophies: 0,
  podium: 0,
}

// Longest run of consecutive EXACT / non-MISS predictions, over the user's scored
// picks in kickoff order.
function streaks(rows: { tier: string; kickoff: Date }[]): { exactStreak: number; scoringStreak: number } {
  const ordered = [...rows].sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())
  let exact = 0
  let scoring = 0
  let bestExact = 0
  let bestScoring = 0
  for (const r of ordered) {
    exact = r.tier === 'EXACT' ? exact + 1 : 0
    scoring = r.tier === 'MISS' ? 0 : scoring + 1
    bestExact = Math.max(bestExact, exact)
    bestScoring = Math.max(bestScoring, scoring)
  }
  return { exactStreak: bestExact, scoringStreak: bestScoring }
}

// Rounds where the user got every scored match in the round EXACT and left none
// of that round's scored matches unpredicted.
function perfectRounds(rows: { roundId: string; tier: string }[], roundScored: Map<string, number>): number {
  const byRound = new Map<string, { scored: number; exact: number }>()
  for (const r of rows) {
    const agg = byRound.get(r.roundId) ?? { scored: 0, exact: 0 }
    agg.scored += 1
    if (r.tier === 'EXACT') agg.exact += 1
    byRound.set(r.roundId, agg)
  }
  let count = 0
  for (const [roundId, agg] of byRound) {
    if (agg.scored > 0 && agg.scored === agg.exact && agg.scored === (roundScored.get(roundId) ?? 0)) count += 1
  }
  return count
}

// Derive every user's achievement metrics for a competition from the settled
// prediction/leaderboard/pick state. Pure read; the evaluation writes.
export async function computeAchievementStats(
  db: AppDatabase,
  competitionId: string,
): Promise<Map<string, UserAchievementStats>> {
  const inComp = and(eq(match.id, prediction.matchId), eq(match.competitionId, competitionId))

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
      earlyBird:
        sql<number>`count(*) filter (where ${prediction.createdAt} <= ${match.kickoffTime} - interval '24 hours')`.mapWith(
          Number,
        ),
      nightOwl: sql<number>`count(*) filter (where extract(hour from ${prediction.createdAt}) < 4)`.mapWith(Number),
      deadlineDancer:
        sql<number>`count(*) filter (where ${prediction.createdAt} >= ${match.kickoffTime} - interval '5 minutes')`.mapWith(
          Number,
        ),
    })
    .from(prediction)
    .innerJoin(match, inComp)
    .groupBy(prediction.userId)

  const scoredRows = await db
    .select({
      userId: prediction.userId,
      roundId: prediction.roundId,
      tier: prediction.baseTier,
      kickoff: match.kickoffTime,
    })
    .from(prediction)
    .innerJoin(match, inComp)
    .where(isNotNull(prediction.baseTier))

  const roundTotals = await db
    .select({ roundId: match.roundId, n: sql<number>`count(*)`.mapWith(Number) })
    .from(match)
    .where(and(eq(match.competitionId, competitionId), eq(match.scoringState, 'SCORED')))
    .groupBy(match.roundId)
  const roundScored = new Map(roundTotals.map((r) => [r.roundId, r.n]))
  const totalScored = roundTotals.reduce((s, r) => s + r.n, 0)

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

  // Fold the per-user, per-row work in JS.
  const scoredByUser = new Map<string, { roundId: string; tier: string; kickoff: Date }[]>()
  for (const r of scoredRows) {
    const arr = scoredByUser.get(r.userId) ?? []
    arr.push({ roundId: r.roundId, tier: r.tier as string, kickoff: r.kickoff as Date })
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

  const out = new Map<string, UserAchievementStats>()
  for (const userId of ids) {
    const a = aggByUser.get(userId)
    const scored = scoredByUser.get(userId) ?? []
    const { exactStreak, scoringStreak } = streaks(scored)
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
      exactStreak,
      scoringStreak,
      perfectRounds: perfectRounds(scored, roundScored),
      completed: totalScored > 0 && scored.length === totalScored ? 1 : 0,
      championOracle: isChampion ? 1 : 0,
      goldenTouch: bestSet.has(userId) ? 1 : 0,
      // Underdog = a winning champion pick that was a long shot (rank 41+, or an
      // unranked team that fell back to the flat bonus).
      underdog: isChampion && (rank === null || rank >= 41) ? 1 : 0,
      loneWolf: loneByUser.get(userId) ?? 0,
      trophies: trophyByUser.get(userId) ?? 0,
      podium: podiumUsers.has(userId) ? 1 : 0,
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

// Idempotent: evaluate every batch achievement for a competition and upsert the
// user_achievement rows. Returns the badges newly earned (or graded up) this run,
// so the caller can notify. Safe on every finalize tick.
export async function evaluateAchievements(db: AppDatabase, competitionId: string): Promise<UnlockedAchievement[]> {
  const stats = await computeAchievementStats(db, competitionId)
  const existing = await db.select().from(userAchievement).where(eq(userAchievement.competitionId, competitionId))
  const exByKey = new Map(existing.map((e) => [`${e.userId}:${e.key}`, e]))

  const newly: UnlockedAchievement[] = []
  for (const [userId, s] of stats) {
    for (const def of ACHIEVEMENTS) {
      const value = s[def.metric as AchievementMetric]
      const tier = tierForValue(def.tiers, value)
      if (!tier) continue
      const ex = exByKey.get(`${userId}:${def.key}`)
      if (!ex) {
        await db.insert(userAchievement).values({ userId, competitionId, key: def.key, tier, progress: value })
        newly.push({ userId, competitionId, key: def.key, tier })
      } else if (tierRank(tier) > tierRank(ex.tier)) {
        await db.update(userAchievement).set({ tier, progress: value }).where(eq(userAchievement.id, ex.id))
        newly.push({ userId, competitionId, key: def.key, tier })
      } else if (ex.progress !== value || ex.tier !== tier) {
        await db.update(userAchievement).set({ tier, progress: value }).where(eq(userAchievement.id, ex.id))
      }
    }
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
