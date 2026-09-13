import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import type { FifaRankingProvider } from '../providers/fifa-ranking'
import { getFifaRanks, getRanksForCompetition, resetFifaRankCache } from './ranking'

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

describe('getRanksForCompetition', () => {
  const T = new Date('2026-06-01T00:00:00Z')
  // Not only on the last line of each test: one failing assertion would
  // otherwise leave a World Rugby-shaped fetch installed for the whole file.
  afterEach(() => vi.unstubAllGlobals())

  function stubWorldRugby(entries: { abbr: string; pos: number }[]) {
    return vi.fn(async () =>
      new Response(
        JSON.stringify({ entries: entries.map((e) => ({ team: { abbreviation: e.abbr }, pos: e.pos })) }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch
  }

  it('reads the World Rugby table for a rugby competition', async () => {
    const fetchImpl = stubWorldRugby([{ abbr: 'RSA', pos: 1 }, { abbr: 'NZL', pos: 2 }])
    vi.stubGlobal('fetch', fetchImpl)
    const ranks = await getRanksForCompetition({ sport: 'RUGBY_UNION', providerSport: 'mru' }, T)
    expect(ranks?.get('RSA')).toBe(1)
    expect(ranks?.get('NZL')).toBe(2)
    vi.unstubAllGlobals()
  })

  it('asks the right sub-feed and caches each one apart', async () => {
    // Men's and women's are different tables under codes of the same shape, so
    // one shared cache slot would serve the wrong sport with nothing to show it.
    const urls: string[] = []
    const fetchImpl = vi.fn(async (url: string | URL) => {
      urls.push(String(url))
      const mens = String(url).endsWith('/mru')
      return new Response(
        JSON.stringify({ entries: [{ team: { abbreviation: mens ? 'RSA' : 'ENG' }, pos: 1 }] }),
        { status: 200 },
      )
    }) as unknown as typeof fetch
    vi.stubGlobal('fetch', fetchImpl)

    const mens = await getRanksForCompetition({ sport: 'RUGBY_UNION', providerSport: 'mru' }, T)
    const womens = await getRanksForCompetition({ sport: 'RUGBY_UNION', providerSport: 'wru' }, T)
    expect(mens?.get('RSA')).toBe(1)
    expect(womens?.get('ENG')).toBe(1)
    expect(urls).toEqual([
      'https://api.wr-rims-prod.pulselive.com/rugby/v3/rankings/mru',
      'https://api.wr-rims-prod.pulselive.com/rugby/v3/rankings/wru',
    ])

    await getRanksForCompetition({ sport: 'RUGBY_UNION', providerSport: 'mru' }, T)
    expect(urls).toHaveLength(2)
    vi.unstubAllGlobals()
  })

  it('defaults a rugby competition with no sub-feed to the mens table', async () => {
    const fetchImpl = stubWorldRugby([{ abbr: 'RSA', pos: 1 }])
    vi.stubGlobal('fetch', fetchImpl)
    expect((await getRanksForCompetition({ sport: 'RUGBY_UNION' }, T))?.get('RSA')).toBe(1)
    vi.unstubAllGlobals()
  })

  it('returns null when the sub-feed has no table, so the pick falls back to the flat bonus', async () => {
    // The sevens feeds answer 400: there is no sevens ranking to read.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 400 })) as unknown as typeof fetch)
    expect(await getRanksForCompetition({ sport: 'RUGBY_UNION', providerSport: 'mrs' }, T)).toBeNull()
    vi.unstubAllGlobals()
    warn.mockRestore()
  })

  it('sends a football competition to FIFA, not to World Rugby', async () => {
    const fetchImpl = stubWorldRugby([{ abbr: 'RSA', pos: 1 }])
    vi.stubGlobal('fetch', fetchImpl)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await getRanksForCompetition({ sport: 'FOOTBALL' }, T)
    // Whatever the FIFA provider did, it must not have been the rugby endpoint.
    for (const call of (fetchImpl as unknown as { mock: { calls: unknown[][] } }).mock.calls) {
      expect(String(call[0])).not.toContain('wr-rims-prod')
    }
    vi.unstubAllGlobals()
    warn.mockRestore()
  })
})
