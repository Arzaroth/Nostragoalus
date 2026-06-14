import { and, eq, inArray, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { bestScorerPick, goalEvent, match } from '../../../db/schema'
import { LockedError } from '../errors'
import { getChampionLockTime } from '../champion/service'
import { getSecondChanceWindow, isSecondChanceOpen } from '../picks/window'

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

  // Upsert on the unique (user, competition) index - race-safe against a
  // double-submit (no select-then-insert window) and "last write wins".
  await db
    .insert(bestScorerPick)
    .values({
      userId: input.userId,
      competitionId: input.competitionId,
      playerId: input.playerId,
      playerName: input.playerName,
      teamCode: input.teamCode,
      teamName: input.teamName,
    })
    .onConflictDoUpdate({
      target: [bestScorerPick.userId, bestScorerPick.competitionId],
      set: { playerId: input.playerId, playerName: input.playerName, teamCode: input.teamCode, teamName: input.teamName },
    })
}

// Second chance, mirrors repickChampion: switch the Golden Boot pick during the
// [last group round -> knockouts] window, latching `repicked` (permanent half)
// and snapshotting the original for display.
export async function repickBestScorer(db: AppDatabase, input: SetBestScorerInput, now: Date = new Date()): Promise<void> {
  const window = await getSecondChanceWindow(db, input.competitionId)
  if (!isSecondChanceOpen(window, now)) throw new LockedError('the second-chance window is not open')

  const existing = await getMyBestScorerPick(db, input.userId, input.competitionId)
  // No original = a late first pick: born halved (repicked), no original.
  if (!existing) {
    await db.insert(bestScorerPick).values({
      userId: input.userId,
      competitionId: input.competitionId,
      playerId: input.playerId,
      playerName: input.playerName,
      teamCode: input.teamCode,
      teamName: input.teamName,
      repicked: true,
    })
    return
  }

  await db
    .update(bestScorerPick)
    .set({
      playerId: input.playerId,
      playerName: input.playerName,
      teamCode: input.teamCode,
      teamName: input.teamName,
      repicked: true,
      ...(existing.repicked ? {} : { originalPlayerName: existing.playerName, originalTeamCode: existing.teamCode }),
    })
    .where(eq(bestScorerPick.id, existing.id))
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
// Golden Boot winner(s). Safe to run on every finalize tick. Self-gated on a
// decided final: until the tournament is over the goal tally is incomplete, so
// awarding early would crown a transient leader (and this runs AFTER the detail
// sync that populates goal_event, not inside the scoring transaction).
export async function awardBestScorerBonuses(db: AppDatabase, competitionId: string, bonus: number): Promise<number> {
  await db.update(bestScorerPick).set({ awardedPoints: 0 }).where(eq(bestScorerPick.competitionId, competitionId))

  const finals = await db
    .select({ winner: match.winner })
    .from(match)
    .where(and(eq(match.competitionId, competitionId), eq(match.stage, 'FINAL')))
  const decided = finals.some((m) => m.winner === 'HOME' || m.winner === 'AWAY')
  if (!decided) return 0

  const winners = await topScorerPlayerIds(db, competitionId)
  if (winners.length === 0) return 0

  const halved = Math.floor(bonus / 2)
  const updated = await db
    .update(bestScorerPick)
    // Half (floored) for picks switched in the second-chance window. The cast
    // pins the integer type the column needs (the branch params are untyped).
    .set({
      awardedPoints: sql`(CASE WHEN ${bestScorerPick.repicked} THEN ${halved} ELSE ${bonus} END)::int`,
    })
    .where(and(eq(bestScorerPick.competitionId, competitionId), inArray(bestScorerPick.playerId, winners)))
    .returning({ id: bestScorerPick.id })
  return updated.length
}
