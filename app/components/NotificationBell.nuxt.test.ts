import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { useQueryClient, type QueryClient } from '@tanstack/vue-query'
import { h } from 'vue'
import NotificationBell from './NotificationBell.vue'
import type { NotificationDTO } from '#shared/types/notifications'

vi.mock('../composables/useAuth', async () => {
  const { ref } = await import('vue')
  const session = ref<{ data: { user: { id: string } } | null }>({ data: { user: { id: 'u1' } } })
  return { useAuth: () => ({ session }), __session: session }
})

vi.mock('../composables/useReconnectingSocket', () => ({
  useReconnectingSocket: () => ({ send: () => false }),
}))

const item: NotificationDTO = {
  id: 'n1',
  type: 'CHAMPION_RESULT',
  data: { type: 'CHAMPION_RESULT', competitionSlug: 'wc', competitionName: 'World Cup', teamName: 'Brazil', points: 40, won: true },
  read: false,
  createdAt: '2026-06-15T00:00:00.000Z',
}

let feed: { notifications: NotificationDTO[]; unreadCount: number }
let lastQc: QueryClient | undefined
beforeEach(() => {
  feed = { notifications: [item], unreadCount: 1 }
  vi.stubGlobal('$fetch', vi.fn(async () => feed))
})
// The composable's 60s staleTime + the shared query client would otherwise serve a
// prior test's cached feed; clear it between tests.
afterEach(() => {
  lastQc?.clear()
  lastQc = undefined
  vi.unstubAllGlobals()
})

// Mount the bell inside a wrapper that captures the query client so afterEach can
// clear the cache.
function mountBell() {
  return mountSuspended({
    setup() {
      lastQc = useQueryClient()
      return () => h(NotificationBell)
    },
  })
}

describe('NotificationBell', () => {
  it('renders the bell and an unread badge from the feed', async () => {
    const wrapper = await mountBell()
    expect(wrapper.html()).toContain('pi-bell')
    await vi.waitFor(() => expect(wrapper.text()).toContain('1'))
    wrapper.unmount()
  })

  it('shows no badge when nothing is unread', async () => {
    feed = { notifications: [], unreadCount: 0 }
    const wrapper = await mountBell()
    await new Promise((r) => setTimeout(r, 20))
    expect(wrapper.text()).not.toContain('9+')
    expect(wrapper.html()).toContain('pi-bell')
    wrapper.unmount()
  })

  it('collapses several DM rows into a single grouped entry in the panel', async () => {
    const dm = (id: string, threadId: string): NotificationDTO => ({
      id,
      type: 'DM_MESSAGE',
      data: { type: 'DM_MESSAGE', threadId, senderId: 's', senderName: 'Alice' },
      read: false,
      createdAt: '2026-06-15T02:00:00.000Z',
    })
    feed = { notifications: [dm('d1', 't1'), dm('d2', 't2'), item], unreadCount: 3 }
    const wrapper = await mountBell()
    await vi.waitFor(() => expect(wrapper.text()).toContain('3'))
    await wrapper.get('button[data-tour="notifications"]').trigger('click')
    await new Promise((r) => setTimeout(r, 20))
    // Two DM threads, but the panel (teleported to body) shows one envelope entry.
    const envelopes = (document.body.innerHTML.match(/pi-envelope/g) ?? []).length
    expect(envelopes).toBe(1)
    wrapper.unmount()
  })
})
