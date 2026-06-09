import { and, eq, isNotNull, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { championPick, match, prediction, user } from '../../../db/schema'

export interface LeaderboardRow {
  rank: number
  userId: string
  displayName: string
  image: string | null
  totalPoints: number
  predictionPoints: number
  championPoints: number
  championCode: string | null
  exactCount: number
  outcomeCount: number
  gdCount: number
}

// Prediction aggregates are scoped to the competition via the match join.
const predPoints = sql<number>`coalesce(sum(${prediction.totalPoints}) filter (where ${match.id} is not null), 0)`
const exactCount = sql<number>`count(*) filter (where ${match.id} is not null and ${prediction.baseTier} = 'EXACT')`
const outcomeCount = sql<number>`count(*) filter (where ${match.id} is not null and ${prediction.baseTier} in ('EXACT', 'DIFF', 'OUTCOME'))`
const gdCount = sql<number>`count(*) filter (where ${match.id} is not null and ${prediction.baseTier} in ('EXACT', 'DIFF'))`

export interface RankableRow {
  totalPoints: number
  exactCount: number
  outcomeCount: number
  gdCount: number
  joinedAt: Date
  userId: string
}

// Ranking ladder: points → exact → outcome → goal-diff → earliest joiner → userId.
export function compareLeaderboardRows(a: RankableRow, b: RankableRow): number {
  return (
    b.totalPoints - a.totalPoints ||
    b.exactCount - a.exactCount ||
    b.outcomeCount - a.outcomeCount ||
    b.gdCount - a.gdCount ||
    (a.joinedAt < b.joinedAt ? -1 : a.joinedAt > b.joinedAt ? 1 : 0) ||
    (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0)
  )
}

export async function getLeaderboard(
  db: AppDatabase,
  opts: { competitionId: string | null; limit?: number; offset?: number; includeHidden?: boolean },
): Promise<LeaderboardRow[]> {
  const limit = opts.limit ?? 100
  const offset = opts.offset ?? 0

  const base = await db
    .select({
      userId: user.id,
      displayName: user.name,
      image: user.image,
      joinedAt: user.createdAt,
      predictionPoints: predPoints.mapWith(Number),
      exactCount: exactCount.mapWith(Number),
      outcomeCount: outcomeCount.mapWith(Number),
      gdCount: gdCount.mapWith(Number),
    })
    .from(user)
    .leftJoin(prediction, and(eq(prediction.userId, user.id), isNotNull(prediction.totalPoints)))
    .leftJoin(
      match,
      opts.competitionId
        ? and(eq(match.id, prediction.matchId), eq(match.competitionId, opts.competitionId))
        : eq(match.id, prediction.matchId),
    )
    // includeHidden serves self-stats: a hidden user still sees their own points.
    .where(opts.includeHidden ? undefined : eq(user.hiddenFromLeaderboard, false))
    .groupBy(user.id, user.name, user.image, user.createdAt)

  const champions = await db
    .select({ userId: championPick.userId, points: championPick.awardedPoints, teamCode: championPick.teamCode })
    .from(championPick)
    .where(opts.competitionId ? eq(championPick.competitionId, opts.competitionId) : undefined)
  // Sum across competitions for the global view (a user may have several picks).
  const championByUser = new Map<string, number>()
  const championCodeByUser = new Map<string, string | null>()
  for (const c of champions) {
    championByUser.set(c.userId, (championByUser.get(c.userId) ?? 0) + c.points)
    // the flag only makes sense scoped to one competition
    if (opts.competitionId) championCodeByUser.set(c.userId, c.teamCode)
  }

  // Champion points are merged in JS (a SQL join would fan out the per-prediction rows).
  const merged = base.map((r) => {
    const championPoints = championByUser.get(r.userId) ?? 0
    return { ...r, championPoints, championCode: championCodeByUser.get(r.userId) ?? null, totalPoints: r.predictionPoints + championPoints }
  })

  merged.sort(compareLeaderboardRows)

  return merged.slice(offset, offset + limit).map((r, index) => ({
    rank: offset + index + 1,
    userId: r.userId,
    displayName: r.displayName,
    image: r.image,
    totalPoints: r.totalPoints,
    predictionPoints: r.predictionPoints,
    championPoints: r.championPoints,
    championCode: r.championCode,
    exactCount: r.exactCount,
    outcomeCount: r.outcomeCount,
    gdCount: r.gdCount,
  }))
}
