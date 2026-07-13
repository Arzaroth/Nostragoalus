// One WebSocket to /_ws with automatic reconnect (capped exponential backoff).
// onOpen fires on the first connect AND every reconnect, so callers can
// re-subscribe and refetch the state they may have missed while disconnected
// (a deploy/restart otherwise froze live scores and crowd totals silently).
// Ping every 25s (under a typical carrier NAT idle timeout) and treat the socket
// as dead if no pong arrives within 10s - see createHeartbeat.
const HEARTBEAT_INTERVAL_MS = 25_000
const HEARTBEAT_TIMEOUT_MS = 10_000

export function useReconnectingSocket(opts: {
  onMessage: (data: unknown) => void
  onOpen?: () => void
}) {
  let socket: WebSocket | null = null
  let retry = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let closed = false

  // A silent half-open socket (carrier dropped the NAT mapping) never fires
  // onclose, so without this the backoff reconnect never runs and live data
  // freezes. The heartbeat forces a reconnect once a pong goes unanswered.
  const heartbeat = createHeartbeat({
    intervalMs: HEARTBEAT_INTERVAL_MS,
    timeoutMs: HEARTBEAT_TIMEOUT_MS,
    ping: () => send({ type: 'ping' }),
    onDead: () => forceReconnect(),
  })

  function connect() {
    if (!import.meta.client || closed) return
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    socket = new WebSocket(`${proto}://${location.host}/_ws`)
    socket.onopen = () => {
      retry = 0
      heartbeat.start()
      opts.onOpen?.()
    }
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        // Pongs answer our keepalive ping; they carry no app state, so swallow
        // them here rather than forwarding to callers.
        if ((data as { type?: unknown })?.type === 'pong') {
          heartbeat.onPong()
          return
        }
        opts.onMessage(data)
      } catch {
        // ignore malformed frames
      }
    }
    socket.onclose = () => {
      heartbeat.stop()
      scheduleReconnect()
    }
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

  // A reconnect that doesn't wait on the (throttled) backoff timer, and that
  // detaches the old socket's onclose so it can't schedule a second connect.
  function forceReconnect() {
    if (closed || !import.meta.client) return
    clearTimeout(reconnectTimer)
    retry = 0
    heartbeat.stop()
    if (socket) {
      socket.onclose = null
      socket.close()
    }
    socket = null
    connect()
  }

  // Background tabs throttle timers and may freeze the page, so a socket that
  // dropped while hidden reconnects late or not at all, and a one-shot push
  // (full-time, kickoff) is missed with nothing to retrigger it. On the way
  // back to the foreground (and when the network returns), reconnect a socket
  // that is not open - but only PROBE one that looks open. This socket also
  // carries voice signaling, and the server treats a close as leaving the call
  // (a DM call ends for both sides), so unconditionally tearing down a healthy
  // socket hung up live calls on every tab switch. A half-open survivor still
  // converges: the probe's unanswered pong forces the reconnect within its
  // timeout, and onOpen re-subscribes as before.
  function checkAlive() {
    if (socket?.readyState === WebSocket.OPEN) heartbeat.probe()
    else forceReconnect()
  }

  function onVisible() {
    if (document.visibilityState === 'visible') checkAlive()
  }

  function send(payload: unknown): boolean {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload))
      return true
    }
    return false
  }

  onMounted(() => {
    connect()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', checkAlive)
  })
  onBeforeUnmount(() => {
    closed = true
    clearTimeout(reconnectTimer)
    heartbeat.stop()
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', checkAlive)
    socket?.close()
  })

  return { send }
}
