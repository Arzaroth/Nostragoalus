import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { makeUser, makeCompetition, makeLeague } from '../../../tests/factories'
import { ConflictError, NotFoundError } from '../errors'
import { getMembership } from './service'
import {
  acceptInvite,
  createInvite,
  inviteStatus,
  listInvites,
  previewInvite,
  pruneSpentInvites,
  revokeInvite,
} from './invites'

describe('league invites', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>['db']
  let client: Awaited<ReturnType<typeof createTestDb>>['client']
  let leagueId: string
  let owner: string

  beforeAll(async () => {
    const t = await createTestDb()
    db = t.db
    client = t.client
    const competitionId = await makeCompetition(db, {})
    owner = await makeUser(db, 'owner')
    leagueId = await makeLeague(db, { competitionId, ownerId: owner, name: 'Friends' })
  })

  afterAll(async () => {
    await client.close()
  })

  it('inviteStatus reflects expiry and use cap', () => {
    const now = new Date('2026-06-13T12:00:00Z')
    expect(inviteStatus({ expiresAt: null, maxUses: null, uses: 0 }, now)).toBe('VALID')
    expect(inviteStatus({ expiresAt: new Date('2026-06-13T11:00:00Z'), maxUses: null, uses: 0 }, now)).toBe('EXPIRED')
    expect(inviteStatus({ expiresAt: null, maxUses: 3, uses: 3 }, now)).toBe('EXHAUSTED')
    expect(inviteStatus({ expiresAt: null, maxUses: 3, uses: 2 }, now)).toBe('VALID')
  })

  it('creates an invite with a unique token and optional limits', async () => {
    const a = await createInvite(db, { leagueId, createdBy: owner })
    const b = await createInvite(db, { leagueId, createdBy: owner, expiresInHours: 24, maxUses: 5 })
    expect(a.token).not.toBe(b.token)
    expect(a.expiresAt).toBeNull()
    expect(a.maxUses).toBeNull()
    expect(b.maxUses).toBe(5)
    expect(b.expiresAt).toBeInstanceOf(Date)
    expect((await listInvites(db, leagueId)).length).toBeGreaterThanOrEqual(2)
  })

  it('previews league without auth and reports status', async () => {
    const inv = await createInvite(db, { leagueId, createdBy: owner })
    const preview = await previewInvite(db, inv.token)
    expect(preview?.league.name).toBe('Friends')
    expect(preview?.status).toBe('VALID')
    expect(preview?.league.memberCount).toBe(1)
    expect(await previewInvite(db, 'nope')).toBeNull()
  })

  it('accept joins, increments uses, and blocks a second join by the same user', async () => {
    const joiner = await makeUser(db, 'joiner')
    const inv = await createInvite(db, { leagueId, createdBy: owner, maxUses: 2 })
    const res = await acceptInvite(db, { token: inv.token, userId: joiner })
    expect(res.league.id).toBe(leagueId)
    expect(res.role).toBe('MEMBER')
    expect(await getMembership(db, leagueId, joiner)).toBeTruthy()
    const [after] = await listInvites(db, leagueId).then((rows) => rows.filter((r) => r.id === inv.id))
    expect(after.uses).toBe(1)
    await expect(acceptInvite(db, { token: inv.token, userId: joiner })).rejects.toThrow(ConflictError)
  })

  it('rejects an exhausted invite', async () => {
    const u1 = await makeUser(db, 'u1')
    const u2 = await makeUser(db, 'u2')
    const inv = await createInvite(db, { leagueId, createdBy: owner, maxUses: 1 })
    await acceptInvite(db, { token: inv.token, userId: u1 })
    await expect(acceptInvite(db, { token: inv.token, userId: u2 })).rejects.toThrow(ConflictError)
  })

  it('rejects an expired invite', async () => {
    const u = await makeUser(db, 'late')
    const inv = await createInvite(db, { leagueId, createdBy: owner, expiresInHours: 1 })
    const later = new Date(Date.now() + 2 * 3_600_000)
    await expect(acceptInvite(db, { token: inv.token, userId: u }, later)).rejects.toThrow(ConflictError)
  })

  it('rejects an unknown token on accept', async () => {
    const u = await makeUser(db, 'ghost')
    await expect(acceptInvite(db, { token: 'missing', userId: u })).rejects.toThrow(NotFoundError)
  })

  it('revoke removes the invite and 404s when gone', async () => {
    const inv = await createInvite(db, { leagueId, createdBy: owner })
    await revokeInvite(db, leagueId, inv.id)
    expect(await previewInvite(db, inv.token)).toBeNull()
    await expect(revokeInvite(db, leagueId, inv.id)).rejects.toThrow(NotFoundError)
  })

  it('prunes spent invites', async () => {
    const fresh = await createInvite(db, { leagueId, createdBy: owner })
    const spent = await createInvite(db, { leagueId, createdBy: owner, maxUses: 1 })
    const u = await makeUser(db, 'pruner')
    await acceptInvite(db, { token: spent.token, userId: u })
    await pruneSpentInvites(db, leagueId)
    const ids = (await listInvites(db, leagueId)).map((r) => r.id)
    expect(ids).toContain(fresh.id)
    expect(ids).not.toContain(spent.id)
  })
})
