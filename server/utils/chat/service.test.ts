import { describe, it, expect } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { findRoundId } from '../sync/rounds'
import { addLeagueMember, makeLeague, makeMatch, makeUser, seedCompetition } from '../../../tests/factories'
import { chatIdentity, chatMessage, league } from '../../../db/schema'
import {
  addWrappedKeys,
  disableLeagueChat,
  enableLeagueChat,
  getChatIdentity,
  getMemberPublicKeys,
  getMembersMissingKey,
  getMyWrappedKey,
  getRecoveryBlob,
  listMessages,
  postMessage,
  registerChatIdentity,
  setRecoveryBlob,
} from './service'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../errors'

type Db = Awaited<ReturnType<typeof createTestDb>>['db']

async function setup() {
  const ctx = await createTestDb()
  const competitionId = await seedCompetition(ctx.db)
  const roundId = (await findRoundId(ctx.db, competitionId, 'GROUP', 1)) as string
  const owner = await makeUser(ctx.db, 'owner')
  const leagueId = await makeLeague(ctx.db, { competitionId, ownerId: owner })
  return { ...ctx, competitionId, roundId, owner, leagueId }
}

async function addIdentity(db: Db, userId: string, pk = `pk-${userId}`) {
  await db.insert(chatIdentity).values({ userId, publicKey: pk })
}
function wrapsFor(userIds: string[]) {
  return userIds.map((u) => ({ userId: u, wrappedKey: `wk-${u}` }))
}
async function enableWith(db: Db, leagueId: string, actorId: string, memberIds: string[]) {
  return enableLeagueChat(db, { leagueId, actorId, wraps: wrapsFor(memberIds) })
}

describe('chat identity', () => {
  it('rejects an empty public key', async () => {
    const { db, client, owner } = await setup()
    await expect(registerChatIdentity(db, owner, '')).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })

  it('registers once and does not overwrite an existing key', async () => {
    const { db, client, owner } = await setup()
    expect(await getChatIdentity(db, owner)).toBeNull()
    expect(await registerChatIdentity(db, owner, 'pkA')).toEqual({ publicKey: 'pkA', created: true })
    expect(await registerChatIdentity(db, owner, 'pkB')).toEqual({ publicKey: 'pkA', created: false })
    expect((await getChatIdentity(db, owner))?.publicKey).toBe('pkA')
    await client.close()
  })

  it('stores and reads back the recovery blob', async () => {
    const { db, client, owner } = await setup()
    await expect(setRecoveryBlob(db, owner, '')).rejects.toBeInstanceOf(ValidationError)
    await expect(setRecoveryBlob(db, owner, 'blob')).rejects.toBeInstanceOf(NotFoundError)
    await addIdentity(db, owner)
    expect(await getRecoveryBlob(db, owner)).toBeNull() // identity, no blob yet
    await setRecoveryBlob(db, owner, 'blob')
    expect(await getRecoveryBlob(db, owner)).toBe('blob')
    await client.close()
  })

  it('returns null recovery blob when there is no identity at all', async () => {
    const { db, client } = await setup()
    const stranger = await makeUser(db, 'stranger')
    expect(await getRecoveryBlob(db, stranger)).toBeNull()
    await client.close()
  })

  it('lists public keys only for members who have an identity', async () => {
    const { db, client, owner, leagueId } = await setup()
    const u2 = await makeUser(db, 'u2')
    await addLeagueMember(db, leagueId, u2)
    await addIdentity(db, owner)
    expect(await getMemberPublicKeys(db, leagueId)).toEqual([{ userId: owner, publicKey: 'pk-owner' }])
    await addIdentity(db, u2)
    expect((await getMemberPublicKeys(db, leagueId)).map((m) => m.userId).sort()).toEqual([owner, u2].sort())
    await client.close()
  })
})

describe('enableLeagueChat', () => {
  it('throws NotFound for an unknown league', async () => {
    const { db, client, owner } = await setup()
    await expect(enableLeagueChat(db, { leagueId: 'nope', actorId: owner, wraps: [] })).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })

  it('forbids a non-member and a plain member', async () => {
    const { db, client, leagueId } = await setup()
    const stranger = await makeUser(db, 'stranger')
    await expect(enableWith(db, leagueId, stranger, [])).rejects.toBeInstanceOf(ForbiddenError)
    const member = await makeUser(db, 'member')
    await addLeagueMember(db, leagueId, member)
    await expect(enableWith(db, leagueId, member, [])).rejects.toBeInstanceOf(ForbiddenError)
    await client.close()
  })

  it('enables for the owner and stores the wraps', async () => {
    const { db, client, owner, leagueId } = await setup()
    const r = await enableWith(db, leagueId, owner, [owner])
    expect(r.epoch).toBe(1)
    const lg = (await db.select().from(league).where(eq(league.id, leagueId)))[0]
    expect(lg.chatEnabled).toBe(true)
    expect(lg.chatKeyEpoch).toBe(1)
    expect(lg.chatEnabledBy).toBe(owner)
    expect(await getMyWrappedKey(db, leagueId, owner, 1)).toBe('wk-owner')
    await client.close()
  })

  it('enables for a moderator (with no wraps)', async () => {
    const { db, client, leagueId } = await setup()
    const mod = await makeUser(db, 'mod')
    await addLeagueMember(db, leagueId, mod, 'MODERATOR')
    const r = await enableWith(db, leagueId, mod, [])
    expect(r.epoch).toBe(1)
    await client.close()
  })

  it('conflicts when already enabled', async () => {
    const { db, client, owner, leagueId } = await setup()
    await enableWith(db, leagueId, owner, [owner])
    await expect(enableWith(db, leagueId, owner, [owner])).rejects.toBeInstanceOf(ConflictError)
    await client.close()
  })

  it('rejects wrapping the key for a non-member', async () => {
    const { db, client, owner, leagueId } = await setup()
    const stranger = await makeUser(db, 'stranger')
    await expect(enableWith(db, leagueId, owner, [stranger])).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })
})

describe('disableLeagueChat', () => {
  it('throws NotFound for an unknown league', async () => {
    const { db, client, owner } = await setup()
    await expect(disableLeagueChat(db, { leagueId: 'nope', actorId: owner })).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })

  it('forbids a non-admin', async () => {
    const { db, client, leagueId } = await setup()
    const member = await makeUser(db, 'member')
    await addLeagueMember(db, leagueId, member)
    await expect(disableLeagueChat(db, { leagueId, actorId: member })).rejects.toBeInstanceOf(ForbiddenError)
    await client.close()
  })

  it('turns chat off', async () => {
    const { db, client, owner, leagueId } = await setup()
    await enableWith(db, leagueId, owner, [owner])
    await disableLeagueChat(db, { leagueId, actorId: owner })
    const lg = (await db.select().from(league).where(eq(league.id, leagueId)))[0]
    expect(lg.chatEnabled).toBe(false)
    await client.close()
  })
})

describe('key distribution', () => {
  it('getMyWrappedKey is null before a key exists', async () => {
    const { db, client, owner, leagueId } = await setup()
    expect(await getMyWrappedKey(db, leagueId, owner, 1)).toBeNull()
    await client.close()
  })

  it('lists members missing a key (identity but no wrap)', async () => {
    const { db, client, owner, leagueId } = await setup()
    await enableWith(db, leagueId, owner, [owner]) // owner has a key
    const u2 = await makeUser(db, 'u2')
    await addLeagueMember(db, leagueId, u2)
    await addIdentity(db, u2) // identity, no key
    const u3 = await makeUser(db, 'u3')
    await addLeagueMember(db, leagueId, u3) // no identity -> excluded
    expect(await getMembersMissingKey(db, leagueId, 1)).toEqual([{ userId: u2, publicKey: 'pk-u2' }])
    await client.close()
  })

  it('addWrappedKeys: NotFound, Forbidden, stale epoch, empty, non-member, idempotent', async () => {
    const { db, client, owner, leagueId } = await setup()
    await expect(addWrappedKeys(db, { leagueId: 'nope', actorId: owner, epoch: 1, wraps: wrapsFor([owner]) })).rejects.toBeInstanceOf(NotFoundError)
    await enableWith(db, leagueId, owner, [owner])
    const stranger = await makeUser(db, 'stranger')
    await expect(addWrappedKeys(db, { leagueId, actorId: stranger, epoch: 1, wraps: wrapsFor([owner]) })).rejects.toBeInstanceOf(ForbiddenError)
    await expect(addWrappedKeys(db, { leagueId, actorId: owner, epoch: 2, wraps: wrapsFor([owner]) })).rejects.toBeInstanceOf(ConflictError)
    expect(await addWrappedKeys(db, { leagueId, actorId: owner, epoch: 1, wraps: [] })).toEqual({ added: 0 })
    await expect(addWrappedKeys(db, { leagueId, actorId: owner, epoch: 1, wraps: wrapsFor([stranger]) })).rejects.toBeInstanceOf(ValidationError)
    const u2 = await makeUser(db, 'u2')
    await addLeagueMember(db, leagueId, u2)
    expect(await addWrappedKeys(db, { leagueId, actorId: owner, epoch: 1, wraps: wrapsFor([u2]) })).toEqual({ added: 1 })
    expect(await getMyWrappedKey(db, leagueId, u2, 1)).toBe('wk-u2')
    // Idempotent: re-wrapping the same member at the same epoch adds nothing.
    expect(await addWrappedKeys(db, { leagueId, actorId: owner, epoch: 1, wraps: wrapsFor([u2]) })).toEqual({ added: 0 })
    await client.close()
  })
})

describe('postMessage', () => {
  it('validates the ciphertext', async () => {
    const { db, client, owner, leagueId } = await setup()
    await expect(postMessage(db, { leagueId, userId: owner, ciphertext: '', epoch: 1 })).rejects.toBeInstanceOf(ValidationError)
    await expect(
      postMessage(db, { leagueId, userId: owner, ciphertext: 'x'.repeat(16_385), epoch: 1 }),
    ).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })

  it('throws NotFound for an unknown league', async () => {
    const { db, client, owner } = await setup()
    await expect(postMessage(db, { leagueId: 'nope', userId: owner, ciphertext: 'c', epoch: 1 })).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })

  it('forbids non-members and posting while disabled', async () => {
    const { db, client, owner, leagueId } = await setup()
    const stranger = await makeUser(db, 'stranger')
    await expect(postMessage(db, { leagueId, userId: stranger, ciphertext: 'c', epoch: 0 })).rejects.toBeInstanceOf(ForbiddenError)
    // Member, but chat not enabled yet.
    await expect(postMessage(db, { leagueId, userId: owner, ciphertext: 'c', epoch: 0 })).rejects.toBeInstanceOf(ForbiddenError)
    await client.close()
  })

  it('conflicts on a stale epoch', async () => {
    const { db, client, owner, leagueId } = await setup()
    await enableWith(db, leagueId, owner, [owner])
    await expect(postMessage(db, { leagueId, userId: owner, ciphertext: 'c', epoch: 2 })).rejects.toBeInstanceOf(ConflictError)
    await client.close()
  })

  it('posts to the league room and to a match thread', async () => {
    const { db, client, owner, leagueId, competitionId, roundId } = await setup()
    await enableWith(db, leagueId, owner, [owner])
    const room = await postMessage(db, { leagueId, userId: owner, ciphertext: 'hello', epoch: 1 })
    expect(room.matchId).toBeNull()
    expect(room.userId).toBe(owner)
    expect(room.ciphertext).toBe('hello')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-10T10:00:00Z') })
    const thread = await postMessage(db, { leagueId, userId: owner, matchId: m, ciphertext: 'on the match', epoch: 1 })
    expect(thread.matchId).toBe(m)
    await client.close()
  })

  it('rejects a match thread for an unknown or cross-competition match', async () => {
    const { db, client, owner, leagueId } = await setup()
    await enableWith(db, leagueId, owner, [owner])
    await expect(postMessage(db, { leagueId, userId: owner, matchId: 'nope', ciphertext: 'c', epoch: 1 })).rejects.toBeInstanceOf(ValidationError)
    const otherComp = await seedCompetition(db)
    const otherRound = (await findRoundId(db, otherComp, 'GROUP', 1)) as string
    const otherMatch = await makeMatch(db, { competitionId: otherComp, roundId: otherRound, kickoffTime: new Date('2026-06-10T10:00:00Z') })
    await expect(postMessage(db, { leagueId, userId: owner, matchId: otherMatch, ciphertext: 'c', epoch: 1 })).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })
})

describe('listMessages', () => {
  it('forbids non-members', async () => {
    const { db, client, leagueId } = await setup()
    const stranger = await makeUser(db, 'stranger')
    await expect(listMessages(db, { leagueId, userId: stranger })).rejects.toBeInstanceOf(ForbiddenError)
    await client.close()
  })

  it('returns the room newest-first and paginates with before', async () => {
    const { db, client, owner, leagueId, competitionId, roundId } = await setup()
    const t = (s: number) => new Date(`2026-06-10T10:0${s}:00Z`)
    await db.insert(chatMessage).values([
      { leagueId, userId: owner, epoch: 1, ciphertext: 'm1', createdAt: t(1) },
      { leagueId, userId: owner, epoch: 1, ciphertext: 'm2', createdAt: t(2) },
      { leagueId, userId: owner, epoch: 1, ciphertext: 'm3', createdAt: t(3) },
    ])
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: t(1) })
    await db.insert(chatMessage).values({ leagueId, matchId: m, userId: owner, epoch: 1, ciphertext: 'thread', createdAt: t(4) })

    const room = await listMessages(db, { leagueId, userId: owner })
    expect(room.map((r) => r.ciphertext)).toEqual(['m3', 'm2', 'm1']) // newest first, league room only
    const page = await listMessages(db, { leagueId, userId: owner, limit: 2 })
    expect(page.map((r) => r.ciphertext)).toEqual(['m3', 'm2'])
    const older = await listMessages(db, { leagueId, userId: owner, before: t(2) })
    expect(older.map((r) => r.ciphertext)).toEqual(['m1'])
    const thread = await listMessages(db, { leagueId, userId: owner, matchId: m })
    expect(thread.map((r) => r.ciphertext)).toEqual(['thread'])
    await client.close()
  })
})
