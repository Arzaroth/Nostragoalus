import { and, eq, lte } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { match, prediction, round } from '../../../db/schema'
import { LockedError, NotFoundError, ValidationError } from '../errors'

export interface UpsertPredictionInput {
  userId: string
  matchId: string
  home: number
  away: number
}

function assertValidGoals(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 99) {
    throw new ValidationError(`${label} must be an integer between 0 and 99`)
  }
}

export async function upsertPrediction(
  db: AppDatabase,
  input: UpsertPredictionInput,
  now: Date = new Date(),
): Promise<string> {
  assertValidGoals(input.home, 'home goals')
  assertValidGoals(input.away, 'away goals')

  const rows = await db.select().from(match).where(eq(match.id, input.matchId)).limit(1)
  if (rows.length === 0) throw new NotFoundError('match not found')
  if (now >= rows[0].kickoffTime) throw new LockedError()

  const existing = await db
    .select({ id: prediction.id })
    .from(prediction)
    .where(and(eq(prediction.userId, input.userId), eq(prediction.matchId, input.matchId)))
    .limit(1)

  if (existing.length > 0) {
    await db
      .update(prediction)
      .set({ homeGoals: input.home, awayGoals: input.away })
      .where(eq(prediction.id, existing[0].id))
    return existing[0].id
  }

  const [row] = await db
    .insert(prediction)
    .values({
      userId: input.userId,
      matchId: input.matchId,
      roundId: rows[0].roundId,
      homeGoals: input.home,
      awayGoals: input.away,
    })
    .returning({ id: prediction.id })
  return row.id
}

// Prediction joined with enough match/round context to render a readable list.
const predictionView = {
  id: prediction.id,
  userId: prediction.userId,
  matchId: prediction.matchId,
  roundId: prediction.roundId,
  homeGoals: prediction.homeGoals,
  awayGoals: prediction.awayGoals,
  isJoker: prediction.isJoker,
  baseTier: prediction.baseTier,
  totalPoints: prediction.totalPoints,
  homeTeam: match.homeTeam,
  awayTeam: match.awayTeam,
  homeTeamCode: match.homeTeamCode,
  awayTeamCode: match.awayTeamCode,
  kickoffTime: match.kickoffTime,
  status: match.status,
  fullTimeHome: match.fullTimeHome,
  fullTimeAway: match.fullTimeAway,
  roundLabel: round.label,
  roundSort: round.sortOrder,
}

export async function getMyPredictions(db: AppDatabase, userId: string) {
  return db
    .select(predictionView)
    .from(prediction)
    .innerJoin(match, eq(match.id, prediction.matchId))
    .innerJoin(round, eq(round.id, prediction.roundId))
    .where(eq(prediction.userId, userId))
    .orderBy(match.kickoffTime)
}

// Another user's predictions are only revealed for matches that have kicked off,
// so picks can't be copied before lock.
export async function getUserPublicPredictions(db: AppDatabase, userId: string, now: Date = new Date()) {
  return db
    .select(predictionView)
    .from(prediction)
    .innerJoin(match, eq(match.id, prediction.matchId))
    .innerJoin(round, eq(round.id, prediction.roundId))
    .where(and(eq(prediction.userId, userId), lte(match.kickoffTime, now)))
    .orderBy(match.kickoffTime)
}

export interface SetJokerInput {
  userId: string
  matchId: string
  isJoker: boolean
}

export async function setJoker(db: AppDatabase, input: SetJokerInput, now: Date = new Date()): Promise<void> {
  const rows = await db.select().from(match).where(eq(match.id, input.matchId)).limit(1)
  if (rows.length === 0) throw new NotFoundError('match not found')
  if (now >= rows[0].kickoffTime) throw new LockedError()

  const preds = await db
    .select()
    .from(prediction)
    .where(and(eq(prediction.userId, input.userId), eq(prediction.matchId, input.matchId)))
    .limit(1)
  if (preds.length === 0) throw new NotFoundError('prediction not found')

  if (input.isJoker) {
    // One joker per round: move it from the current joker — but only if that match
    // hasn't kicked off yet (a joker on a started match is already committed there).
    const current = await db
      .select({ id: prediction.id, kickoffTime: match.kickoffTime })
      .from(prediction)
      .innerJoin(match, eq(match.id, prediction.matchId))
      .where(
        and(
          eq(prediction.userId, input.userId),
          eq(prediction.roundId, rows[0].roundId),
          eq(prediction.isJoker, true),
        ),
      )
      .limit(1)
    if (current.length > 0 && current[0].id !== preds[0].id) {
      if (now >= current[0].kickoffTime) throw new LockedError()
      await db.update(prediction).set({ isJoker: false }).where(eq(prediction.id, current[0].id))
    }
  }

  await db.update(prediction).set({ isJoker: input.isJoker }).where(eq(prediction.id, preds[0].id))
}
