import { describe, it, expect, vi, afterEach } from 'vitest'
import { createTtlCache } from './ttl-cache'

describe('createTtlCache', () => {
  it('returns undefined on a miss, the value within the TTL, and undefined once expired', () => {
    const c = createTtlCache<string, number>({ ttlMs: 10_000 })
    expect(c.get('a', 0)).toBeUndefined()
    c.set('a', 42, 1_000)
    expect(c.get('a', 1_000)).toBe(42)
    expect(c.get('a', 1_000 + 9_000)).toBe(42) // inside the TTL
    expect(c.get('a', 1_000 + 11_000)).toBeUndefined() // past the TTL
  })

  it('distinguishes a cached null from a miss', () => {
    const c = createTtlCache<string, number | null>({ ttlMs: 10_000 })
    c.set('a', null, 0)
    expect(c.get('a', 0)).toBeNull()
    expect(c.get('b', 0)).toBeUndefined()
  })

  it('has() reports live membership without returning the value', () => {
    const c = createTtlCache<string, number>({ ttlMs: 10_000 })
    c.set('a', 1, 0)
    expect(c.has('a', 0)).toBe(true)
    expect(c.has('a', 20_000)).toBe(false) // expired
    expect(c.has('missing', 0)).toBe(false)
  })

  it('evicts the expired entry on read so size shrinks', () => {
    const c = createTtlCache<string, number>({ ttlMs: 10_000 })
    c.set('a', 1, 0)
    expect(c.size).toBe(1)
    c.get('a', 20_000)
    expect(c.size).toBe(0)
  })

  it('invalidate drops one entry, clear drops all', () => {
    const c = createTtlCache<string, number>({ ttlMs: 10_000 })
    c.set('a', 1, 0)
    c.set('b', 2, 0)
    c.invalidate('a')
    expect(c.get('a', 0)).toBeUndefined()
    expect(c.get('b', 0)).toBe(2)
    c.clear()
    expect(c.get('b', 0)).toBeUndefined()
    expect(c.size).toBe(0)
  })

  it('supports a per-value TTL so misses expire sooner than hits', () => {
    const c = createTtlCache<string, { ok: boolean }>({
      ttlMs: (v) => (v.ok ? 60_000 : 1_000),
    })
    c.set('hit', { ok: true }, 0)
    c.set('miss', { ok: false }, 0)
    expect(c.get('hit', 30_000)).toEqual({ ok: true }) // still live at 30s
    expect(c.get('miss', 30_000)).toBeUndefined() // miss expired at 1s
  })

  it('caps at maxSize by dropping the oldest inserted key', () => {
    const c = createTtlCache<string, number>({ ttlMs: 60_000, maxSize: 2 })
    c.set('a', 1, 0)
    c.set('b', 2, 0)
    c.set('c', 3, 0) // evicts 'a'
    expect(c.get('a', 0)).toBeUndefined()
    expect(c.get('b', 0)).toBe(2)
    expect(c.get('c', 0)).toBe(3)
    expect(c.size).toBe(2)
  })

  it('overwriting an existing key does not evict under maxSize', () => {
    const c = createTtlCache<string, number>({ ttlMs: 60_000, maxSize: 2 })
    c.set('a', 1, 0)
    c.set('b', 2, 0)
    c.set('a', 9, 0) // in-place update, no eviction
    expect(c.get('a', 0)).toBe(9)
    expect(c.get('b', 0)).toBe(2)
  })

  it('falls back to the injectable clock when now is omitted', () => {
    const now = vi.fn(() => 5_000)
    const c = createTtlCache<string, number>({ ttlMs: 10_000, now })
    c.set('a', 1)
    now.mockReturnValue(10_000)
    expect(c.get('a')).toBe(1) // 5s elapsed, within TTL
    now.mockReturnValue(20_000)
    expect(c.get('a')).toBeUndefined() // 15s elapsed, expired
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })
})
