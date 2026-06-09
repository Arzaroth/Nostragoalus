import { describe, it, expect } from 'vitest'
import { RateLimiter } from '../../providers/rate-limiter'
import { ProviderRateLimitError, ProviderUpstreamError } from '../../providers/types'
import { sofascoreProvider } from './sofascore'

const noWait = () => new RateLimiter(0)

const SEASONS = { seasons: [{ id: 58210, year: '2026' }, { id: 41087, year: '2022' }] }

function sofaEvent(id: number, home: string, away: string, ts: number, type = 'notstarted') {
  return { id, startTimestamp: ts, status: { type }, homeTeam: { name: home }, awayTeam: { name: away } }
}

function jsonFetch(routes: Record<string, unknown>): typeof fetch {
  return (async (url: string) => {
    const path = url.replace('https://api.sofascore.com/api/v1', '')
    if (!(path in routes)) return new Response('not found', { status: 404 })
    return new Response(JSON.stringify(routes[path]), { status: 200 })
  }) as unknown as typeof fetch
}

function provider(routes: Record<string, unknown>) {
  return sofascoreProvider({ fetchImpl: jsonFetch(routes), rateLimiter: noWait() })
}

describe('sofascore listEvents', () => {
  it('resolves the season by hint and pages until hasNextPage is false', async () => {
    const p = provider({
      '/unique-tournament/16/seasons': SEASONS,
      '/unique-tournament/16/season/41087/events/last/0': {
        events: [sofaEvent(1, 'Iran', 'USA', 1669748400, 'finished')],
        hasNextPage: true,
      },
      '/unique-tournament/16/season/41087/events/last/1': {
        events: [sofaEvent(2, 'Wales', 'England', 1669748400, 'finished')],
        hasNextPage: false,
      },
    })
    const events = await p.listEvents({ providerRef: '16', seasonHint: '2022', scope: 'finished' })
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({
      ref: '1',
      homeName: 'Iran',
      awayName: 'USA',
      finished: true,
      kickoff: new Date(1669748400 * 1000),
    })
  })

  it('falls back to the newest season without a hint match and uses next/ for upcoming', async () => {
    const p = provider({
      '/unique-tournament/16/seasons': SEASONS,
      '/unique-tournament/16/season/58210/events/next/0': {
        events: [sofaEvent(3, 'France', 'Brazil', 1781546400)],
        hasNextPage: false,
      },
    })
    const events = await p.listEvents({ providerRef: '16', seasonHint: '1990', scope: 'upcoming' })
    expect(events).toHaveLength(1)
    expect(events[0].finished).toBe(false)
  })

  it('skips events missing teams or a kickoff and tolerates 404 pages', async () => {
    const p = provider({
      '/unique-tournament/16/seasons': SEASONS,
      '/unique-tournament/16/season/58210/events/next/0': {
        events: [
          { id: 4, startTimestamp: null, homeTeam: { name: 'A' }, awayTeam: { name: 'B' } },
          { id: 5, startTimestamp: 1, homeTeam: null, awayTeam: { name: 'B' } },
        ],
        hasNextPage: true,
      },
      // page 1 missing -> 404 -> stop paging
    })
    expect(await p.listEvents({ providerRef: '16', seasonHint: null, scope: 'upcoming' })).toEqual([])
  })

  it('returns no events when the seasons list is empty or missing', async () => {
    const empty = provider({ '/unique-tournament/9/seasons': { seasons: [] } })
    expect(await empty.listEvents({ providerRef: '9', seasonHint: null, scope: 'upcoming' })).toEqual([])
    const missing = provider({})
    expect(await missing.listEvents({ providerRef: '9', seasonHint: null, scope: 'upcoming' })).toEqual([])
  })
})

describe('sofascore getEventOdds', () => {
  const choices = [
    { name: '1', fractionalValue: '5/2', initialFractionalValue: '2/1' },
    { name: 'X', fractionalValue: '12/5', initialFractionalValue: '12/5' },
    { name: '2', fractionalValue: '9/10', initialFractionalValue: '11/10' },
  ]

  it('parses the full-time market into decimal triples', async () => {
    const p = provider({
      '/event/7/odds/1/all': { markets: [{ marketId: 2, choices: [] }, { marketId: 1, choices }] },
    })
    expect(await p.getEventOdds('7')).toEqual({
      current: { home: 3.5, draw: 3.4, away: 1.9 },
      initial: { home: 3, draw: 3.4, away: 2.1 },
      bookmakers: null,
    })
  })

  it('returns a null initial triple when opening prices are incomplete', async () => {
    const partial = choices.map((c) => (c.name === 'X' ? { ...c, initialFractionalValue: null } : c))
    const p = provider({ '/event/7/odds/1/all': { markets: [{ marketId: 1, choices: partial }] } })
    expect((await p.getEventOdds('7'))?.initial).toBeNull()
  })

  it('returns null without a usable full-time market', async () => {
    const noMarket = provider({ '/event/7/odds/1/all': { markets: [{ marketId: 2, choices }] } })
    expect(await noMarket.getEventOdds('7')).toBeNull()
    const incomplete = provider({
      '/event/7/odds/1/all': { markets: [{ marketId: 1, choices: choices.slice(0, 2) }] },
    })
    expect(await incomplete.getEventOdds('7')).toBeNull()
    const gone = provider({})
    expect(await gone.getEventOdds('7')).toBeNull()
  })
})

describe('sofascore error mapping', () => {
  it('maps 403/429 to rate-limit errors and other failures upstream', async () => {
    const status = (code: number) =>
      sofascoreProvider({
        rateLimiter: noWait(),
        fetchImpl: (async () => new Response('blocked', { status: code })) as unknown as typeof fetch,
      })
    await expect(status(403).getEventOdds('7')).rejects.toBeInstanceOf(ProviderRateLimitError)
    await expect(status(429).getEventOdds('7')).rejects.toBeInstanceOf(ProviderRateLimitError)
    await expect(status(500).getEventOdds('7')).rejects.toBeInstanceOf(ProviderUpstreamError)
  })
})
