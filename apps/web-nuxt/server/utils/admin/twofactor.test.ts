import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { makeUser } from '../../../tests/factories'
import { removeTwoFactor } from './twofactor'
import { twoFactor, user } from '../../../db/schema'

describe('removeTwoFactor', () => {
  it('deletes the secret row and clears the user flag', async () => {
    const { db, client } = await createTestDb()
    const userId = await makeUser(db, 'tfa', 'TFA User')
    await db.update(user).set({ twoFactorEnabled: true }).where(eq(user.id, userId))
    await db.insert(twoFactor).values({ id: 'tf1', secret: 's3cret', backupCodes: 'a,b,c', userId })

    await removeTwoFactor(db, userId)

    expect(await db.select().from(twoFactor)).toHaveLength(0)
    const [u] = await db.select().from(user).where(eq(user.id, userId))
    expect(u.twoFactorEnabled).toBe(false)
    await client.close()
  })
})
