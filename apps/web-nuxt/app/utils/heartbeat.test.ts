import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHeartbeat } from './heartbeat'

describe('createHeartbeat', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function setup() {
    const ping = vi.fn()
    const onDead = vi.fn()
    const hb = createHeartbeat({ intervalMs: 1000, timeoutMs: 500, ping, onDead })
    return { ping, onDead, hb }
  }

  it('pings on each interval while pongs keep arriving', () => {
    const { ping, onDead, hb } = setup()
    hb.start()
    vi.advanceTimersByTime(1000)
    expect(ping).toHaveBeenCalledTimes(1)
    hb.onPong()
    vi.advanceTimersByTime(1000)
    expect(ping).toHaveBeenCalledTimes(2)
    hb.onPong()
    expect(onDead).not.toHaveBeenCalled()
  })

  it('declares the socket dead when a pong does not arrive within the timeout', () => {
    const { ping, onDead, hb } = setup()
    hb.start()
    vi.advanceTimersByTime(1000)
    expect(ping).toHaveBeenCalledTimes(1)
    // No pong. After the timeout the watchdog fires.
    vi.advanceTimersByTime(500)
    expect(onDead).toHaveBeenCalledTimes(1)
    // Once dead it stops pinging (start() re-arms; onDead does not).
    vi.advanceTimersByTime(5000)
    expect(ping).toHaveBeenCalledTimes(1)
  })

  it('declaring the socket dead cancels the interval so it never pings again', () => {
    const { ping, onDead, hb } = setup()
    hb.start()
    vi.advanceTimersByTime(1000) // ping #1, watchdog armed (fires at +500)
    // At t=1500 the watchdog fires: onDead runs and stop() clears the interval,
    // so the next scheduled tick at t=2000 never happens.
    vi.advanceTimersByTime(1000)
    expect(onDead).toHaveBeenCalledTimes(1)
    expect(ping).toHaveBeenCalledTimes(1)
  })

  it('does not re-ping while a ping is still awaiting its pong', () => {
    // interval shorter than the timeout, so a fresh beat lands while the
    // previous ping's watchdog is still pending.
    const ping = vi.fn()
    const onDead = vi.fn()
    const hb = createHeartbeat({ intervalMs: 500, timeoutMs: 2000, ping, onDead })
    hb.start()
    vi.advanceTimersByTime(500) // ping #1, watchdog armed (fires at +2000)
    vi.advanceTimersByTime(500) // beat #2 mid-timeout: must early-return, no re-ping
    expect(ping).toHaveBeenCalledTimes(1)
    expect(onDead).not.toHaveBeenCalled()
    hb.onPong() // pong clears; next beat may ping again
    vi.advanceTimersByTime(500)
    expect(ping).toHaveBeenCalledTimes(2)
    hb.stop()
  })

  it('stop() cancels the interval and any pending watchdog', () => {
    const { ping, onDead, hb } = setup()
    hb.start()
    vi.advanceTimersByTime(1000)
    expect(ping).toHaveBeenCalledTimes(1)
    hb.stop()
    vi.advanceTimersByTime(10_000)
    expect(ping).toHaveBeenCalledTimes(1)
    expect(onDead).not.toHaveBeenCalled()
  })

  it('start() resets a running heartbeat rather than stacking intervals', () => {
    const { ping, hb } = setup()
    hb.start()
    hb.start()
    vi.advanceTimersByTime(1000)
    expect(ping).toHaveBeenCalledTimes(1)
  })

  it('onPong with no pending watchdog is a no-op', () => {
    const { onDead, hb } = setup()
    hb.start()
    hb.onPong()
    vi.advanceTimersByTime(400)
    expect(onDead).not.toHaveBeenCalled()
  })

  it('probe() pings immediately and its unanswered pong declares death', () => {
    const { ping, onDead, hb } = setup()
    hb.start()
    hb.probe()
    expect(ping).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(500)
    expect(onDead).toHaveBeenCalledTimes(1)
  })

  it('probe() answered by a pong keeps the socket alive', () => {
    const { onDead, hb } = setup()
    hb.start()
    hb.probe()
    hb.onPong()
    vi.advanceTimersByTime(500)
    expect(onDead).not.toHaveBeenCalled()
  })

  it('probe() is a no-op while stopped or while a ping is pending', () => {
    const { ping, hb } = setup()
    hb.probe()
    expect(ping).not.toHaveBeenCalled()
    hb.start()
    hb.probe() // ping #1, watchdog pending
    hb.probe() // must not double-ping
    expect(ping).toHaveBeenCalledTimes(1)
    hb.stop()
  })
})
