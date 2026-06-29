import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { addLeagueMember, makeLeague, makeMatch, makeUser, seedCompetition } from '../../../tests/factories'
import { findRoundId } from '../sync/rounds'
import { chatMessage, userNotification } from '../../../db/schema'
import { notifyMentions } from './mentions'
import type { NotificationData } from '../../../shared/types/notifications'

type Db = Awaited<ReturnType<typeof createTestDb>>['db']
type MentionData = Extract<NotificationData, { type: 'CHAT_MENTION' }>

async function addMessage(db: Db, leagueId: string, userId: string, matchId: string | null = null): Promise<string> {
  const rows = await db
    .insert(chatMessage)
    .values({ leagueId, userId, matchId, epoch: 1, ciphertext: 'x' })
    .returning({ id: chatMessage.id })
  return rows[0].id
}

function notifsFor(db: Db, userId: string) {
  return db.select().from(userNotification).where(eq(userNotification.userId, userId))
}

// sender (owner) + two members in one league of a 'wc' competition.
async function setup() {
  const ctx = await createTestDb()
  const competitionId = await seedCompetition(ctx.db, { slug: 'wc' })
  const sender = await makeUser(ctx.db, 'sender', 'Alice')
  const leagueId = await makeLeague(ctx.db, { competitionId, ownerId: sender, name: 'Friends' })
  const m1 = await makeUser(ctx.db, 'm1', 'Bob')
  const m2 = await makeUser(ctx.db, 'm2', 'Carol')
  await addLeagueMember(ctx.db, leagueId, m1)
  await addLeagueMember(ctx.db, leagueId, m2)
  return { ...ctx, competitionId, sender, leagueId, m1, m2 }
}

describe('notifyMentions', () => {
  it('creates a CHAT_MENTION bell row for each mentioned member (global room)', async () => {
    const { db, client, sender, leagueId, m1, m2 } = await setup()
    const messageId = await addMessage(db, leagueId, sender)
    const sent = await notifyMentions(db, { leagueId, matchId: null, messageId, senderId: sender, mentions: [m1, m2] })
    expect(sent).toBe(2)
    const rows = await notifsFor(db, m1)
    expect(rows).toHaveLength(1)
    expect(rows[0].data as MentionData).toMatchObject({
      type: 'CHAT_MENTION',
      leagueId,
      leagueName: 'Friends',
      competitionSlug: 'wc',
      matchId: null,
      homeTeam: null,
      awayTeam: null,
      senderId: sender,
      senderName: 'Alice',
    })
    await client.close()
  })

  it('drops the sender and any non-member ids before notifying', async () => {
    const { db, client, sender, leagueId, m1 } = await setup()
    const stranger = await makeUser(db, 'stranger', 'Stranger')
    const messageId = await addMessage(db, leagueId, sender)
    const sent = await notifyMentions(db, {
      leagueId,
      matchId: null,
      messageId,
      senderId: sender,
      mentions: [sender, stranger, m1],
    })
    expect(sent).toBe(1)
    expect(await notifsFor(db, sender)).toHaveLength(0)
    expect(await notifsFor(db, stranger)).toHaveLength(0)
    expect(await notifsFor(db, m1)).toHaveLength(1)
    await client.close()
  })

  it('is idempotent per (message, recipient) via the dedupe key', async () => {
    const { db, client, sender, leagueId, m1 } = await setup()
    const messageId = await addMessage(db, leagueId, sender)
    await notifyMentions(db, { leagueId, matchId: null, messageId, senderId: sender, mentions: [m1] })
    const second = await notifyMentions(db, { leagueId, matchId: null, messageId, senderId: sender, mentions: [m1] })
    expect(second).toBe(0)
    expect(await notifsFor(db, m1)).toHaveLength(1)
    await client.close()
  })

  it('carries the match teams for a match-thread mention', async () => {
    const { db, client, competitionId, sender, leagueId, m1 } = await setup()
    const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const matchId = await makeMatch(db, {
      competitionId,
      roundId,
      kickoffTime: new Date('2026-06-10T00:00:00Z'),
      homeTeam: 'France',
      awayTeam: 'Brazil',
    })
    const messageId = await addMessage(db, leagueId, sender, matchId)
    await notifyMentions(db, { leagueId, matchId, messageId, senderId: sender, mentions: [m1] })
    expect((await notifsFor(db, m1))[0].data as MentionData).toMatchObject({
      matchId,
      homeTeam: 'France',
      awayTeam: 'Brazil',
    })
    await client.close()
  })

  it('no-ops on empty mentions', async () => {
    const { db, client, sender, leagueId } = await setup()
    const messageId = await addMessage(db, leagueId, sender)
    expect(await notifyMentions(db, { leagueId, matchId: null, messageId, senderId: sender, mentions: [] })).toBe(0)
    await client.close()
  })

  it('no-ops when every mention is the sender or a non-member', async () => {
    const { db, client, sender, leagueId } = await setup()
    const stranger = await makeUser(db, 'stranger', 'Stranger')
    const messageId = await addMessage(db, leagueId, sender)
    const sent = await notifyMentions(db, { leagueId, matchId: null, messageId, senderId: sender, mentions: [sender, stranger] })
    expect(sent).toBe(0)
    await client.close()
  })
})
