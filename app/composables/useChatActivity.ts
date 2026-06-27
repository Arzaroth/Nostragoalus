// League-wide chat activity: tracks unread message counts per room (the global
// room and each match thread) from the live socket, so the dock can badge a
// collapsed bubble, the scope toggle, and a "rooms with activity" list - across
// rooms the user is not currently looking at. Unread is per-session (in memory);
// it clears as soon as a room is viewed.
export const GLOBAL_ROOM = '__global__'

export function roomKeyOf(matchId: string | null): string {
  return matchId ?? GLOBAL_ROOM
}

export interface ActiveRoom {
  roomKey: string
  matchId: string | null
  count: number
}

export function useChatActivity(
  leagueId: MaybeRefOrGetter<string | null>,
  opts: { activeRoom: MaybeRefOrGetter<string | null>; viewing: MaybeRefOrGetter<boolean> },
) {
  const { session } = useAuth()
  const myId = computed(() => session.value?.data?.user?.id ?? null)

  const unread = ref<Record<string, number>>({})
  // Unread messages that @-mention the reader, tracked separately so the dock can
  // badge them distinctly. The chat is E2EE, so we can't read the text here - the
  // sender ships the mentioned ids as plaintext on the push (see publishChatMessage).
  const unreadMentions = ref<Record<string, number>>({})

  function markSeen(roomKey: string): void {
    if (unread.value[roomKey]) {
      const next = { ...unread.value }
      delete next[roomKey]
      unread.value = next
    }
    if (unreadMentions.value[roomKey]) {
      const next = { ...unreadMentions.value }
      delete next[roomKey]
      unreadMentions.value = next
    }
  }

  useReconnectingSocket({
    onMessage: (data) => {
      const msg = data as {
        type?: string
        leagueId?: string
        message?: { matchId?: string | null; userId?: string; threadId?: string | null }
        mentions?: string[]
      }
      if (msg.type !== 'chat:new' || msg.leagueId !== toValue(leagueId) || !msg.message) return
      // Thread replies live inside a collapsed thread, not the main list. Counting
      // them as room unread (or as an unread mention) would badge the room, then
      // markSeen would clear it on open without the reply ever being shown.
      if (msg.message.threadId) return
      const rk = roomKeyOf(msg.message.matchId ?? null)
      // The room the user is actively viewing is never unread.
      if (toValue(opts.viewing) && toValue(opts.activeRoom) === rk) return
      unread.value = { ...unread.value, [rk]: (unread.value[rk] ?? 0) + 1 }
      const me = myId.value
      if (me && msg.message.userId !== me && msg.mentions?.includes(me)) {
        unreadMentions.value = { ...unreadMentions.value, [rk]: (unreadMentions.value[rk] ?? 0) + 1 }
      }
    },
  })

  const total = computed(() => Object.values(unread.value).reduce((a, b) => a + b, 0))
  const totalMentions = computed(() => Object.values(unreadMentions.value).reduce((a, b) => a + b, 0))
  const activeRooms = computed<ActiveRoom[]>(() =>
    Object.entries(unread.value)
      .filter(([, c]) => c > 0)
      .map(([roomKey, count]) => ({ roomKey, matchId: roomKey === GLOBAL_ROOM ? null : roomKey, count })),
  )
  function unreadFor(roomKey: string): number {
    return unread.value[roomKey] ?? 0
  }
  function mentionsFor(roomKey: string): number {
    return unreadMentions.value[roomKey] ?? 0
  }

  // Whatever room is being viewed clears as it is shown (and stays clear).
  watch(
    [() => toValue(opts.activeRoom), () => toValue(opts.viewing)],
    () => {
      const room = toValue(opts.activeRoom)
      if (toValue(opts.viewing) && room) markSeen(room)
    },
    { immediate: true },
  )

  return { unread, total, totalMentions, activeRooms, unreadFor, mentionsFor, markSeen }
}
