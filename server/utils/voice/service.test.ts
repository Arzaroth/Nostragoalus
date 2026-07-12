import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { addLeagueMember, makeLeague, makeMatch, makeUser, seedCompetition } from '../../../tests/factories'
import { dmThread, league, round, userNotification, voiceCall } from '../../../db/schema'
import { orderPair } from '../dm/service'
import { buildIceServers, recordMissedCall, resolveVoiceScope, turnCredential } from './service'

async function makeThread(db: Awaited<ReturnType<typeof createTestDb>>['db'], a: string, b: string): Promise<string> {
  const [lo, hi] = orderPair(a, b)
  const [row] = await db.insert(dmThread).values({ userAId: lo, userBId: hi }).returning({ id: dmThread.id })
  return row.id
}

async function firstRound(db: Awaited<ReturnType<typeof createTestDb>>['db'], competitionId: string): Promise<string> {
  const rows = await db.select({ id: round.id }).from(round).where(eq(round.competitionId, competitionId)).limit(1)
  return rows[0].id
}

describe('turnCredential', () => {
  it('builds a `<expiry>:<userId>` username and a stable HMAC credential', () => {
    const now = 1_700_000_000_000
    const c = turnCredential('shh', 'user-a', 3600, now)
    expect(c.username).toBe(`${Math.floor(now / 1000) + 3600}:user-a`)
    // Deterministic for the same inputs, so coturn recomputes the same value.
    expect(turnCredential('shh', 'user-a', 3600, now)).toEqual(c)
  })

  it('differs by user and by secret', () => {
    const now = 1_700_000_000_000
    expect(turnCredential('shh', 'user-a', 3600, now).credential).not.toBe(
      turnCredential('shh', 'user-b', 3600, now).credential,
    )
    expect(turnCredential('shh', 'user-a', 3600, now).credential).not.toBe(
      turnCredential('other', 'user-a', 3600, now).credential,
    )
  })
})

describe('buildIceServers', () => {
  it('returns STUN only when TURN is not configured', () => {
    const res = buildIceServers(null, 'user-a', 1_700_000_000_000)
    expect(res.iceServers).toEqual([{ urls: 'stun:stun.l.google.com:19302' }])
    expect(res.ttl).toBe(3600)
  })

  it('adds TURN urls with an ephemeral credential when configured', () => {
    const now = 1_700_000_000_000
    const res = buildIceServers({ secret: 'shh', host: 'turn.example.com', realm: 'r' }, 'user-a', now, 600)
    const cred = turnCredential('shh', 'user-a', 600, now)
    const turn = res.iceServers.filter((s) => typeof s.urls === 'string' && /^turns?:/.test(s.urls as string))
    expect(turn.length).toBe(3)
    for (const s of turn) {
      expect(s.username).toBe(cred.username)
      expect(s.credential).toBe(cred.credential)
    }
    expect(res.ttl).toBe(600)
  })

  it('stays STUN-only when the secret is set but the host is missing', () => {
    const res = buildIceServers({ secret: 'shh' }, 'user-a', 1_700_000_000_000)
    expect(res.iceServers).toHaveLength(1)
  })

  it('stays STUN-only when the host is set but the secret is missing', () => {
    const res = buildIceServers({ host: 'turn.example.com' }, 'user-a', 1_700_000_000_000)
    expect(res.iceServers).toHaveLength(1)
  })
})

describe('resolveVoiceScope - DM', () => {
  it('authorizes a participant and resolves the room key + pair audience', async () => {
    const { db } = await createTestDb()
    await makeUser(db, 'alice')
    await makeUser(db, 'bob')
    const threadId = await makeThread(db, 'alice', 'bob')
    const res = await resolveVoiceScope(db, 'alice', { kind: 'dm', threadId })
    expect(res.roomKey).toBe(`dm:${threadId}`)
    expect([...res.audience].sort()).toEqual(['alice', 'bob'])
    expect(res.meta).toEqual({ kind: 'dm', threadId })
  })

  it('rejects a non-participant', async () => {
    const { db } = await createTestDb()
    await makeUser(db, 'alice')
    await makeUser(db, 'bob')
    await makeUser(db, 'mallory')
    const threadId = await makeThread(db, 'alice', 'bob')
    await expect(resolveVoiceScope(db, 'mallory', { kind: 'dm', threadId })).rejects.toThrow()
  })
})

describe('resolveVoiceScope - league', () => {
  async function setup() {
    const { db } = await createTestDb()
    const competitionId = await seedCompetition(db)
    await makeUser(db, 'owner')
    await makeUser(db, 'member')
    await makeUser(db, 'outsider')
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'owner', name: 'Reds' })
    await addLeagueMember(db, leagueId, 'member')
    await db.update(league).set({ chatEnabled: true }).where(eq(league.id, leagueId))
    return { db, competitionId, leagueId }
  }

  it('authorizes a member and resolves room key + member audience + meta', async () => {
    const { db, leagueId } = await setup()
    const res = await resolveVoiceScope(db, 'member', { kind: 'league', leagueId, matchId: null })
    expect(res.roomKey).toBe(`league:${leagueId}`)
    expect([...res.audience].sort()).toEqual(['member', 'owner'])
    expect(res.meta).toMatchObject({ kind: 'league', leagueId, leagueName: 'Reds' })
  })

  it('rejects a non-member', async () => {
    const { db, leagueId } = await setup()
    await expect(resolveVoiceScope(db, 'outsider', { kind: 'league', leagueId, matchId: null })).rejects.toThrow()
  })

  it('rejects when chat (hence voice) is disabled', async () => {
    const { db, leagueId } = await setup()
    await db.update(league).set({ chatEnabled: false }).where(eq(league.id, leagueId))
    await expect(resolveVoiceScope(db, 'member', { kind: 'league', leagueId, matchId: null })).rejects.toThrow()
  })

  it('resolves a match-scoped room key when the match is in the competition', async () => {
    const { db, competitionId, leagueId } = await setup()
    const roundId = await firstRound(db, competitionId)
    const matchId = await makeMatch(db, { competitionId, roundId, kickoffTime: new Date() })
    const res = await resolveVoiceScope(db, 'member', { kind: 'league', leagueId, matchId })
    expect(res.roomKey).toBe(`league:${leagueId}:match:${matchId}`)
    expect(res.meta).toMatchObject({ matchId })
  })

  it('rejects a match from another competition', async () => {
    const { db, leagueId } = await setup()
    const otherComp = await seedCompetition(db, { slug: 'other-cup' })
    const roundId = await firstRound(db, otherComp)
    const foreign = await makeMatch(db, { competitionId: otherComp, roundId, kickoffTime: new Date() })
    await expect(resolveVoiceScope(db, 'member', { kind: 'league', leagueId, matchId: foreign })).rejects.toThrow()
  })

  it('rejects a matchId that does not resolve to any match', async () => {
    const { db, leagueId } = await setup()
    await expect(
      resolveVoiceScope(db, 'member', { kind: 'league', leagueId, matchId: 'no-such-match' }),
    ).rejects.toThrow()
  })
})

describe('recordMissedCall', () => {
  it('writes a MISSED row and notifies the DM target', async () => {
    const { db } = await createTestDb()
    await makeUser(db, 'alice', 'Alice')
    await makeUser(db, 'bob')
    const threadId = await makeThread(db, 'alice', 'bob')
    await recordMissedCall(db, { meta: { kind: 'dm', threadId }, callerId: 'alice', targetId: 'bob' })

    const calls = await db.select().from(voiceCall).where(eq(voiceCall.dmThreadId, threadId))
    expect(calls).toHaveLength(1)
    expect(calls[0].status).toBe('MISSED')
    expect(calls[0].initiatorId).toBe('alice')

    const notifs = await db.select().from(userNotification).where(eq(userNotification.userId, 'bob'))
    expect(notifs).toHaveLength(1)
    expect(notifs[0].type).toBe('VOICE_MISSED')
    expect(notifs[0].data).toMatchObject({ type: 'VOICE_MISSED', callerName: 'Alice', threadId, leagueId: null })
  })

  it('collapses repeated misses from the same caller into one freshly-unread entry', async () => {
    const { db } = await createTestDb()
    await makeUser(db, 'alice')
    await makeUser(db, 'bob')
    const threadId = await makeThread(db, 'alice', 'bob')
    await recordMissedCall(db, { meta: { kind: 'dm', threadId }, callerId: 'alice', targetId: 'bob' })
    await recordMissedCall(db, { meta: { kind: 'dm', threadId }, callerId: 'alice', targetId: 'bob' })
    const notifs = await db.select().from(userNotification).where(eq(userNotification.userId, 'bob'))
    expect(notifs).toHaveLength(1)
  })

  it('carries league + match context for a league miss', async () => {
    const { db } = await createTestDb()
    const competitionId = await seedCompetition(db)
    await makeUser(db, 'owner', 'Owner')
    await makeUser(db, 'member')
    const leagueId = await makeLeague(db, { competitionId, ownerId: 'owner', name: 'Reds' })
    await addLeagueMember(db, leagueId, 'member')
    await recordMissedCall(db, {
      meta: { kind: 'league', leagueId, leagueName: 'Reds', competitionSlug: 'wc', matchId: null },
      callerId: 'owner',
      targetId: 'member',
    })
    const notifs = await db.select().from(userNotification).where(eq(userNotification.userId, 'member'))
    expect(notifs[0].data).toMatchObject({ type: 'VOICE_MISSED', leagueId, leagueName: 'Reds', competitionSlug: 'wc', threadId: null })
    const calls = await db.select().from(voiceCall).where(eq(voiceCall.leagueId, leagueId))
    expect(calls[0].status).toBe('MISSED')
  })
})
