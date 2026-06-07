import { and, eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { leaderboardRank } from '../../../db/schema'
import { getLeaderboard } from './service'

// Persist the current ranks; when one changes we remember the previous rank so
// the leaderboard can show movement arrows until the next change.
export async function updateRankSnapshots(db: AppDatabase, competitionId: string): Promise<void> {
  const board = await getLeaderboard(db, { competitionId, limit: 1000 })
  const existing = await db.select().from(leaderboardRank).where(eq(leaderboardRank.competitionId, competitionId))
  const byUser = new Map(existing.map((r) => [r.userId, r]))

  for (const row of board) {
    const prev = byUser.get(row.userId)
    if (!prev) {
      await db.insert(leaderboardRank).values({ competitionId, userId: row.userId, rank: row.rank })
    } else if (prev.rank !== row.rank) {
      await db
        .update(leaderboardRank)
        .set({ rank: row.rank, prevRank: prev.rank, updatedAt: new Date() })
        .where(and(eq(leaderboardRank.competitionId, competitionId), eq(leaderboardRank.userId, row.userId)))
    }
  }
}

export async function getRankMovements(db: AppDatabase, competitionId: string): Promise<Map<string, number>> {
  const rows = await db.select().from(leaderboardRank).where(eq(leaderboardRank.competitionId, competitionId))
  const movements = new Map<string, number>()
  for (const r of rows) {
    if (r.prevRank != null && r.prevRank !== r.rank) movements.set(r.userId, r.prevRank - r.rank)
  }
  return movements
}
