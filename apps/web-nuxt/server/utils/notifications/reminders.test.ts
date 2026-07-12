import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { createTestDb } from '../../../tests/db'
import { makeMatch, makeUser, seedCompetition } from '../../../tests/factories'
import { findRoundId } from '../sync/rounds'
import { prediction, userNotification } from '../../../db/schema'
import { deletePickReminder, pruneStartedReminders, remindMissingPredictions } from './reminders'

const NOW = new Date('2026-06-15T12:00:00Z')

function notifsFor(db: AppDatabase, userId: string) {
  return db.select().from(userNotification).where(eq(userNotification.userId, userId))
}

async function setup() {
  const ctx = await createTestDb()
  const competitionId = await seedCompetition(ctx.db)
  const roundId = (await findRoundId(ctx.db, competitionId, 'GROUP', 1)) as string
  // A finished match makes A and B "active predictors" of the competition.
  const past = await makeMatch(ctx.db, {
    competitionId,
    roundId,
    kickoffTime: new Date('2026-06-14T12:00:00Z'),
    status: 'FINISHED',
  })
  // Locks in 2h: inside the 3h lead window.
  const soon = await makeMatch(ctx.db, {
    competitionId,
    roundId,
    kickoffTime: new Date('2026-06-15T14:00:00Z'),
    homeTeam: 'Brazil',
    homeTeamCode: 'BRA',
    awayTeam: 'Argentina',
    awayTeamCode: 'ARG',
    status: 'SCHEDULED',
  })
  const a = await makeUser(ctx.db, 'A')
  const b = await makeUser(ctx.db, 'B')
  const c = await makeUser(ctx.db, 'C')
  await ctx.db.insert(prediction).values([
    { userId: a, matchId: past, roundId, homeGoals: 1, awayGoals: 0 },
    { userId: b, matchId: past, roundId, homeGoals: 2, awayGoals: 2 },
    { userId: b, matchId: soon, roundId, homeGoals: 1, awayGoals: 1 },
  ])
  return { ...ctx, competitionId, roundId, soon, a, b, c }
}

describe('remindMissingPredictions', () => {
  it('reminds active predictors missing a soon-locking pick, skips pickers and inactive users, dedupes', async () => {
    const { db, client, soon, a, b, c } = await setup()
    expect(await remindMissingPredictions(db, NOW)).toBe(1)
    const aN = await notifsFor(db, a)
    expect(aN).toHaveLength(1)
    expect(aN[0]!.data).toMatchObject({ type: 'PICK_REMINDER', matchId: soon, homeTeam: 'Brazil', awayTeam: 'Argentina' })
    expect(await notifsFor(db, b)).toHaveLength(0)
    expect(await notifsFor(db, c)).toHaveLength(0)
    expect(await remindMissingPredictions(db, NOW)).toBe(0)
    expect(await notifsFor(db, a)).toHaveLength(1)
    await client.close()
  })

  it('skips matches outside the window, with TBD teams, or already kicked off', async () => {
    const { db, client, competitionId, roundId, a } = await setup()
    await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-15T22:00:00Z'), homeTeamCode: 'X', awayTeamCode: 'Y', status: 'SCHEDULED' })
    await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-15T14:30:00Z'), homeTeamCode: null, awayTeamCode: null, status: 'SCHEDULED' })
    await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-15T11:00:00Z'), homeTeamCode: 'P', awayTeamCode: 'Q', status: 'SCHEDULED' })
    // Only the original soon-locking match qualifies, so A is reminded once.
    expect(await remindMissingPredictions(db, NOW)).toBe(1)
    expect(await notifsFor(db, a)).toHaveLength(1)
    await client.close()
  })

  it('reminds across several soon matches in one competition (predictors resolved once)', async () => {
    const { db, client, competitionId, roundId, a, b } = await setup()
    await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-15T13:30:00Z'), homeTeamCode: 'X', awayTeamCode: 'Y', status: 'SCHEDULED' })
    // A misses both soon matches; B (also active) misses only the new one.
    expect(await remindMissingPredictions(db, NOW)).toBe(3)
    expect(await notifsFor(db, a)).toHaveLength(2)
    expect(await notifsFor(db, b)).toHaveLength(1)
    await client.close()
  })

  it('returns 0 when no match is in the window', async () => {
    const ctx = await createTestDb()
    const competitionId = await seedCompetition(ctx.db)
    const roundId = (await findRoundId(ctx.db, competitionId, 'GROUP', 1)) as string
    await makeMatch(ctx.db, { competitionId, roundId, kickoffTime: new Date('2026-06-16T00:00:00Z'), homeTeamCode: 'X', awayTeamCode: 'Y', status: 'SCHEDULED' })
    expect(await remindMissingPredictions(ctx.db, NOW)).toBe(0)
    await ctx.client.close()
  })

  it('returns 0 when the competition has no active predictors', async () => {
    const ctx = await createTestDb()
    const competitionId = await seedCompetition(ctx.db)
    const roundId = (await findRoundId(ctx.db, competitionId, 'GROUP', 1)) as string
    await makeUser(ctx.db, 'lonely')
    await makeMatch(ctx.db, { competitionId, roundId, kickoffTime: new Date('2026-06-15T14:00:00Z'), homeTeamCode: 'X', awayTeamCode: 'Y', status: 'SCHEDULED' })
    expect(await remindMissingPredictions(ctx.db, NOW)).toBe(0)
    await ctx.client.close()
  })
})

describe('pruneStartedReminders', () => {
  it('drops reminders only once their match has kicked off', async () => {
    const { db, client, a } = await setup()
    await remindMissingPredictions(db, NOW)
    expect(await notifsFor(db, a)).toHaveLength(1)
    expect(await pruneStartedReminders(db, NOW)).toBe(0)
    expect(await notifsFor(db, a)).toHaveLength(1)
    expect(await pruneStartedReminders(db, new Date('2026-06-15T14:30:00Z'))).toBe(1)
    expect(await notifsFor(db, a)).toHaveLength(0)
    await client.close()
  })
})

describe('deletePickReminder', () => {
  it("removes a user's reminder for one match and leaves others", async () => {
    const { db, client, soon, a } = await setup()
    await remindMissingPredictions(db, NOW)
    expect(await notifsFor(db, a)).toHaveLength(1)
    await deletePickReminder(db, a, 'unrelated-match')
    expect(await notifsFor(db, a)).toHaveLength(1)
    await deletePickReminder(db, a, soon)
    expect(await notifsFor(db, a)).toHaveLength(0)
    await client.close()
  })
})
