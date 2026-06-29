// "N watching now" for one match. Tells the server this socket is viewing the
// match (a `viewing` frame, distinct from the score `subscribe` useLiveMatch
// sends - that one rides the fixtures list too and would inflate the count) and
// tracks the live viewer count the hub pushes back. The shared reconnecting
// socket re-sends `viewing` on every reconnect, so the count heals after a drop.
export function useMatchPresence(matchId: MaybeRefOrGetter<string>) {
  const id = toRef(matchId)
  const count = ref(0)

  const { send } = useReconnectingSocket({
    onOpen: () => send({ type: 'viewing', matchId: id.value }),
    onMessage: (data) => {
      const msg = data as { type?: string; matchId?: string; count?: number }
      if (msg?.type === 'viewers:update' && msg.matchId === id.value && typeof msg.count === 'number') {
        count.value = msg.count
      }
    },
  })

  // Navigating to another match (same page instance) re-points the viewer room.
  watch(id, () => {
    count.value = 0
    send({ type: 'viewing', matchId: id.value })
  })

  return { count }
}
