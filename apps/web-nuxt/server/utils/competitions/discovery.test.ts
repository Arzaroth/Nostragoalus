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
    // The upstream's own text stays on `cause`: it can be a WAF's HTML page, and
    // the message ends up in the client-visible status line.
    await expect(discoverForProvider('espn', { makeProvider: make })).rejects.toThrow(/could not read espn/)
    await expect(discoverForProvider('espn', { makeProvider: make })).rejects.not.toThrow(/403 Access Denied/)
    expect(discover).toHaveBeenCalledTimes(3)
  })
})

describe('discovery cache', () => {
  // A rate-limited walk still resolves, just short. Caching an empty catalog
  // would wedge the admin's screen for the whole TTL with no error to act on.
  it('does not cache an empty catalog', async () => {
    clearDiscoveryCache()
    const discover = vi.fn(async () => [] as DiscoveredCompetition[])
    const make = () => adapter({ discoverCompetitions: discover })
    await discoverForProvider('espn', { makeProvider: make })
    await discoverForProvider('espn', { makeProvider: make })
    expect(discover).toHaveBeenCalledTimes(2)
  })
})

describe('per-sport catalogs', () => {
  const catalogFor = (sport: string | null | undefined): DiscoveredCompetition[] => [
    { externalCompetitionId: `evt-${sport}`, name: `Event ${sport}`, seasonHint: '2027', isTournament: null },
  ]

  it('passes the sub-feed through to the provider', async () => {
    const seen: (string | null | undefined)[] = []
    const make = (_p: string, sport?: string | null) => {
      seen.push(sport)
      return adapter({ discoverCompetitions: async () => catalogFor(sport) })
    }
    const found = await discoverForProvider('worldrugby', { makeProvider: make }, 'wru')
    expect(seen).toEqual(['wru'])
    expect(found[0]!.externalCompetitionId).toBe('evt-wru')
  })

  it('caches each sub-feed separately', async () => {
    // One entry per provider would serve the men's catalog to an admin who asked
    // for the women's, for the whole TTL and with nothing to indicate it.
    const make = vi.fn((_p: string, sport?: string | null) =>
      adapter({ discoverCompetitions: async () => catalogFor(sport) }),
    )
    const mens = await discoverForProvider('worldrugby', { makeProvider: make }, 'mru')
    const womens = await discoverForProvider('worldrugby', { makeProvider: make }, 'wru')
    expect(mens[0]!.externalCompetitionId).toBe('evt-mru')
    expect(womens[0]!.externalCompetitionId).toBe('evt-wru')
    expect(make).toHaveBeenCalledTimes(2)

    await discoverForProvider('worldrugby', { makeProvider: make }, 'mru')
    expect(make).toHaveBeenCalledTimes(2)
  })

  it('keeps the bare provider key when no sub-feed is named', async () => {
    const make = vi.fn(() => adapter({ discoverCompetitions: async () => CATALOG }))
    await discoverForProvider('espn', { makeProvider: make })
    await discoverForProvider('espn', { makeProvider: make })
    expect(make).toHaveBeenCalledTimes(1)
  })
})
