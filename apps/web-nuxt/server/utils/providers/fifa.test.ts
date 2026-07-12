import { describe, it, expect, vi } from 'vitest'
import {
  assignGroupMatchdays,
  fifaProvider,
  gamedayStoryUrl,
  mapFifaStage,
  mapFifaStatus,
  mergeGamedayStories,
  normalizeFifaMatch,
  normalizeFifaPlayerStats,
  parseGamedayActors,
  parseFifaGroup,
  pickFifaSeason,
  resolveFifaSeasonId,
  type FifaMatch,
  type GamedayStoriesResponse,
} from './fifa'
import { RateLimiter } from './rate-limiter'
import { ProviderRateLimitError, ProviderUpstreamError } from './types'
import { cycleGet } from './cycle-tls'

vi.mock('./cycle-tls', () => ({ CHROME_JA3: 'ja3', CHROME_UA: 'ua', cycleGet: vi.fn() }))

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
    expect(mapFifaStatus(4)).toBe('CANCELLED')
    expect(mapFifaStatus(7)).toBe('POSTPONED')
    expect(mapFifaStatus(8)).toBe('CANCELLED')
    expect(mapFifaStatus(11)).toBe('INTERRUPTED')
    expect(mapFifaStatus(12)).toBe('SCHEDULED')
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

  it('keeps just-finished matches in the live feed so the final whistle lands', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-11T20:30:00Z'))
    try {
      const payload = {
        Results: [
          groupMatch({ IdMatch: 'live', MatchStatus: 3, Date: '2026-06-11T20:00:00Z' }),
          groupMatch({ IdMatch: 'ft', MatchStatus: 0, Date: '2026-06-11T18:00:00Z' }), // ~2.5h ago
          groupMatch({ IdMatch: 'old', MatchStatus: 0, Date: '2026-06-10T18:00:00Z' }), // > 4h ago
        ],
      }
      const provider = fifaProvider({ seasonId: '285023', fetchImpl: (async () => jsonResponse(payload)) as unknown as typeof fetch, rateLimiter: noWait() })
      const ids = (await provider.getLiveMatches()).map((m) => m.providerMatchId)
      expect(ids).toEqual(expect.arrayContaining(['live', 'ft']))
      expect(ids).not.toContain('old')
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps an interrupted match in the live feed so its resume is caught', async () => {
    const payload = {
      Results: [
        groupMatch({ IdMatch: 'int', MatchStatus: 11, Date: '2026-06-11T20:00:00Z' }),
        groupMatch({ IdMatch: 'sched', MatchStatus: 1, Date: '2026-06-12T18:00:00Z' }),
      ],
    }
    const provider = fifaProvider({ seasonId: '285023', fetchImpl: (async () => jsonResponse(payload)) as unknown as typeof fetch, rateLimiter: noWait() })
    const ids = (await provider.getLiveMatches()).map((m) => m.providerMatchId)
    expect(ids).toContain('int')
    expect(ids).not.toContain('sched')
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
  it('orders multiple upcoming seasons by start date', () => {
    const future = [
      { IdSeason: 'later', Name: [{ Locale: 'en', Description: 'Later' }], StartDate: '2031-01-01T00:00:00Z', EndDate: '2031-02-01T00:00:00Z' },
      { IdSeason: 'sooner', Name: [{ Locale: 'en', Description: 'Sooner' }], StartDate: '2030-01-01T00:00:00Z', EndDate: '2030-02-01T00:00:00Z' },
    ]
    expect(pickFifaSeason(future, null, new Date('2029-01-01'))).toBe('sooner')
  })
  it('ignores a hint that matches no season', () => {
    const seasons = [{ IdSeason: 'x', StartDate: '2026-06-11T00:00:00Z', EndDate: '2026-07-19T00:00:00Z' }]
    expect(pickFifaSeason(seasons, '9999', new Date('2026-06-15'))).toBe('x')
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

function gdActor(name: string, team: string, code: string, stats: Record<string, number>) {
  return {
    key: { _externalSportsPersonId: name },
    name: { eng: name },
    tags: [
      { name: 'urn:gd:tag:story:team:name:eng', value: team },
      { name: 'urn:gd:tag:story:team:abbreviation', value: code },
      ...Object.entries(stats).map(([k, v]) => ({ name: `urn:gd:tag:football:stats:${k}`, value: v })),
    ],
  }
}
const gdStory = (actors: ReturnType<typeof gdActor>[]): GamedayStoriesResponse => ({ items: [{ actors }] })

describe('parseGamedayActors', () => {
  it('reads player, team and stats from actor tags', () => {
    const out = parseGamedayActors(gdStory([gdActor('Bruno', 'Brazil', 'BRA', { assists: 4, goals: 0 })]))
    expect(out).toEqual([{ playerId: 'Bruno', playerName: 'Bruno', teamName: 'Brazil', teamCode: 'BRA', goals: 0, assists: 4 }])
  })

  it('returns nothing for an empty (404-shaped) story', () => {
    expect(parseGamedayActors({ items: [] })).toEqual([])
    expect(parseGamedayActors({})).toEqual([])
  })
})

describe('mergeGamedayStories', () => {
  it('merges goals and assists boards, surfacing a low-goal assister', () => {
    const scorers = gdStory([gdActor('Messi', 'Argentina', 'ARG', { goals: 6, assists: 0 }), gdActor('Mbappe', 'France', 'FRA', { goals: 4, assists: 2 })])
    const assists = gdStory([gdActor('Bruno', 'Brazil', 'BRA', { assists: 4 }), gdActor('Mbappe', 'France', 'FRA', { assists: 2 })])
    const merged = mergeGamedayStories(scorers, assists)
    expect(merged).toContainEqual({ playerName: 'Messi', teamName: 'Argentina', teamCode: 'ARG', goals: 6, assists: 0, penalties: null })
    expect(merged).toContainEqual({ playerName: 'Mbappe', teamName: 'France', teamCode: 'FRA', goals: 4, assists: 2, penalties: null })
    // Bruno is only in the assists story (no goals) yet still appears.
    expect(merged.find((p) => p.playerName === 'Bruno')).toMatchObject({ goals: 0, assists: 4 })
  })
})

describe('gamedayStoryUrl', () => {
  it('encodes the classification external id with group, season and stat', () => {
    const url = gamedayStoryUrl('gcp_attack', '285023', 'assists')
    const decoded = decodeURIComponent(url)
    expect(decoded).toContain('classification:gcp_attack:competitionId:285023:assists:rank_asc:page:1')
    expect(url).toContain('gameday-prod.fifa.mangodev.co.uk')
  })
})

describe('fifaProvider.getPlayerStats', () => {
  const noWait = () => new RateLimiter(0)

  it('returns the gameday rankings for a live edition', async () => {
    const gamedayFetch = async (url: string) => {
      if (url.includes('gameDay/token')) return { token: 'tok' }
      if (url.includes('gcp_top_scorer')) return gdStory([gdActor('Messi', 'Argentina', 'ARG', { goals: 6, assists: 0 })])
      return gdStory([gdActor('Bruno', 'Brazil', 'BRA', { assists: 4 })])
    }
    const provider = fifaProvider({ seasonId: '285023', gamedayFetch, rateLimiter: noWait() })
    const out = await provider.getPlayerStats!({ teamId: '43911' })
    expect(out.map((p) => p.playerName).sort()).toEqual(['Bruno', 'Messi'])
    expect(out.find((p) => p.playerName === 'Bruno')).toMatchObject({ assists: 4, goals: 0 })
  })

  it('falls back to the official aggregate when gameday has no token (finished edition)', async () => {
    const aggregate = {
      AggregatedTeamStats: [{ IdTeam: 't1', TeamName: [{ Locale: 'en-GB', Description: 'France' }], IdCountry: 'FRA' }],
      AggregatedPlayerStats: [
        { IdTeam: 't1', PlayerName: [{ Locale: 'en-GB', Description: 'Mbappe' }], Statistic: [{ Type: 1, Value: 8 }, { Type: 219, Value: 2 }] },
        { IdTeam: 't1', PlayerName: [{ Locale: 'en-GB', Description: 'NoStat' }], Statistic: [{ Type: 1, Value: 0 }, { Type: 219, Value: 0 }] },
      ],
    }
    const fetchImpl = (async () => jsonResponse(aggregate)) as unknown as typeof fetch
    const provider = fifaProvider({ seasonId: '1', gamedayFetch: async () => ({}), fetchImpl, rateLimiter: noWait() })
    const out = await provider.getPlayerStats!({ teamId: 't1' })
    // The 0/0 player is dropped; the scorer carries goals + assists.
    expect(out).toEqual([{ playerName: 'Mbappe', teamName: 'France', teamCode: 'FRA', goals: 8, assists: 2, penalties: null }])
  })

  it('falls back to the aggregate when the gameday fetch throws', async () => {
    const fetchImpl = (async () => jsonResponse({ AggregatedTeamStats: [], AggregatedPlayerStats: [] })) as unknown as typeof fetch
    const provider = fifaProvider({
      seasonId: '1',
      gamedayFetch: async () => {
        throw new Error('gameday down')
      },
      fetchImpl,
      rateLimiter: noWait(),
    })
    expect(await provider.getPlayerStats!({ teamId: 't1' })).toEqual([])
  })

  it('default gameday fetcher reads through the cycletls engine', async () => {
    vi.mocked(cycleGet).mockImplementation((async (url: string) => ({
      data: url.includes('token') ? { token: 'x' } : gdStory([gdActor('Messi', 'Argentina', 'ARG', { goals: 6, assists: 0 })]),
    })) as unknown as typeof cycleGet)
    // No gamedayFetch injected -> exercises defaultGamedayFetch (the cycletls path).
    const provider = fifaProvider({ seasonId: '285023', rateLimiter: noWait() })
    const out = await provider.getPlayerStats!({ teamId: '43911' })
    expect(out.find((p) => p.playerName === 'Messi')).toMatchObject({ goals: 6 })
    expect(vi.mocked(cycleGet)).toHaveBeenCalled()
  })
})

describe('normalizeFifaPlayerStats', () => {
  it('keeps players with a goal or assist and sorts by goals then assists then name', () => {
    const out = normalizeFifaPlayerStats({
      AggregatedTeamStats: [{ IdTeam: 't', TeamName: [{ Locale: 'en', Description: 'Spain' }], IdCountry: 'ESP' }],
      AggregatedPlayerStats: [
        { IdTeam: 't', PlayerName: [{ Locale: 'en', Description: 'Zero' }], Statistic: [{ Type: 1, Value: 0 }, { Type: 219, Value: 0 }] },
        { IdTeam: 't', PlayerName: [{ Locale: 'en', Description: 'Passer' }], Statistic: [{ Type: 219, Value: 3 }] },
        { IdTeam: 'unknown', PlayerName: [{ Locale: 'en', Description: 'Scorer' }], Statistic: [{ Type: 1, Value: 2 }] },
      ],
    })
    expect(out.map((p) => p.playerName)).toEqual(['Scorer', 'Passer'])
    expect(out[0]).toMatchObject({ goals: 2, assists: 0, teamName: '', teamCode: null })
  })
})
