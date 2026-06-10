import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '../../../tests/db'
import { addLeagueMember, makeCompetition, makeLeague, makeUser } from '../../../tests/factories'
import { ssoProvider, ssoProviderLeague, user } from '../../../db/schema'
import { autoJoinSsoLeagues } from './auto-join'
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
