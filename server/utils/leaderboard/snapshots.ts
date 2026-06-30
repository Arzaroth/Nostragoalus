import { and, eq, notInArray, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { leaderboardRank, league, leagueLeaderboardRank } from '../../../db/schema'
import { getLeaderboard, type LeaderboardRow } from './service'

// Persist the current ranks in one upsert; prevRank is always set to the rank
// this snapshot replaces, so movement reflects the change at THIS update and
// clears when a user didn't move (no stale arrow lingering from an older round).
// One statement for the whole board (no per-row N+1). Rows for users no longer
// on the board (went private/hidden, deleted, left the league) are dropped, so a
// departed user can't leave a phantom that shifts everyone below them, and a
// returning user starts fresh (no resurrected arrow).
async function writeRankSnapshots(
  db: AppDatabase,
  table: typeof leaderboardRank | typeof leagueLeaderboardRank,
  scopeColumn: typeof leaderboardRank.competitionId | typeof leagueLeaderboardRank.leagueId,
  scope: { competitionId: string } | { leagueId: string },
  board: LeaderboardRow[],
): Promise<void> {
  const scopeValue = 'competitionId' in scope ? scope.competitionId : scope.leagueId
  const userIds = board.map((row) => row.userId)
  if (userIds.length === 0) {
    await db.delete(table).where(eq(scopeColumn, scopeValue))
    return
  }
  await db
    .insert(table)
    .values(board.map((row) => ({ ...scope, userId: row.userId, rank: row.rank })))
    .onConflictDoUpdate({
      target: [scopeColumn, table.userId],
      set: {
        rank: sql`excluded.rank`,
        // The rank being replaced becomes prevRank, every time - so an unchanged
        // rank yields prevRank === rank, i.e. no movement.
        prevRank: sql`${table.rank}`,
        updatedAt: new Date(),
      },
    })
  await db.delete(table).where(and(eq(scopeColumn, scopeValue), notInArray(table.userId, userIds)))
}

export interface RankSnapshot {
  rank: number
  prevRank: number | null
}

function snapshotMap(rows: { userId: string; rank: number; prevRank: number | null }[]): Map<string, RankSnapshot> {
  const map = new Map<string, RankSnapshot>()
  for (const r of rows) map.set(r.userId, { rank: r.rank, prevRank: r.prevRank })
  return map
}

// The movement arrow for one row. The displayed rank carries live (in-progress)
// match points, so movement is measured against THAT rank, not the snapshot's
// own settled rank, to stay consistent with the number on screen. While a match
// is live the baseline is the last settled rank (snapshot.rank); on a settled
// board it's the rank before this round (snapshot.prevRank). Null when there's
// no baseline (first appearance) or no movement.
export function rankMovement(snap: RankSnapshot | undefined, displayedRank: number, live: boolean): number | null {
  if (!snap) return null
  const baseline = live ? snap.rank : snap.prevRank
  if (baseline == null || baseline === displayedRank) return null
  return baseline - displayedRank
}

export async function updateRankSnapshots(db: AppDatabase, competitionId: string): Promise<void> {
  const board = await getLeaderboard(db, { competitionId, limit: 1000 })
  await writeRankSnapshots(db, leaderboardRank, leaderboardRank.competitionId, { competitionId }, board)
}

export async function getRankSnapshots(db: AppDatabase, competitionId: string): Promise<Map<string, RankSnapshot>> {
  const rows = await db.select().from(leaderboardRank).where(eq(leaderboardRank.competitionId, competitionId))
  return snapshotMap(rows)
}

// Same per league of the competition. Snapshots rank the full member set
// (private profiles included) - they're served to members/admins only. Only
// NORMAL leagues: moded leagues (easy/hard/hardcore) re-score from effective
// picks and rank live, so a base-total snapshot would be wrong for them (their
// movement arrows are deferred - see TODO.md).
export async function updateLeagueRankSnapshots(db: AppDatabase, competitionId: string): Promise<void> {
  const leagues = await db
    .select({ id: league.id })
    .from(league)
    .where(and(eq(league.competitionId, competitionId), eq(league.mode, 'NORMAL')))
  for (const l of leagues) {
    const board = await getLeaderboard(db, { competitionId, leagueId: l.id, includePrivate: true, limit: 1000 })
    await writeRankSnapshots(db, leagueLeaderboardRank, leagueLeaderboardRank.leagueId, { leagueId: l.id }, board)
  }
}

export async function getLeagueRankSnapshots(db: AppDatabase, leagueId: string): Promise<Map<string, RankSnapshot>> {
  const rows = await db.select().from(leagueLeaderboardRank).where(eq(leagueLeaderboardRank.leagueId, leagueId))
  return snapshotMap(rows)
}
