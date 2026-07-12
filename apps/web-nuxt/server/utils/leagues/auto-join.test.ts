import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '../../../tests/db'
import { addLeagueMember, makeCompetition, makeLeague, makeUser } from '../../../tests/factories'
import { ssoProvider, ssoProviderLeague, user } from '../../../db/schema'
import { applyAllProviderAutoJoins, autoJoinSsoLeagues } from './auto-join'
import { getMembership, leaveLeague, setProviderAutoJoinLeagues } from './service'

let db: TestDb
let client: { close: () => Promise<void> }
let competitionId: string

beforeEach(async () => {
  ;({ db, client } = await createTestDb())
  competitionId = await makeCompetition(db)
})

afterEach(async () => {
  await client.close()
})

async function makeProvider(providerId: string) {
  await db.insert(ssoProvider).values({ id: providerId, providerId, issuer: 'https://idp.test', domain: 'corp.test' })
}

describe('autoJoinSsoLeagues', () => {
  it('joins every linked league and stamps the prompt flag', async () => {
    await makeUser(db, 'alice')
    await makeUser(db, 'owner')
    // One ownerless league (first in claims it) and one already owned.
    const a = await makeLeague(db, { competitionId })
    const b = await makeLeague(db, { competitionId, ownerId: 'owner' })
    await makeProvider('acme')
    await setProviderAutoJoinLeagues(db, 'acme', [a, b])

    const joined = await autoJoinSsoLeagues(db, { userId: 'alice', providerId: 'acme' })
    expect(joined.sort()).toEqual([a, b].sort())
    expect((await getMembership(db, a, 'alice'))?.role).toBe('OWNER')
    expect((await getMembership(db, b, 'alice'))?.role).toBe('MEMBER')
    const rows = await db.select({ at: user.leaguePromptDismissedAt }).from(user).where(eq(user.id, 'alice'))
    expect(rows[0].at).not.toBeNull()
  })

  it('is idempotent and keeps existing roles', async () => {
    await makeUser(db, 'alice')
    const a = await makeLeague(db, { competitionId })
    await makeProvider('acme')
    await setProviderAutoJoinLeagues(db, 'acme', [a])
    await addLeagueMember(db, a, 'alice', 'MODERATOR')

    expect(await autoJoinSsoLeagues(db, { userId: 'alice', providerId: 'acme' })).toEqual([])
    expect((await getMembership(db, a, 'alice'))?.role).toBe('MODERATOR')
  })

  it('honors an explicit leave on later logins', async () => {
    await makeUser(db, 'alice')
    const a = await makeLeague(db, { competitionId })
    await makeProvider('acme')
    await setProviderAutoJoinLeagues(db, 'acme', [a])

    await autoJoinSsoLeagues(db, { userId: 'alice', providerId: 'acme' })
    await leaveLeague(db, { leagueId: a, userId: 'alice' })
    expect(await autoJoinSsoLeagues(db, { userId: 'alice', providerId: 'acme' })).toEqual([])
    expect(await getMembership(db, a, 'alice')).toBeNull()
  })

  it('does nothing for providers without links', async () => {
    await makeUser(db, 'alice')
    await makeProvider('acme')
    expect(await autoJoinSsoLeagues(db, { userId: 'alice', providerId: 'acme' })).toEqual([])
    expect(await autoJoinSsoLeagues(db, { userId: 'alice', providerId: 'ghost' })).toEqual([])
  })

  it('is idempotent: a second run joins nothing and never throws on conflicts', async () => {
    await makeUser(db, 'alice')
    const a = await makeLeague(db, { competitionId })
    await makeProvider('acme')
    await setProviderAutoJoinLeagues(db, 'acme', [a])
    expect(await autoJoinSsoLeagues(db, { userId: 'alice', providerId: 'acme' })).toEqual([a])
    // Second login: already a member - the membership-conflict path is skipped,
    // not surfaced as an error.
    expect(await autoJoinSsoLeagues(db, { userId: 'alice', providerId: 'acme' })).toEqual([])
  })

  it('rethrows a non-conflict error (e.g. the user row is gone)', async () => {
    const a = await makeLeague(db, { competitionId })
    await makeProvider('acme')
    await setProviderAutoJoinLeagues(db, 'acme', [a])
    // No user row for 'ghost' -> the membership insert hits a FK violation,
    // which is not a unique conflict and must propagate.
    await expect(autoJoinSsoLeagues(db, { userId: 'ghost', providerId: 'acme' })).rejects.toBeTruthy()
  })

  it('two providers can share a league without conflict', async () => {
    await makeUser(db, 'alice')
    const a = await makeLeague(db, { competitionId })
    await makeProvider('acme')
    await makeProvider('globex')
    await db.insert(ssoProviderLeague).values([
      { providerId: 'acme', leagueId: a },
      { providerId: 'globex', leagueId: a },
    ])
    expect(await autoJoinSsoLeagues(db, { userId: 'alice', providerId: 'acme' })).toEqual([a])
    expect(await autoJoinSsoLeagues(db, { userId: 'alice', providerId: 'globex' })).toEqual([])
  })
})


describe('applyAllProviderAutoJoins', () => {
  it('joins existing domain-matched users, skips non-matching and opted-out', async () => {
    const a = await makeLeague(db, { competitionId })
    await makeProvider('acme')
    // provider captures corp.test
    await db.update(ssoProvider).set({ domain: 'corp.test' }).where(eq(ssoProvider.providerId, 'acme'))
    await setProviderAutoJoinLeagues(db, 'acme', [a])

    const inDomain = await makeUser(db, 'in', 'in')
    await db.update(user).set({ email: 'in@corp.test' }).where(eq(user.id, inDomain))
    const outDomain = await makeUser(db, 'out', 'out')
    await db.update(user).set({ email: 'out@other.test' }).where(eq(user.id, outDomain))
    // Malformed email (no domain) is skipped, not matched.
    const noDomain = await makeUser(db, 'nod', 'nod')
    await db.update(user).set({ email: 'broken' }).where(eq(user.id, noDomain))

    const res = await applyAllProviderAutoJoins(db)
    expect(res.providers).toBe(1)
    expect(res.usersMatched).toBe(1)
    expect(res.joined).toBe(1)
    expect((await getMembership(db, a, inDomain))?.role).toBe('OWNER')
    expect(await getMembership(db, a, outDomain)).toBeNull()

    // Idempotent re-run joins nothing new.
    const again = await applyAllProviderAutoJoins(db)
    expect(again.joined).toBe(0)
  })

  it('returns zeros when no provider has linked leagues', async () => {
    await makeProvider('acme')
    expect(await applyAllProviderAutoJoins(db)).toEqual({ providers: 0, usersMatched: 0, joined: 0 })
  })
})
