import { describe, it, expect } from 'vitest'
import {
  fifaProvider,
  normalizeFifaBracket,
  normalizeFifaMatch,
  normalizeFifaMatchDetail,
  normalizeFifaPlayerStats,
  type FifaMatch,
} from './fifa'
import { RateLimiter } from './rate-limiter'

describe('normalizeFifaMatch providerStageId', () => {
  it('captures IdStage for later detail lookups', () => {
    const m = normalizeFifaMatch({
      IdMatch: '1',
      IdStage: 'st1',
      IdGroup: null,
      Date: '2026-06-11T16:00:00Z',
      Home: null,
      Away: null,
      HomeTeamScore: null,
      AwayTeamScore: null,
      HomeTeamPenaltyScore: null,
      AwayTeamPenaltyScore: null,
      Winner: null,
      MatchStatus: 1,
    } as FifaMatch)
    expect(m.providerStageId).toBe('st1')
  })
})

describe('normalizeFifaMatchDetail', () => {
  const detail = {
    BallPossession: { OverallHome: 47.1, OverallAway: 52.9 },
    HomeTeam: {
      IdTeam: 'H',
      TeamName: [{ Locale: 'en', Description: 'Qatar' }],
      Abbreviation: 'QAT',
      Players: [{ IdPlayer: 'h1', PlayerName: [{ Locale: 'en', Description: 'HOME GUY' }] }],
      Goals: [],
    },
    AwayTeam: {
      IdTeam: 'A',
      TeamName: [{ Locale: 'en', Description: 'Ecuador' }],
      Abbreviation: 'ECU',
      Players: [
        { IdPlayer: 'a1', PlayerName: [{ Locale: 'en', Description: 'E. VALENCIA' }] },
        { IdPlayer: 'a2', PlayerName: [{ Locale: 'en', Description: 'ASSIST GUY' }] },
      ],
      Goals: [
        { Type: 1, Period: 3, IdPlayer: 'a1', Minute: "16'", IdAssistPlayer: 'a2', IdTeam: 'A' },
        { Type: 1, Period: 5, IdPlayer: 'a1', Minute: "31'", IdAssistPlayer: null, IdTeam: 'A' },
        { Type: 1, Period: 11, IdPlayer: 'a1', Minute: "121'", IdAssistPlayer: null, IdTeam: 'A' },
      ],
    },
  }

  it('maps goals with scorer/assist names and possession, excluding shootout goals', () => {
    const d = normalizeFifaMatchDetail(detail)
    expect(d.possessionHome).toBeCloseTo(47.1)
    expect(d.goals).toHaveLength(2) // the Period 11 (shootout) goal is dropped
    expect(d.goals[0]).toMatchObject({
      side: 'AWAY',
      playerName: 'E. VALENCIA',
      teamCode: 'ECU',
      minute: "16'",
      ownGoal: false,
      assistPlayerName: null,
    })
    expect(d.goals[1].assistPlayerName).toBeNull()
  })

  it('flags an own goal when the scorer is on the opposing roster', () => {
    const og = {
      HomeTeam: {
        IdTeam: 'H',
        Players: [{ IdPlayer: 'h1', PlayerName: [{ Locale: 'en', Description: 'HOME D' }] }],
        Goals: [{ Type: 1, IdPlayer: 'a1', Minute: "10'", IdTeam: 'H' }],
      },
      AwayTeam: {
        IdTeam: 'A',
        Players: [{ IdPlayer: 'a1', PlayerName: [{ Locale: 'en', Description: 'AWAY GUY' }] }],
        Goals: [],
      },
    }
    const d = normalizeFifaMatchDetail(og)
    expect(d.goals[0].ownGoal).toBe(true)
  })

  it('handles missing teams and possession', () => {
    expect(normalizeFifaMatchDetail({})).toEqual({ possessionHome: null, possessionAway: null, goals: [] })
  })
})

describe('fifaProvider.getMatchDetail', () => {
  const noWait = () => new RateLimiter(0)

  it('fetches and normalizes a match detail', async () => {
    const payload = {
      BallPossession: { OverallHome: 50, OverallAway: 50 },
      HomeTeam: { IdTeam: 'H', Players: [], Goals: [] },
      AwayTeam: { IdTeam: 'A', Players: [], Goals: [] },
    }
    const fetchImpl = (async () => new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch
    const provider = fifaProvider({ seasonId: '255711', competitionId: '17', fetchImpl, rateLimiter: noWait() })
    expect(await provider.getMatchDetail!({ stageId: 'st1', matchId: 'm1' })).toEqual({
      possessionHome: 50,
      possessionAway: 50,
      goals: [],
    })
  })

  it('throws on an upstream error', async () => {
    const provider = fifaProvider({
      seasonId: '1',
      competitionId: '17',
      fetchImpl: (async () => new Response('x', { status: 500 })) as unknown as typeof fetch,
      rateLimiter: noWait(),
    })
    await expect(provider.getMatchDetail!({ stageId: 's', matchId: 'm' })).rejects.toThrow()
  })

  it('throws when rate limited', async () => {
    const provider = fifaProvider({
      seasonId: '1',
      competitionId: '17',
      fetchImpl: (async () => new Response('', { status: 429 })) as unknown as typeof fetch,
      rateLimiter: noWait(),
    })
    await expect(provider.getMatchDetail!({ stageId: 's', matchId: 'm' })).rejects.toThrow()
  })
})

describe('normalizeFifaBracket', () => {
  const data = {
    Winner: { TeamName: [{ Locale: 'en', Description: 'Argentina' }], Abbreviation: 'ARG' },
    KnockoutStages: [
      {
        SequenceOrder: 6,
        Name: [{ Locale: 'en', Description: 'Final' }],
        Matches: [
          {
            HomeTeam: { IdTeam: 'arg', TeamName: [{ Locale: 'en', Description: 'Argentina' }], Abbreviation: 'ARG' },
            AwayTeam: { IdTeam: 'fra', TeamName: [{ Locale: 'en', Description: 'France' }], Abbreviation: 'FRA' },
            HomeTeamScore: 3,
            AwayTeamScore: 3,
            HomeTeamPenaltyScore: 4,
            AwayTeamPenaltyScore: 2,
            Winner: 'arg',
            IdMatch: 'mFinal',
            MatchStatus: 0,
            Date: '2022-12-18T15:00:00Z',
          },
        ],
      },
      {
        SequenceOrder: 2,
        Name: [{ Locale: 'en', Description: 'Round of 16' }],
        Matches: [{ IdMatch: 'mR16', PlaceHolderA: '1A', PlaceHolderB: '2B', MatchStatus: 1, Date: '2022-12-03T15:00:00Z' }],
      },
      {
        SequenceOrder: 4,
        Name: [{ Locale: 'en', Description: 'Semi-final' }],
        Matches: [
          {
            HomeTeam: { IdTeam: 'h', TeamName: [{ Locale: 'en', Description: 'H' }], Abbreviation: 'H' },
            AwayTeam: { IdTeam: 'a', TeamName: [{ Locale: 'en', Description: 'A' }], Abbreviation: 'A' },
            HomeTeamScore: 0,
            AwayTeamScore: 1,
            Winner: 'a',
            IdMatch: 'mSF1',
            MatchStatus: 0,
            Date: '2022-12-13T19:00:00Z',
          },
          { IdMatch: 'mSF2', Winner: 'zzz', MatchStatus: 0, Date: '2022-12-14T19:00:00Z' },
        ],
      },
    ],
  }

  it('sorts rounds by sequence, resolves placeholders, maps winner/scores/pens', () => {
    const b = normalizeFifaBracket(data)
    expect(b.winner).toEqual({ name: 'Argentina', code: 'ARG' })
    expect(b.rounds.map((r) => r.sequence)).toEqual([2, 4, 6])
    const r16 = b.rounds.find((r) => r.name === 'Round of 16')!
    const sf = b.rounds.find((r) => r.name === 'Semi-final')!
    const final = b.rounds.find((r) => r.name === 'Final')!
    expect(r16.matches[0]).toMatchObject({ homeTeam: '1A', awayTeam: '2B', winner: null, status: 'SCHEDULED' })
    expect(final.matches[0]).toMatchObject({ homeTeam: 'Argentina', winner: 'HOME', homePens: 4, awayPens: 2, status: 'FINISHED', providerMatchId: 'mFinal' })
    expect(sf.matches[0]).toMatchObject({ winner: 'AWAY' })
    expect(sf.matches[1]).toMatchObject({ homeTeam: 'TBD', awayTeam: 'TBD', winner: null })
  })

  it('handles an empty bracket', () => {
    expect(normalizeFifaBracket({})).toEqual({ winner: null, rounds: [] })
  })
})

describe('fifaProvider.getBracket', () => {
  it('fetches and normalizes the bracket', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ KnockoutStages: [], Winner: null }), { status: 200 })) as unknown as typeof fetch
    const provider = fifaProvider({ seasonId: '255711', competitionId: '17', fetchImpl, rateLimiter: new RateLimiter(0) })
    expect(await provider.getBracket!()).toEqual({ winner: null, rounds: [] })
  })

  it('throws on an upstream error', async () => {
    const provider = fifaProvider({
      seasonId: '1',
      competitionId: '17',
      fetchImpl: (async () => new Response('x', { status: 500 })) as unknown as typeof fetch,
      rateLimiter: new RateLimiter(0),
    })
    await expect(provider.getBracket!()).rejects.toThrow()
  })
})

describe('normalizeFifaPlayerStats', () => {
  const data = {
    AggregatedTeamStats: [
      { IdTeam: 'fra', TeamName: [{ Locale: 'en', Description: 'France' }], IdCountry: 'FRA' },
      { IdTeam: 'esp' },
      {},
    ],
    AggregatedPlayerStats: [
      { IdTeam: 'fra', IdPlayer: 'mbappe', PlayerName: [{ Locale: 'en', Description: 'MBAPPE' }], Statistic: [{ Type: 1, Value: 8 }, { Type: 219, Value: 2 }] },
      { IdTeam: 'fra', IdPlayer: 'griezmann', PlayerName: [{ Locale: 'en', Description: 'GRIEZMANN' }], Statistic: [{ Type: 1, Value: 0 }, { Type: 219, Value: 3 }] },
      { IdTeam: 'esp', IdPlayer: 'morata', PlayerName: [{ Locale: 'en', Description: 'MORATA' }], Statistic: [{ Type: 1, Value: 3 }] },
      { IdTeam: 'ghost', IdPlayer: 'x', PlayerName: [{ Locale: 'en', Description: 'GHOST' }], Statistic: [{ Type: 1, Value: 1 }] },
      { IdTeam: 'fra', IdPlayer: 'noname', Statistic: [{ Type: 1, Value: 1 }] },
      { IdTeam: 'fra', IdPlayer: 'bench', PlayerName: [{ Locale: 'en', Description: 'BENCH' }] },
    ],
  }

  it('extracts goals (Type 1) + assists (Type 219), maps teams, fills fallbacks, drops blanks, sorts', () => {
    const s = normalizeFifaPlayerStats(data)
    const by = (n: string) => s.find((x) => x.playerName === n)
    expect(by('BENCH')).toBeUndefined() // no stats → dropped
    expect(s[0].playerName).toBe('MBAPPE') // sorted by goals desc
    expect(by('MBAPPE')).toMatchObject({ teamName: 'France', teamCode: 'FRA', goals: 8, assists: 2 })
    expect(by('GRIEZMANN')).toMatchObject({ goals: 0, assists: 3 }) // assist-only still included
    expect(by('MORATA')).toMatchObject({ teamName: '', teamCode: null, goals: 3, assists: 0 }) // team without name/code, missing assist stat
    expect(by('GHOST')).toMatchObject({ teamName: '', teamCode: null, goals: 1 }) // team id not in map
    expect(by('Unknown')).toMatchObject({ goals: 1 }) // missing PlayerName
  })

  it('handles empty data', () => {
    expect(normalizeFifaPlayerStats({})).toEqual([])
  })
})

describe('fifaProvider.getPlayerStats', () => {
  it('fetches and normalizes player stats', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ AggregatedTeamStats: [], AggregatedPlayerStats: [] }), { status: 200 })) as unknown as typeof fetch
    const provider = fifaProvider({ seasonId: '255711', competitionId: '17', fetchImpl, rateLimiter: new RateLimiter(0) })
    expect(await provider.getPlayerStats!({ teamId: '43946' })).toEqual([])
  })

  it('throws on an upstream error', async () => {
    const provider = fifaProvider({
      seasonId: '1',
      competitionId: '17',
      fetchImpl: (async () => new Response('x', { status: 500 })) as unknown as typeof fetch,
      rateLimiter: new RateLimiter(0),
    })
    await expect(provider.getPlayerStats!({ teamId: '1' })).rejects.toThrow()
  })
})
