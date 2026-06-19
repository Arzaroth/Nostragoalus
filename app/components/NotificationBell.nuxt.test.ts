import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
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
beforeEach(() => {
  feed = { notifications: [item], unreadCount: 1 }
  vi.stubGlobal('$fetch', vi.fn(async () => feed))
})
afterEach(() => vi.unstubAllGlobals())

describe('NotificationBell', () => {
  it('renders the bell and an unread badge from the feed', async () => {
    const wrapper = await mountSuspended(NotificationBell)
    expect(wrapper.html()).toContain('pi-bell')
    await vi.waitFor(() => expect(wrapper.text()).toContain('1'))
    wrapper.unmount()
  })

  it('shows no badge when nothing is unread', async () => {
    feed = { notifications: [], unreadCount: 0 }
    const wrapper = await mountSuspended(NotificationBell)
    await new Promise((r) => setTimeout(r, 20))
    expect(wrapper.text()).not.toContain('9+')
    expect(wrapper.html()).toContain('pi-bell')
    wrapper.unmount()
  })
})
