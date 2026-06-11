import { describe, it, expect } from 'vitest'
import { RateLimiter } from './rate-limiter'
import { ProviderUpstreamError } from './types'
import { fifaRankingProvider, normalizeFifaRanking } from './fifa-ranking'

const noWait = () => new RateLimiter(0)

const BY_COUNTRY = {
  rankings: [{ IdCountry: 'BRA', Rank: 6, IdSchedule: 'id15065' }],
}

const OVERVIEW = {
  rankings: [
    { rankingItem: { rank: 1, countryCode: 'FRA', name: 'France' } },
    { rankingItem: { rank: 6, countryCode: 'BRA', name: 'Brazil' } },
    { rankingItem: { rank: 82, countryCode: 'CUW', name: 'Curacao' } },
    { rankingItem: { rank: null, countryCode: 'XXX', name: 'Unranked' } },
    { rankingItem: { rank: 12, countryCode: null, name: 'Codeless' } },
    {},
  ],
}

function jsonFetch(routes: Record<string, unknown>): typeof fetch {
  return (async (url: string) => {
    const path = new URL(url).pathname + new URL(url).search
    if (!(path in routes)) return new Response('not found', { status: 404 })
    return new Response(JSON.stringify(routes[path]), { status: 200 })
  }) as unknown as typeof fetch
}

function provider(routes: Record<string, unknown>) {
  return fifaRankingProvider({ fetchImpl: jsonFetch(routes), rateLimiter: noWait() })
}

const BY_COUNTRY_PATH = '/api/rankings/by-country?gender=male&countryCode=BRA&footballType=football&locale=en'
const OVERVIEW_PATH = '/api/ranking-overview?locale=en&dateId=id15065'

describe('normalizeFifaRanking', () => {
  it('maps countryCode to rank and skips entries missing either', () => {
    const ranks = normalizeFifaRanking(OVERVIEW)
    expect(ranks.get('FRA')).toBe(1)
    expect(ranks.get('BRA')).toBe(6)
    expect(ranks.get('CUW')).toBe(82)
    expect(ranks.size).toBe(3)
  })

  it('handles an absent rankings array', () => {
    expect(normalizeFifaRanking({}).size).toBe(0)
  })
})

describe('fifaRankingProvider', () => {
  it('resolves the latest schedule id from by-country, then fetches the table', async () => {
    const p = provider({ [BY_COUNTRY_PATH]: BY_COUNTRY, [OVERVIEW_PATH]: OVERVIEW })
    const { scheduleId, ranks } = await p.getLatestRanks()
    expect(scheduleId).toBe('id15065')
    expect(ranks.get('FRA')).toBe(1)
  })

  it('supports a custom probe country', async () => {
    const p = fifaRankingProvider({
      fetchImpl: jsonFetch({
        '/api/rankings/by-country?gender=male&countryCode=ARG&footballType=football&locale=en': {
          rankings: [{ IdCountry: 'ARG', Rank: 3, IdSchedule: 'id15065' }],
        },
      }),
      rateLimiter: noWait(),
      probeCountryCode: 'ARG',
    })
    expect(await p.getLatestScheduleId()).toBe('id15065')
  })

  it('throws on a non-ok response', async () => {
    const p = provider({})
    await expect(p.getLatestScheduleId()).rejects.toBeInstanceOf(ProviderUpstreamError)
  })

  it('throws when by-country answers without an IdSchedule', async () => {
    const p = provider({ [BY_COUNTRY_PATH]: { rankings: [] } })
    await expect(p.getLatestScheduleId()).rejects.toBeInstanceOf(ProviderUpstreamError)
  })

  it('throws when the ranking table comes back empty (FIFA does this for stale ids)', async () => {
    const p = provider({ [BY_COUNTRY_PATH]: BY_COUNTRY, [OVERVIEW_PATH]: { rankings: [] } })
    await expect(p.getLatestRanks()).rejects.toBeInstanceOf(ProviderUpstreamError)
  })
})
