import { and, eq, isNotNull, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { championPick, match, prediction, user } from '../../../db/schema'

export interface LeaderboardRow {
  rank: number
  userId: string
  displayName: string
  totalPoints: number
  predictionPoints: number
  championPoints: number
  exactCount: number
  outcomeCount: number
  gdCount: number
}

// Prediction aggregates are scoped to the competition via the match join.
const predPoints = sql<number>`coalesce(sum(${prediction.totalPoints}) filter (where ${match.id} is not null), 0)`
const exactCount = sql<number>`count(*) filter (where ${match.id} is not null and ${prediction.baseTier} = 'EXACT')`
const outcomeCount = sql<number>`count(*) filter (where ${match.id} is not null and ${prediction.baseTier} in ('EXACT', 'DIFF', 'OUTCOME'))`
const gdCount = sql<number>`count(*) filter (where ${match.id} is not null and ${prediction.baseTier} in ('EXACT', 'DIFF'))`

export async function getLeaderboard(
  db: AppDatabase,
  opts: { competitionId: string; limit?: number; offset?: number },
): Promise<LeaderboardRow[]> {
  const limit = opts.limit ?? 100
  const offset = opts.offset ?? 0

  const base = await db
    .select({
      userId: user.id,
      displayName: user.name,
      joinedAt: user.createdAt,
      predictionPoints: predPoints.mapWith(Number),
      exactCount: exactCount.mapWith(Number),
      outcomeCount: outcomeCount.mapWith(Number),
      gdCount: gdCount.mapWith(Number),
    })
    .from(user)
    .leftJoin(prediction, and(eq(prediction.userId, user.id), isNotNull(prediction.totalPoints)))
    .leftJoin(match, and(eq(match.id, prediction.matchId), eq(match.competitionId, opts.competitionId)))
    .groupBy(user.id, user.name, user.createdAt)

  const champions = await db
    .select({ userId: championPick.userId, points: championPick.awardedPoints })
    .from(championPick)
    .where(eq(championPick.competitionId, opts.competitionId))
  const championByUser = new Map(champions.map((c) => [c.userId, c.points]))

  // Champion points are merged in JS (a SQL join would fan out the per-prediction rows).
  const merged = base.map((r) => {
    const championPoints = championByUser.get(r.userId) ?? 0
    return { ...r, championPoints, totalPoints: r.predictionPoints + championPoints }
  })

  merged.sort(
    (a, b) =>
      b.totalPoints - a.totalPoints ||
      b.exactCount - a.exactCount ||
      b.outcomeCount - a.outcomeCount ||
      b.gdCount - a.gdCount ||
      (a.joinedAt < b.joinedAt ? -1 : a.joinedAt > b.joinedAt ? 1 : 0) ||
      (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
  )

  return merged.slice(offset, offset + limit).map((r, index) => ({
    rank: offset + index + 1,
    userId: r.userId,
    displayName: r.displayName,
    totalPoints: r.totalPoints,
    predictionPoints: r.predictionPoints,
    championPoints: r.championPoints,
    exactCount: r.exactCount,
    outcomeCount: r.outcomeCount,
    gdCount: r.gdCount,
  }))
}
