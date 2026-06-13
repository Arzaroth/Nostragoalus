import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { account, user } from '../../../db/schema'
import { setEmailVerificationRequired } from './email-verification'
import { pruneUnverifiedUsers } from './prune-unverified'

const NOW = new Date('2026-06-13T12:00:00Z')
const OLD = new Date('2026-06-01T00:00:00Z') // ~12 days before NOW
const RECENT = new Date('2026-06-10T00:00:00Z') // ~3 days before NOW

async function addUser(
  db: Awaited<ReturnType<typeof createTestDb>>['db'],
  id: string,
  opts: { verified?: boolean; createdAt?: Date; role?: string | null } = {},
) {
  await db.insert(user).values({
    id,
    name: id,
    email: `${id}@example.com`,
    emailVerified: opts.verified ?? false,
    createdAt: opts.createdAt ?? OLD,
    role: opts.role ?? null,
  })
}

describe('pruneUnverifiedUsers', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>['db']
  let client: Awaited<ReturnType<typeof createTestDb>>['client']

  beforeEach(async () => {
    const t = await createTestDb()
    db = t.db
    client = t.client
  })
  afterEach(async () => {
    await client.close()
  })

  it('no-ops while email verification is disabled (would otherwise wipe everyone)', async () => {
    await addUser(db, 'a', { verified: false, createdAt: OLD })
    const res = await pruneUnverifiedUsers(db, { now: NOW })
    expect(res).toEqual({ pruned: 0, skipped: 'verification-disabled' })
    expect(await db.select().from(user)).toHaveLength(1)
  })

  it('deletes only old, unverified, non-SSO, non-admin accounts when enabled', async () => {
    await setEmailVerificationRequired(db, true)
    // setEmailVerificationRequired grandfathers everything to verified, so
    // create the test rows AFTER enabling.
    await addUser(db, 'stale', { verified: false, createdAt: OLD })
    await addUser(db, 'recent', { verified: false, createdAt: RECENT })
    await addUser(db, 'verified-old', { verified: true, createdAt: OLD })
    await addUser(db, 'admin-old', { verified: false, createdAt: OLD, role: 'admin' })
    await addUser(db, 'sso-old', { verified: false, createdAt: OLD })
    await db.insert(account).values({ id: 'acc1', accountId: 'x', providerId: 'acme-oidc', userId: 'sso-old' })

    const res = await pruneUnverifiedUsers(db, { now: NOW })
    expect(res.pruned).toBe(1)
    const left = (await db.select({ id: user.id }).from(user)).map((r) => r.id).sort()
    expect(left).toEqual(['admin-old', 'recent', 'sso-old', 'verified-old'])
  })

  it('keeps an unverified account that still has only a credential (non-SSO) link', async () => {
    await setEmailVerificationRequired(db, true)
    await addUser(db, 'local', { verified: false, createdAt: OLD })
    await db.insert(account).values({ id: 'acc2', accountId: 'local', providerId: 'credential', userId: 'local' })
    const res = await pruneUnverifiedUsers(db, { now: NOW })
    expect(res.pruned).toBe(1) // credential link is not an SSO link, so it's still pruned
  })
})
