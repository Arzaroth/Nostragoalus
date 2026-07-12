import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '../../../tests/db'
import { makeUser } from '../../../tests/factories'
import { user } from '../../../db/schema'
import { dismissOnboardingTour } from './service'

let db: TestDb
let client: { close: () => Promise<void> }

beforeEach(async () => {
  ;({ db, client } = await createTestDb())
})
afterEach(async () => {
  await client.close()
})

async function flag(id: string): Promise<Date | null> {
  const rows = await db.select({ at: user.onboardingTourDismissedAt }).from(user).where(eq(user.id, id))
  return rows[0]?.at ?? null
}

describe('onboarding service', () => {
  it('stamps the tour as dismissed for a fresh user', async () => {
    await makeUser(db, 'u1')
    expect(await flag('u1')).toBeNull()
    await dismissOnboardingTour(db, 'u1')
    expect(await flag('u1')).toBeInstanceOf(Date)
  })

  it('is idempotent: a second call keeps the first timestamp', async () => {
    await makeUser(db, 'u1')
    await dismissOnboardingTour(db, 'u1')
    const first = await flag('u1')
    await dismissOnboardingTour(db, 'u1')
    expect((await flag('u1'))?.getTime()).toBe(first?.getTime())
  })

  it('leaves other users untouched', async () => {
    await makeUser(db, 'u1')
    await makeUser(db, 'u2')
    await dismissOnboardingTour(db, 'u1')
    expect(await flag('u2')).toBeNull()
  })
})
