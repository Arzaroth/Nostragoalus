export interface LiveMatchUpdate {
  id: string
  status: string
  fullTimeHome: number | null
  fullTimeAway: number | null
  penaltiesHome: number | null
  penaltiesAway: number | null
  winner: string | null
}

// Subscribes to live updates for one match over the WebSocket and exposes the
// latest pushed state. The match view merges this over its SSR-fetched data.
// Reconnect + re-subscribe is handled by the shared socket.
export function useLiveMatch(matchId: MaybeRefOrGetter<string>) {
  const id = toRef(matchId)
  const live = ref<LiveMatchUpdate | null>(null)

  const { send } = useReconnectingSocket({
    // On (re)connect, (re)subscribe to this match so updates resume after a drop.
    onOpen: () => send({ type: 'subscribe', matchIds: [id.value] }),
    onMessage: (data) => {
      const msg = data as { type?: string; match?: LiveMatchUpdate }
      if (msg?.type === 'match:update' && msg.match?.id === id.value) live.value = msg.match
    },
  })

  watch(id, () => send({ type: 'subscribe', matchIds: [id.value] }))

  return { live }
}
