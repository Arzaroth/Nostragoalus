import { eq, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { leaderboardRank, league, leagueLeaderboardRank } from '../../../db/schema'
import { getLeaderboard, type LeaderboardRow } from './service'

// Persist the current ranks in one upsert; prevRank is set to the old rank only
// when the rank actually changed, so the leaderboard shows a movement arrow
// until the next change. One statement for the whole board (no per-row N+1).
async function writeRankSnapshots(
  db: AppDatabase,
  table: typeof leaderboardRank | typeof leagueLeaderboardRank,
  scopeColumn: typeof leaderboardRank.competitionId | typeof leagueLeaderboardRank.leagueId,
  scope: { competitionId: string } | { leagueId: string },
  board: LeaderboardRow[],
): Promise<void> {
  if (board.length === 0) return
  await db
    .insert(table)
    .values(board.map((row) => ({ ...scope, userId: row.userId, rank: row.rank })))
    .onConflictDoUpdate({
      target: [scopeColumn, table.userId],
      set: {
        rank: sql`excluded.rank`,
        // Keep the previous rank when nothing moved, so the arrow persists.
        prevRank: sql`case when ${table.rank} <> excluded.rank then ${table.rank} else ${table.prevRank} end`,
        updatedAt: new Date(),
      },
    })
}

function movementsFrom(rows: { userId: string; rank: number; prevRank: number | null }[]): Map<string, number> {
  const movements = new Map<string, number>()
  for (const r of rows) {
    if (r.prevRank != null && r.prevRank !== r.rank) movements.set(r.userId, r.prevRank - r.rank)
  }
  return movements
}

export async function updateRankSnapshots(db: AppDatabase, competitionId: string): Promise<void> {
  const board = await getLeaderboard(db, { competitionId, limit: 1000 })
  await writeRankSnapshots(db, leaderboardRank, leaderboardRank.competitionId, { competitionId }, board)
}

export async function getRankMovements(db: AppDatabase, competitionId: string): Promise<Map<string, number>> {
  const rows = await db.select().from(leaderboardRank).where(eq(leaderboardRank.competitionId, competitionId))
  return movementsFrom(rows)
}

// Same per league of the competition. Snapshots rank the full member set
// (private profiles included) - they're served to members/admins only.
export async function updateLeagueRankSnapshots(db: AppDatabase, competitionId: string): Promise<void> {
  const leagues = await db.select({ id: league.id }).from(league).where(eq(league.competitionId, competitionId))
  for (const l of leagues) {
    const board = await getLeaderboard(db, { competitionId, leagueId: l.id, includePrivate: true, limit: 1000 })
    await writeRankSnapshots(db, leagueLeaderboardRank, leagueLeaderboardRank.leagueId, { leagueId: l.id }, board)
  }
}

export async function getLeagueRankMovements(db: AppDatabase, leagueId: string): Promise<Map<string, number>> {
  const rows = await db.select().from(leagueLeaderboardRank).where(eq(leagueLeaderboardRank.leagueId, leagueId))
  return movementsFrom(rows)
}
