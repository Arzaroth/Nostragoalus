import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { addLeagueMember, makeLeague, makeUser, seedCompetition } from '../../../tests/factories'
import { chatMessage, dmThread } from '../../../db/schema'
import { setChatReaction, getReactionTotals, getMyReactions, getMessageReactionTotals } from './reactions'
import { emptyReactionTotals } from '../../../shared/reactions'
import { ForbiddenError, NotFoundError, ValidationError } from '../errors'

type Db = Awaited<ReturnType<typeof createTestDb>>['db']

async function addMessage(db: Db, leagueId: string, userId: string, text = 'c'): Promise<string> {
  const rows = await db.insert(chatMessage).values({ leagueId, userId, epoch: 1, ciphertext: text }).returning({ id: chatMessage.id })
  return rows[0].id
}

async function setup() {
  const ctx = await createTestDb()
  const competitionId = await seedCompetition(ctx.db)
  const owner = await makeUser(ctx.db, 'owner')
  const member = await makeUser(ctx.db, 'member')
  const leagueId = await makeLeague(ctx.db, { competitionId, ownerId: owner })
  await addLeagueMember(ctx.db, leagueId, member)
  const messageId = await addMessage(ctx.db, leagueId, owner)
  return { ...ctx, competitionId, owner, member, leagueId, messageId }
}

describe('setChatReaction', () => {
  it('sets, changes and clears the caller reaction (one per message)', async () => {
    const { db, client, leagueId, messageId, member } = await setup()
    await setChatReaction(db, { leagueId, messageId, userId: member, emoji: 'FIRE' })
    expect(await getMessageReactionTotals(db, messageId)).toMatchObject({ FIRE: 1 })
    // Changing the emoji replaces, it does not stack.
    await setChatReaction(db, { leagueId, messageId, userId: member, emoji: 'GOAL' })
    const totals = await getMessageReactionTotals(db, messageId)
    expect(totals).toMatchObject({ FIRE: 0, GOAL: 1 })
    expect(await getMyReactions(db, member, [messageId])).toEqual({ [messageId]: 'GOAL' })
    // null clears it.
    await setChatReaction(db, { leagueId, messageId, userId: member, emoji: null })
    expect(await getMessageReactionTotals(db, messageId)).toEqual(emptyReactionTotals())
    expect(await getMyReactions(db, member, [messageId])).toEqual({})
    await client.close()
  })

  it('counts distinct members and reports my own reaction', async () => {
    const { db, client, leagueId, messageId, owner, member } = await setup()
    await setChatReaction(db, { leagueId, messageId, userId: owner, emoji: 'FIRE' })
    await setChatReaction(db, { leagueId, messageId, userId: member, emoji: 'FIRE' })
    expect(await getReactionTotals(db, [messageId])).toEqual({ [messageId]: { ...emptyReactionTotals(), FIRE: 2 } })
    expect(await getMyReactions(db, owner, [messageId])).toEqual({ [messageId]: 'FIRE' })
    await client.close()
  })

  it('forbids non-members and 404s an unknown message', async () => {
    const { db, client, messageId } = await setup()
    const stranger = await makeUser(db, 'stranger')
    await expect(setChatReaction(db, { messageId, userId: stranger, emoji: 'FIRE' })).rejects.toBeInstanceOf(ForbiddenError)
    await expect(setChatReaction(db, { messageId: '00000000-0000-0000-0000-000000000000', userId: stranger, emoji: 'FIRE' })).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })

  it('authorizes a DM participant and 404s a non-participant on a DM message', async () => {
    const { db, client, owner, member } = await setup()
    // A DM thread + a chat_message scoped to it (leagueId null).
    const [lo, hi] = owner < member ? [owner, member] : [member, owner]
    const t = await db.insert(dmThread).values({ userAId: lo, userBId: hi }).returning({ id: dmThread.id })
    const dmMsg = await db.insert(chatMessage).values({ dmThreadId: t[0].id, userId: owner, epoch: 1, ciphertext: 'secret' }).returning({ id: chatMessage.id })
    // A participant reacts; the returned context is the DM scope.
    const ctx = await setChatReaction(db, { messageId: dmMsg[0].id, userId: owner, emoji: 'FIRE' })
    expect(ctx.kind).toBe('dm')
    // A non-participant cannot even see the message.
    const stranger = await makeUser(db, 'stranger2')
    await expect(setChatReaction(db, { messageId: dmMsg[0].id, userId: stranger, emoji: 'FIRE' })).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })

  it('rejects an unknown emoji', async () => {
    const { db, client, messageId, member } = await setup()
    await expect(setChatReaction(db, { messageId, userId: member, emoji: 'NOPE' as never })).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })

  it('returns empty totals for an empty id list', async () => {
    const { db, client } = await setup()
    expect(await getReactionTotals(db, [])).toEqual({})
    expect(await getMyReactions(db, 'x', [])).toEqual({})
    await client.close()
  })
})
