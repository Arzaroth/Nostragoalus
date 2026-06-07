import { describe, it, expect } from 'vitest'
import {
  fifaProvider,
  normalizeFdhMatchStats,
  normalizeFifaBracket,
  normalizeFifaMatch,
  normalizeFifaMatchDetail,
  normalizeFifaPlayerStats,
  normalizeFifaSquad,
  normalizeFifaTeamStats,
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
    expect(normalizeFifaMatchDetail({})).toEqual({
      possessionHome: null,
      possessionAway: null,
      attendance: null,
      stadium: null,
      cards: { home: { yellow: 0, red: 0 }, away: { yellow: 0, red: 0 } },
      goals: [],
      bookings: [],
      ifesId: null,
      homeTeamId: null,
      awayTeamId: null,
    })
  })

  it('extracts attendance, stadium and cards (yellow/red, ignoring blanks)', () => {
    const d = normalizeFifaMatchDetail({
      Attendance: 88966,
      Stadium: { Name: [{ Locale: 'en', Description: 'Lusail Stadium' }] },
      HomeTeam: { Bookings: [{ Card: 1 }, { Card: 1 }, { Card: 2 }] },
      AwayTeam: { Bookings: [{ Card: 1 }, { Card: 3 }, {}] },
    })
    expect(d.attendance).toBe(88966)
    expect(d.stadium).toBe('Lusail Stadium')
    expect(d.cards).toEqual({ home: { yellow: 2, red: 1 }, away: { yellow: 1, red: 1 } })
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
      attendance: null,
      stadium: null,
      cards: { home: { yellow: 0, red: 0 }, away: { yellow: 0, red: 0 } },
      goals: [],
      bookings: [],
      ifesId: null,
      homeTeamId: 'H',
      awayTeamId: 'A',
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

describe('normalizeFifaMatchDetail fallbacks', () => {
  it('fills defaults for missing names, teams and goal fields', () => {
    const d = normalizeFifaMatchDetail({
      HomeTeam: {
        Players: [
          { IdPlayer: 'h1', ShortName: [{ Locale: 'en', Description: 'H1 SHORT' }] },
          { IdPlayer: 'h2' },
          { ShortName: [{ Locale: 'en', Description: 'NO ID' }] },
        ],
        Goals: [{ IdPlayer: 'h1' }, {}],
      },
      AwayTeam: {
        Players: [{ IdPlayer: 'a1', PlayerName: [{ Locale: 'en', Description: 'A1' }] }, {}],
        Goals: [],
      },
    })
    expect(d.goals).toHaveLength(2)
    expect(d.goals[0]).toMatchObject({ playerName: 'H1 SHORT', teamId: null, teamName: '', teamCode: null, minute: null, goalType: null })
    expect(d.goals[1]).toMatchObject({ playerId: null, playerName: 'Unknown' })
  })
})

describe('normalizeFifaBracket fallbacks', () => {
  it('handles a stage and winner with missing fields', () => {
    const b = normalizeFifaBracket({ Winner: {}, KnockoutStages: [{ SequenceOrder: 1 }] })
    expect(b.winner).toEqual({ name: '', code: null })
    expect(b.rounds[0]).toMatchObject({ name: '', sequence: 1, matches: [] })
  })
})

describe('normalizeFifaPlayerStats sort', () => {
  it('breaks goal ties by assists then name', () => {
    const data = {
      AggregatedTeamStats: [],
      AggregatedPlayerStats: [
        { IdPlayer: 'p1', PlayerName: [{ Locale: 'en', Description: 'Zzz' }], Statistic: [{ Type: 1, Value: 1 }, { Type: 219, Value: 0 }] },
        { IdPlayer: 'p2', PlayerName: [{ Locale: 'en', Description: 'Aaa' }], Statistic: [{ Type: 1, Value: 1 }, { Type: 219, Value: 0 }] },
        { IdPlayer: 'p3', PlayerName: [{ Locale: 'en', Description: 'Helper' }], Statistic: [{ Type: 1, Value: 1 }, { Type: 219, Value: 2 }] },
      ],
    }
    expect(normalizeFifaPlayerStats(data).map((s) => s.playerName)).toEqual(['Helper', 'Aaa', 'Zzz'])
  })
})

describe('fifaProvider rate limits', () => {
  const limited = (method: 'getBracket' | 'getPlayerStats') => {
    const provider = fifaProvider({
      seasonId: '1',
      competitionId: '17',
      fetchImpl: (async () => new Response('', { status: 429 })) as unknown as typeof fetch,
      rateLimiter: new RateLimiter(0),
    })
    return method === 'getBracket' ? provider.getBracket!() : provider.getPlayerStats!({ teamId: '1' })
  }
  it('throws on bracket rate limiting', async () => {
    await expect(limited('getBracket')).rejects.toThrow()
  })
  it('throws on player-stats rate limiting', async () => {
    await expect(limited('getPlayerStats')).rejects.toThrow()
  })
})

describe('booking events', () => {
  it('extracts named, chronological booking events from both sides', () => {
    const d = normalizeFifaMatchDetail({
      HomeTeam: {
        IdTeam: 'H',
        Players: [{ IdPlayer: 'p1', PlayerName: [{ Locale: 'en', Description: 'Adrien RABIOT' }] }],
        Bookings: [{ Card: 1, IdPlayer: 'p1', Minute: "55'" }],
      },
      AwayTeam: {
        IdTeam: 'A',
        Players: [{ IdPlayer: 'p2', PlayerName: [{ Locale: 'en', Description: 'Marcos ACUNA' }] }],
        Bookings: [{ Card: 2, IdPlayer: 'p2', Minute: "12'" }, {}],
      },
    })
    expect(d.bookings).toEqual([
      { side: 'AWAY', playerId: 'p2', playerName: 'Marcos ACUNA', minute: "12'", card: 'RED' },
      { side: 'HOME', playerId: 'p1', playerName: 'Adrien RABIOT', minute: "55'", card: 'YELLOW' },
    ])
  })
})

describe('normalizeFifaSquad', () => {
  const detail = (players: any[], teamId = 'T1') => ({ HomeTeam: { IdTeam: teamId, Players: players } })

  it('unions match-day rosters, keeps best-known position, sorts GK→FW then by number', () => {
    const squad = normalizeFifaSquad(
      [
        detail([
          { IdPlayer: 'a', PlayerName: [{ Locale: 'en', Description: 'Keeper' }], ShirtNumber: '1', Position: '0', Captain: 'True' },
          { IdPlayer: 'b', PlayerName: [{ Locale: 'en', Description: 'Striker' }], ShirtNumber: 10, Position: 3 },
          { IdPlayer: 'c', ShortName: [{ Locale: 'en', Description: 'BENCH' }], ShirtNumber: 20, Position: 9 },
        ]),
        detail([
          { IdPlayer: 'c', PlayerName: [{ Locale: 'en', Description: 'Sub Mid' }], ShirtNumber: 20, Position: 2 },
          { IdPlayer: 'b', PlayerName: [{ Locale: 'en', Description: 'Striker' }], ShirtNumber: 10, Position: 3, Captain: true },
          { IdPlayer: '' },
        ]),
        { HomeTeam: { IdTeam: 'OTHER', Players: [{ IdPlayer: 'x', ShirtNumber: 5, Position: 1 }] } },
      ],
      'T1',
    )
    expect(squad.map((p) => [p.playerId, p.position, p.shirtNumber, p.captain])).toEqual([
      ['a', 'GK', 1, true],
      ['c', 'MF', 20, false],
      ['b', 'FW', 10, true],
    ])
  })

  it('matches the away side too and handles empty input', () => {
    const squad = normalizeFifaSquad(
      [{ AwayTeam: { IdTeam: 'T2', Players: [{ IdPlayer: 'z', PlayerName: [{ Locale: 'en', Description: 'Away Guy' }], ShirtNumber: null, Position: 1 }] } }],
      'T2',
    )
    expect(squad).toEqual([{ playerId: 'z', name: 'Away Guy', shirtNumber: null, position: 'DF', captain: false }])
    expect(normalizeFifaSquad([], 'T2')).toEqual([])
  })
})

describe('normalizeFifaTeamStats', () => {
  const stat = (type: number, value: number) => ({ Type: type, Value: value })

  it('decodes the team stat type codes', () => {
    const stats = normalizeFifaTeamStats(
      {
        AggregatedTeamStats: [
          {
            IdTeam: 'T1',
            Statistic: [
              stat(33, 16), stat(34, 8), stat(219, 12), stat(2, 51.2), stat(3, 101), stat(4, 36),
              stat(68, 4812), stat(23, 3221), stat(70, 171), stat(12, 38), stat(13, 15), stat(21, 8), stat(179, 0),
            ],
          },
        ],
      },
      'T1',
    )
    expect(stats).toMatchObject({ goals: 16, conceded: 8, assists: 12, attempts: 101, onTarget: 36, passes: 4812, corners: 38, offsides: 15, yellowCards: 8, redCards: 0 })
    expect(stats!.passAccuracy).toBeCloseTo(66.94, 1)
  })

  it('returns null for an unknown team and null accuracy without passes', () => {
    expect(normalizeFifaTeamStats({ AggregatedTeamStats: [] }, 'T1')).toBeNull()
    expect(normalizeFifaTeamStats({ AggregatedTeamStats: [{ IdTeam: 'T1', Statistic: [] }] }, 'T1')!.passAccuracy).toBeNull()
  })
})

describe('normalizeFdhMatchStats', () => {
  it('maps named stats per team and skips the contested bucket', () => {
    const out = normalizeFdhMatchStats({
      '-1': [['Possession', 0.1, true]],
      T1: [
        ['Possession', 0.441, true],
        ['AttemptAtGoal', 23, true],
        ['AttemptAtGoalOnTarget', 10, true],
        ['Passes', 550, true],
        ['PassesCompleted', 480, true],
        ['Crosses', 18, true],
        ['Corners', 7, true],
        ['FoulsAgainst', 14, true],
        ['Offsides', 2, true],
        ['TotalDistance', 109120.8, true],
        ['DefensivePressuresApplied', 269, true],
        ['ForcedTurnovers', 79, true],
      ],
      T2: [['AttemptAtGoal', 9, true]],
    })
    expect(Object.keys(out).sort()).toEqual(['T1', 'T2'])
    expect(out.T1).toEqual({
      possession: 44.1, attempts: 23, onTarget: 10, passes: 550, passesCompleted: 480,
      crosses: 18, corners: 7, fouls: 14, offsides: 2,
      distanceKm: 109.1208, pressuresApplied: 269, forcedTurnovers: 79,
    })
    expect(out.T2.passes).toBeNull()
  })
})

describe('new provider methods', () => {
  const noWait = () => new RateLimiter(0)
  const okJson = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch

  it('getTeamSeason returns players and team stats from one fetch', async () => {
    const provider = fifaProvider({
      seasonId: '255711',
      competitionId: '17',
      rateLimiter: noWait(),
      fetchImpl: okJson({
        AggregatedTeamStats: [{ IdTeam: 'T1', TeamName: [{ Locale: 'en', Description: 'France' }], IdCountry: 'FRA', Statistic: [{ Type: 33, Value: 16 }] }],
        AggregatedPlayerStats: [{ IdTeam: 'T1', IdPlayer: 'p', PlayerName: [{ Locale: 'en', Description: 'KM' }], Statistic: [{ Type: 1, Value: 8 }] }],
      }),
    })
    const res = await provider.getTeamSeason!({ teamId: 'T1' })
    expect(res.team!.goals).toBe(16)
    expect(res.players[0]).toMatchObject({ playerName: 'KM', goals: 8 })
  })

  it('getTeamSeason surfaces rate limit and upstream errors', async () => {
    const limited = fifaProvider({ seasonId: '1', competitionId: '17', rateLimiter: noWait(), fetchImpl: (async () => new Response('', { status: 429 })) as unknown as typeof fetch })
    await expect(limited.getTeamSeason!({ teamId: 'T1' })).rejects.toThrow()
    const broken = fifaProvider({ seasonId: '1', competitionId: '17', rateLimiter: noWait(), fetchImpl: (async () => new Response('x', { status: 500 })) as unknown as typeof fetch })
    await expect(broken.getTeamSeason!({ teamId: 'T1' })).rejects.toThrow()
  })

  it('getSquad unions rosters and skips failed match fetches', async () => {
    const payloads = [
      new Response(JSON.stringify({ HomeTeam: { IdTeam: 'T1', Players: [{ IdPlayer: 'a', PlayerName: [{ Locale: 'en', Description: 'A' }], ShirtNumber: 1, Position: 0 }] } }), { status: 200 }),
      new Response('nope', { status: 500 }),
    ]
    const fetchImpl = (async () => payloads.shift()!) as unknown as typeof fetch
    const provider = fifaProvider({ seasonId: '255711', competitionId: '17', rateLimiter: noWait(), fetchImpl })
    const squad = await provider.getSquad!({ teamId: 'T1', matches: [{ stageId: 's', matchId: 'm1' }, { stageId: 's', matchId: 'm2' }] })
    expect(squad).toHaveLength(1)
    expect(squad[0].name).toBe('A')
  })

  it('getSquad throws when rate limited', async () => {
    const provider = fifaProvider({ seasonId: '1', competitionId: '17', rateLimiter: noWait(), fetchImpl: (async () => new Response('', { status: 429 })) as unknown as typeof fetch })
    await expect(provider.getSquad!({ teamId: 'T1', matches: [{ stageId: 's', matchId: 'm' }] })).rejects.toThrow()
  })

  it('getMatchStats normalizes fdh stats and returns null on failure', async () => {
    const ok = fifaProvider({ seasonId: '1', competitionId: '17', rateLimiter: noWait(), fetchImpl: okJson({ T1: [['AttemptAtGoal', 23, true]] }) })
    expect((await ok.getMatchStats!({ ifesId: '133016' }))!.T1.attempts).toBe(23)
    const broken = fifaProvider({ seasonId: '1', competitionId: '17', rateLimiter: noWait(), fetchImpl: (async () => new Response('x', { status: 500 })) as unknown as typeof fetch })
    expect(await broken.getMatchStats!({ ifesId: '133016' })).toBeNull()
    const limited = fifaProvider({ seasonId: '1', competitionId: '17', rateLimiter: noWait(), fetchImpl: (async () => new Response('', { status: 429 })) as unknown as typeof fetch })
    await expect(limited.getMatchStats!({ ifesId: '133016' })).rejects.toThrow()
  })
})

describe('squad edge cases (coverage of fallbacks)', () => {
  it('falls back to Unknown names, boolean captain, and sorts null positions/shirts last', () => {
    const squad = normalizeFifaSquad(
      [
        {
          HomeTeam: {
            IdTeam: 'T1',
            Players: [
              { IdPlayer: 'n1', Captain: true, ShirtNumber: '', Position: 7 }, // no names, boolean captain, blank shirt
              { IdPlayer: 'n2', Position: 8 }, // no names, no shirt — exercises the null/null sort tail
              { IdPlayer: 'n3', PlayerName: [{ Locale: 'en', Description: 'Named' }], ShirtNumber: 4, Position: 1 },
            ],
          },
        },
      ],
      'T1',
    )
    expect(squad[0]).toMatchObject({ playerId: 'n3', position: 'DF' })
    const tail = squad.slice(1)
    expect(tail.every((p) => p.name === 'Unknown' && p.position === null)).toBe(true)
    expect(tail.find((p) => p.playerId === 'n1')!.captain).toBe(true)
    expect(tail.find((p) => p.playerId === 'n1')!.shirtNumber).toBeNull()
  })

  it('names an away scorer with no name fields as Unknown', () => {
    const d = normalizeFifaMatchDetail({
      HomeTeam: { IdTeam: 'H', Players: [], Goals: [] },
      AwayTeam: { IdTeam: 'A', Players: [{ IdPlayer: 'x9' }], Goals: [{ Type: 1, IdPlayer: 'x9', Minute: "5'", IdTeam: 'A' }] },
    })
    expect(d.goals[0].playerName).toBe('Unknown')
  })
})
