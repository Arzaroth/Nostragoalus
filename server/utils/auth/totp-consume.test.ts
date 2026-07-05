import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { makeUser } from '../../../tests/factories'
import { twoFactor } from '../../../db/schema'
import { totpCode } from './totp'
import { consumeTotpCode } from './totp-consume'

const SECRET = '12345678901234567890' // raw key, RFC 6238 vector

async function enroll(db: Parameters<typeof consumeTotpCode>[0], userId: string) {
  await db.insert(twoFactor).values({ id: `tf-${userId}`, secret: SECRET, backupCodes: '', userId })
}

describe('consumeTotpCode', () => {
  it('accepts a valid code once, then rejects the replay of the same code', async () => {
    const { db, client } = await createTestDb()
    const u = await makeUser(db, 'u1', 'U1')
    await enroll(db, u)
    const t = 1_234_567_890_000
    const code = totpCode(SECRET, t, 'raw')

    expect(await consumeTotpCode(db, u, SECRET, code, t)).toBe(true)
    // Replay inside the same window: the step is already consumed -> rejected.
    expect(await consumeTotpCode(db, u, SECRET, code, t)).toBe(false)
    // A later, higher-step code is accepted again.
    const t2 = t + 60_000
    expect(await consumeTotpCode(db, u, SECRET, totpCode(SECRET, t2, 'raw'), t2)).toBe(true)
    await client.close()
  })

  it('rejects a wrong code without advancing the stored step', async () => {
    const { db, client } = await createTestDb()
    const u = await makeUser(db, 'u2', 'U2')
    await enroll(db, u)
    const t = 1_234_567_890_000
    expect(await consumeTotpCode(db, u, SECRET, '000000', t)).toBe(false)
    const [row] = await db.select().from(twoFactor).where(eq(twoFactor.userId, u))
    expect(row.lastTotpStep).toBeNull()
    // A genuine code still works afterwards.
    expect(await consumeTotpCode(db, u, SECRET, totpCode(SECRET, t, 'raw'), t)).toBe(true)
    await client.close()
  })

  it('does not let an earlier-step code replay after a later one was consumed', async () => {
    const { db, client } = await createTestDb()
    const u = await makeUser(db, 'u3', 'U3')
    await enroll(db, u)
    const later = 1_234_567_920_000
    const earlier = 1_234_567_860_000
    expect(await consumeTotpCode(db, u, SECRET, totpCode(SECRET, later, 'raw'), later)).toBe(true)
    // An older code (lower step) is now below the stored high-water mark.
    expect(await consumeTotpCode(db, u, SECRET, totpCode(SECRET, earlier, 'raw'), earlier)).toBe(false)
    await client.close()
  })
})
