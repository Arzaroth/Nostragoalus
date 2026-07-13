// Half-open WebSocket detector. On mobile/CGNAT a carrier silently drops an idle
// NAT mapping: the socket stops delivering data but never fires `onclose`, so the
// reconnect logic never triggers and live scores/chat freeze until a manual
// reload. This sends a periodic app-level ping; if the matching pong does not
// arrive within `timeoutMs`, it calls `onDead` so the caller can force a
// reconnect. The traffic also keeps the NAT mapping warm, so an otherwise-idle
// socket is less likely to be reaped in the first place.
export interface HeartbeatOptions {
  // How often to send a ping. Keep it under a typical carrier NAT idle timeout
  // (~30-60s) so the mapping never goes idle long enough to be reaped.
  intervalMs: number
  // How long to wait for a pong before declaring the socket dead.
  timeoutMs: number
  ping: () => void
  onDead: () => void
}

export interface Heartbeat {
  start: () => void
  stop: () => void
  // Feed every received pong here to clear the pending watchdog.
  onPong: () => void
  // Ping now (out of band), e.g. on tab foregrounding: a half-open socket is
  // declared dead within timeoutMs instead of waiting for the next beat. No-op
  // while stopped, and while a ping is already unanswered (the pending
  // watchdog, possibly armed pre-throttle in a background tab, already bounds
  // detection).
  probe: () => void
}

export function createHeartbeat(opts: HeartbeatOptions): Heartbeat {
  let beat: ReturnType<typeof setInterval> | undefined
  let watchdog: ReturnType<typeof setTimeout> | undefined

  function clearWatchdog() {
    if (watchdog !== undefined) {
      clearTimeout(watchdog)
      watchdog = undefined
    }
  }

  function tick() {
    // A watchdog already pending means the previous ping is still unanswered;
    // arm only one at a time so a dead socket is declared after a single
    // timeout, not extended by each fresh beat.
    if (watchdog !== undefined) return
    opts.ping()
    watchdog = setTimeout(() => {
      watchdog = undefined
      stop()
      opts.onDead()
    }, opts.timeoutMs)
  }

  function start() {
    stop()
    beat = setInterval(tick, opts.intervalMs)
  }

  function stop() {
    if (beat !== undefined) {
      clearInterval(beat)
      beat = undefined
    }
    clearWatchdog()
  }

  function onPong() {
    clearWatchdog()
  }

  function probe() {
    if (beat === undefined) return
    tick()
  }

  return { start, stop, onPong, probe }
}
