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
  return { db, leagueId, roomKey: `league:${leagueId}`, scope: { kind: 'league' as const, leagueId, matchId: null } }
}

describe('voice signaling glue', () => {
  it('join fans the roster to the room as members arrive', async () => {
    const { db, threadId, scope } = await dmFixture()
    const a = connect('alice')
    await handleVoiceJoin(db, a, scope)
    expect(framesOfType(a, 'voice:roster').at(-1)).toMatchObject({
      roomKey: `dm:${threadId}`,
      roster: ['alice'],
      names: { alice: 'Alice' },
    })

    const b = connect('bob')
    await handleVoiceJoin(db, b, scope)
    // Both participants get the new roster, names included (a DM client has no
    // member list of its own to resolve them from).
    expect(framesOfType(a, 'voice:roster').at(-1)?.roster).toEqual(['alice', 'bob'])
    expect(framesOfType(b, 'voice:roster').at(-1)).toMatchObject({ names: { alice: 'Alice', bob: 'Bob' } })
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

  it('a takeover tells the other participants to reset their peer to the rejoiner', async () => {
    const { db, scope } = await leagueFixture()
    const owner1 = connect('owner')
    const member = connect('member')
    await handleVoiceJoin(db, owner1, scope)
    await handleVoiceJoin(db, member, scope)
    member.send.mockClear()
    // Owner rejoins from a second tab.
    const owner2 = connect('owner')
    await handleVoiceJoin(db, owner2, scope)
    // The other member is told to reset their connection to owner; the rejoining
    // tab itself is not.
    expect(framesOfType(member, 'voice:peer-reset').at(-1)).toMatchObject({ userId: 'owner' })
    expect(framesOfType(owner2, 'voice:peer-reset')).toHaveLength(0)
  })

  it('leave pushes the reduced roster to the remaining league members', async () => {
    const { db, scope } = await leagueFixture()
    const owner = connect('owner')
    const member = connect('member')
    await handleVoiceJoin(db, owner, scope)
    await handleVoiceJoin(db, member, scope)
    owner.send.mockClear()
    await handleVoiceLeave(db, member)
    expect(framesOfType(owner, 'voice:roster').at(-1)?.roster).toEqual(['owner'])
  })

  it('DM: one side leaving ends the call for the other', async () => {
    const { db, threadId, scope } = await dmFixture()
    const a = connect('alice')
    const b = connect('bob')
    await handleVoiceJoin(db, a, scope)
    await handleVoiceJoin(db, b, scope)
    a.send.mockClear()
    await handleVoiceLeave(db, b)
    // The remainer is told the call ended (not left alone in a zombie room).
    expect(framesOfType(a, 'voice:ended').at(-1)).toMatchObject({ from: 'bob', scope })
    // The room is empty: a fresh join opens a new 1-member room.
    const a2 = connect('alice')
    await handleVoiceJoin(db, a2, scope)
    expect(framesOfType(a2, 'voice:roster').at(-1)).toMatchObject({ roomKey: `dm:${threadId}`, roster: ['alice'] })
  })

  it('leaving when in no room is a no-op', async () => {
    const { db } = await dmFixture()
    const a = connect('alice')
    await expect(handleVoiceLeave(db, a)).resolves.toBeUndefined()
  })

  it('broadcasts the "N in voice" count to all league members on join and leave', async () => {
    const { db, roomKey, scope } = await leagueFixture()
    const owner = connect('owner')
    const member = connect('member') // not joining - just a league member watching the badge
    await handleVoiceJoin(db, owner, scope)
    // The non-participant member is told the room now has 1 and who it is.
    expect(framesOfType(member, 'voice:presence').at(-1)).toMatchObject({ roomKey, count: 1, names: { owner: 'Owner' } })
    await handleVoiceLeave(db, owner)
    // Emptied room broadcasts 0 so the badge clears.
    expect(framesOfType(member, 'voice:presence').at(-1)).toMatchObject({ roomKey, count: 0 })
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

  it('an offline callee is recorded once across the invite + cancel that follows', async () => {
    const { db, threadId, scope } = await dmFixture()
    const a = connect('alice') // 'bob' has no socket - offline for the whole ring
    // The DM ring: invite (undeliverable -> logs the miss), then the caller's
    // timeout cancels. Cancel must not log a second row for the same miss.
    await handleVoiceInvite(db, a, scope, ['bob'])
    await handleVoiceCancel(db, a, scope, 'bob')
    const rows = await db.select().from(voiceCall).where(eq(voiceCall.dmThreadId, threadId))
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('MISSED')
  })

  it('cancel to a target outside the scope records nothing', async () => {
    const { db, scope } = await dmFixture()
    const a = connect('alice')
    await handleVoiceCancel(db, a, scope, 'stranger')
    const rows = await db.select().from(voiceCall)
    expect(rows).toHaveLength(0)
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
