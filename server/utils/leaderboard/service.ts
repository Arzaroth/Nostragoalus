import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { match, prediction, user } from '../../../db/schema'

export interface LeaderboardRow {
  rank: number
  userId: string
  displayName: string
  totalPoints: number
  exactCount: number
  outcomeCount: number
  gdCount: number
}

// Aggregates are scoped to a single competition: predictions are joined to their
// match, and only rows whose match belongs to `competitionId` are counted.
const totalPoints = sql<number>`coalesce(sum(${prediction.totalPoints}) filter (where ${match.id} is not null), 0)`
const exactCount = sql<number>`count(*) filter (where ${match.id} is not null and ${prediction.baseTier} = 'EXACT')`
const outcomeCount = sql<number>`count(*) filter (where ${match.id} is not null and ${prediction.baseTier} in ('EXACT', 'DIFF', 'OUTCOME'))`
const gdCount = sql<number>`count(*) filter (where ${match.id} is not null and ${prediction.baseTier} in ('EXACT', 'DIFF'))`

export async function getLeaderboard(
  db: AppDatabase,
  opts: { competitionId: string; limit?: number; offset?: number },
): Promise<LeaderboardRow[]> {
  const limit = opts.limit ?? 100
  const offset = opts.offset ?? 0

  const rows = await db
    .select({
      userId: user.id,
      displayName: user.name,
      totalPoints: totalPoints.mapWith(Number),
      exactCount: exactCount.mapWith(Number),
      outcomeCount: outcomeCount.mapWith(Number),
      gdCount: gdCount.mapWith(Number),
    })
    .from(user)
    .leftJoin(prediction, and(eq(prediction.userId, user.id), isNotNull(prediction.totalPoints)))
    .leftJoin(match, and(eq(match.id, prediction.matchId), eq(match.competitionId, opts.competitionId)))
    .groupBy(user.id, user.name, user.createdAt)
    .orderBy(desc(totalPoints), desc(exactCount), desc(outcomeCount), desc(gdCount), asc(user.createdAt), asc(user.id))
    .limit(limit)
    .offset(offset)

  return rows.map((row, index) => ({ rank: offset + index + 1, ...row }))
}
