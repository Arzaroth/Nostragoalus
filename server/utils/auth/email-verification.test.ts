import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { makeUser } from '../../../tests/factories'
import { user } from '../../../db/schema'
import {
  EMAIL_VERIFICATION_KEY,
  emailVerificationRequiredSync,
  isSmtpConfigured,
  loadEmailVerificationFlag,
  setEmailVerificationRequired,
} from './email-verification'
import { getAppSetting } from '../settings/service'

describe('email-verification flag', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>['db']
  let client: Awaited<ReturnType<typeof createTestDb>>['client']

  beforeEach(async () => {
    const t = await createTestDb()
    db = t.db
    client = t.client
    // Reset the module cache to a known state between tests.
    await loadEmailVerificationFlag(db)
  })
  afterEach(async () => {
    await client.close()
  })

  it('defaults to off and reads back what was set', async () => {
    expect(emailVerificationRequiredSync(db)).toBe(false)
    await setEmailVerificationRequired(db, true)
    expect(emailVerificationRequiredSync(db)).toBe(true)
    expect(await getAppSetting(db, EMAIL_VERIFICATION_KEY)).toBe('true')

    await setEmailVerificationRequired(db, false)
    expect(emailVerificationRequiredSync(db)).toBe(false)
  })

  it('loadEmailVerificationFlag hydrates the cache from the DB', async () => {
    await setEmailVerificationRequired(db, true)
    // Simulate a fresh process: a new db with the flag persisted.
    const fresh = await createTestDb()
    expect(await loadEmailVerificationFlag(fresh.db)).toBe(false) // nothing stored in the fresh db
    await setEmailVerificationRequired(fresh.db, true)
    expect(await loadEmailVerificationFlag(fresh.db)).toBe(true)
    await fresh.client.close()
  })

  it('grandfathers existing unverified accounts when enabled, and leaves them when disabled', async () => {
    await makeUser(db, 'old1')
    await makeUser(db, 'old2')
    // makeUser inserts emailVerified=false.
    await setEmailVerificationRequired(db, true)
    const rows = await db.select({ v: user.emailVerified }).from(user)
    expect(rows.every((r) => r.v === true)).toBe(true)

    // A later signup is unverified; disabling must not retro-verify it.
    await makeUser(db, 'new1')
    await setEmailVerificationRequired(db, false)
    const after = await db.select({ v: user.emailVerified }).from(user).where(eq(user.id, 'new1'))
    expect(after[0]?.v).toBe(false)
  })

  it('reports SMTP availability from the env', () => {
    vi.stubEnv('NUXT_SMTP_URL', '')
    expect(isSmtpConfigured()).toBe(false)
    vi.stubEnv('NUXT_SMTP_URL', 'smtp://localhost:1025')
    expect(isSmtpConfigured()).toBe(true)
    vi.unstubAllEnvs()
  })
})
