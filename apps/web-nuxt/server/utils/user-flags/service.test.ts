import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '../../../tests/db'
import { makeUser } from '../../../tests/factories'
import { user } from '../../../db/schema'
import { stampUserFlagOnce, type UserOnceFlag } from './service'

let db: TestDb
let client: { close: () => Promise<void> }

beforeEach(async () => {
  ;({ db, client } = await createTestDb())
})
afterEach(async () => {
  await client.close()
})

async function flag(id: string, col: UserOnceFlag): Promise<Date | null> {
  const rows = await db.select().from(user).where(eq(user.id, id))
  return (rows[0]?.[col] as Date | null) ?? null
}

const FLAGS: UserOnceFlag[] = ['leaguePromptDismissedAt', 'onboardingTourDismissedAt']

describe('stampUserFlagOnce', () => {
  for (const col of FLAGS) {
    it(`stamps ${col} for a fresh user`, async () => {
      await makeUser(db, 'u1')
      expect(await flag('u1', col)).toBeNull()
      await stampUserFlagOnce(db, 'u1', col)
      expect(await flag('u1', col)).toBeInstanceOf(Date)
    })

    it(`is idempotent on ${col}: a second call keeps the first timestamp`, async () => {
      await makeUser(db, 'u1')
      await stampUserFlagOnce(db, 'u1', col)
      const first = await flag('u1', col)
      await stampUserFlagOnce(db, 'u1', col)
      expect((await flag('u1', col))?.getTime()).toBe(first?.getTime())
    })
  }

  it('stamps each flag independently', async () => {
    await makeUser(db, 'u1')
    await stampUserFlagOnce(db, 'u1', 'leaguePromptDismissedAt')
    expect(await flag('u1', 'leaguePromptDismissedAt')).toBeInstanceOf(Date)
    expect(await flag('u1', 'onboardingTourDismissedAt')).toBeNull()
  })

  it('leaves other users untouched', async () => {
    await makeUser(db, 'u1')
    await makeUser(db, 'u2')
    await stampUserFlagOnce(db, 'u1', 'onboardingTourDismissedAt')
    expect(await flag('u2', 'onboardingTourDismissedAt')).toBeNull()
  })
})
