export interface LiveMatchUpdate {
  id: string
  status: string
  fullTimeHome: number | null
  fullTimeAway: number | null
  winner: string | null
}

// Subscribes to live updates for one match over the WebSocket and exposes the
// latest pushed state. The match view merges this over its SSR-fetched data.
export function useLiveMatch(matchId: MaybeRefOrGetter<string>) {
  const id = toRef(matchId)
  const live = ref<LiveMatchUpdate | null>(null)
  let socket: WebSocket | null = null

  function subscribe() {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'subscribe', matchIds: [id.value] }))
    }
  }

  function connect() {
    if (!import.meta.client) return
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    socket = new WebSocket(`${proto}://${location.host}/_ws`)
    socket.onopen = subscribe
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data?.type === 'match:update' && data.match?.id === id.value) {
          live.value = data.match
        }
      } catch {
        // ignore
      }
    }
  }

  onMounted(connect)
  onBeforeUnmount(() => socket?.close())
  watch(id, subscribe)

  return { live }
}
