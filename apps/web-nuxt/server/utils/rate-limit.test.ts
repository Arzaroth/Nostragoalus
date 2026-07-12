import { describe, it, expect } from 'vitest'
import { createRateLimiter } from './rate-limit'

describe('createRateLimiter', () => {
  it('allows up to the limit per window, per key', () => {
    let t = 0
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now: () => t })
    expect(limiter.allow('a')).toBe(true)
    t = 500
    expect(limiter.allow('a')).toBe(true)
    t = 900
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('a')).toBe(false)
    // Other keys have their own budget.
    expect(limiter.allow('b')).toBe(true)
    // Window slides: only the t=0 hit has expired, freeing exactly one slot.
    t = 1001
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('a')).toBe(false)
  })

  it('denied calls do not consume budget', () => {
    let t = 0
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => t })
    expect(limiter.allow('a')).toBe(true)
    expect(limiter.allow('a')).toBe(false)
    expect(limiter.allow('a')).toBe(false)
    t = 1001
    expect(limiter.allow('a')).toBe(true)
  })

  it('prunes idle keys once the map grows large', () => {
    let t = 0
    const limiter = createRateLimiter({ limit: 1, windowMs: 10, now: () => t })
    for (let i = 0; i < 10_001; i++) limiter.allow(`k${i}`)
    t = 100
    // Triggers the prune sweep and still answers correctly.
    expect(limiter.allow('fresh')).toBe(true)
    expect(limiter.allow('k0')).toBe(true)
  })
})
