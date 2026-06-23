import { describe, it, expect, vi } from 'vitest'
import { createTestDb } from '../../../tests/db'
import {
  addLiveSubscriber,
  liveSubscriberCount,
  publishMatchUpdates,
  removeLiveSubscriber,
  sendMatchSnapshot,
  type LiveSubscriber,
} from './hub'
import { findRoundId } from '../sync/rounds'
import { makeMatch, seedCompetition } from '../../../tests/factories'

describe('live hub', () => {
  it('delivers updates only to subscribers watching the match', async () => {
    const { db, client } = await createTestDb()
    const cid = await seedCompetition(db)
    const roundId = (await findRoundId(db, cid, 'GROUP', 1)) as string
    const m = await makeMatch(db, { competitionId: cid, roundId, kickoffTime: new Date('2026-06-11T16:00:00Z'), status: 'LIVE', fullTimeHome: 1, fullTimeAway: 0 })

    const watcher: LiveSubscriber = { matchIds: new Set([m]), send: vi.fn() }
    const other: LiveSubscriber = { matchIds: new Set(['nope']), send: vi.fn() }
    addLiveSubscriber(watcher)
    addLiveSubscriber(other)
    expect(liveSubscriberCount()).toBe(2)

    try {
      expect(await publishMatchUpdates(db, [m])).toBe(1)
      expect(watcher.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'match:update' }))
      // The non-watcher gets no per-match update, only the global scores:changed nudge.
      expect(other.send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'match:update' }))
      expect(other.send).toHaveBeenCalledWith({ type: 'scores:changed' })
    } finally {
      removeLiveSubscriber(watcher)
      removeLiveSubscriber(other)
    }
    expect(liveSubscriberCount()).toBe(0)
    await client.close()
  })

  it('no-ops with no match ids or no subscribers', async () => {
    const { db, client } = await createTestDb()
    expect(await publishMatchUpdates(db, [])).toBe(0)
    expect(await publishMatchUpdates(db, ['x'])).toBe(0)
    await client.close()
  })

  it('sends a current snapshot of the subscribed matches on (re)subscribe', async () => {
    const { db, client } = await createTestDb()
    const cid = await seedCompetition(db)
    const roundId = (await findRoundId(db, cid, 'GROUP', 1)) as string
    const m = await makeMatch(db, { competitionId: cid, roundId, kickoffTime: new Date('2026-06-11T16:00:00Z'), status: 'FINISHED', fullTimeHome: 2, fullTimeAway: 1 })

    const empty: LiveSubscriber = { matchIds: new Set(), send: vi.fn() }
    const sub: LiveSubscriber = { matchIds: new Set([m]), send: vi.fn() }
    // Nothing subscribed: nothing to converge.
    expect(await sendMatchSnapshot(db, empty)).toBe(0)
    expect(empty.send).not.toHaveBeenCalled()
    // Subscribed: the client is handed the match's current (finished) state so a
    // missed full-time transition heals without a reload.
    expect(await sendMatchSnapshot(db, sub)).toBe(1)
    expect(sub.send).toHaveBeenCalledWith({ type: 'match:update', match: expect.objectContaining({ id: m, status: 'FINISHED' }) })
    await client.close()
  })
})

it('publishCrowdUpdate broadcasts to every subscriber regardless of match subscriptions', async () => {
  const { addLiveSubscriber, removeLiveSubscriber, publishCrowdUpdate } = await import('./hub')
  const got: unknown[] = []
  const sub = { matchIds: new Set<string>(), send: (p: unknown) => got.push(p) }
  addLiveSubscriber(sub)
  const delivered = publishCrowdUpdate('m1', { home: 7, away: 2, count: 3 })
  removeLiveSubscriber(sub)
  expect(delivered).toBeGreaterThanOrEqual(1)
  expect(got.at(-1)).toEqual({ type: 'crowd:update', matchId: 'm1', totals: { home: 7, away: 2, count: 3 } })
})

it('publishReactionUpdate broadcasts per-emoji counts to every subscriber', async () => {
  const { addLiveSubscriber, removeLiveSubscriber, publishReactionUpdate } = await import('./hub')
  const totals = { FIRE: 3, GOAL: 1, WOW: 0, LAUGH: 0, SAD: 0, ANGRY: 2 }
  const got: unknown[] = []
  const sub = { matchIds: new Set<string>(), send: (p: unknown) => got.push(p) }
  addLiveSubscriber(sub)
  const delivered = publishReactionUpdate('m1', totals)
  removeLiveSubscriber(sub)
  expect(delivered).toBeGreaterThanOrEqual(1)
  expect(got.at(-1)).toEqual({ type: 'reaction:update', matchId: 'm1', totals })
})

it('publishLeagueReactionUpdate reaches connected members only', async () => {
  const { addLiveSubscriber, removeLiveSubscriber, publishLeagueReactionUpdate } = await import('./hub')
  const totals = { FIRE: 1, GOAL: 0, WOW: 1, LAUGH: 0, SAD: 0, ANGRY: 0 }
  const member = { matchIds: new Set<string>(), userId: 'm', send: vi.fn() }
  const outsider = { matchIds: new Set<string>(), userId: 'o', send: vi.fn() }
  const guest = { matchIds: new Set<string>(), userId: null, send: vi.fn() }
  for (const s of [member, outsider, guest]) addLiveSubscriber(s)
  try {
    const delivered = publishLeagueReactionUpdate('lg', ['m'], 'm1', totals)
    expect(delivered).toBe(1)
    expect(member.send).toHaveBeenCalledWith({ type: 'reaction:league-update', leagueId: 'lg', matchId: 'm1', totals })
    expect(outsider.send).not.toHaveBeenCalled()
    expect(guest.send).not.toHaveBeenCalled()
  } finally {
    for (const s of [member, outsider, guest]) removeLiveSubscriber(s)
  }
})

it('publishChatRekeyRequest nudges connected members only, with no key material', async () => {
  const { addLiveSubscriber, removeLiveSubscriber, publishChatRekeyRequest } = await import('./hub')
  const member = { matchIds: new Set<string>(), userId: 'm', send: vi.fn() }
  const outsider = { matchIds: new Set<string>(), userId: 'o', send: vi.fn() }
  const guest = { matchIds: new Set<string>(), userId: null, send: vi.fn() }
  for (const s of [member, outsider, guest]) addLiveSubscriber(s)
  try {
    const delivered = publishChatRekeyRequest('lg', ['m'])
    expect(delivered).toBe(1)
    expect(member.send).toHaveBeenCalledWith({ type: 'chat:rekey-request', leagueId: 'lg' })
    expect(outsider.send).not.toHaveBeenCalled()
    expect(guest.send).not.toHaveBeenCalled()
  } finally {
    for (const s of [member, outsider, guest]) removeLiveSubscriber(s)
  }
})

it('publishChatKeysAdded reaches the named recipients only', async () => {
  const { addLiveSubscriber, removeLiveSubscriber, publishChatKeysAdded } = await import('./hub')
  const newcomer = { matchIds: new Set<string>(), userId: 'n', send: vi.fn() }
  const other = { matchIds: new Set<string>(), userId: 'x', send: vi.fn() }
  const guest = { matchIds: new Set<string>(), userId: null, send: vi.fn() }
  for (const s of [newcomer, other, guest]) addLiveSubscriber(s)
  try {
    const delivered = publishChatKeysAdded('lg', ['n'])
    expect(delivered).toBe(1)
    expect(newcomer.send).toHaveBeenCalledWith({ type: 'chat:keys-added', leagueId: 'lg' })
    expect(other.send).not.toHaveBeenCalled()
    expect(guest.send).not.toHaveBeenCalled()
  } finally {
    for (const s of [newcomer, other, guest]) removeLiveSubscriber(s)
  }
})

it('publishChatStateChanged nudges connected members only', async () => {
  const { addLiveSubscriber, removeLiveSubscriber, publishChatStateChanged } = await import('./hub')
  const member = { matchIds: new Set<string>(), userId: 'm', send: vi.fn() }
  const outsider = { matchIds: new Set<string>(), userId: 'o', send: vi.fn() }
  const guest = { matchIds: new Set<string>(), userId: null, send: vi.fn() }
  for (const s of [member, outsider, guest]) addLiveSubscriber(s)
  try {
    const delivered = publishChatStateChanged('lg', ['m'])
    expect(delivered).toBe(1)
    expect(member.send).toHaveBeenCalledWith({ type: 'chat:state-changed', leagueId: 'lg' })
    expect(outsider.send).not.toHaveBeenCalled()
    expect(guest.send).not.toHaveBeenCalled()
  } finally {
    for (const s of [member, outsider, guest]) removeLiveSubscriber(s)
  }
})
