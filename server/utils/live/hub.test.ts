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

it('publishChatReactionUpdate delivers a message totals patch to members only', async () => {
  const { addLiveSubscriber, removeLiveSubscriber, publishChatReactionUpdate } = await import('./hub')
  const { emptyReactionTotals } = await import('../../../shared/reactions')
  const totals = { ...emptyReactionTotals(), FIRE: 3 }
  const member = { matchIds: new Set<string>(), userId: 'm', send: vi.fn() }
  const outsider = { matchIds: new Set<string>(), userId: 'o', send: vi.fn() }
  for (const s of [member, outsider]) addLiveSubscriber(s)
  try {
    const delivered = publishChatReactionUpdate('lg', ['m'], 'msg1', totals)
    expect(delivered).toBe(1)
    expect(member.send).toHaveBeenCalledWith({ type: 'chat:reaction', leagueId: 'lg', messageId: 'msg1', totals })
    expect(outsider.send).not.toHaveBeenCalled()
  } finally {
    for (const s of [member, outsider]) removeLiveSubscriber(s)
  }
})

it('publishChatModeration patches a message state for members only', async () => {
  const { addLiveSubscriber, removeLiveSubscriber, publishChatModeration } = await import('./hub')
  const member = { matchIds: new Set<string>(), userId: 'm', send: vi.fn() }
  const outsider = { matchIds: new Set<string>(), userId: 'o', send: vi.fn() }
  for (const s of [member, outsider]) addLiveSubscriber(s)
  try {
    const delivered = publishChatModeration('lg', ['m'], 'msg1', 'REMOVED')
    expect(delivered).toBe(1)
    expect(member.send).toHaveBeenCalledWith({ type: 'chat:moderation', leagueId: 'lg', messageId: 'msg1', state: 'REMOVED' })
    expect(outsider.send).not.toHaveBeenCalled()
  } finally {
    for (const s of [member, outsider]) removeLiveSubscriber(s)
  }
})

it('publishChatEdit pushes the new ciphertext + attachments to members only', async () => {
  const { addLiveSubscriber, removeLiveSubscriber, publishChatEdit } = await import('./hub')
  const member = { matchIds: new Set<string>(), userId: 'm', send: vi.fn() }
  const outsider = { matchIds: new Set<string>(), userId: 'o', send: vi.fn() }
  for (const s of [member, outsider]) addLiveSubscriber(s)
  try {
    const attachments = [{ idx: 0, epoch: 2 }]
    const delivered = publishChatEdit('lg', ['m'], 'msg1', 'CT', '2026-06-10T10:00:00.000Z', attachments)
    expect(delivered).toBe(1)
    expect(member.send).toHaveBeenCalledWith({ type: 'chat:edit', leagueId: 'lg', messageId: 'msg1', ciphertext: 'CT', editedAt: '2026-06-10T10:00:00.000Z', attachments })
    expect(outsider.send).not.toHaveBeenCalled()
  } finally {
    for (const s of [member, outsider]) removeLiveSubscriber(s)
  }
})

it('publishChatTyping pushes a typing hint to the named recipients only', async () => {
  const { addLiveSubscriber, removeLiveSubscriber, publishChatTyping } = await import('./hub')
  const member = { matchIds: new Set<string>(), userId: 'm', send: vi.fn() }
  const outsider = { matchIds: new Set<string>(), userId: 'o', send: vi.fn() }
  for (const s of [member, outsider]) addLiveSubscriber(s)
  try {
    const delivered = publishChatTyping('lg', ['m'], 'match-1', 'typer')
    expect(delivered).toBe(1)
    expect(member.send).toHaveBeenCalledWith({ type: 'chat:typing', leagueId: 'lg', matchId: 'match-1', userId: 'typer' })
    expect(outsider.send).not.toHaveBeenCalled()
  } finally {
    for (const s of [member, outsider]) removeLiveSubscriber(s)
  }
})

it('publishDmMessage delivers to the two participants only', async () => {
  const { addLiveSubscriber, removeLiveSubscriber, publishDmMessage } = await import('./hub')
  const a = { matchIds: new Set<string>(), userId: 'a', send: vi.fn() }
  const b = { matchIds: new Set<string>(), userId: 'b', send: vi.fn() }
  const outsider = { matchIds: new Set<string>(), userId: 'o', send: vi.fn() }
  for (const s of [a, b, outsider]) addLiveSubscriber(s)
  try {
    const message = { id: 'm1', threadId: 't1', parentId: null, userId: 'a', epoch: 1, ciphertext: 'CT', createdAt: '2026-06-10T10:00:00.000Z', editedAt: null, moderation: 'VISIBLE' as const }
    const delivered = publishDmMessage(['a', 'b'], message)
    expect(delivered).toBe(2)
    expect(a.send).toHaveBeenCalledWith({ type: 'dm:new', threadId: 't1', message })
    expect(b.send).toHaveBeenCalledWith({ type: 'dm:new', threadId: 't1', message })
    expect(outsider.send).not.toHaveBeenCalled()
  } finally {
    for (const s of [a, b, outsider]) removeLiveSubscriber(s)
  }
})

it('publishDmEdit pushes the new ciphertext + attachments to the two participants only', async () => {
  const { addLiveSubscriber, removeLiveSubscriber, publishDmEdit } = await import('./hub')
  const a = { matchIds: new Set<string>(), userId: 'a', send: vi.fn() }
  const outsider = { matchIds: new Set<string>(), userId: 'o', send: vi.fn() }
  for (const s of [a, outsider]) addLiveSubscriber(s)
  try {
    const attachments = [{ idx: 0, epoch: 1 }]
    const delivered = publishDmEdit(['a', 'b'], 't1', 'm1', 'CT', '2026-06-10T10:00:00.000Z', attachments)
    expect(delivered).toBe(1)
    expect(a.send).toHaveBeenCalledWith({ type: 'dm:edit', threadId: 't1', messageId: 'm1', ciphertext: 'CT', editedAt: '2026-06-10T10:00:00.000Z', attachments })
    expect(outsider.send).not.toHaveBeenCalled()
  } finally {
    for (const s of [a, outsider]) removeLiveSubscriber(s)
  }
})

it('publishDmReaction pushes the new totals to the two participants only', async () => {
  const { addLiveSubscriber, removeLiveSubscriber, publishDmReaction } = await import('./hub')
  const { emptyReactionTotals } = await import('../../../shared/reactions')
  const a = { matchIds: new Set<string>(), userId: 'a', send: vi.fn() }
  const outsider = { matchIds: new Set<string>(), userId: 'o', send: vi.fn() }
  for (const s of [a, outsider]) addLiveSubscriber(s)
  try {
    const totals = emptyReactionTotals()
    const delivered = publishDmReaction(['a', 'b'], 't1', 'm1', totals)
    expect(delivered).toBe(1)
    expect(a.send).toHaveBeenCalledWith({ type: 'dm:reaction', threadId: 't1', messageId: 'm1', totals })
    expect(outsider.send).not.toHaveBeenCalled()
  } finally {
    for (const s of [a, outsider]) removeLiveSubscriber(s)
  }
})

describe('per-match viewer counts', () => {
  it('pushes the live count to everyone in the match room as viewers join and leave', async () => {
    const { syncMatchViewers, dropMatchViewer } = await import('./hub')
    const { __resetViewers } = await import('./viewers')
    __resetViewers()
    const a = { matchIds: new Set<string>(), send: vi.fn() }
    const b = { matchIds: new Set<string>(), send: vi.fn() }
    try {
      syncMatchViewers(a, ['m1'])
      expect(a.send).toHaveBeenLastCalledWith({ type: 'viewers:update', matchId: 'm1', count: 1 })

      syncMatchViewers(b, ['m1'])
      // Both viewers learn the new total of 2.
      expect(a.send).toHaveBeenLastCalledWith({ type: 'viewers:update', matchId: 'm1', count: 2 })
      expect(b.send).toHaveBeenLastCalledWith({ type: 'viewers:update', matchId: 'm1', count: 2 })

      b.send.mockClear()
      a.send.mockClear()
      dropMatchViewer(b)
      // The remaining viewer is decremented; the one that left is not notified.
      expect(a.send).toHaveBeenLastCalledWith({ type: 'viewers:update', matchId: 'm1', count: 1 })
      expect(b.send).not.toHaveBeenCalled()
    } finally {
      __resetViewers()
    }
  })

  it('a viewer reporting the same match twice does not re-broadcast (socket de-dupe)', async () => {
    const { syncMatchViewers } = await import('./hub')
    const { __resetViewers } = await import('./viewers')
    __resetViewers()
    const a = { matchIds: new Set<string>(), send: vi.fn() }
    try {
      syncMatchViewers(a, ['m1'])
      a.send.mockClear()
      syncMatchViewers(a, ['m1'])
      expect(a.send).not.toHaveBeenCalled()
    } finally {
      __resetViewers()
    }
  })

  it('keeps fanning out when one viewer socket send throws', async () => {
    const { syncMatchViewers } = await import('./hub')
    const { __resetViewers } = await import('./viewers')
    __resetViewers()
    const bad = { matchIds: new Set<string>(), send: () => { throw new Error('closing') } }
    const good = { matchIds: new Set<string>(), send: vi.fn() }
    try {
      syncMatchViewers(bad, ['m1'])
      syncMatchViewers(good, ['m1'])
      expect(good.send).toHaveBeenLastCalledWith({ type: 'viewers:update', matchId: 'm1', count: 2 })
    } finally {
      __resetViewers()
    }
  })

  it('dropping an unknown viewer broadcasts nothing', async () => {
    const { dropMatchViewer } = await import('./hub')
    const { __resetViewers } = await import('./viewers')
    __resetViewers()
    const a = { matchIds: new Set<string>(), send: vi.fn() }
    dropMatchViewer(a)
    expect(a.send).not.toHaveBeenCalled()
    __resetViewers()
  })
})
