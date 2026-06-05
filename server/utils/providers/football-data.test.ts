import { describe, it, expect, vi } from 'vitest'
import { footballDataProvider, normalizeFdScorer, normalizeFootballDataMatch, type FdMatch } from './football-data'
import { RateLimiter } from './rate-limiter'
import { ProviderRateLimitError, ProviderUpstreamError } from './types'

const finishedGroupMatch: FdMatch = {
  id: 1,
  utcDate: '2026-06-11T16:00:00Z',
  status: 'FINISHED',
  matchday: 1,
  stage: 'GROUP_STAGE',
  group: 'GROUP_A',
  lastUpdated: '2026-06-11T18:00:00Z',
  homeTeam: { id: 10, name: 'Mexico', tla: 'MEX', crest: 'mex.png' },
  awayTeam: { id: 11, name: 'Canada', tla: 'CAN', crest: 'can.png' },
  score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 1 }, halfTime: { home: 1, away: 0 } },
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('normalizeFootballDataMatch', () => {
  it('normalizes a finished group match', () => {
    const m = normalizeFootballDataMatch(finishedGroupMatch)
    expect(m).toMatchObject({
      providerMatchId: '1',
      stage: 'GROUP',
      group: 'A',
      matchday: 1,
      status: 'FINISHED',
      winner: 'HOME',
      kickoffTime: '2026-06-11T16:00:00Z',
    })
    expect(m.homeTeam).toEqual({ name: 'Mexico', code: 'MEX', crest: 'mex.png', providerTeamId: '10' })
    expect(m.score.fullTime).toEqual({ home: 2, away: 1 })
    expect(m.score.halfTime).toEqual({ home: 1, away: 0 })
    expect(m.score.extraTime).toBeUndefined()
    expect(m.score.penalties).toBeUndefined()
  })

  it('handles knockout placeholders with missing teams and null scores', () => {
    const m = normalizeFootballDataMatch({
      id: 2,
      utcDate: '2026-06-28T20:00:00Z',
      status: 'TIMED',
      stage: 'LAST_16',
      homeTeam: null,
      awayTeam: { name: 'Winner Group A' },
      score: { winner: null, fullTime: { home: null, away: null } },
    })
    expect(m.stage).toBe('R16')
    expect(m.group).toBeNull()
    expect(m.matchday).toBeNull()
    expect(m.status).toBe('SCHEDULED')
    expect(m.winner).toBeNull()
    expect(m.homeTeam).toEqual({ name: 'TBD', code: null, crest: null, providerTeamId: null })
    expect(m.awayTeam.name).toBe('Winner Group A')
    expect(m.score.fullTime).toEqual({ home: null, away: null })
  })

  it('includes extra time and penalties when present', () => {
    const m = normalizeFootballDataMatch({
      id: 3,
      utcDate: '2026-07-19T19:00:00Z',
      status: 'FINISHED',
      stage: 'FINAL',
      homeTeam: { id: 1, name: 'A' },
      awayTeam: { id: 2, name: 'B' },
      score: {
        winner: 'AWAY_TEAM',
        fullTime: { home: 1, away: 1 },
        halfTime: { home: 0, away: 0 },
        extraTime: { home: 1, away: 1 },
        penalties: { home: 3, away: 4 },
      },
    })
    expect(m.winner).toBe('AWAY')
    expect(m.score.extraTime).toEqual({ home: 1, away: 1 })
    expect(m.score.penalties).toEqual({ home: 3, away: 4 })
  })

  it('maps an explicit DRAW winner', () => {
    const m = normalizeFootballDataMatch({
      id: 7,
      utcDate: '2026-06-12T16:00:00Z',
      status: 'FINISHED',
      stage: 'GROUP_STAGE',
      group: 'GROUP_C',
      homeTeam: { id: 1, name: 'A' },
      awayTeam: { id: 2, name: 'B' },
      score: { winner: 'DRAW', fullTime: { home: 1, away: 1 }, halfTime: { home: 0, away: 1 } },
    })
    expect(m.winner).toBe('DRAW')
  })

  it('maps a missing score block to nulls', () => {
    const m = normalizeFootballDataMatch({
      id: 4,
      utcDate: '2026-06-12T16:00:00Z',
      status: 'FINISHED',
      stage: 'GROUP_STAGE',
      group: 'GROUP_B',
      homeTeam: { id: 5, name: 'X' },
      awayTeam: { id: 6, name: 'Y' },
    })
    expect(m.winner).toBeNull()
    expect(m.score.fullTime).toEqual({ home: null, away: null })
  })
})

describe('footballDataProvider', () => {
  const noWait = () => new RateLimiter(0)

  it('lists fixtures with the season query and auth header', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return jsonResponse({ matches: [finishedGroupMatch] })
    }) as unknown as typeof fetch

    const provider = footballDataProvider({ token: 'tok', fetchImpl, rateLimiter: noWait() })
    const fixtures = await provider.listFixtures({ season: '2026' })

    expect(fixtures).toHaveLength(1)
    expect(fixtures[0].providerMatchId).toBe('1')
    expect(calls[0].url).toContain('/competitions/WC/matches?season=2026')
    expect((calls[0].init?.headers as Record<string, string>)['X-Auth-Token']).toBe('tok')
    expect(provider.meta).toEqual({ name: 'football-data', rateLimitPerMin: 10, dailyCap: null })
  })

  it('fetches matches by date', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('?dateFrom=2026-06-11&dateTo=2026-06-11')
      return jsonResponse({ matches: [] })
    }) as unknown as typeof fetch
    const provider = footballDataProvider({ token: 't', fetchImpl, rateLimiter: noWait() })
    expect(await provider.getMatchesByDate('2026-06-11')).toEqual([])
  })

  it('fetches live matches', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('?status=IN_PLAY,PAUSED')
      return jsonResponse({ matches: [finishedGroupMatch] })
    }) as unknown as typeof fetch
    const provider = footballDataProvider({ token: 't', fetchImpl, rateLimiter: noWait() })
    expect(await provider.getLiveMatches()).toHaveLength(1)
  })

  it('returns an empty array when the payload has no matches', async () => {
    const fetchImpl = (async () => jsonResponse({})) as unknown as typeof fetch
    const provider = footballDataProvider({ token: 't', fetchImpl, rateLimiter: noWait() })
    expect(await provider.listFixtures({ season: '2026' })).toEqual([])
  })

  it('throws ProviderRateLimitError on HTTP 429', async () => {
    const fetchImpl = (async () => new Response('', { status: 429 })) as unknown as typeof fetch
    const provider = footballDataProvider({ token: 't', fetchImpl, rateLimiter: noWait() })
    await expect(provider.getLiveMatches()).rejects.toBeInstanceOf(ProviderRateLimitError)
  })

  it('throws ProviderUpstreamError on other HTTP errors', async () => {
    const fetchImpl = (async () => new Response('boom', { status: 500 })) as unknown as typeof fetch
    const provider = footballDataProvider({ token: 't', fetchImpl, rateLimiter: noWait() })
    await expect(provider.listFixtures({ season: '2026' })).rejects.toMatchObject({
      name: 'ProviderUpstreamError',
      status: 500,
    })
  })

  it('uses a default rate limiter when none is supplied', async () => {
    const fetchImpl = (async () => jsonResponse({ matches: [] })) as unknown as typeof fetch
    const provider = footballDataProvider({ token: 't', fetchImpl })
    expect(await provider.listFixtures({ season: '2026' })).toEqual([])
  })

  it('returns normalized top scorers', async () => {
    const payload = { scorers: [{ player: { name: 'Harry Kane' }, team: { name: 'England', tla: 'ENG' }, goals: 8, assists: 3, penalties: 2 }] }
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('/competitions/WC/scorers?season=2026')
      return jsonResponse(payload)
    }) as unknown as typeof fetch
    const provider = footballDataProvider({ token: 't', fetchImpl, rateLimiter: noWait() })
    const scorers = await provider.getTopScorers!({ season: '2026' })
    expect(scorers[0]).toEqual({ playerName: 'Harry Kane', teamName: 'England', teamCode: 'ENG', goals: 8, assists: 3, penalties: 2 })
  })

  it('throws on a scorers upstream error', async () => {
    const provider = footballDataProvider({ token: 't', fetchImpl: (async () => new Response('boom', { status: 500 })) as unknown as typeof fetch, rateLimiter: noWait() })
    await expect(provider.getTopScorers!({ season: '2026' })).rejects.toBeInstanceOf(ProviderUpstreamError)
  })
})

describe('normalizeFdScorer', () => {
  it('falls back gracefully on missing fields', () => {
    expect(normalizeFdScorer({})).toEqual({ playerName: 'Unknown', teamName: '', teamCode: null, goals: 0, assists: null, penalties: null })
  })
})
