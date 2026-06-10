import { and, eq, inArray } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { bestScorerPick, goalEvent } from '../../../db/schema'
import { LockedError } from '../errors'
import { getChampionLockTime } from '../champion/service'

export async function getMyBestScorerPick(db: AppDatabase, userId: string, competitionId: string) {
  const rows = await db
    .select()
    .from(bestScorerPick)
    .where(and(eq(bestScorerPick.userId, userId), eq(bestScorerPick.competitionId, competitionId)))
    .limit(1)
  return rows[0] ?? null
}

export interface SetBestScorerInput {
  userId: string
  competitionId: string
  playerId: string
  playerName: string
  teamCode: string | null
  teamName: string
}

// Same lock as the champion pick: editable until the competition's first kickoff.
export async function setBestScorerPick(db: AppDatabase, input: SetBestScorerInput, now: Date = new Date()): Promise<void> {
  const lock = await getChampionLockTime(db, input.competitionId)
  if (lock && now >= lock) throw new LockedError('best scorer pick is locked (the competition has started)')

  const existing = await db
    .select({ id: bestScorerPick.id })
    .from(bestScorerPick)
    .where(and(eq(bestScorerPick.userId, input.userId), eq(bestScorerPick.competitionId, input.competitionId)))
    .limit(1)

  if (existing.length > 0) {
    await db
      .update(bestScorerPick)
      .set({ playerId: input.playerId, playerName: input.playerName, teamCode: input.teamCode, teamName: input.teamName })
      .where(eq(bestScorerPick.id, existing[0].id))
  } else {
    await db.insert(bestScorerPick).values({
      userId: input.userId,
      competitionId: input.competitionId,
      playerId: input.playerId,
      playerName: input.playerName,
      teamCode: input.teamCode,
      teamName: input.teamName,
    })
  }
}

// Golden Boot winners from stored goal events: every player tied at the top
// goal count (own goals excluded, like the official award).
export async function topScorerPlayerIds(db: AppDatabase, competitionId: string): Promise<string[]> {
  const rows = await db
    .select({ playerId: goalEvent.playerId, ownGoal: goalEvent.ownGoal })
    .from(goalEvent)
    .where(eq(goalEvent.competitionId, competitionId))

  const goals = new Map<string, number>()
  for (const r of rows) {
    if (r.ownGoal || !r.playerId) continue
    goals.set(r.playerId, (goals.get(r.playerId) ?? 0) + 1)
  }
  if (goals.size === 0) return []

  const max = Math.max(...goals.values())
  return [...goals.entries()].filter(([, count]) => count === max).map(([playerId]) => playerId)
}

// Idempotent: reset all picks for the competition, then award the bonus to the
// winners. Safe to run on every finalize tick.
export async function awardBestScorerBonuses(db: AppDatabase, competitionId: string, bonus: number): Promise<number> {
  await db.update(bestScorerPick).set({ awardedPoints: 0 }).where(eq(bestScorerPick.competitionId, competitionId))

  const winners = await topScorerPlayerIds(db, competitionId)
  if (winners.length === 0) return 0

  const updated = await db
    .update(bestScorerPick)
    .set({ awardedPoints: bonus })
    .where(and(eq(bestScorerPick.competitionId, competitionId), inArray(bestScorerPick.playerId, winners)))
    .returning({ id: bestScorerPick.id })
  return updated.length
}
