import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { addLeagueMember, makeLeague, makeUser, seedCompetition } from '../../../tests/factories'
import { chatIdentity } from '../../../db/schema'
import { enableLeagueChat, postMessage } from './service'
import { createThread, postDmMessage } from '../dm/service'
import { authorizeMessageActor, isModerator, messageAudience } from './access'
import { ForbiddenError, NotFoundError } from '../errors'

type Db = Awaited<ReturnType<typeof createTestDb>>['db']

async function chatUser(db: Db, id: string): Promise<string> {
  await makeUser(db, id)
  await db.insert(chatIdentity).values({ userId: id, publicKey: `pk-${id}` })
  return id
}

// A league room with an enabled chat plus a DM thread between two of the users, so
// both scope branches of the resolver can be exercised against real rows.
async function setup() {
  const ctx = await createTestDb()
  const competitionId = await seedCompetition(ctx.db)
  const owner = await chatUser(ctx.db, 'owner')
  const member = await chatUser(ctx.db, 'member')
  const stranger = await chatUser(ctx.db, 'stranger')
  const leagueId = await makeLeague(ctx.db, { competitionId, ownerId: owner })
  await addLeagueMember(ctx.db, leagueId, member)
  await enableLeagueChat(ctx.db, { leagueId, actorId: owner, wraps: [{ userId: owner, wrappedKey: 'wk' }] })
  const leagueMsg = await postMessage(ctx.db, { leagueId, userId: owner, ciphertext: 'lg', epoch: 1 })
  const { threadId } = await createThread(ctx.db, {
    userId: owner,
    recipientId: member,
    wraps: [{ userId: owner, wrappedKey: 'a' }, { userId: member, wrappedKey: 'b' }],
  })
  const dmMsg = await postDmMessage(ctx.db, { threadId, userId: owner, ciphertext: 'dm', epoch: 1 })
  return { ...ctx, owner, member, stranger, leagueId, leagueMsg, threadId, dmMsg }
}

describe('authorizeMessageActor', () => {
  it('resolves a league message for a member and forbids a non-member', async () => {
    const { db, client, owner, stranger, leagueId, leagueMsg } = await setup()
    const ctx = await authorizeMessageActor(db, leagueMsg.id, owner)
    expect(ctx).toMatchObject({ kind: 'league', leagueId, matchId: null, role: 'OWNER' })
    await expect(authorizeMessageActor(db, leagueMsg.id, stranger)).rejects.toBeInstanceOf(ForbiddenError)
    await client.close()
  })

  it('resolves a DM message for a participant and 404s a non-participant', async () => {
    const { db, client, owner, member, stranger, threadId, dmMsg } = await setup()
    const ctx = await authorizeMessageActor(db, dmMsg.id, member)
    expect(ctx).toMatchObject({ kind: 'dm', threadId })
    if (ctx.kind === 'dm') expect([ctx.userAId, ctx.userBId].sort()).toEqual([owner, member].sort())
    await expect(authorizeMessageActor(db, dmMsg.id, stranger)).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })

  it('404s an unknown message id', async () => {
    const { db, client, owner } = await setup()
    await expect(
      authorizeMessageActor(db, '00000000-0000-0000-0000-000000000000', owner),
    ).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })
})

describe('messageAudience', () => {
  it('returns the league members for a league scope', async () => {
    const { db, client, owner, member, leagueId } = await setup()
    const audience = await messageAudience(db, { kind: 'league', leagueId, matchId: null, role: 'OWNER' })
    expect(audience.sort()).toEqual([owner, member].sort())
    await client.close()
  })

  it('returns the two participants for a DM scope', async () => {
    const { db, client } = await setup()
    const audience = await messageAudience(db, { kind: 'dm', threadId: 't', userAId: 'a', userBId: 'b' })
    expect(audience).toEqual(['a', 'b'])
    await client.close()
  })
})

describe('isModerator', () => {
  it('is true only for a league owner/moderator, false for a member and any DM', () => {
    expect(isModerator({ kind: 'league', leagueId: 'l', matchId: null, role: 'OWNER' })).toBe(true)
    expect(isModerator({ kind: 'league', leagueId: 'l', matchId: null, role: 'MODERATOR' })).toBe(true)
    expect(isModerator({ kind: 'league', leagueId: 'l', matchId: null, role: 'MEMBER' })).toBe(false)
    expect(isModerator({ kind: 'dm', threadId: 't', userAId: 'a', userBId: 'b' })).toBe(false)
  })
})
