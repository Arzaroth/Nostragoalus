import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { FifaRankingProvider } from '../providers/fifa-ranking'
import { getFifaRanks, resetFifaRankCache } from './ranking'

function fakeProvider(ranks: Record<string, number>): FifaRankingProvider & { calls: number } {
  const p = {
    calls: 0,
    async getLatestScheduleId() {
      return 'id15065'
    },
    async getRanks() {
      return new Map(Object.entries(ranks))
    },
    async getLatestRanks() {
      p.calls += 1
      return { scheduleId: 'id15065', ranks: new Map(Object.entries(ranks)) }
    },
  }
  return p
}

function failingProvider(): FifaRankingProvider {
  return {
    getLatestScheduleId: () => Promise.reject(new Error('down')),
    getRanks: () => Promise.reject(new Error('down')),
    getLatestRanks: () => Promise.reject(new Error('down')),
  }
}

const T0 = new Date('2026-06-01T00:00:00Z')
const T0_PLUS_1H = new Date('2026-06-01T01:00:00Z')
const T0_PLUS_13H = new Date('2026-06-01T13:00:00Z')

beforeEach(() => {
  resetFifaRankCache()
})

describe('getFifaRanks', () => {
  it('fetches once and serves the cache within the TTL', async () => {
    const provider = fakeProvider({ BRA: 6 })
    expect((await getFifaRanks(provider, T0))?.get('BRA')).toBe(6)
    expect((await getFifaRanks(provider, T0_PLUS_1H))?.get('BRA')).toBe(6)
    expect(provider.calls).toBe(1)
  })

  it('refetches after the TTL expires', async () => {
    const provider = fakeProvider({ BRA: 6 })
    await getFifaRanks(provider, T0)
    await getFifaRanks(provider, T0_PLUS_13H)
    expect(provider.calls).toBe(2)
  })

  it('returns null when the fetch fails with no cache to fall back on', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await getFifaRanks(failingProvider(), T0)).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('serves the stale cache when a refresh fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await getFifaRanks(fakeProvider({ BRA: 6 }), T0)
    const stale = await getFifaRanks(failingProvider(), T0_PLUS_13H)
    expect(stale?.get('BRA')).toBe(6)
    warn.mockRestore()
  })

  it('shares one in-flight fetch across concurrent cold-cache callers (no stampede)', async () => {
    const provider = fakeProvider({ BRA: 6 })
    const [a, b, c] = await Promise.all([getFifaRanks(provider, T0), getFifaRanks(provider, T0), getFifaRanks(provider, T0)])
    expect(a?.get('BRA')).toBe(6)
    expect(b?.get('BRA')).toBe(6)
    expect(c?.get('BRA')).toBe(6)
    expect(provider.calls).toBe(1)
  })

  it('does not re-hammer a failing endpoint within the backoff window', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let calls = 0
    const provider: FifaRankingProvider = {
      getLatestScheduleId: () => Promise.reject(new Error('down')),
      getRanks: () => Promise.reject(new Error('down')),
      getLatestRanks: () => {
        calls += 1
        return Promise.reject(new Error('down'))
      },
    }
    expect(await getFifaRanks(provider, T0)).toBeNull()
    // 1 minute later (within the 5-minute backoff) - no retry.
    expect(await getFifaRanks(provider, new Date('2026-06-01T00:01:00Z'))).toBeNull()
    expect(calls).toBe(1)
    warn.mockRestore()
  })
})
