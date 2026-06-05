import { and, eq, min } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { championPick, match } from '../../../db/schema'
import { LockedError } from '../errors'

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
      .set({ teamCode: input.teamCode, teamName: input.teamName })
      .where(eq(championPick.id, existing[0].id))
  } else {
    await db.insert(championPick).values({
      userId: input.userId,
      competitionId: input.competitionId,
      teamCode: input.teamCode,
      teamName: input.teamName,
    })
  }
}

// Idempotent: reset all picks for the competition, then award the bonus to the
// winners. Safe to run on every finalize tick.
export async function awardChampionBonuses(
  db: AppDatabase,
  competitionId: string,
  winnerCode: string | null,
  bonus: number,
): Promise<number> {
  await db.update(championPick).set({ awardedPoints: 0 }).where(eq(championPick.competitionId, competitionId))
  if (!winnerCode) return 0

  const updated = await db
    .update(championPick)
    .set({ awardedPoints: bonus })
    .where(and(eq(championPick.competitionId, competitionId), eq(championPick.teamCode, winnerCode)))
    .returning({ id: championPick.id })
  return updated.length
}
