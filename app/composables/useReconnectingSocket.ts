// One WebSocket to /_ws with automatic reconnect (capped exponential backoff).
// onOpen fires on the first connect AND every reconnect, so callers can
// re-subscribe and refetch the state they may have missed while disconnected
// (a deploy/restart otherwise froze live scores and crowd totals silently).
export function useReconnectingSocket(opts: {
  onMessage: (data: unknown) => void
  onOpen?: () => void
}) {
  let socket: WebSocket | null = null
  let retry = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let closed = false

  function connect() {
    if (!import.meta.client || closed) return
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    socket = new WebSocket(`${proto}://${location.host}/_ws`)
    socket.onopen = () => {
      retry = 0
      opts.onOpen?.()
    }
    socket.onmessage = (event) => {
      try {
        opts.onMessage(JSON.parse(event.data))
      } catch {
        // ignore malformed frames
      }
    }
    socket.onclose = scheduleReconnect
  }

  function scheduleReconnect() {
    if (closed) return
    // 1s, 2s, 4s … capped at 30s, so a server restart reconnects promptly
    // without hammering it.
    const delay = Math.min(1000 * 2 ** retry, 30_000)
    retry += 1
    clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(connect, delay)
  }

  function send(payload: unknown): boolean {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload))
      return true
    }
    return false
  }

  onMounted(connect)
  onBeforeUnmount(() => {
    closed = true
    clearTimeout(reconnectTimer)
    socket?.close()
  })

  return { send }
}
