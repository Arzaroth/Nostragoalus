import { and, eq, min, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { championPick, match } from '../../../db/schema'
import { LockedError } from '../errors'
import { getSecondChanceWindow, isSecondChanceOpen } from '../picks/window'

// Champion picks lock when the competition's first match kicks off.
export async function getChampionLockTime(db: AppDatabase, competitionId: string): Promise<Date | null> {
  const rows = await db.select({ first: min(match.kickoffTime) }).from(match).where(eq(match.competitionId, competitionId))
  const first = rows[0]?.first
  return first == null ? null : new Date(first as string | Date)
}

export async function listCompetitionTeams(
  db: AppDatabase,
  competitionId: string,
): Promise<{ code: string; name: string }[]> {
  const rows = await db
    .select({ hc: match.homeTeamCode, hn: match.homeTeam, ac: match.awayTeamCode, an: match.awayTeam })
    .from(match)
    .where(eq(match.competitionId, competitionId))

  const byCode = new Map<string, string>()
  for (const r of rows) {
    if (r.hc) byCode.set(r.hc, r.hn)
    if (r.ac) byCode.set(r.ac, r.an)
  }
  return [...byCode.entries()].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name))
}

export async function getMyChampionPick(db: AppDatabase, userId: string, competitionId: string) {
  const rows = await db
    .select()
    .from(championPick)
    .where(and(eq(championPick.userId, userId), eq(championPick.competitionId, competitionId)))
    .limit(1)
  return rows[0] ?? null
}

export interface SetChampionInput {
  userId: string
  competitionId: string
  teamCode: string
  teamName: string
  // Snapshot taken when the pick is made; null when the team is unranked or
  // the ranking fetch failed (potentialPoints then carries the flat fallback).
  fifaRank: number | null
  potentialPoints: number
}

export async function setChampionPick(db: AppDatabase, input: SetChampionInput, now: Date = new Date()): Promise<void> {
  const lock = await getChampionLockTime(db, input.competitionId)
  if (lock && now >= lock) throw new LockedError('champion pick is locked (the competition has started)')

  const existing = await db
    .select({ id: championPick.id })
    .from(championPick)
    .where(and(eq(championPick.userId, input.userId), eq(championPick.competitionId, input.competitionId)))
    .limit(1)

  if (existing.length > 0) {
    await db
      .update(championPick)
      .set({
        teamCode: input.teamCode,
        teamName: input.teamName,
        fifaRank: input.fifaRank,
        potentialPoints: input.potentialPoints,
      })
      .where(eq(championPick.id, existing[0].id))
  } else {
    await db.insert(championPick).values({
      userId: input.userId,
      competitionId: input.competitionId,
      teamCode: input.teamCode,
      teamName: input.teamName,
      fifaRank: input.fifaRank,
      potentialPoints: input.potentialPoints,
    })
  }
}

// Second chance: switch the champion pick during the [last group round ->
// knockouts] window. Latches `repicked` on the first switch (halving the award
// for good, even if reverted) and snapshots the original pick for display.
export async function repickChampion(db: AppDatabase, input: SetChampionInput, now: Date = new Date()): Promise<void> {
  const window = await getSecondChanceWindow(db, input.competitionId)
  if (!isSecondChanceOpen(window, now)) throw new LockedError('the second-chance window is not open')

  const existing = await getMyChampionPick(db, input.userId, input.competitionId)
  // No original = a late first pick: born halved (repicked), no original to show.
  // Upsert so a double-submit can't violate the (user, competition) unique index.
  if (!existing) {
    await db
      .insert(championPick)
      .values({
        userId: input.userId,
        competitionId: input.competitionId,
        teamCode: input.teamCode,
        teamName: input.teamName,
        fifaRank: input.fifaRank,
        potentialPoints: input.potentialPoints,
        repicked: true,
      })
      .onConflictDoUpdate({
        target: [championPick.userId, championPick.competitionId],
        set: {
          teamCode: input.teamCode,
          teamName: input.teamName,
          fifaRank: input.fifaRank,
          potentialPoints: input.potentialPoints,
          repicked: true,
        },
      })
    return
  }

  await db
    .update(championPick)
    .set({
      teamCode: input.teamCode,
      teamName: input.teamName,
      fifaRank: input.fifaRank,
      potentialPoints: input.potentialPoints,
      repicked: true,
      // First switch only: keep the pre-switch pick. Later switches don't
      // overwrite it (and `repicked` already latched true).
      ...(existing.repicked ? {} : { originalTeamCode: existing.teamCode, originalTeamName: existing.teamName }),
    })
    .where(eq(championPick.id, existing.id))
}

// Idempotent: reset all picks for the competition, then award each winner the
// points locked in at pick time - halved when the pick was switched in the
// second-chance window. Safe to run on every finalize tick.
export async function awardChampionBonuses(
  db: AppDatabase,
  competitionId: string,
  winnerCode: string | null,
): Promise<number> {
  await db.update(championPick).set({ awardedPoints: 0 }).where(eq(championPick.competitionId, competitionId))
  if (!winnerCode) return 0

  const updated = await db
    .update(championPick)
    // Integer division floors for positive values, so a re-picked 7-point pick
    // pays 3, matching "half the points, rounded down".
    .set({
      awardedPoints: sql`CASE WHEN ${championPick.repicked} THEN ${championPick.potentialPoints} / 2 ELSE ${championPick.potentialPoints} END`,
    })
    .where(and(eq(championPick.competitionId, competitionId), eq(championPick.teamCode, winnerCode)))
    .returning({ id: championPick.id })
  return updated.length
}
