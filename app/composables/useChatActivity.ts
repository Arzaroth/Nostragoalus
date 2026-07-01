import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useDebounceFn } from '@vueuse/core'
import { GLOBAL_ROOM, roomKeyFor, type ChatUnreadRoomDTO } from '#shared/types/chat'

// Cross-league chat activity: every league-global room and match thread, across
// all the user's leagues, with unread messages and/or unread @mentions. The
// authoritative counts come from GET /api/chat/unread (recomputed from persisted
// read markers, so they survive a reload); the live socket patches the cached
// list optimistically between fetches. Opening a room persists its read marker.
export { GLOBAL_ROOM } from '#shared/types/chat'
export { roomKeyFor as roomKeyOf } from '#shared/types/chat'

const UNREAD_KEY = ['chat', 'unread']

export function useChatActivity(opts: {
  activeLeagueId: MaybeRefOrGetter<string | null>
  activeRoom: MaybeRefOrGetter<string | null>
  // The open room is actually READABLE (uncollapsed AND decrypted). A room whose
  // messages we cannot decrypt yet - no recovery key, key not sealed to us - is
  // not "read" just by being on screen, so it keeps accruing unread until it
  // decrypts. That gates the mark-read below.
  readable: MaybeRefOrGetter<boolean>
}) {
  const qc = useQueryClient()
  const { session } = useAuth()
  const myId = computed(() => session.value?.data?.user?.id ?? null)
  const enabled = computed(() => !!myId.value)

  const query = useQuery({
    queryKey: UNREAD_KEY,
    queryFn: ({ signal }) => $fetch<{ rooms: ChatUnreadRoomDTO[] }>('/api/chat/unread', { signal }).then((r) => r.rooms),
    enabled,
  })

  // Sort client-side (newest activity first, mirroring the server's tiebreaker) so
  // the in-place live patches below never leave the list out of order between fetches.
  const sortKey = (r: ChatUnreadRoomDTO) => `${r.lastAt}|${r.leagueId}|${r.roomKey}`
  const rooms = computed<ChatUnreadRoomDTO[]>(() =>
    [...(query.data.value ?? [])].sort((a, b) => sortKey(b).localeCompare(sortKey(a))),
  )

  function patch(fn: (list: ChatUnreadRoomDTO[]) => ChatUnreadRoomDTO[]): void {
    qc.setQueryData<ChatUnreadRoomDTO[]>(UNREAD_KEY, (old) => fn(old ?? []))
  }
  function find(list: ChatUnreadRoomDTO[], leagueId: string, roomKey: string): ChatUnreadRoomDTO | undefined {
    return list.find((r) => r.leagueId === leagueId && r.roomKey === roomKey)
  }

  // Persist the read marker for a room and converge the list with the server.
  // Marking a room read also clears its CHAT_MENTION bell rows, so refresh the
  // notification feed too or the bell's unread count goes stale.
  function postRead(leagueId: string, roomKey: string): Promise<unknown> {
    return $fetch('/api/chat/read', { method: 'POST', body: { leagueId, roomKey } })
      .catch(() => {})
      .finally(() => {
        if (enabled.value) {
          qc.invalidateQueries({ queryKey: UNREAD_KEY })
          qc.invalidateQueries({ queryKey: ['notifications', 'feed'] })
        }
      })
  }

  // While a room is open, keep its marker fresh as messages stream in, so a reload
  // does not resurrect messages the user already watched arrive. Debounced: one
  // write per burst, not per message.
  const touchActive = useDebounceFn(() => {
    const leagueId = toValue(opts.activeLeagueId)
    const room = toValue(opts.activeRoom)
    if (toValue(opts.readable) && leagueId && room) void postRead(leagueId, room)
  }, 1500)

  useReconnectingSocket({
    // A reconnect may have missed live frames (deploy/restart): refetch to converge.
    onOpen: () => {
      if (enabled.value) qc.invalidateQueries({ queryKey: UNREAD_KEY })
    },
    onMessage: (data) => {
      const msg = data as {
        type?: string
        leagueId?: string
        message?: { matchId?: string | null; userId?: string; threadId?: string | null; createdAt?: string }
        mentions?: string[]
      }
      if (msg.type !== 'chat:new' || !msg.leagueId || !msg.message) return
      // Thread replies live inside a collapsed thread, not the main list.
      if (msg.message.threadId) return
      const leagueId = msg.leagueId
      const rk = roomKeyFor(msg.message.matchId ?? null)
      const me = myId.value
      // My own messages never count.
      if (me && msg.message.userId === me) return
      // The room being actively read (decrypted) is already caught up: just keep
      // its marker fresh. If it's open but not yet decrypted, fall through so the
      // message still accrues as unread until the reader can actually see it.
      if (toValue(opts.readable) && toValue(opts.activeLeagueId) === leagueId && toValue(opts.activeRoom) === rk) {
        touchActive()
        return
      }
      const isMention = !!(me && msg.mentions?.includes(me))
      const existing = find(query.data.value ?? [], leagueId, rk)
      if (existing) {
        patch((list) =>
          list.map((r) =>
            r.leagueId === leagueId && r.roomKey === rk
              ? {
                  ...r,
                  unread: r.unread + 1,
                  mentions: r.mentions + (isMention ? 1 : 0),
                  lastAt: msg.message?.createdAt ?? r.lastAt,
                }
              : r,
          ),
        )
      } else if (enabled.value) {
        // A room not yet in the list (its first activity, or labels unknown
        // client-side): pull the authoritative, fully-labelled set.
        qc.invalidateQueries({ queryKey: UNREAD_KEY })
      }
    },
  })

  const total = computed(() => rooms.value.reduce((a, r) => a + r.unread, 0))
  const totalMentions = computed(() => rooms.value.reduce((a, r) => a + r.mentions, 0))

  function unreadFor(leagueId: string | null, roomKey: string): number {
    if (!leagueId) return 0
    return find(rooms.value, leagueId, roomKey)?.unread ?? 0
  }
  function mentionsFor(leagueId: string | null, roomKey: string): number {
    if (!leagueId) return 0
    return find(rooms.value, leagueId, roomKey)?.mentions ?? 0
  }

  // Mark a room read: drop it locally for instant feedback, then persist + converge.
  function markSeen(leagueId: string | null, roomKey: string): void {
    if (!leagueId || !enabled.value) return
    const had = find(query.data.value ?? [], leagueId, roomKey)
    if (!had) return
    patch((list) => list.filter((r) => !(r.leagueId === leagueId && r.roomKey === roomKey)))
    void postRead(leagueId, roomKey)
  }

  // The room being read clears as it is shown (and the marker persists it). Gated
  // on `readable`, so switching into a room we cannot decrypt does not mark it
  // read; it clears once the key arrives and this fires on the readable flip.
  watch(
    [() => toValue(opts.activeLeagueId), () => toValue(opts.activeRoom), () => toValue(opts.readable)],
    () => {
      const leagueId = toValue(opts.activeLeagueId)
      const room = toValue(opts.activeRoom)
      if (toValue(opts.readable) && leagueId && room) markSeen(leagueId, room)
    },
    { immediate: true },
  )

  return { rooms, total, totalMentions, unreadFor, mentionsFor, markSeen, refetch: () => query.refetch() }
}
