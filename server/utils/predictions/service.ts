import { and, eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { match, prediction } from '../../../db/schema'
import { JokerQuotaError, LockedError, NotFoundError, ValidationError } from '../errors'

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

export async function getMyPredictions(db: AppDatabase, userId: string) {
  return db.select().from(prediction).where(eq(prediction.userId, userId))
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
    const others = await db
      .select({ id: prediction.id })
      .from(prediction)
      .where(
        and(
          eq(prediction.userId, input.userId),
          eq(prediction.roundId, rows[0].roundId),
          eq(prediction.isJoker, true),
        ),
      )
    if (others.some((o) => o.id !== preds[0].id)) throw new JokerQuotaError()
  }

  await db.update(prediction).set({ isJoker: input.isJoker }).where(eq(prediction.id, preds[0].id))
}
