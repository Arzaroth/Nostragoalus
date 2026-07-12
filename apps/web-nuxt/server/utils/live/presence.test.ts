import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  __resetPresence,
  addLiveSubscriber,
  presenceConnect,
  presenceDisconnect,
  presenceSetIdle,
  presenceSnapshot,
  removeLiveSubscriber,
  type LiveSubscriber,
} from './hub'

function sub(userId: string | null): LiveSubscriber & { send: ReturnType<typeof vi.fn> } {
  return { matchIds: new Set(), userId, send: vi.fn() }
}

afterEach(() => __resetPresence())

describe('presence', () => {
  it('broadcasts online/idle/offline to all sockets and snapshots state', () => {
    const a = sub('alice')
    const b = sub('bob')
    addLiveSubscriber(a)
    addLiveSubscriber(b)
    try {
      presenceConnect('alice')
      const online = { type: 'presence:update', userId: 'alice', status: 'active' }
      expect(a.send).toHaveBeenCalledWith(online)
      expect(b.send).toHaveBeenCalledWith(online)
      expect(presenceSnapshot()).toEqual({ alice: 'active' })

      presenceSetIdle('alice', true)
      expect(b.send).toHaveBeenCalledWith({ type: 'presence:update', userId: 'alice', status: 'idle' })
      expect(presenceSnapshot()).toEqual({ alice: 'idle' })

      // Unchanged status is a no-op (no extra broadcast).
      b.send.mockClear()
      presenceSetIdle('alice', true)
      expect(b.send).not.toHaveBeenCalled()

      presenceDisconnect('alice')
      expect(b.send).toHaveBeenCalledWith({ type: 'presence:update', userId: 'alice', status: 'offline' })
      expect(presenceSnapshot()).toEqual({})
    } finally {
      removeLiveSubscriber(a)
      removeLiveSubscriber(b)
    }
  })

  it('ref-counts connections: a second tab keeps the user online until the last closes', () => {
    const a = sub('alice')
    addLiveSubscriber(a)
    try {
      presenceConnect('alice')
      a.send.mockClear()
      presenceConnect('alice') // second tab: no fresh broadcast
      expect(a.send).not.toHaveBeenCalled()
      presenceDisconnect('alice') // one tab closes: still online
      expect(a.send).not.toHaveBeenCalled()
      expect(presenceSnapshot()).toEqual({ alice: 'active' })
      presenceDisconnect('alice') // last closes: offline
      expect(a.send).toHaveBeenCalledWith({ type: 'presence:update', userId: 'alice', status: 'offline' })
    } finally {
      removeLiveSubscriber(a)
    }
  })

  it('ignores idle/disconnect for a user with no presence entry', () => {
    presenceSetIdle('ghost', true)
    presenceDisconnect('ghost')
    expect(presenceSnapshot()).toEqual({})
  })

  it('keeps broadcasting when one socket send throws', () => {
    const bad: LiveSubscriber = { matchIds: new Set(), userId: 'x', send: () => { throw new Error('closing') } }
    const good = sub('y')
    addLiveSubscriber(bad)
    addLiveSubscriber(good)
    try {
      presenceConnect('z')
      expect(good.send).toHaveBeenCalledWith({ type: 'presence:update', userId: 'z', status: 'active' })
    } finally {
      removeLiveSubscriber(bad)
      removeLiveSubscriber(good)
    }
  })
})
