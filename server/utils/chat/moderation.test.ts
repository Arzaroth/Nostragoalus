import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { addLeagueMember, makeLeague, makeUser, seedCompetition } from '../../../tests/factories'
import { chatMessage } from '../../../db/schema'
import { listReports, moderateMessage, pendingThreshold, reportMessage, unreportMessage, getMyReports } from './moderation'
import { ForbiddenError, NotFoundError, ValidationError } from '../errors'

type Db = Awaited<ReturnType<typeof createTestDb>>['db']

async function addMessage(db: Db, leagueId: string, userId: string, text = 'c'): Promise<string> {
  const rows = await db.insert(chatMessage).values({ leagueId, userId, epoch: 1, ciphertext: text }).returning({ id: chatMessage.id })
  return rows[0].id
}

// owner + n members; returns ids.
async function setup(extraMembers = 0) {
  const ctx = await createTestDb()
  const competitionId = await seedCompetition(ctx.db)
  const owner = await makeUser(ctx.db, 'owner')
  const leagueId = await makeLeague(ctx.db, { competitionId, ownerId: owner })
  const members: string[] = []
  for (let i = 0; i < extraMembers; i++) {
    const u = await makeUser(ctx.db, `m${i}`)
    await addLeagueMember(ctx.db, leagueId, u)
    members.push(u)
  }
  return { ...ctx, owner, leagueId, members }
}

describe('pendingThreshold', () => {
  it('is a quarter of the league but at least three', () => {
    expect(pendingThreshold(1)).toBe(3)
    expect(pendingThreshold(8)).toBe(3)
    expect(pendingThreshold(20)).toBe(5)
    expect(pendingThreshold(100)).toBe(25)
  })
})

describe('reportMessage', () => {
  it('flips to PENDING once enough distinct members report', async () => {
    // owner + 11 members = 12, threshold = ceil(3) = 3.
    const { db, client, owner, leagueId, members } = await setup(11)
    const messageId = await addMessage(db, leagueId, owner)
    let res = await reportMessage(db, { leagueId, messageId, userId: members[0] })
    expect(res).toEqual({ state: 'VISIBLE', reports: 1 })
    // A repeat by the same member does not count twice.
    res = await reportMessage(db, { leagueId, messageId, userId: members[0] })
    expect(res.reports).toBe(1)
    await reportMessage(db, { leagueId, messageId, userId: members[1] })
    res = await reportMessage(db, { leagueId, messageId, userId: members[2] })
    expect(res).toEqual({ state: 'PENDING', reports: 3 })
    await client.close()
  })

  it('forbids non-members, 404s unknown messages, refuses your own', async () => {
    const { db, client, owner, leagueId, members } = await setup(1)
    const messageId = await addMessage(db, leagueId, owner)
    const stranger = await makeUser(db, 'stranger')
    await expect(reportMessage(db, { leagueId, messageId, userId: stranger })).rejects.toBeInstanceOf(ForbiddenError)
    await expect(reportMessage(db, { leagueId, messageId: '00000000-0000-0000-0000-000000000000', userId: members[0] })).rejects.toBeInstanceOf(NotFoundError)
    await expect(reportMessage(db, { leagueId, messageId, userId: owner })).rejects.toBeInstanceOf(ValidationError)
    await client.close()
  })
})

describe('unreportMessage', () => {
  it('withdraws the caller report but leaves a pending message pending', async () => {
    const { db, client, owner, leagueId, members } = await setup(11) // threshold 3
    const messageId = await addMessage(db, leagueId, owner)
    await reportMessage(db, { leagueId, messageId, userId: members[0] })
    await reportMessage(db, { leagueId, messageId, userId: members[1] })
    expect((await reportMessage(db, { leagueId, messageId, userId: members[2] })).state).toBe('PENDING')
    // Withdrawing drops the count but does not un-hide it.
    expect(await unreportMessage(db, { leagueId, messageId, userId: members[0] })).toEqual({ state: 'PENDING', reports: 2 })
    expect(await getMyReports(db, members[0], [messageId])).toEqual(new Set())
    await client.close()
  })

  it('forbids non-members and 404s an unknown message', async () => {
    const { db, client, owner, leagueId } = await setup(1)
    const messageId = await addMessage(db, leagueId, owner)
    const stranger = await makeUser(db, 'stranger')
    await expect(unreportMessage(db, { leagueId, messageId, userId: stranger })).rejects.toBeInstanceOf(ForbiddenError)
    await expect(unreportMessage(db, { leagueId, messageId: '00000000-0000-0000-0000-000000000000', userId: owner })).rejects.toBeInstanceOf(NotFoundError)
    await client.close()
  })
})

describe('moderateMessage', () => {
  it('removes (tombstones) and restores, clearing reports on restore', async () => {
    const { db, client, owner, leagueId, members } = await setup(3)
    const messageId = await addMessage(db, leagueId, members[0])
    await reportMessage(db, { leagueId, messageId, userId: owner })
    expect(await moderateMessage(db, { leagueId, messageId, actorId: owner, action: 'remove' })).toEqual({ state: 'REMOVED' })
    const restored = await moderateMessage(db, { leagueId, messageId, actorId: owner, action: 'restore' })
    expect(restored).toEqual({ state: 'VISIBLE' })
    // Reports were cleared by the restore.
    expect((await listReports(db, { leagueId, actorId: owner })).length).toBe(0)
    await client.close()
  })

  it('only an owner/moderator can moderate or list reports', async () => {
    const { db, client, owner, leagueId, members } = await setup(2)
    const messageId = await addMessage(db, leagueId, owner)
    await reportMessage(db, { leagueId, messageId, userId: members[0] })
    await expect(moderateMessage(db, { leagueId, messageId, actorId: members[0], action: 'remove' })).rejects.toBeInstanceOf(ForbiddenError)
    await expect(listReports(db, { leagueId, actorId: members[0] })).rejects.toBeInstanceOf(ForbiddenError)
    await client.close()
  })
})

describe('listReports + getMyReports', () => {
  it('lists reported messages most-reported first and tracks who reported', async () => {
    const { db, client, owner, leagueId, members } = await setup(3)
    const a = await addMessage(db, leagueId, owner, 'a')
    const b = await addMessage(db, leagueId, owner, 'b')
    await reportMessage(db, { leagueId, messageId: a, userId: members[0] })
    await reportMessage(db, { leagueId, messageId: b, userId: members[0] })
    await reportMessage(db, { leagueId, messageId: b, userId: members[1] })
    const reports = await listReports(db, { leagueId, actorId: owner })
    expect(reports.map((r) => r.id)).toEqual([b, a]) // b has more reports
    expect(reports[0].reports).toBe(2)
    expect(await getMyReports(db, members[0], [a, b])).toEqual(new Set([a, b]))
    expect(await getMyReports(db, members[1], [a, b])).toEqual(new Set([b]))
    expect(await getMyReports(db, members[2], [a, b])).toEqual(new Set())
    expect(await getMyReports(db, members[0], [])).toEqual(new Set())
    await client.close()
  })

  it('drops removed messages from the queue', async () => {
    const { db, client, owner, leagueId, members } = await setup(3)
    const a = await addMessage(db, leagueId, owner, 'a')
    await reportMessage(db, { leagueId, messageId: a, userId: members[0] })
    expect((await listReports(db, { leagueId, actorId: owner })).map((r) => r.id)).toEqual([a])
    await moderateMessage(db, { leagueId, messageId: a, actorId: owner, action: 'remove' })
    expect(await listReports(db, { leagueId, actorId: owner })).toEqual([])
    await client.close()
  })
})
