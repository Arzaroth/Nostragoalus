import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { makeUser } from '../../../tests/factories'
import { user } from '../../../db/schema'
import { NotFoundError } from '../errors'
import { forceVerifyUserEmail } from './email-verify'

describe('forceVerifyUserEmail', () => {
  it('flips emailVerified to true and is idempotent', async () => {
    const { db, client } = await createTestDb()
    await makeUser(db, 'u') // inserted unverified
    await forceVerifyUserEmail(db, 'u')
    expect((await db.select({ v: user.emailVerified }).from(user).where(eq(user.id, 'u')))[0]?.v).toBe(true)
    await forceVerifyUserEmail(db, 'u') // no throw second time
    await client.close()
  })

  it('throws NotFoundError for an unknown user', async () => {
    const { db, client } = await createTestDb()
    await expect(forceVerifyUserEmail(db, 'ghost')).rejects.toThrow(NotFoundError)
    await client.close()
  })
})
