import { describe, it, expect, vi } from 'vitest'
import {
  assignGroupMatchdays,
  fifaProvider,
  mapFifaStage,
  mapFifaStatus,
  normalizeFifaMatch,
  parseFifaGroup,
  pickFifaSeason,
  resolveFifaSeasonId,
  type FifaMatch,
} from './fifa'
import { RateLimiter } from './rate-limiter'
import { ProviderRateLimitError, ProviderUpstreamError } from './types'

function groupMatch(over: Partial<FifaMatch> = {}): FifaMatch {
  return {
    IdMatch: '400021443',
    IdStage: 's',
    IdGroup: 'g',
    StageName: [{ Locale: 'en-GB', Description: 'First Stage' }],
    GroupName: [{ Locale: 'en-GB', Description: 'Group A' }],
    Date: '2026-06-11T19:00:00Z',
    Home: {
      IdTeam: '43911',
      Score: null,
      TeamName: [{ Locale: 'en-GB', Description: 'Mexico' }],
      Abbreviation: 'MEX',
      IdCountry: 'MEX',
      PictureUrl: 'https://api.fifa.com/api/v3/picture/flags-{format}-{size}/MEX',
    },
    Away: {
      IdTeam: '43883',
      Score: null,
      TeamName: [{ Locale: 'en-GB', Description: 'South Africa' }],
      Abbreviation: 'RSA',
      IdCountry: 'RSA',
      PictureUrl: null,
    },
    HomeTeamScore: null,
    AwayTeamScore: null,
    HomeTeamPenaltyScore: null,
    AwayTeamPenaltyScore: null,
    Winner: null,
    MatchStatus: 1,
    PlaceHolderA: 'A1',
    PlaceHolderB: 'A2',
    ...over,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('mapFifaStatus', () => {
  it('maps known codes and defaults to SCHEDULED', () => {
    expect(mapFifaStatus(0)).toBe('FINISHED')
    expect(mapFifaStatus(1)).toBe('SCHEDULED')
    expect(mapFifaStatus(3)).toBe('LIVE')
    expect(mapFifaStatus(99)).toBe('SCHEDULED')
  })
})

describe('mapFifaStage', () => {
  it.each([
    ['First Stage', 'GROUP'],
    ['Round of 32', 'R32'],
    ['Round of 16', 'R16'],
    ['Quarter-final', 'QF'],
    ['Semi-final', 'SF'],
    ['Play-off for third place', 'THIRD_PLACE'],
    ['Final', 'FINAL'],
    ['Mystery Stage', 'GROUP'],
  ])('maps %s -> %s', (name, stage) => {
    expect(mapFifaStage(name)).toBe(stage)
  })
})

describe('parseFifaGroup', () => {
  it('extracts the group letter or null', () => {
    expect(parseFifaGroup('Group A')).toBe('A')
    expect(parseFifaGroup('Group L')).toBe('L')
    expect(parseFifaGroup(undefined)).toBeNull()
    expect(parseFifaGroup('Knockout')).toBeNull()
  })
})

describe('normalizeFifaMatch', () => {
  it('normalizes an upcoming group match and expands the crest template', () => {
    const m = normalizeFifaMatch(groupMatch())
    expect(m).toMatchObject({
      providerMatchId: '400021443',
      stage: 'GROUP',
      group: 'A',
      matchday: null,
      status: 'SCHEDULED',
      winner: null,
      kickoffTime: '2026-06-11T19:00:00Z',
    })
    expect(m.homeTeam).toEqual({
      name: 'Mexico',
      code: 'MEX',
      crest: 'https://api.fifa.com/api/v3/picture/flags-sq-4/MEX',
      providerTeamId: '43911',
    })
    expect(m.awayTeam.crest).toBeNull()
    expect(m.score.fullTime).toEqual({ home: null, away: null })
    expect(m.score.penalties).toBeUndefined()
  })

  it('normalizes a finished penalty match with the winner taken from the team id', () => {
    const m = normalizeFifaMatch(
      groupMatch({
        StageName: [{ Locale: 'en', Description: 'Final' }],
        GroupName: undefined,
        MatchStatus: 0,
        HomeTeamScore: 3,
        AwayTeamScore: 3,
        HomeTeamPenaltyScore: 4,
        AwayTeamPenaltyScore: 2,
        Winner: '43911',
      }),
    )
    expect(m.stage).toBe('FINAL')
    expect(m.group).toBeNull()
    expect(m.status).toBe('FINISHED')
    expect(m.score.fullTime).toEqual({ home: 3, away: 3 })
    expect(m.score.penalties).toEqual({ home: 4, away: 2 })
    expect(m.winner).toBe('HOME')
  })

  it('records penalties when only one side is present (defensive)', () => {
    const m = normalizeFifaMatch(groupMatch({ HomeTeamPenaltyScore: null, AwayTeamPenaltyScore: 3 }))
    expect(m.score.penalties).toEqual({ home: null, away: 3 })
  })

  it('detects away winners, draws, and undecided results', () => {
    expect(normalizeFifaMatch(groupMatch({ MatchStatus: 0, HomeTeamScore: 0, AwayTeamScore: 2, Winner: '43883' })).winner).toBe('AWAY')
    expect(normalizeFifaMatch(groupMatch({ MatchStatus: 0, HomeTeamScore: 1, AwayTeamScore: 1, Winner: null })).winner).toBe('DRAW')
    expect(normalizeFifaMatch(groupMatch({ MatchStatus: 0, HomeTeamScore: 1, AwayTeamScore: 0, Winner: null })).winner).toBeNull()
  })

  it('falls back to placeholders for unresolved knockout teams', () => {
    const m = normalizeFifaMatch(
      groupMatch({
        StageName: [{ Locale: 'en', Description: 'Round of 32' }],
        GroupName: undefined,
        Home: null,
        Away: null,
        PlaceHolderA: '2A',
        PlaceHolderB: '2B',
      }),
    )
    expect(m.stage).toBe('R32')
    expect(m.homeTeam.name).toBe('2A')
    expect(m.awayTeam).toEqual({ name: '2B', code: null, crest: null, providerTeamId: null })
  })

  it('uses the country code fallback and TBD when nothing else is available', () => {
    const withCountry = normalizeFifaMatch(
      groupMatch({
        Home: { IdTeam: '1', Score: null, TeamName: [{ Locale: 'en', Description: 'Brazil' }], Abbreviation: null, IdCountry: 'BRA', PictureUrl: null },
      }),
    )
    expect(withCountry.homeTeam.code).toBe('BRA')
    expect(normalizeFifaMatch(groupMatch({ Home: null, PlaceHolderA: null })).homeTeam.name).toBe('TBD')
    expect(normalizeFifaMatch(groupMatch({ StageName: undefined })).stage).toBe('GROUP')
  })
})

describe('assignGroupMatchdays', () => {
  it('assigns matchdays by date within each group and leaves knockouts untouched', () => {
    const dates = ['2026-06-25', '2026-06-11', '2026-06-19', '2026-06-12', '2026-06-18', '2026-06-25']
    const matches = dates.map((d, i) => normalizeFifaMatch(groupMatch({ IdMatch: `g${i}`, Date: `${d}T18:00:00Z` })))
    const ko = normalizeFifaMatch(groupMatch({ IdMatch: 'ko', StageName: [{ Locale: 'en', Description: 'Final' }], GroupName: undefined }))

    assignGroupMatchdays([...matches, ko])

    const matchdayById = Object.fromEntries(matches.map((m) => [m.providerMatchId, m.matchday]))
    expect(matchdayById.g1).toBe(1) // 06-11
    expect(matchdayById.g3).toBe(1) // 06-12
    expect(matchdayById.g4).toBe(2) // 06-18
    expect(matchdayById.g2).toBe(2) // 06-19
    expect(matchdayById.g0).toBe(3) // 06-25
    expect(ko.matchday).toBeNull()
  })

  it('ignores group matches without a group letter', () => {
    const m = normalizeFifaMatch(groupMatch({ GroupName: undefined }))
    assignGroupMatchdays([m])
    expect(m.matchday).toBeNull()
  })
})

describe('fifaProvider', () => {
  const noWait = () => new RateLimiter(0)

  it('lists fixtures with the season id and derives matchdays', async () => {
    const payload = {
      Results: [groupMatch({ IdMatch: 'a', Date: '2026-06-11T18:00:00Z' }), groupMatch({ IdMatch: 'b', Date: '2026-06-12T18:00:00Z' })],
    }
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('idSeason=285023')
      return jsonResponse(payload)
    }) as unknown as typeof fetch

    const provider = fifaProvider({ seasonId: '285023', fetchImpl, rateLimiter: noWait() })
    const fixtures = await provider.listFixtures({ season: '2026' })
    expect(fixtures.map((f) => f.matchday)).toEqual([1, 1])
    expect(provider.meta).toEqual({ name: 'fifa', rateLimitPerMin: 60, dailyCap: null })
  })

  it('filters live matches and by date', async () => {
    const payload = {
      Results: [
        groupMatch({ IdMatch: 'live', MatchStatus: 3, Date: '2026-06-11T18:00:00Z' }),
        groupMatch({ IdMatch: 'sched', MatchStatus: 1, Date: '2026-06-12T18:00:00Z' }),
      ],
    }
    const fetchImpl = (async () => jsonResponse(payload)) as unknown as typeof fetch
    const provider = fifaProvider({ seasonId: '285023', fetchImpl, rateLimiter: noWait() })
    expect((await provider.getLiveMatches()).map((m) => m.providerMatchId)).toEqual(['live'])
    expect((await provider.getMatchesByDate('2026-06-12')).map((m) => m.providerMatchId)).toEqual(['sched'])
  })

  it('handles empty payloads and upstream errors', async () => {
    const rate = fifaProvider({ seasonId: '1', fetchImpl: (async () => new Response('', { status: 429 })) as unknown as typeof fetch, rateLimiter: noWait() })
    await expect(rate.listFixtures({ season: '2026' })).rejects.toBeInstanceOf(ProviderRateLimitError)

    const upstream = fifaProvider({ seasonId: '1', fetchImpl: (async () => new Response('boom', { status: 500 })) as unknown as typeof fetch, rateLimiter: noWait() })
    await expect(upstream.getLiveMatches()).rejects.toBeInstanceOf(ProviderUpstreamError)

    const empty = fifaProvider({ seasonId: '1', fetchImpl: (async () => jsonResponse({})) as unknown as typeof fetch, rateLimiter: noWait() })
    expect(await empty.listFixtures({ season: '2026' })).toEqual([])
  })

  it('uses a default rate limiter when none is supplied', async () => {
    const provider = fifaProvider({ seasonId: '1', fetchImpl: (async () => jsonResponse({ Results: [] })) as unknown as typeof fetch })
    expect(await provider.getMatchesByDate('2026-06-11')).toEqual([])
  })
})

const SEASONS = [
  { IdSeason: '285023', Name: [{ Locale: 'en', Description: 'FIFA World Cup 2026' }], StartDate: '2026-06-11T00:00:00Z', EndDate: '2026-07-19T00:00:00Z' },
  { IdSeason: '255711', Name: [{ Locale: 'en', Description: 'FIFA World Cup Qatar 2022' }], StartDate: '2022-11-20T00:00:00Z', EndDate: '2022-12-18T00:00:00Z' },
]

describe('pickFifaSeason', () => {
  it('matches by name hint', () => {
    expect(pickFifaSeason(SEASONS, '2026', new Date('2020-01-01'))).toBe('285023')
  })
  it('picks the currently running season', () => {
    expect(pickFifaSeason(SEASONS, null, new Date('2026-06-15'))).toBe('285023')
  })
  it('picks the next upcoming season', () => {
    expect(pickFifaSeason(SEASONS, null, new Date('2024-01-01'))).toBe('285023')
  })
  it('falls back to the latest by start date', () => {
    expect(pickFifaSeason(SEASONS, null, new Date('2030-01-01'))).toBe('285023')
  })
  it('throws when there are no seasons', () => {
    expect(() => pickFifaSeason([], null, new Date('2026-01-01'))).toThrow(/no FIFA season/)
  })
})

describe('resolveFifaSeasonId', () => {
  it('fetches /seasons and picks by hint', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('idCompetition=17')
      return jsonResponse({ Results: SEASONS })
    }) as unknown as typeof fetch
    expect(await resolveFifaSeasonId({ competitionId: '17', hint: '2026', fetchImpl, now: new Date('2020-01-01') })).toBe('285023')
  })

  it('throws on an upstream error', async () => {
    const fetchImpl = (async () => new Response('boom', { status: 500 })) as unknown as typeof fetch
    await expect(resolveFifaSeasonId({ competitionId: '17', fetchImpl })).rejects.toBeInstanceOf(ProviderUpstreamError)
  })
})
