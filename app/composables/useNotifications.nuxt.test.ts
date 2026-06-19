import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useQueryClient, type QueryClient } from '@tanstack/vue-query'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { useNotifications } from './useNotifications'
import type { NotificationDTO } from '#shared/types/notifications'

vi.mock('./useAuth', async () => {
  const { ref } = await import('vue')
  const session = ref<{ data: { user: { id: string } } | null }>({ data: { user: { id: 'u1' } } })
  return { useAuth: () => ({ session }), __session: session }
})

// Capture the socket options so a test can drive incoming frames directly,
// without a real WebSocket in the test env.
vi.mock('./useReconnectingSocket', () => {
  const opts: { current: { onOpen?: () => void; onMessage: (d: unknown) => void } | null } = { current: null }
  return {
    useReconnectingSocket: (o: { onOpen?: () => void; onMessage: (d: unknown) => void }) => {
      opts.current = o
      return { send: () => false }
    },
    __opts: opts,
  }
})

const n1: NotificationDTO = {
  id: 'n1',
  type: 'LEAGUE_JOIN',
  data: { type: 'LEAGUE_JOIN', leagueId: 'l1', leagueName: 'Friends', joinerName: 'Bob' },
  read: false,
  createdAt: '2026-06-15T00:00:00.000Z',
}

let fetchMock: ReturnType<typeof vi.fn>
let feed: { notifications: NotificationDTO[]; unreadCount: number }
let lastQc: QueryClient | undefined

beforeEach(() => {
  feed = { notifications: [n1], unreadCount: 1 }
  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/notifications') return feed
    if (url === '/api/notifications/read') return { marked: 1 }
    return {}
  })
  vi.stubGlobal('$fetch', fetchMock)
})
afterEach(() => {
  lastQc?.clear()
  vi.unstubAllGlobals()
})

async function setup() {
  let api!: ReturnType<typeof useNotifications>
  await mountSuspended({
    setup() {
      lastQc = useQueryClient()
      api = useNotifications()
      return () => null
    },
  })
  return { api }
}

async function socketOpts() {
  return ((await import('./useReconnectingSocket')) as unknown as { __opts: { current: { onMessage: (d: unknown) => void } } })
    .__opts.current
}

describe('useNotifications', () => {
  it('does not fetch for guests', async () => {
    const session = ((await import('./useAuth')) as unknown as { __session: { value: unknown } }).__session
    session.value = { data: null }
    fetchMock.mockClear()
    await mountSuspended({
      setup() {
        lastQc = useQueryClient()
        useNotifications()
        return () => null
      },
    })
    await new Promise((r) => setTimeout(r, 20))
    expect(fetchMock).not.toHaveBeenCalled()
    session.value = { data: { user: { id: 'u1' } } }
  })

  it('fetches the feed and exposes the unread count', async () => {
    const { api } = await setup()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/notifications', expect.anything()))
    await vi.waitFor(() => expect(api.unreadCount.value).toBe(1))
    expect(api.notifications.value).toHaveLength(1)
  })

  it('prepends a live notification, bumps the count, and ignores dupes and other frames', async () => {
    const { api } = await setup()
    await vi.waitFor(() => expect(api.unreadCount.value).toBe(1))
    const socket = await socketOpts()
    const incoming: NotificationDTO = {
      id: 'n2',
      type: 'LEAGUE_ROLE',
      data: { type: 'LEAGUE_ROLE', leagueId: 'l1', leagueName: 'Friends', role: 'MODERATOR' },
      read: false,
      createdAt: '2026-06-15T01:00:00.000Z',
    }
    socket.onMessage({ type: 'notification:new', notification: incoming })
    await vi.waitFor(() => {
      expect(api.unreadCount.value).toBe(2)
      expect(api.notifications.value[0]?.id).toBe('n2')
    })
    socket.onMessage({ type: 'notification:new', notification: incoming })
    socket.onMessage({ type: 'scores:changed' })
    expect(api.unreadCount.value).toBe(2)
  })

  it('markRead posts the ids', async () => {
    const { api } = await setup()
    await vi.waitFor(() => expect(api.notifications.value).toHaveLength(1))
    await api.markRead.mutateAsync(['n1'])
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/notifications/read',
      expect.objectContaining({ method: 'POST', body: { ids: ['n1'] } }),
    )
  })

  it('markAllRead posts all:true', async () => {
    const { api } = await setup()
    await api.markAllRead.mutateAsync()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/notifications/read',
      expect.objectContaining({ method: 'POST', body: { all: true } }),
    )
  })

  it('dismiss deletes the id', async () => {
    const { api } = await setup()
    await api.dismiss.mutateAsync('n1')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/notifications/delete',
      expect.objectContaining({ method: 'POST', body: { ids: ['n1'] } }),
    )
  })
})
