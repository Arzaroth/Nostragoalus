import { describe, it, expect, beforeEach, vi } from 'vitest'
import { clearDiscoveryCache, discoverForProvider } from './discovery'
import { ProviderError, ValidationError } from '../errors'
import type { DiscoveredCompetition, MatchDataProvider } from '../providers/types'

const CATALOG: DiscoveredCompetition[] = [
  { externalCompetitionId: 'eng.1', name: 'Premier League', seasonHint: '2026', isTournament: false },
]

function adapter(over: Partial<MatchDataProvider> = {}): MatchDataProvider {
  return {
    meta: { name: 'stub', rateLimitPerMin: 0, dailyCap: null },
    listFixtures: async () => [],
    getMatchesByDate: async () => [],
    getLiveMatches: async () => [],
    ...over,
  } as MatchDataProvider
}

beforeEach(() => {
  clearDiscoveryCache()
})

describe('discoverForProvider', () => {
  it('returns the provider catalog', async () => {
    const discover = vi.fn(async () => CATALOG)
    const found = await discoverForProvider('espn', { makeProvider: () => adapter({ discoverCompetitions: discover }) })
    expect(found).toEqual(CATALOG)
    expect(discover).toHaveBeenCalledTimes(1)
  })

  // Each entry costs a request to name, so a second admin visit must not re-walk
  // the whole catalog.
  it('serves a second call from cache, and re-reads once the entry ages out', async () => {
    const discover = vi.fn(async () => CATALOG)
    const make = () => adapter({ discoverCompetitions: discover })
    let clock = 1_000

    await discoverForProvider('espn', { makeProvider: make, now: () => clock })
    await discoverForProvider('espn', { makeProvider: make, now: () => clock })
    expect(discover).toHaveBeenCalledTimes(1)

    clock += 10 * 60_000 + 1
    await discoverForProvider('espn', { makeProvider: make, now: () => clock })
    expect(discover).toHaveBeenCalledTimes(2)
  })

  it('clearDiscoveryCache forces the next call to re-read', async () => {
    const discover = vi.fn(async () => CATALOG)
    const make = () => adapter({ discoverCompetitions: discover })
    await discoverForProvider('espn', { makeProvider: make })
    clearDiscoveryCache()
    await discoverForProvider('espn', { makeProvider: make })
    expect(discover).toHaveBeenCalledTimes(2)
  })

  // "Cannot enumerate" is a normal answer for UEFA and the fixture provider, so
  // it is the admin's request that is wrong, not the upstream.
  it('rejects a provider that cannot enumerate as a bad request', async () => {
    await expect(discoverForProvider('espn', { makeProvider: () => adapter() })).rejects.toThrow(ValidationError)
  })

  // A dead undocumented endpoint is the provider's fault, not the admin's: it
  // must surface as a 502, not a 400, so the admin knows to retry.
  it('wraps an upstream failure as a ProviderError and caches nothing', async () => {
    const discover = vi.fn(async () => {
      throw new Error('403 Access Denied')
    })
    const make = () => adapter({ discoverCompetitions: discover })
    await expect(discoverForProvider('espn', { makeProvider: make })).rejects.toThrow(ProviderError)
    await expect(discoverForProvider('espn', { makeProvider: make })).rejects.toThrow(/403 Access Denied/)
    expect(discover).toHaveBeenCalledTimes(2)
  })
})
