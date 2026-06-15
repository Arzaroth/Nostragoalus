import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { NotificationDTO } from '../../shared/types/notifications'

interface FeedResponse {
  notifications: NotificationDTO[]
  unreadCount: number
}

const FEED_KEY = ['notifications', 'feed']

function markIdsRead(feed: FeedResponse, ids: string[]): FeedResponse {
  const set = new Set(ids)
  let cleared = 0
  const notifications = feed.notifications.map((n) => {
    if (set.has(n.id) && !n.read) {
      cleared += 1
      return { ...n, read: true }
    }
    return n
  })
  return { notifications, unreadCount: Math.max(0, feed.unreadCount - cleared) }
}

// Drives the header bell: the feed query, live prepend over the shared socket
// (the server gates `notification:new` to this user's own sockets), and the
// read mutations with an optimistic local patch.
export function useNotifications() {
  const qc = useQueryClient()
  const { session } = useAuth()
  const enabled = computed(() => !!session.value?.data)

  const query = useQuery({
    queryKey: FEED_KEY,
    queryFn: ({ signal }) => $fetch<FeedResponse>('/api/notifications', { signal }),
    enabled,
  })

  const notifications = computed(() => query.data.value?.notifications ?? [])
  const unreadCount = computed(() => query.data.value?.unreadCount ?? 0)

  function patchFeed(fn: (feed: FeedResponse) => FeedResponse) {
    qc.setQueryData<FeedResponse>(FEED_KEY, (old) => fn(old ?? { notifications: [], unreadCount: 0 }))
  }

  useReconnectingSocket({
    // A reconnect may have missed a push (deploy/restart): refetch to converge.
    onOpen: () => {
      if (enabled.value) qc.invalidateQueries({ queryKey: FEED_KEY })
    },
    onMessage: (data) => {
      const msg = data as { type?: string; notification?: NotificationDTO }
      if (msg?.type !== 'notification:new' || !msg.notification) return
      const incoming = msg.notification
      patchFeed((feed) => {
        if (feed.notifications.some((n) => n.id === incoming.id)) return feed
        return { notifications: [incoming, ...feed.notifications], unreadCount: feed.unreadCount + 1 }
      })
    },
  })

  const markRead = useMutation({
    mutationFn: (ids: string[]) =>
      $fetch<{ marked: number }>('/api/notifications/read', { method: 'POST', body: { ids } }),
    onMutate: (ids: string[]) => patchFeed((feed) => markIdsRead(feed, ids)),
    onSettled: () => qc.invalidateQueries({ queryKey: FEED_KEY }),
  })

  const markAllRead = useMutation({
    mutationFn: () => $fetch<{ marked: number }>('/api/notifications/read', { method: 'POST', body: { all: true } }),
    onMutate: () =>
      patchFeed((feed) => ({ notifications: feed.notifications.map((n) => ({ ...n, read: true })), unreadCount: 0 })),
    onSettled: () => qc.invalidateQueries({ queryKey: FEED_KEY }),
  })

  return { notifications, unreadCount, isLoading: query.isLoading, markRead, markAllRead }
}
