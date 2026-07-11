import { afterEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { addLeagueMember, makeLeague, makeUser, seedCompetition } from '../../../tests/factories'
import { dmThread, league, userNotification, voiceCall } from '../../../db/schema'
import { orderPair } from '../dm/service'
import { addLiveSubscriber, removeLiveSubscriber, type LiveSubscriber } from './hub'
import { __resetVoiceRooms } from './voice-rooms'
import {
  handleVoiceCancel,
  handleVoiceDecline,
  handleVoiceInvite,
  handleVoiceJoin,
  handleVoiceLeave,
  handleVoiceSignal,
} from './voice'

const live: LiveSubscriber[] = []
afterEach(() => {
  for (const s of live) removeLiveSubscriber(s)
  live.length = 0
  __resetVoiceRooms()
})

function connect(userId: string): LiveSubscriber & { send: ReturnType<typeof vi.fn> } {
  const sub = { userId, matchIds: new Set<string>(), send: vi.fn() } as LiveSubscriber & { send: ReturnType<typeof vi.fn> }
  addLiveSubscriber(sub)
  live.push(sub)
  return sub
}

function framesOfType(sub: { send: ReturnType<typeof vi.fn> }, type: string): Record<string, unknown>[] {
  return sub.send.mock.calls.map((c) => c[0] as Record<string, unknown>).filter((p) => p.type === type)
}

async function dmThreadId(db: Awaited<ReturnType<typeof createTestDb>>['db'], a: string, b: string): Promise<string> {
  const [lo, hi] = orderPair(a, b)
  const [row] = await db.insert(dmThread).values({ userAId: lo, userBId: hi }).returning({ id: dmThread.id })
  return row.id
}

async function dmFixture() {
  const { db } = await createTestDb()
  await makeUser(db, 'alice', 'Alice')
  await makeUser(db, 'bob', 'Bob')
  const threadId = await dmThreadId(db, 'alice', 'bob')
  return { db, threadId, scope: { kind: 'dm' as const, threadId } }
}

async function leagueFixture() {
  const { db } = await createTestDb()
  const competitionId = await seedCompetition(db)
  await makeUser(db, 'owner', 'Owner')
  await makeUser(db, 'member')
  const leagueId = await makeLeague(db, { competitionId, ownerId: 'owner', name: 'Reds' })
  await addLeagueMember(db, leagueId, 'member')
  await db.update(league).set({ chatEnabled: true }).where(eq(league.id, leagueId))
  return { db, leagueId, scope: { kind: 'league' as const, leagueId, matchId: null } }
}

describe('voice signaling glue', () => {
  it('join fans the roster to the room as members arrive', async () => {
    const { db, threadId, scope } = await dmFixture()
    const a = connect('alice')
    await handleVoiceJoin(db, a, scope)
    expect(framesOfType(a, 'voice:roster').at(-1)).toMatchObject({ roomKey: `dm:${threadId}`, roster: ['alice'] })

    const b = connect('bob')
    await handleVoiceJoin(db, b, scope)
    // Both participants get the new roster.
    expect(framesOfType(a, 'voice:roster').at(-1)?.roster).toEqual(['alice', 'bob'])
    expect(framesOfType(b, 'voice:roster').at(-1)?.roster).toEqual(['alice', 'bob'])
  })

  it('relays a signal only between two members of the same room', async () => {
    const { db, scope } = await dmFixture()
    const a = connect('alice')
    const b = connect('bob')
    await handleVoiceJoin(db, a, scope)
    await handleVoiceJoin(db, b, scope)

    handleVoiceSignal(a, 'bob', 'offer', { sdp: 'x' })
    expect(framesOfType(b, 'voice:signal').at(-1)).toMatchObject({ from: 'alice', kind: 'offer', payload: { sdp: 'x' } })

    // A target not in the room gets nothing.
    b.send.mockClear()
    handleVoiceSignal(a, 'nobody', 'ice', {})
    expect(framesOfType(b, 'voice:signal')).toHaveLength(0)
  })

  it('does not relay a signal from a socket that is in no room', async () => {
    const { db, scope } = await dmFixture()
    const a = connect('alice')
    const b = connect('bob')
    await handleVoiceJoin(db, b, scope)
    // a never joined.
    handleVoiceSignal(a, 'bob', 'offer', {})
    expect(framesOfType(b, 'voice:signal')).toHaveLength(0)
  })

  it('a second tab of the same user takes over and evicts the first', async () => {
    const { db, scope } = await dmFixture()
    const a1 = connect('alice')
    const a2 = connect('alice')
    await handleVoiceJoin(db, a1, scope)
    await handleVoiceJoin(db, a2, scope)
    expect(framesOfType(a1, 'voice:evicted')).toHaveLength(1)
  })

  it('leave pushes the reduced roster to the remaining members', async () => {
    const { db, scope } = await dmFixture()
    const a = connect('alice')
    const b = connect('bob')
    await handleVoiceJoin(db, a, scope)
    await handleVoiceJoin(db, b, scope)
    a.send.mockClear()
    handleVoiceLeave(b)
    expect(framesOfType(a, 'voice:roster').at(-1)?.roster).toEqual(['alice'])
  })

  it('leaving when in no room is a no-op', () => {
    const a = connect('alice')
    expect(() => handleVoiceLeave(a)).not.toThrow()
  })

  it('invite rings an online member and records no missed call', async () => {
    const { db, leagueId, scope } = await leagueFixture()
    const owner = connect('owner')
    const member = connect('member')
    await handleVoiceJoin(db, owner, scope)
    await handleVoiceInvite(db, owner, scope, ['member'])
    expect(framesOfType(member, 'voice:ring').at(-1)).toMatchObject({ from: 'owner', fromName: 'Owner' })
    const misses = await db.select().from(voiceCall).where(eq(voiceCall.leagueId, leagueId))
    expect(misses).toHaveLength(0)
  })

  it('invite to an offline member records a missed call + notification', async () => {
    const { db, scope } = await leagueFixture()
    const owner = connect('owner')
    await handleVoiceJoin(db, owner, scope)
    // 'member' has no socket connected.
    await handleVoiceInvite(db, owner, scope, ['member'])
    const notifs = await db.select().from(userNotification).where(eq(userNotification.userId, 'member'))
    expect(notifs).toHaveLength(1)
    expect(notifs[0].type).toBe('VOICE_MISSED')
  })

  it('invite ignores non-audience ids and the caller themselves', async () => {
    const { db, scope } = await dmFixture()
    const a = connect('alice')
    await handleVoiceJoin(db, a, scope)
    await handleVoiceInvite(db, a, scope, ['alice', 'stranger'])
    // No missed row for a stranger who is not in the scope.
    const rows = await db.select().from(voiceCall)
    expect(rows).toHaveLength(0)
  })

  it('decline notifies the inviter', async () => {
    const { db, scope } = await dmFixture()
    const a = connect('alice')
    const b = connect('bob')
    await handleVoiceDecline(db, b, scope, 'alice')
    expect(framesOfType(a, 'voice:declined').at(-1)).toMatchObject({ from: 'bob' })
  })

  it('decline to a non-audience target is dropped', async () => {
    const { db, scope } = await dmFixture()
    const b = connect('bob')
    const stranger = connect('stranger')
    await handleVoiceDecline(db, b, scope, 'stranger')
    expect(framesOfType(stranger, 'voice:declined')).toHaveLength(0)
  })

  it('cancel records a missed call and dismisses the ring when the callee never joined', async () => {
    const { db, threadId, scope } = await dmFixture()
    const a = connect('alice')
    const b = connect('bob')
    await handleVoiceCancel(db, a, scope, 'bob')
    expect(framesOfType(b, 'voice:cancelled')).toHaveLength(1)
    const rows = await db.select().from(voiceCall).where(eq(voiceCall.dmThreadId, threadId))
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('MISSED')
  })

  it('cancel does nothing once the callee has joined', async () => {
    const { db, scope } = await dmFixture()
    const a = connect('alice')
    const b = connect('bob')
    await handleVoiceJoin(db, a, scope)
    await handleVoiceJoin(db, b, scope)
    b.send.mockClear()
    await handleVoiceCancel(db, a, scope, 'bob')
    expect(framesOfType(b, 'voice:cancelled')).toHaveLength(0)
    const rows = await db.select().from(voiceCall)
    expect(rows).toHaveLength(0)
  })

  it('handlers no-op for a socket with no resolved user', async () => {
    const { db, scope } = await dmFixture()
    const anon = connect('anon')
    anon.userId = null
    await expect(handleVoiceJoin(db, anon, scope)).resolves.toBeUndefined()
    handleVoiceSignal(anon, 'bob', 'offer', {})
    await expect(handleVoiceInvite(db, anon, scope, ['bob'])).resolves.toBeUndefined()
    await expect(handleVoiceDecline(db, anon, scope, 'bob')).resolves.toBeUndefined()
    await expect(handleVoiceCancel(db, anon, scope, 'bob')).resolves.toBeUndefined()
  })
})
