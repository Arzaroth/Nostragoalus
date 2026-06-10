import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { createTestDb, type TestDb } from '../../../tests/db'
import { addLeagueMember, makeCompetition, makeLeague, makeUser } from '../../../tests/factories'
import { league, leagueMember, leagueOptOut, ssoProvider, ssoProviderLeague, user } from '../../../db/schema'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors'
import {
  adminAddMember,
  adminCreateLeague,
  canViewProfile,
  listLeaguesAdmin,
  listProviderAutoJoinLeagues,
  pruneEmptyLeagues,
  setProviderAutoJoinLeagues,
  shareLeague,
  assertLeaguesExist,
  canViewLeague,
  createLeague,
  deleteLeague,
  dismissLeaguePrompt,
  findLeagueByCode,
  getLeague,
  getMembership,
  joinLeagueByCode,
  joinPublicLeague,
  kickMember,
  leaveLeague,
  listLeagueMembers,
  listPublicLeagues,
  listUserLeagues,
  regenerateJoinCode,
  removeMembership,
  renameLeague,
  setAdminMemberRole,
  setLeagueVisibility,
  setMemberRole,
  shouldShowLeaguePrompt,
  transferOwnership,
} from './service'

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

async function promptDismissedAt(userId: string): Promise<Date | null> {
  const rows = await db.select({ at: user.leaguePromptDismissedAt }).from(user).where(eq(user.id, userId))
  return rows[0]?.at ?? null
}

async function optOutExists(leagueId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(leagueOptOut)
    .where(and(eq(leagueOptOut.leagueId, leagueId), eq(leagueOptOut.userId, userId)))
  return rows.length > 0
}

describe('createLeague', () => {
  it('creates the league with an OWNER membership and stamps the prompt flag', async () => {
    await makeUser(db, 'alice')
    const row = await createLeague(db, { competitionId, name: 'Bureau', ownerId: 'alice' })
    expect(row.visibility).toBe('PRIVATE')
    expect(row.joinCode).toMatch(/^[A-Z2-9]{8}$/)
    expect((await getMembership(db, row.id, 'alice'))?.role).toBe('OWNER')
    expect(await promptDismissedAt('alice')).not.toBeNull()
  })

  it('honors an explicit visibility', async () => {
    await makeUser(db, 'alice')
    const row = await createLeague(db, { competitionId, name: 'Open', ownerId: 'alice', visibility: 'PUBLIC' })
    expect(row.visibility).toBe('PUBLIC')
  })

  it('retries on join-code collision', async () => {
    await makeUser(db, 'alice')
    await makeLeague(db, { competitionId, joinCode: 'TAKEN222' })
    const codes = ['TAKEN222', 'FRESH222']
    const row = await createLeague(db, { competitionId, name: 'Retry', ownerId: 'alice', codeGen: () => codes.shift()! })
    expect(row.joinCode).toBe('FRESH222')
  })

  it('gives up after exhausting collision retries', async () => {
    await makeUser(db, 'alice')
    await makeLeague(db, { competitionId, joinCode: 'TAKEN222' })
    await expect(
      createLeague(db, { competitionId, name: 'Stuck', ownerId: 'alice', codeGen: () => 'TAKEN222' }),
    ).rejects.toMatchObject({ cause: { code: '23505' } })
  })
})

describe('findLeagueByCode / getLeague', () => {
  it('normalizes the code before lookup', async () => {
    const id = await makeLeague(db, { competitionId, joinCode: 'ABCD2345' })
    expect((await findLeagueByCode(db, ' ab-cd 2345 '))?.id).toBe(id)
    expect(await findLeagueByCode(db, 'NOPE9999')).toBeNull()
    expect(await findLeagueByCode(db, '   ')).toBeNull()
  })

  it('getLeague returns null for unknown ids', async () => {
    expect(await getLeague(db, 'missing')).toBeNull()
  })
})

describe('canViewLeague', () => {
  it('members, public leagues and admins pass; private non-members fail', () => {
    expect(canViewLeague({ visibility: 'PRIVATE' }, { role: 'MEMBER' })).toBe(true)
    expect(canViewLeague({ visibility: 'PUBLIC' }, null)).toBe(true)
    expect(canViewLeague({ visibility: 'PRIVATE' }, null, true)).toBe(true)
    expect(canViewLeague({ visibility: 'PRIVATE' }, null)).toBe(false)
  })
})

describe('joinLeagueByCode', () => {
  it('adds a MEMBER, clears any opt-out and stamps the prompt flag', async () => {
    await makeUser(db, 'alice')
    await makeUser(db, 'bob')
    const id = await makeLeague(db, { competitionId, ownerId: 'alice', joinCode: 'ABCD2345' })
    await db.insert(leagueOptOut).values({ leagueId: id, userId: 'bob' })
    const row = await joinLeagueByCode(db, { userId: 'bob', code: 'abcd2345' })
    expect(row.id).toBe(id)
    expect((await getMembership(db, id, 'bob'))?.role).toBe('MEMBER')
    expect(await optOutExists(id, 'bob')).toBe(false)
    expect(await promptDismissedAt('bob')).not.toBeNull()
  })

  it('404s on a bad code and 409s when already a member', async () => {
    await makeUser(db, 'alice')
    await makeLeague(db, { competitionId, ownerId: 'alice', joinCode: 'ABCD2345' })
    await expect(joinLeagueByCode(db, { userId: 'alice', code: 'WRONG999' })).rejects.toBeInstanceOf(NotFoundError)
    await expect(joinLeagueByCode(db, { userId: 'alice', code: 'ABCD2345' })).rejects.toBeInstanceOf(ConflictError)
  })
})

describe('first joiner of an ownerless league', () => {
  it('code join claims ownership, the next joiner is a member', async () => {
    await makeUser(db, 'alice')
    await makeUser(db, 'bob')
    const id = await makeLeague(db, { competitionId, joinCode: 'ABCD2345' })
    await joinLeagueByCode(db, { userId: 'alice', code: 'ABCD2345' })
    expect((await getMembership(db, id, 'alice'))?.role).toBe('OWNER')
    await joinLeagueByCode(db, { userId: 'bob', code: 'ABCD2345' })
    expect((await getMembership(db, id, 'bob'))?.role).toBe('MEMBER')
  })

  it('public one-click join claims ownership too', async () => {
    await makeUser(db, 'alice')
    const id = await makeLeague(db, { competitionId, visibility: 'PUBLIC' })
    await joinPublicLeague(db, { userId: 'alice', leagueId: id })
    expect((await getMembership(db, id, 'alice'))?.role).toBe('OWNER')
  })
})

describe('joinPublicLeague', () => {
  it('joins public leagues by id', async () => {
    await makeUser(db, 'alice')
    await makeUser(db, 'bob')
    const id = await makeLeague(db, { competitionId, ownerId: 'alice', visibility: 'PUBLIC' })
    await joinPublicLeague(db, { userId: 'bob', leagueId: id })
    expect((await getMembership(db, id, 'bob'))?.role).toBe('MEMBER')
  })

  it('404s for private or unknown leagues, 409s for members', async () => {
    await makeUser(db, 'alice')
    await makeUser(db, 'bob')
    const priv = await makeLeague(db, { competitionId, ownerId: 'alice' })
    const pub = await makeLeague(db, { competitionId, ownerId: 'alice', visibility: 'PUBLIC' })
    await expect(joinPublicLeague(db, { userId: 'bob', leagueId: priv })).rejects.toBeInstanceOf(NotFoundError)
    await expect(joinPublicLeague(db, { userId: 'bob', leagueId: 'missing' })).rejects.toBeInstanceOf(NotFoundError)
    await expect(joinPublicLeague(db, { userId: 'alice', leagueId: pub })).rejects.toBeInstanceOf(ConflictError)
  })
})

describe('listUserLeagues', () => {
  it('returns role, member count and competition; join code only for owner/mod', async () => {
    await makeUser(db, 'alice')
    await makeUser(db, 'bob')
    const id = await makeLeague(db, { competitionId, ownerId: 'alice', joinCode: 'ABCD2345', name: 'Bureau' })
    await addLeagueMember(db, id, 'bob')
    const asOwner = await listUserLeagues(db, 'alice')
    expect(asOwner).toHaveLength(1)
    expect(asOwner[0]).toMatchObject({ id, role: 'OWNER', memberCount: 2, joinCode: 'ABCD2345' })
    expect(asOwner[0].competition.id).toBe(competitionId)
    const asMember = await listUserLeagues(db, 'bob')
    expect(asMember[0].role).toBe('MEMBER')
    expect(asMember[0].joinCode).toBeUndefined()
  })

  it('filters by competition when asked', async () => {
    await makeUser(db, 'alice')
    const otherCompetition = await makeCompetition(db)
    await makeLeague(db, { competitionId, ownerId: 'alice' })
    const other = await makeLeague(db, { competitionId: otherCompetition, ownerId: 'alice' })
    const filtered = await listUserLeagues(db, 'alice', otherCompetition)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe(other)
    expect(await listUserLeagues(db, 'alice')).toHaveLength(2)
  })
})

describe('listPublicLeagues', () => {
  it('lists only public leagues of the competition', async () => {
    const otherCompetition = await makeCompetition(db)
    await makeLeague(db, { competitionId, name: 'Hidden' })
    const pub = await makeLeague(db, { competitionId, name: 'Open', visibility: 'PUBLIC' })
    await makeLeague(db, { competitionId: otherCompetition, name: 'Elsewhere', visibility: 'PUBLIC' })
    const rows = await listPublicLeagues(db, competitionId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: pub, name: 'Open', memberCount: 0 })
  })
})

describe('listLeagueMembers', () => {
  it('orders owner, moderators, members, then by join date', async () => {
    await makeUser(db, 'alice')
    await makeUser(db, 'bob')
    await makeUser(db, 'carol')
    const id = await makeLeague(db, { competitionId, ownerId: 'alice' })
    await addLeagueMember(db, id, 'bob')
    await addLeagueMember(db, id, 'carol', 'MODERATOR')
    const rows = await listLeagueMembers(db, id)
    expect(rows.map((r) => r.userId)).toEqual(['alice', 'carol', 'bob'])
    expect(rows.map((r) => r.role)).toEqual(['OWNER', 'MODERATOR', 'MEMBER'])
  })
})

describe('leaveLeague', () => {
  it('removes a member and records an opt-out', async () => {
    await makeUser(db, 'alice')
    await makeUser(db, 'bob')
    const id = await makeLeague(db, { competitionId, ownerId: 'alice' })
    await addLeagueMember(db, id, 'bob')
    await leaveLeague(db, { leagueId: id, userId: 'bob' })
    expect(await getMembership(db, id, 'bob')).toBeNull()
    expect(await optOutExists(id, 'bob')).toBe(true)
  })

  it('blocks an owner with other members', async () => {
    await makeUser(db, 'alice')
    await makeUser(db, 'bob')
    const id = await makeLeague(db, { competitionId, ownerId: 'alice' })
    await addLeagueMember(db, id, 'bob')
    await expect(leaveLeague(db, { leagueId: id, userId: 'alice' })).rejects.toBeInstanceOf(ConflictError)
  })

  it('keeps the league when the last member leaves; the next joiner owns it', async () => {
    await makeUser(db, 'alice')
    await makeUser(db, 'bob')
    const id = await makeLeague(db, { competitionId, ownerId: 'alice', joinCode: 'ABCD2345' })
    await leaveLeague(db, { leagueId: id, userId: 'alice' })
    expect(await getLeague(db, id)).not.toBeNull()
    expect(await db.select().from(leagueMember).where(eq(leagueMember.leagueId, id))).toHaveLength(0)
    expect(await optOutExists(id, 'alice')).toBe(true)
    await joinLeagueByCode(db, { userId: 'bob', code: 'ABCD2345' })
    expect((await getMembership(db, id, 'bob'))?.role).toBe('OWNER')
  })

  it('404s for non-members', async () => {
    await makeUser(db, 'bob')
    const id = await makeLeague(db, { competitionId })
    await expect(leaveLeague(db, { leagueId: id, userId: 'bob' })).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('kickMember', () => {
  it('owner kicks moderator, moderator kicks member; opt-out recorded', async () => {
    await makeUser(db, 'alice')
    await makeUser(db, 'bob')
    await makeUser(db, 'carol')
    const id = await makeLeague(db, { competitionId, ownerId: 'alice' })
    await addLeagueMember(db, id, 'bob', 'MODERATOR')
    await addLeagueMember(db, id, 'carol')
    await kickMember(db, { leagueId: id, actorUserId: 'bob', targetUserId: 'carol' })
    expect(await getMembership(db, id, 'carol')).toBeNull()
    expect(await optOutExists(id, 'carol')).toBe(true)
    await kickMember(db, { leagueId: id, actorUserId: 'alice', targetUserId: 'bob' })
    expect(await getMembership(db, id, 'bob')).toBeNull()
  })

  it('rejects self-kick, insufficient roles and missing targets', async () => {
    await makeUser(db, 'alice')
    await makeUser(db, 'bob')
    await makeUser(db, 'carol')
    const id = await makeLeague(db, { competitionId, ownerId: 'alice' })
    await addLeagueMember(db, id, 'bob')
    await addLeagueMember(db, id, 'carol', 'MODERATOR')
    await expect(kickMember(db, { leagueId: id, actorUserId: 'bob', targetUserId: 'bob' })).rejects.toBeInstanceOf(ValidationError)
    await expect(kickMember(db, { leagueId: id, actorUserId: 'bob', targetUserId: 'alice' })).rejects.toBeInstanceOf(ForbiddenError)
    await expect(kickMember(db, { leagueId: id, actorUserId: 'carol', targetUserId: 'alice' })).rejects.toBeInstanceOf(ForbiddenError)
    await expect(kickMember(db, { leagueId: id, actorUserId: 'alice', targetUserId: 'ghost' })).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('setMemberRole', () => {
  it('promotes and demotes between MEMBER and MODERATOR', async () => {
    await makeUser(db, 'alice')
    await makeUser(db, 'bob')
    const id = await makeLeague(db, { competitionId, ownerId: 'alice' })
    await addLeagueMember(db, id, 'bob')
    await setMemberRole(db, { leagueId: id, targetUserId: 'bob', role: 'MODERATOR' })
    expect((await getMembership(db, id, 'bob'))?.role).toBe('MODERATOR')
    await setMemberRole(db, { leagueId: id, targetUserId: 'bob', role: 'MEMBER' })
    expect((await getMembership(db, id, 'bob'))?.role).toBe('MEMBER')
  })

  it('refuses to touch the owner and 404s on non-members', async () => {
    await makeUser(db, 'alice')
    const id = await makeLeague(db, { competitionId, ownerId: 'alice' })
    await expect(setMemberRole(db, { leagueId: id, targetUserId: 'alice', role: 'MEMBER' })).rejects.toBeInstanceOf(ConflictError)
    await expect(setMemberRole(db, { leagueId: id, targetUserId: 'ghost', role: 'MEMBER' })).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('transferOwnership', () => {
  it('swaps roles atomically', async () => {
    await makeUser(db, 'alice')
    await makeUser(db, 'bob')
    const id = await makeLeague(db, { competitionId, ownerId: 'alice' })
    await addLeagueMember(db, id, 'bob')
    await transferOwnership(db, { leagueId: id, fromUserId: 'alice', toUserId: 'bob' })
    expect((await getMembership(db, id, 'alice'))?.role).toBe('MODERATOR')
    expect((await getMembership(db, id, 'bob'))?.role).toBe('OWNER')
  })

  it('rejects self-transfer and non-member targets', async () => {
    await makeUser(db, 'alice')
    const id = await makeLeague(db, { competitionId, ownerId: 'alice' })
    await expect(transferOwnership(db, { leagueId: id, fromUserId: 'alice', toUserId: 'alice' })).rejects.toBeInstanceOf(ValidationError)
    await expect(transferOwnership(db, { leagueId: id, fromUserId: 'alice', toUserId: 'ghost' })).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('regenerateJoinCode', () => {
  it('replaces the code, retrying through collisions', async () => {
    await makeLeague(db, { competitionId, joinCode: 'TAKEN222' })
    const id = await makeLeague(db, { competitionId, joinCode: 'MINE2222' })
    const codes = ['TAKEN222', 'FRESH222']
    const code = await regenerateJoinCode(db, id, () => codes.shift()!)
    expect(code).toBe('FRESH222')
    expect((await getLeague(db, id))?.joinCode).toBe('FRESH222')
  })

  it('gives up after exhausting retries and 404s unknown leagues', async () => {
    await makeLeague(db, { competitionId, joinCode: 'TAKEN222' })
    const id = await makeLeague(db, { competitionId, joinCode: 'MINE2222' })
    await expect(regenerateJoinCode(db, id, () => 'TAKEN222')).rejects.toMatchObject({ cause: { code: '23505' } })
    await expect(regenerateJoinCode(db, 'missing')).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('rename / visibility / delete', () => {
  it('updates name and visibility', async () => {
    const id = await makeLeague(db, { competitionId, name: 'Old' })
    await renameLeague(db, id, 'New')
    await setLeagueVisibility(db, id, 'PUBLIC')
    const row = await getLeague(db, id)
    expect(row?.name).toBe('New')
    expect(row?.visibility).toBe('PUBLIC')
  })

  it('delete cascades memberships and opt-outs', async () => {
    await makeUser(db, 'alice')
    await makeUser(db, 'bob')
    const id = await makeLeague(db, { competitionId, ownerId: 'alice' })
    await addLeagueMember(db, id, 'bob')
    await removeMembership(db, id, 'bob')
    await deleteLeague(db, id)
    expect(await getLeague(db, id)).toBeNull()
    expect(await db.select().from(leagueMember).where(eq(leagueMember.leagueId, id))).toHaveLength(0)
    expect(await db.select().from(leagueOptOut).where(eq(leagueOptOut.leagueId, id))).toHaveLength(0)
  })

  it('404 on unknown league for all three', async () => {
    await expect(renameLeague(db, 'missing', 'X')).rejects.toBeInstanceOf(NotFoundError)
    await expect(setLeagueVisibility(db, 'missing', 'PUBLIC')).rejects.toBeInstanceOf(NotFoundError)
    await expect(deleteLeague(db, 'missing')).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('league prompt', () => {
  it('shows only for users with no membership and no dismissal', async () => {
    await makeUser(db, 'alice')
    expect(await shouldShowLeaguePrompt(db, 'alice')).toBe(true)
    await dismissLeaguePrompt(db, 'alice')
    expect(await shouldShowLeaguePrompt(db, 'alice')).toBe(false)
    // Idempotent: the original timestamp is kept.
    const first = await promptDismissedAt('alice')
    await dismissLeaguePrompt(db, 'alice')
    expect(await promptDismissedAt('alice')).toEqual(first)
  })

  it('membership alone hides the prompt, and unknown users never see it', async () => {
    await makeUser(db, 'bob')
    const id = await makeLeague(db, { competitionId })
    await addLeagueMember(db, id, 'bob')
    // Direct insert (factory) bypasses the service stamp - membership must win on its own.
    expect(await promptDismissedAt('bob')).toBeNull()
    expect(await shouldShowLeaguePrompt(db, 'bob')).toBe(false)
    expect(await shouldShowLeaguePrompt(db, 'ghost')).toBe(false)
  })
})

describe('adminAddMember / setAdminMemberRole', () => {
  it('upserts membership, clears opt-out and stamps the prompt', async () => {
    await makeUser(db, 'alice')
    await makeUser(db, 'bob')
    const id = await makeLeague(db, { competitionId, ownerId: 'alice' })
    await db.insert(leagueOptOut).values({ leagueId: id, userId: 'bob' })
    await adminAddMember(db, { leagueId: id, userId: 'bob' })
    expect((await getMembership(db, id, 'bob'))?.role).toBe('MEMBER')
    expect(await optOutExists(id, 'bob')).toBe(false)
    expect(await promptDismissedAt('bob')).not.toBeNull()
    // Upsert path: adding again with a role updates in place.
    await adminAddMember(db, { leagueId: id, userId: 'bob', role: 'MODERATOR' })
    expect((await getMembership(db, id, 'bob'))?.role).toBe('MODERATOR')
  })

  it('assigning OWNER demotes the current owner (add and role-set paths)', async () => {
    await makeUser(db, 'alice')
    await makeUser(db, 'bob')
    await makeUser(db, 'carol')
    const id = await makeLeague(db, { competitionId, ownerId: 'alice' })
    await adminAddMember(db, { leagueId: id, userId: 'bob', role: 'OWNER' })
    expect((await getMembership(db, id, 'alice'))?.role).toBe('MODERATOR')
    expect((await getMembership(db, id, 'bob'))?.role).toBe('OWNER')
    await addLeagueMember(db, id, 'carol')
    await setAdminMemberRole(db, { leagueId: id, userId: 'carol', role: 'OWNER' })
    expect((await getMembership(db, id, 'bob'))?.role).toBe('MODERATOR')
    expect((await getMembership(db, id, 'carol'))?.role).toBe('OWNER')
  })

  it('404s on unknown league, user or membership', async () => {
    await makeUser(db, 'alice')
    const id = await makeLeague(db, { competitionId, ownerId: 'alice' })
    await expect(adminAddMember(db, { leagueId: 'missing', userId: 'alice' })).rejects.toBeInstanceOf(NotFoundError)
    await expect(adminAddMember(db, { leagueId: id, userId: 'ghost' })).rejects.toBeInstanceOf(NotFoundError)
    await expect(setAdminMemberRole(db, { leagueId: id, userId: 'ghost', role: 'MEMBER' })).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('pruneEmptyLeagues', () => {
  it('removes only memberless leagues and reports the count', async () => {
    await makeUser(db, 'alice')
    const kept = await makeLeague(db, { competitionId, ownerId: 'alice' })
    const empty1 = await makeLeague(db, { competitionId })
    const empty2 = await makeLeague(db, { competitionId, visibility: 'PUBLIC' })
    // Opt-outs alone don't keep a league alive.
    await db.insert(leagueOptOut).values({ leagueId: empty1, userId: 'alice' })

    expect(await pruneEmptyLeagues(db)).toBe(2)
    expect(await getLeague(db, kept)).not.toBeNull()
    expect(await getLeague(db, empty1)).toBeNull()
    expect(await getLeague(db, empty2)).toBeNull()
    expect(await pruneEmptyLeagues(db)).toBe(0)
  })
})

describe('assertLeaguesExist', () => {
  it('passes on known ids (with duplicates) and empty input, throws on unknown', async () => {
    const a = await makeLeague(db, { competitionId })
    const b = await makeLeague(db, { competitionId })
    await expect(assertLeaguesExist(db, [])).resolves.toBeUndefined()
    await expect(assertLeaguesExist(db, [a, b, a])).resolves.toBeUndefined()
    await expect(assertLeaguesExist(db, [a, 'missing'])).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('shareLeague / canViewProfile', () => {
  it('shareLeague is true only for users with a common league', async () => {
    await makeUser(db, 'alice')
    await makeUser(db, 'bob')
    await makeUser(db, 'carol')
    const id = await makeLeague(db, { competitionId, ownerId: 'alice' })
    await addLeagueMember(db, id, 'bob')
    expect(await shareLeague(db, 'alice', 'bob')).toBe(true)
    expect(await shareLeague(db, 'bob', 'alice')).toBe(true)
    expect(await shareLeague(db, 'alice', 'carol')).toBe(false)
    expect(await shareLeague(db, 'carol', 'ghost')).toBe(false)
  })

  it('public profiles are visible to anyone, unknown users to no one', async () => {
    await makeUser(db, 'alice')
    expect(await canViewProfile(db, { viewerId: null, targetUserId: 'alice' })).toBe(true)
    expect(await canViewProfile(db, { viewerId: 'someone', targetUserId: 'ghost' })).toBe(false)
  })

  it('private profiles pass for self, admins and league mates only', async () => {
    await makeUser(db, 'alice')
    await makeUser(db, 'bob')
    await makeUser(db, 'carol')
    await db.update(user).set({ profilePrivate: true }).where(eq(user.id, 'alice'))
    const id = await makeLeague(db, { competitionId, ownerId: 'alice' })
    await addLeagueMember(db, id, 'bob')

    expect(await canViewProfile(db, { viewerId: 'alice', targetUserId: 'alice' })).toBe(true)
    expect(await canViewProfile(db, { viewerId: 'carol', targetUserId: 'alice', isAdmin: true })).toBe(true)
    expect(await canViewProfile(db, { viewerId: 'bob', targetUserId: 'alice' })).toBe(true)
    expect(await canViewProfile(db, { viewerId: 'carol', targetUserId: 'alice' })).toBe(false)
    expect(await canViewProfile(db, { viewerId: null, targetUserId: 'alice' })).toBe(false)
  })
})

describe('admin list / create / provider links', () => {
  async function makeProvider(providerId: string) {
    await db.insert(ssoProvider).values({ id: providerId, providerId, issuer: 'https://idp.test', domain: 'corp.test' })
  }

  it('listLeaguesAdmin returns owner, member count and provider links', async () => {
    await makeUser(db, 'alice')
    await makeUser(db, 'bob')
    const otherCompetition = await makeCompetition(db)
    const a = await makeLeague(db, { competitionId, ownerId: 'alice', name: 'Alpha', joinCode: 'AAAA2222' })
    await addLeagueMember(db, a, 'bob')
    const b = await makeLeague(db, { competitionId: otherCompetition, name: 'Beta' })
    await makeProvider('acme')
    await db.insert(ssoProviderLeague).values({ providerId: 'acme', leagueId: a })

    const all = await listLeaguesAdmin(db)
    expect(all).toHaveLength(2)
    const alpha = all.find((l) => l.id === a)!
    expect(alpha).toMatchObject({
      name: 'Alpha',
      joinCode: 'AAAA2222',
      memberCount: 2,
      owner: { userId: 'alice', name: 'alice' },
      autoJoinProviderIds: ['acme'],
    })
    const beta = all.find((l) => l.id === b)!
    expect(beta.owner).toBeNull()
    expect(beta.autoJoinProviderIds).toEqual([])

    const filtered = await listLeaguesAdmin(db, otherCompetition)
    expect(filtered.map((l) => l.id)).toEqual([b])
    expect(await listLeaguesAdmin(db, 'missing')).toEqual([])
  })

  it('adminCreateLeague supports ownerless and owned creation', async () => {
    await makeUser(db, 'alice')
    const ownerless = await adminCreateLeague(db, { competitionId, name: 'NoOwner' })
    expect((await listLeagueMembers(db, ownerless.id))).toHaveLength(0)
    const owned = await adminCreateLeague(db, { competitionId, name: 'Owned', ownerId: 'alice', visibility: 'PUBLIC' })
    expect((await getMembership(db, owned.id, 'alice'))?.role).toBe('OWNER')
    expect(owned.visibility).toBe('PUBLIC')
    await expect(adminCreateLeague(db, { competitionId, name: 'Ghost', ownerId: 'ghost' })).rejects.toBeInstanceOf(NotFoundError)
  })

  it('adminCreateLeague retries ownerless creation through code collisions', async () => {
    await makeLeague(db, { competitionId, joinCode: 'TAKEN222' })
    const codes = ['TAKEN222', 'FRESH222']
    const row = await adminCreateLeague(db, { competitionId, name: 'Retry', codeGen: () => codes.shift()! })
    expect(row.joinCode).toBe('FRESH222')
    await expect(
      adminCreateLeague(db, { competitionId, name: 'Stuck', codeGen: () => 'TAKEN222' }),
    ).rejects.toMatchObject({ cause: { code: '23505' } })
  })

  it('setProviderAutoJoinLeagues replaces the set and validates inputs', async () => {
    const a = await makeLeague(db, { competitionId })
    const b = await makeLeague(db, { competitionId })
    await makeProvider('acme')
    await setProviderAutoJoinLeagues(db, 'acme', [a, b, a])
    expect((await listProviderAutoJoinLeagues(db)).get('acme')?.sort()).toEqual([a, b].sort())
    await setProviderAutoJoinLeagues(db, 'acme', [b])
    expect((await listProviderAutoJoinLeagues(db)).get('acme')).toEqual([b])
    await setProviderAutoJoinLeagues(db, 'acme', [])
    expect((await listProviderAutoJoinLeagues(db)).get('acme')).toBeUndefined()
    await expect(setProviderAutoJoinLeagues(db, 'ghost', [a])).rejects.toBeInstanceOf(NotFoundError)
    await expect(setProviderAutoJoinLeagues(db, 'acme', ['missing'])).rejects.toBeInstanceOf(ValidationError)
  })

  it('provider deletion cascades its league links', async () => {
    const a = await makeLeague(db, { competitionId })
    await makeProvider('acme')
    await setProviderAutoJoinLeagues(db, 'acme', [a])
    await db.delete(ssoProvider).where(eq(ssoProvider.providerId, 'acme'))
    expect((await listProviderAutoJoinLeagues(db)).size).toBe(0)
  })
})

describe('user deletion cascade', () => {
  it('removes memberships and nulls league.createdBy', async () => {
    await makeUser(db, 'alice')
    await makeUser(db, 'bob')
    const id = await makeLeague(db, { competitionId, ownerId: 'alice' })
    await addLeagueMember(db, id, 'bob')
    await db.delete(user).where(eq(user.id, 'alice'))
    expect(await getMembership(db, id, 'alice')).toBeNull()
    expect((await getLeague(db, id))?.createdBy).toBeNull()
    // Ownerless league survives; remaining members keep it alive.
    expect((await listLeagueMembers(db, id)).map((m) => m.userId)).toEqual(['bob'])
  })
})
