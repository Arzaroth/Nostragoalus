import { describe, it, expect, vi } from 'vitest'
import { RateLimiter } from './rate-limiter'

describe('RateLimiter', () => {
  it('does not wait on the first acquire', async () => {
    const sleep = vi.fn(async () => {})
    const limiter = new RateLimiter(1000, () => 0, sleep)
    await limiter.acquire()
    expect(sleep).not.toHaveBeenCalled()
  })

  it('waits the remaining interval when calls are too close', async () => {
    const sleep = vi.fn(async () => {})
    let t = 0
    const limiter = new RateLimiter(1000, () => t, sleep)
    await limiter.acquire() // t=0, sets lastAt=0
    t = 300
    await limiter.acquire() // wait = 1000 - 300 = 700
    expect(sleep).toHaveBeenCalledWith(700)
  })

  it('does not wait when enough time has elapsed', async () => {
    const sleep = vi.fn(async () => {})
    let t = 0
    const limiter = new RateLimiter(1000, () => t, sleep)
    await limiter.acquire()
    t = 1500
    await limiter.acquire()
    expect(sleep).not.toHaveBeenCalled()
  })

  // The reason the slot is reserved before sleeping rather than recorded after:
  // concurrent callers must queue behind each other, not all wake together.
  it('spaces concurrent acquires instead of releasing them as a burst', async () => {
    const slept: number[] = []
    const limiter = new RateLimiter(60, () => 0, async (ms) => {
      slept.push(ms)
    })
    // Six at once, the way a bounded worker pool acquires.
    await Promise.all(Array.from({ length: 6 }, () => limiter.acquire()))
    // One goes immediately, the rest are handed successive slots.
    expect(slept).toEqual([60, 120, 180, 240, 300])
  })

  it('does not punish a caller that arrives after a long idle', async () => {
    const sleep = vi.fn(async () => {})
    let t = 0
    const limiter = new RateLimiter(1000, () => t, sleep)
    await limiter.acquire()
    await limiter.acquire()
    sleep.mockClear()
    // Well past the reserved slot: the limiter must not still be holding it.
    t = 99_000
    await limiter.acquire()
    expect(sleep).not.toHaveBeenCalled()
  })

  it('works with the default clock and sleep', async () => {
    const limiter = new RateLimiter(1)
    await limiter.acquire()
    await limiter.acquire()
    // No assertion beyond completing without throwing; exercises the default deps.
    expect(true).toBe(true)
  })
})
