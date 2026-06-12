import { describe, it, expect } from 'vitest'
import {
  fifaProvider,
  normalizeFifaSquadDoc,
  upperSurname,
  normalizeFdhMatchStats,
  normalizeFifaBracket,
  normalizeFifaMatch,
  normalizeFifaMatchDetail,
  normalizeFifaTimeline,
  normalizeFifaPlayerStats,
  normalizeFifaSquad,
  normalizeFifaCoach,
  aggregateTeamMatchStats,
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
      minute: null,
      halfTime: false,
      possessionHome: null,
      possessionAway: null,
      attendance: null,
      stadium: null,
      cards: { home: { yellow: 0, red: 0 }, away: { yellow: 0, red: 0 } },
      goals: [],
      bookings: [],
      substitutions: [],
      ifesId: null,
      homeTeamId: null,
      awayTeamId: null,
    })
    // The live clock comes through when FIFA exposes it.
    expect(normalizeFifaMatchDetail({ MatchTime: "47'" }).minute).toBe("47'")
    // Period 4 is the half-time interval - flagged so the UI shows "HT" even
    // though the clock has reset and MatchStatus is still LIVE.
    expect(normalizeFifaMatchDetail({ Period: 4, MatchTime: "0'" }).halfTime).toBe(true)
    expect(normalizeFifaMatchDetail({ Period: 5, MatchTime: "47'" }).halfTime).toBe(false)
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

describe('normalizeFifaTimeline', () => {
  const desc = (s: string) => [{ Locale: 'en-GB', Description: s }]

  it('keeps only curated events, maps sides, and reverses to newest-first', () => {
    const events = normalizeFifaTimeline(
      {
        Event: [
          { Type: 7, MatchMinute: "1'", EventDescription: desc('Kick-off.') },
          { Type: 18, MatchMinute: "3'", IdTeam: 'H', EventDescription: desc('Foul.') }, // noise, dropped
          { Type: 0, MatchMinute: "23'", IdTeam: 'H', HomeGoals: 1, AwayGoals: 0, EventDescription: desc('SCORER scores!') },
          { Type: 2, MatchMinute: "30'", IdTeam: 'A', EventDescription: desc('BOOKED is booked.') },
          { Type: 5, MatchMinute: "60'", IdTeam: 'X', EventDescription: desc('Sub for a neutral team.') },
        ],
      },
      'H',
      'A',
    )
    expect(events.map((e) => [e.kind, e.side, e.minute])).toEqual([
      ['sub', null, "60'"], // IdTeam X matches neither home nor away -> null side
      ['yellow', 'AWAY', "30'"],
      ['goal', 'HOME', "23'"],
      ['period', null, "1'"],
    ])
    expect(events.find((e) => e.kind === 'goal')).toMatchObject({ homeScore: 1, awayScore: 0, text: 'SCORER scores!' })
  })

  it('places an own goal on the benefiting side, not the scorer team', () => {
    // FIFA tags an own goal with the scorer's own team (here the away team 'A'),
    // but it counts for the opponent - the home side's score ticks up.
    const events = normalizeFifaTimeline(
      { Event: [{ Type: 34, MatchMinute: "40'", IdTeam: 'A', HomeGoals: 1, AwayGoals: 0, EventDescription: desc('DEFENDER scores an own goal!!') }] },
      'H',
      'A',
    )
    expect(events[0]).toMatchObject({ kind: 'own-goal', side: 'HOME', homeScore: 1, awayScore: 0 })
  })

  it('drops events with no type or no description, and defaults a missing minute', () => {
    expect(normalizeFifaTimeline({ Event: [{ Type: 0, MatchMinute: "5'", EventDescription: [] }] })).toEqual([])
    expect(normalizeFifaTimeline({ Event: [{ EventDescription: desc('No type, dropped.') }] })).toEqual([])
    expect(normalizeFifaTimeline({})).toEqual([])
    // A kept event with neither minute nor team id: minute null, side null.
    expect(normalizeFifaTimeline({ Event: [{ Type: 71, EventDescription: desc('VAR check.') }] })).toEqual([
      { kind: 'var', side: null, minute: null, text: 'VAR check.', homeScore: null, awayScore: null },
    ])
  })
})

describe('fifaProvider.getMatchTimeline', () => {
  const noWait = () => new RateLimiter(0)

  it('fetches, normalizes and resolves sides from the passed team ids', async () => {
    const payload = {
      Event: [
        { Type: 0, MatchMinute: "10'", IdTeam: 'home-id', HomeGoals: 1, AwayGoals: 0, EventDescription: [{ Locale: 'en', Description: 'Goal!' }] },
      ],
    }
    const fetchImpl = (async () => new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch
    const provider = fifaProvider({ seasonId: '255711', competitionId: '17', fetchImpl, rateLimiter: noWait() })
    const events = await provider.getMatchTimeline!({ matchId: 'm1', homeTeamId: 'home-id', awayTeamId: 'away-id' })
    expect(events).toEqual([{ kind: 'goal', side: 'HOME', minute: "10'", text: 'Goal!', homeScore: 1, awayScore: 0 }])
  })
})

describe('fifaProvider.getMatchDetail', () => {
  const noWait = () => new RateLimiter(0)

  it('fetches and normalizes a match detail', async () => {
    const payload = {
      MatchTime: "62'",
      BallPossession: { OverallHome: 50, OverallAway: 50 },
      HomeTeam: { IdTeam: 'H', Players: [], Goals: [] },
      AwayTeam: { IdTeam: 'A', Players: [], Goals: [] },
    }
    const fetchImpl = (async () => new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch
    const provider = fifaProvider({ seasonId: '255711', competitionId: '17', fetchImpl, rateLimiter: noWait() })
    expect(await provider.getMatchDetail!({ stageId: 'st1', matchId: 'm1' })).toEqual({
      minute: "62'",
      halfTime: false,
      possessionHome: 50,
      possessionAway: 50,
      attendance: null,
      stadium: null,
      cards: { home: { yellow: 0, red: 0 }, away: { yellow: 0, red: 0 } },
      goals: [],
      bookings: [],
      substitutions: [],
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
        Bookings: [{ Card: 2, IdPlayer: 'p2', Minute: "12'" }, { Card: 3, IdPlayer: 'p2', Minute: "30'" }, {}],
      },
    })
    expect(d.bookings).toEqual([
      { side: 'AWAY', playerId: 'p2', playerName: 'Marcos ACUNA', minute: "12'", card: 'RED', coach: false },
      { side: 'AWAY', playerId: 'p2', playerName: 'Marcos ACUNA', minute: "30'", card: 'SECOND_YELLOW', coach: false },
      { side: 'HOME', playerId: 'p1', playerName: 'Adrien RABIOT', minute: "55'", card: 'YELLOW', coach: false },
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

  it('getTeamTournament sweeps matches into squad, coach and aggregated stats', async () => {
    const detail = {
      Properties: { IdIFES: '133' },
      HomeTeam: {
        IdTeam: 'T1',
        Abbreviation: 'FRA',
        Players: [{ IdPlayer: 'a', PlayerName: [{ Locale: 'en', Description: 'A' }], ShirtNumber: 1, Position: 0 }],
        Bookings: [{ Card: 1, IdPlayer: 'a', Minute: "10'" }],
        Coaches: [{ Name: [{ Locale: 'en', Description: 'Didier Deschamps' }], Role: 0 }],
      },
      AwayTeam: { IdTeam: 'T2', Players: [], Goals: [] },
    }
    const fdh = { T1: [['Possession', 0.5, true], ['AttemptAtGoal', 20, true], ['Passes', 600, true], ['PassesCompleted', 480, true]] }
    const squadDoc = {
      Players: [
        { IdPlayer: 'a', PlayerName: [{ Locale: 'en', Description: 'A' }], JerseyNum: '1', Position: '0' },
        { IdPlayer: 'z', PlayerName: [{ Locale: 'en', Description: 'Bench DF' }], JerseyNum: 17, Position: 1 },
      ],
      Officials: [
        { Name: [{ Locale: 'en', Description: 'Guy Stephan' }], Role: '1' },
        { Name: [{ Locale: 'en', Description: 'Didier Deschamps' }], Role: '0' },
      ],
    }
    const payloads = [
      new Response(JSON.stringify(detail), { status: 200 }),
      new Response(JSON.stringify(fdh), { status: 200 }),
      new Response(JSON.stringify(squadDoc), { status: 200 }),
    ]
    const fetchImpl = (async () => payloads.shift()!) as unknown as typeof fetch
    const provider = fifaProvider({ seasonId: '255711', competitionId: '17', rateLimiter: noWait(), fetchImpl })
    const res = await provider.getTeamTournament!({ teamRef: 'FRA', matches: [{ stageId: 's', matchId: 'm1' }] })
    expect(res.coach).toBe('Didier DESCHAMPS') // head coach (Role 0), surname aligned with player style
    expect(res.squad).toHaveLength(2) // official squad doc wins: bench player has a real position
    expect(res.squad.find((p) => p.playerId === 'z')!.position).toBe('DF')
    expect(res.squad.find((p) => p.playerId === 'a')!.captain).toBe(false)
    expect(res.stats).toMatchObject({ attempts: 20, passes: 600, possession: 50, yellowCards: 1, redCards: 0 })
    expect(res.stats!.passAccuracy).toBeCloseTo(80, 5)
  })

  it('getTeamTournament skips failed detail fetches and throws when rate limited', async () => {
    const payloads = [new Response('nope', { status: 500 })]
    const fetchImpl = (async () => payloads.shift()!) as unknown as typeof fetch
    const provider = fifaProvider({ seasonId: '1', competitionId: '17', rateLimiter: noWait(), fetchImpl })
    const res = await provider.getTeamTournament!({ teamRef: 'FRA', matches: [{ stageId: 's', matchId: 'm' }] })
    expect(res.squad).toEqual([])
    expect(res.stats).toBeNull()

    const limited = fifaProvider({ seasonId: '1', competitionId: '17', rateLimiter: noWait(), fetchImpl: (async () => new Response('', { status: 429 })) as unknown as typeof fetch })
    await expect(limited.getTeamTournament!({ teamRef: 'FRA', matches: [{ stageId: 's', matchId: 'm' }] })).rejects.toThrow()
  })

  it('getTeamTournament resolves the team id from the calendar before kickoff (announced squads)', async () => {
    const calendar = { Results: [{ IdMatch: 'm1', Home: { IdTeam: '43946', Abbreviation: 'FRA', Score: null }, Away: { IdTeam: '43935', Abbreviation: 'BRA', Score: null } }] }
    const squadDoc = {
      Players: [{ IdPlayer: 'p1', PlayerName: [{ Locale: 'en', Description: 'Brice SAMBA' }], JerseyNum: '1', Position: '0' }],
      Officials: [{ Name: [{ Locale: 'en', Description: 'Didier Deschamps' }], Role: 0 }],
    }
    const fetchImpl = (async (url: string) => {
      const u = String(url)
      if (u.includes('/live/football/')) return new Response('null', { status: 200 }) // unplayed: 200 with a null body
      if (u.includes('/calendar/matches')) return new Response(JSON.stringify(calendar), { status: 200 })
      if (u.includes('/squad')) return new Response(JSON.stringify(squadDoc), { status: 200 })
      return new Response('{}', { status: 200 })
    }) as unknown as typeof fetch
    const provider = fifaProvider({ seasonId: '285023', competitionId: '17', rateLimiter: noWait(), fetchImpl })
    const res = await provider.getTeamTournament!({ teamRef: 'FRA', matches: [{ stageId: 's', matchId: 'm1' }] })
    expect(res.squad).toHaveLength(1)
    expect(res.squad[0]).toMatchObject({ name: 'Brice SAMBA', position: 'GK', shirtNumber: 1 })
    expect(res.coach).toBe('Didier DESCHAMPS')
    expect(res.stats).toBeNull() // nothing played, nothing aggregated
  })

  it('getTeamTournament stays empty when the calendar has no such team or fails', async () => {
    const emptyCal = (async (url: string) => {
      const u = String(url)
      if (u.includes('/live/football/')) return new Response('null', { status: 200 })
      if (u.includes('/calendar/matches')) return new Response(JSON.stringify({ Results: [{ Home: null, Away: { IdTeam: null, Abbreviation: 'FRA', Score: null } }, { Home: { IdTeam: 'X9', Abbreviation: 'ZZ', Score: null }, Away: null }] }), { status: 200 })
      return new Response('{}', { status: 200 })
    }) as unknown as typeof fetch
    const provider = fifaProvider({ seasonId: '1', competitionId: '17', rateLimiter: noWait(), fetchImpl: emptyCal })
    const res = await provider.getTeamTournament!({ teamRef: 'FRA', matches: [{ stageId: 's', matchId: 'm1' }] })
    expect(res.squad).toEqual([])
    // exact-id match path
    expect((await provider.getTeamTournament!({ teamRef: 'X9', matches: [{ stageId: 's', matchId: 'm1' }] })).squad).toEqual([])

    const calDown = (async (url: string) => {
      const u = String(url)
      if (u.includes('/live/football/')) return new Response('null', { status: 200 })
      return new Response('down', { status: 500 })
    }) as unknown as typeof fetch
    const p2 = fifaProvider({ seasonId: '1', competitionId: '17', rateLimiter: noWait(), fetchImpl: calDown })
    expect((await p2.getTeamTournament!({ teamRef: 'FRA', matches: [{ stageId: 's', matchId: 'm1' }] })).squad).toEqual([])
  })

  it('coach bookings carry the head coach name and flag', async () => {
    const detail = {
      HomeTeam: {
        IdTeam: 't1',
        TeamName: [{ Locale: 'en', Description: 'Germany' }],
        Coaches: [{ Name: [{ Locale: 'en', Description: 'Julian Nagelsmann' }], Role: 0 }],
        Bookings: [
          { Card: 1, Minute: "59'", IdPlayer: null, IdCoach: 'c9' },
          { Card: 1, Minute: "70'", IdPlayer: 'nobody', IdCoach: null },
        ],
        Players: [],
        Goals: [],
      },
      AwayTeam: { IdTeam: 't2', TeamName: [{ Locale: 'en', Description: 'Denmark' }], Bookings: [], Players: [], Goals: [] },
      Properties: {},
    }
    const provider = fifaProvider({ seasonId: '1', competitionId: '17', rateLimiter: noWait(), fetchImpl: okJson(detail) })
    const d = await provider.getMatchDetail!({ stageId: 's', matchId: 'm' })
    expect(d!.bookings[0]).toMatchObject({ playerName: 'Julian Nagelsmann', coach: true, playerId: 'c9' })
    expect(d!.bookings[1]).toMatchObject({ playerName: 'Unknown', coach: false })
  })

  it('substitutions normalize from both sides with sparse fields', async () => {
    const detail = {
      HomeTeam: {
        IdTeam: 't1', TeamName: [{ Locale: 'en', Description: 'France' }], Players: [], Goals: [], Bookings: [],
        Substitutions: [
          { Minute: "72'", IdPlayerOff: 'a', IdPlayerOn: 'b', PlayerOffName: [{ Locale: 'en', Description: 'ALMOEZ ALI' }], PlayerOnName: [{ Locale: 'en', Description: 'MOHAMMED MUNTARI' }] },
          { Minute: null, IdPlayerOff: null, IdPlayerOn: null }, // sparse: every fallback
        ],
      },
      AwayTeam: {
        IdTeam: 't2', TeamName: [{ Locale: 'en', Description: 'Brazil' }], Players: [], Goals: [], Bookings: [],
        Substitutions: [{ Minute: "60'", IdPlayerOff: 'c', IdPlayerOn: 'd', PlayerOffName: [{ Locale: 'en', Description: 'OFF AWAY' }], PlayerOnName: [{ Locale: 'en', Description: 'ON AWAY' }] }],
      },
      Properties: {},
    }
    const provider = fifaProvider({ seasonId: '1', competitionId: '17', rateLimiter: noWait(), fetchImpl: okJson(detail) })
    const d = await provider.getMatchDetail!({ stageId: 's', matchId: 'm' })
    expect(d!.substitutions.map((x) => [x.minute, x.playerOffName, x.playerOnName, x.side])).toEqual([
      ["60'", 'OFF AWAY', 'ON AWAY', 'AWAY'],
      ["72'", 'ALMOEZ ALI', 'MOHAMMED MUNTARI', 'HOME'],
      [null, '?', '?', 'HOME'], // minute-less sorts last
    ])
  })

  it('resolves sub names from the roster when the inline arrays are momentarily empty', async () => {
    const detail = {
      HomeTeam: {
        IdTeam: 't1', TeamName: [{ Locale: 'en', Description: 'France' }], Goals: [], Bookings: [],
        Players: [
          { IdPlayer: 'off1', PlayerName: [{ Locale: 'en', Description: 'STARTER' }] },
          { IdPlayer: 'on1', PlayerName: [{ Locale: 'en', Description: 'BENCH GUY' }] },
        ],
        // FIFA's transient state: the event exists, the inline names do not yet.
        Substitutions: [{ Minute: "61'", IdPlayerOff: 'off1', IdPlayerOn: 'on1', PlayerOffName: [], PlayerOnName: [] }],
      },
      AwayTeam: { IdTeam: 't2', TeamName: [{ Locale: 'en', Description: 'Brazil' }], Players: [], Goals: [], Bookings: [], Substitutions: [] },
      Properties: {},
    }
    const provider = fifaProvider({ seasonId: '1', competitionId: '17', rateLimiter: noWait(), fetchImpl: okJson(detail) })
    const d = await provider.getMatchDetail!({ stageId: 's', matchId: 'm' })
    expect(d!.substitutions).toEqual([{ side: 'HOME', minute: "61'", playerOffId: 'off1', playerOffName: 'STARTER', playerOnId: 'on1', playerOnName: 'BENCH GUY' }])
  })

  it('coach booking with no coach roster falls back to "Coach"; alias name path', async () => {
    const mk = (coaches: unknown) => ({
      HomeTeam: { IdTeam: 't1', TeamName: [{ Locale: 'en', Description: 'X' }], Players: [], Goals: [], Coaches: coaches, Bookings: [{ Card: 1, Minute: "10'", IdPlayer: null, IdCoach: 'c1' }] },
      AwayTeam: { IdTeam: 't2', TeamName: [{ Locale: 'en', Description: 'Y' }], Players: [], Goals: [], Bookings: [] },
      Properties: {},
    })
    const noRoster = fifaProvider({ seasonId: '1', competitionId: '17', rateLimiter: noWait(), fetchImpl: okJson(mk(undefined)) })
    expect((await noRoster.getMatchDetail!({ stageId: 's', matchId: 'm' }))!.bookings[0].playerName).toBe('Coach')
    const aliasOnly = fifaProvider({ seasonId: '1', competitionId: '17', rateLimiter: noWait(), fetchImpl: okJson(mk([{ Alias: [{ Locale: 'en', Description: 'Le Boss' }], Role: 0 }])) })
    expect((await aliasOnly.getMatchDetail!({ stageId: 's', matchId: 'm' }))!.bookings[0].playerName).toBe('Le Boss')
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
              { IdPlayer: 'n2', Position: 8 }, // no names, no shirt - exercises the null/null sort tail
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

describe('normalizeFifaCoach + aggregateTeamMatchStats', () => {
  it('finds the head coach (Role 0) and returns null when absent', () => {
    const details = [
      { HomeTeam: { IdTeam: 'T1', Coaches: [{ Name: [{ Locale: 'en', Description: 'Assistant' }], Role: 1 }] } },
      { AwayTeam: { IdTeam: 'T1', Coaches: [{ Role: 0, Name: [{ Locale: 'en', Description: 'Head Coach' }] }] } },
    ]
    expect(normalizeFifaCoach(details, 'T1')).toBe('Assistant') // first match: falls back to first coach
    expect(normalizeFifaCoach([details[1]], 'T1')).toBe('Head COACH') // surname aligned to player style
    expect(normalizeFifaCoach([{}], 'T1')).toBeNull()
  })

  it('aggregates per-match stats: sums, averaged possession, accuracy, cards', () => {
    const m = (over: Record<string, number | null>) => ({
      possession: null, attempts: null, onTarget: null, passes: null, passesCompleted: null,
      crosses: null, corners: null, fouls: null, offsides: null, distanceKm: null,
      pressuresApplied: null, forcedTurnovers: null, ...over,
    })
    const agg = aggregateTeamMatchStats(
      [m({ possession: 40, attempts: 10, passes: 500, passesCompleted: 400 }), m({ possession: 60, attempts: 15, passes: 500, passesCompleted: 475 })],
      [{ yellow: 2, red: 0 }, { yellow: 1, red: 1 }],
    )
    expect(agg).toMatchObject({ possession: 50, attempts: 25, passes: 1000, yellowCards: 3, redCards: 1 })
    expect(agg!.passAccuracy).toBeCloseTo(87.5, 5)
    expect(aggregateTeamMatchStats([], [])).toBeNull()
    expect(aggregateTeamMatchStats([m({})], [])!.passAccuracy).toBeNull()
  })
})

describe('normalizeFifaSquadDoc + upperSurname', () => {
  it('maps the official squad doc with real positions and head coach', () => {
    const out = normalizeFifaSquadDoc(
      {
        Players: [
          { IdPlayer: 's1', PlayerName: [{ Locale: 'en', Description: 'William SALIBA' }], JerseyNum: '17', Position: '1' },
          { IdPlayer: 's2', ShortName: [{ Locale: 'en', Description: 'LLORIS' }], JerseyNum: 1, Position: 0 },
          { IdPlayer: '', Position: 3 },
          { IdPlayer: 's3', JerseyNum: '', Position: 9 },
        ],
      },
      new Set(['s2']),
    )
    expect(out.squad.map((p) => [p.playerId, p.position, p.captain])).toEqual([
      ['s2', 'GK', true],
      ['s1', 'DF', false],
      ['s3', null, false],
    ])
    expect(out.coach).toBeNull()
  })

  it('uppercases everything after the first name', () => {
    expect(upperSurname('Didier Deschamps')).toBe('Didier DESCHAMPS')
    expect(upperSurname('Louis van Gaal')).toBe('Louis VAN GAAL')
    expect(upperSurname('Pele')).toBe('Pele')
  })
})

describe('getTeamTournament fallback paths', () => {
  const noWait = () => new RateLimiter(0)

  it('matches the away side, skips unmatched/ifes-less details, falls back to union squad', async () => {
    const d1 = {
      HomeTeam: { IdTeam: 'X' },
      AwayTeam: {
        IdTeam: 'T9',
        Abbreviation: 'AAA',
        Players: [{ IdPlayer: 'q', ShortName: [{ Locale: 'en', Description: 'Q' }], ShirtNumber: 9, Position: 3 }],
        Bookings: [{ Card: 1 }],
        Coaches: [{ Alias: [{ Locale: 'en', Description: 'Alias Coach' }] }],
      },
    } // no Properties → fdh skipped
    const d2 = { HomeTeam: { IdTeam: 'o1' }, AwayTeam: { IdTeam: 'o2' } } // not our team → skipped
    const payloads = [
      new Response(JSON.stringify(d1), { status: 200 }),
      new Response(JSON.stringify(d2), { status: 200 }),
      new Response('x', { status: 500 }), // squad doc fails → union fallback
    ]
    const provider = fifaProvider({ seasonId: '1', competitionId: '17', rateLimiter: noWait(), fetchImpl: (async () => payloads.shift()!) as unknown as typeof fetch })
    const res = await provider.getTeamTournament!({ teamRef: 'AAA', matches: [{ stageId: 's', matchId: 'm1' }, { stageId: 's', matchId: 'm2' }] })
    expect(res.squad.map((p) => p.name)).toEqual(['Q'])
    expect(res.coach).toBe('Alias COACH')
    expect(res.stats!.yellowCards).toBe(1)
  })

  it('squad doc with only an assistant official falls back to it; unnamed players become Unknown', () => {
    const out = normalizeFifaSquadDoc(
      { Players: [{ IdPlayer: 'u1', JerseyNum: 3, Position: 2 }], Officials: [{ Name: [{ Locale: 'en', Description: 'Only One' }], Role: '1' }] },
      new Set(),
    )
    expect(out.squad[0].name).toBe('Unknown')
    expect(out.coach).toBe('Only ONE')
  })
})

describe('getMatchDetail by bare match id', () => {
  it('uses the single-id live endpoint when no stage id is available', async () => {
    let calledUrl = ''
    const fetchImpl = (async (url: string) => {
      calledUrl = String(url)
      return new Response(JSON.stringify({ HomeTeam: { IdTeam: 'H' }, AwayTeam: { IdTeam: 'A' } }), { status: 200 })
    }) as unknown as typeof fetch
    const provider = fifaProvider({ seasonId: '255711', competitionId: '17', rateLimiter: new RateLimiter(0), fetchImpl })
    const d = await provider.getMatchDetail!({ matchId: '400235467' })
    expect(calledUrl).toContain('/live/football/400235467?')
    expect(d!.homeTeamId).toBe('H')
  })
})

describe('squad doc + fdh edge branches', () => {
  it('empty squad doc yields empty squad and null coach', () => {
    expect(normalizeFifaSquadDoc({}, new Set())).toEqual({ squad: [], coach: null })
  })

  it('a failing fdh fetch still aggregates cards from the detail', async () => {
    const detail = {
      Properties: { IdIFES: '999' },
      HomeTeam: { IdTeam: 'T1', Abbreviation: 'AAA', Players: [], Bookings: [{ Card: 1 }, { Card: 2 }] },
      AwayTeam: { IdTeam: 'T2' },
    }
    const payloads = [
      new Response(JSON.stringify(detail), { status: 200 }),
      new Response('down', { status: 500 }), // fdh fails
      new Response('down', { status: 500 }), // squad doc fails
    ]
    const provider = fifaProvider({ seasonId: '1', competitionId: '17', rateLimiter: new RateLimiter(0), fetchImpl: (async () => payloads.shift()!) as unknown as typeof fetch })
    const res = await provider.getTeamTournament!({ teamRef: 'AAA', matches: [{ stageId: 's', matchId: 'm' }] })
    expect(res.stats).toMatchObject({ yellowCards: 1, redCards: 1, attempts: null })
  })
})
