import { describe, it, expect } from 'vitest'
import {
  fifaProvider,
  normalizeFifaSquadDoc,
  upperSurname,
  normalizeFdhMatchStats,
  normalizeFifaBracket,
  normalizeFifaMatch,
  normalizeFifaMatchDetail,
  mergeTimelineAssists,
  normalizeFifaTimeline,
  normalizeFifaPlayerStats,
  normalizeFifaSquad,
  normalizeFifaCoach,
  normalizeFifaMatchLineups,
  aggregateTeamMatchStats,
  type FifaMatch,
} from './fifa'
import { RateLimiter } from './rate-limiter'
import { EXTRA_TIME_BREAK_MINUTE } from '../../../shared/types/match'

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
      playerNames: {},
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
  it('keeps curated events, maps sides, resolves names, reverses to newest-first', () => {
    const names = { p1: 'SCORER', p2: 'BOOKED', on: 'BENCH GUY', off: 'TIRED GUY', c1: 'KICKER' }
    const events = normalizeFifaTimeline(
      {
        Event: [
          { Type: 7, Period: 3, MatchMinute: "0'" }, // kickoff
          { Type: 24, MatchMinute: "3'", IdTeam: 'H' }, // noise (throw-in), dropped
          { Type: 18, MatchMinute: "5'", IdTeam: 'A', IdPlayer: 'unknown' }, // foul, name not in map -> null
          { Type: 0, MatchMinute: "23'", IdTeam: 'H', IdPlayer: 'p1', HomeGoals: 1, AwayGoals: 0 }, // goal
          { Type: 2, MatchMinute: "30'", IdTeam: 'A', IdPlayer: 'p2' }, // yellow
          { Type: 16, MatchMinute: "33'", IdTeam: 'H', IdPlayer: 'c1' }, // corner: taker
          { Type: 5, MatchMinute: "60'", IdTeam: 'H', IdPlayer: 'on', IdSubPlayer: 'off' }, // sub: on/off
          { Type: 8, Period: 3, MatchMinute: "45'" }, // half-time
          { Type: 8, Period: 5, MatchMinute: "90'" }, // end of the second half
          { Type: 26, Period: 10, MatchMinute: "92'" }, // full-time
        ],
      },
      'H',
      'A',
      names,
    )
    expect(events.map((e) => [e.kind, e.side, e.minute, e.periodKind])).toEqual([
      ['period', null, "92'", 'full-time'],
      ['period', null, "90'", 'second-half-end'],
      ['period', null, "45'", 'half-time'],
      ['sub', 'HOME', "60'", null],
      ['corner', 'HOME', "33'", null],
      ['yellow', 'AWAY', "30'", null],
      ['goal', 'HOME', "23'", null],
      ['foul', 'AWAY', "5'", null],
      ['period', null, "0'", 'kickoff'],
    ])
    expect(events.find((e) => e.kind === 'goal')).toMatchObject({ playerName: 'SCORER', homeScore: 1, awayScore: 0 })
    expect(events.find((e) => e.kind === 'foul')).toMatchObject({ playerName: null }) // unknown id -> null
    expect(events.find((e) => e.kind === 'sub')).toMatchObject({ playerName: null, playerInName: 'BENCH GUY', playerOutName: 'TIRED GUY' })
    expect(events.find((e) => e.kind === 'corner')).toMatchObject({ playerName: 'KICKER', side: 'HOME' })
  })

  it('badges shootout conversions with the running pen tally, not the frozen regulation score', () => {
    const events = normalizeFifaTimeline(
      {
        Event: [
          // The feed keeps reporting the 1-1 regulation result on every kick.
          { Type: 41, Period: 11, MatchMinute: "120'", IdTeam: 'H', IdPlayer: 'p1', HomeGoals: 1, AwayGoals: 1 }, // 1-0
          { Type: 51, Period: 11, MatchMinute: "120'", IdTeam: 'A', IdPlayer: 'p2', HomeGoals: 1, AwayGoals: 1 }, // miss, no badge
          { Type: 41, Period: 11, MatchMinute: "120'", IdTeam: 'A', IdPlayer: 'p3', HomeGoals: 1, AwayGoals: 1 }, // 1-1
          { Type: 41, Period: 11, MatchMinute: "120'", IdTeam: 'H', IdPlayer: 'p4', HomeGoals: 1, AwayGoals: 1 }, // 2-1
        ],
      },
      'H',
      'A',
    )
    // newest-first after reverse: the running shootout score, not 1-1 each time.
    expect(events.filter((e) => e.kind === 'penalty-goal').map((e) => [e.homeScore, e.awayScore])).toEqual([
      [2, 1],
      [1, 1],
      [1, 0],
    ])
  })

  it('leaves a regulation penalty score untouched (only Period 11 is the shootout)', () => {
    const [pen] = normalizeFifaTimeline(
      { Event: [{ Type: 41, Period: 5, MatchMinute: "70'", IdTeam: 'H', IdPlayer: 'p1', HomeGoals: 2, AwayGoals: 1 }] },
      'H',
      'A',
    )
    expect(pen).toMatchObject({ kind: 'penalty-goal', homeScore: 2, awayScore: 1 })
  })

  it('maps period markers from the FIFA period codes', () => {
    const ev = (Type: number, Period: number) => ({ Type, Period, MatchMinute: "x" })
    const got = normalizeFifaTimeline({
      Event: [ev(7, 5), ev(7, 7), ev(7, 9), ev(8, 3), ev(8, 5), ev(8, 7), ev(8, 9)],
    }).map((e) => e.periodKind)
    // reversed (newest first)
    expect(got).toEqual([
      'extra-time-end',
      'extra-time-end',
      'second-half-end',
      'half-time',
      'extra-time',
      'extra-time',
      'second-half',
    ])
  })

  it('places an own goal on the benefiting side, not the scorer team', () => {
    // FIFA tags an own goal with the scorer's own team (here the away team 'A'),
    // but it counts for the opponent - the home side's score ticks up.
    const events = normalizeFifaTimeline(
      { Event: [{ Type: 34, MatchMinute: "40'", IdTeam: 'A', IdPlayer: 'd1', HomeGoals: 1, AwayGoals: 0 }] },
      'H',
      'A',
      { d1: 'DEFENDER' },
    )
    expect(events[0]).toMatchObject({ kind: 'own-goal', side: 'HOME', playerName: 'DEFENDER', homeScore: 1, awayScore: 0 })
    // ...and mirrored: a home-team scorer's own goal counts for the away side.
    const mirrored = normalizeFifaTimeline(
      { Event: [{ Type: 34, MatchMinute: "40'", IdTeam: 'H', IdPlayer: 'h1', HomeGoals: 0, AwayGoals: 1 }] },
      'H',
      'A',
      { h1: 'KEEPER' },
    )
    expect(mirrored[0]).toMatchObject({ kind: 'own-goal', side: 'AWAY', playerName: 'KEEPER' })
  })

  it('drops untyped and unlabelled-period events; keeps a player-less curated one', () => {
    expect(normalizeFifaTimeline({ Event: [{}] })).toEqual([]) // no type -> dropped
    expect(normalizeFifaTimeline({})).toEqual([])
    // A period-end with an unrecognized period code is unlabelled, so dropped.
    expect(normalizeFifaTimeline({ Event: [{ Type: 8, MatchMinute: "90'" }] })).toEqual([])
    // Penalty award: curated, no actor - kept, name fields null (the UI labels by kind).
    expect(normalizeFifaTimeline({ Event: [{ Type: 6, MatchMinute: "17'", IdTeam: 'H' }] }, 'H', 'A')).toEqual([
      { kind: 'penalty-awarded', side: 'HOME', minute: "17'", playerName: null, playerInName: null, playerOutName: null, periodKind: null, text: null, homeScore: null, awayScore: null },
    ])
    // VAR with no minute, no team, no names map: everything null.
    expect(normalizeFifaTimeline({ Event: [{ Type: 71 }] })).toEqual([
      { kind: 'var', side: null, minute: null, playerName: null, playerInName: null, playerOutName: null, periodKind: null, text: null, homeScore: null, awayScore: null },
    ])
  })

  it('keeps VAR commentary only when a feed-localized language is given', () => {
    const varEvent = { Event: [{ Type: 71, MatchMinute: "82'", EventDescription: [{ Locale: 'fr-FR', Description: 'Carton rouge accordé' }] }] }
    // With a language, the decision text is surfaced...
    expect(normalizeFifaTimeline(varEvent, 'H', 'A', undefined, 'fr')[0]).toMatchObject({ kind: 'var', text: 'Carton rouge accordé' })
    // ...without one, it stays null (we only show our generic label).
    expect(normalizeFifaTimeline(varEvent, 'H', 'A')[0]).toMatchObject({ kind: 'var', text: null })
    // A language but no description -> still null (not an empty string).
    expect(normalizeFifaTimeline({ Event: [{ Type: 71, EventDescription: [] }] }, 'H', 'A', undefined, 'fr')[0]).toMatchObject({ text: null })
    // A non-VAR event never carries text even with a language.
    expect(normalizeFifaTimeline({ Event: [{ Type: 18, IdTeam: 'H', EventDescription: [{ Locale: 'fr', Description: 'faute' }] }] }, 'H', 'A', undefined, 'fr')[0]).toMatchObject({ kind: 'foul', text: null })
  })
})

describe('fifaProvider.getMatchTimeline', () => {
  const noWait = () => new RateLimiter(0)

  it('fetches, normalizes, resolves sides and player names', async () => {
    const payload = {
      Event: [{ Type: 0, MatchMinute: "10'", IdTeam: 'home-id', IdPlayer: 'p9', HomeGoals: 1, AwayGoals: 0 }],
    }
    const fetchImpl = (async () => new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch
    const provider = fifaProvider({ seasonId: '255711', competitionId: '17', fetchImpl, rateLimiter: noWait() })
    const events = await provider.getMatchTimeline!({ matchId: 'm1', homeTeamId: 'home-id', awayTeamId: 'away-id', playerNames: { p9: 'STRIKER' } })
    expect(events).toEqual([
      { kind: 'goal', side: 'HOME', minute: "10'", playerName: 'STRIKER', playerInName: null, playerOutName: null, periodKind: null, text: null, homeScore: 1, awayScore: 0 },
    ])
  })

  it('passes the language through to the feed and surfaces VAR text', async () => {
    const payload = { Event: [{ Type: 71, MatchMinute: "82'", EventDescription: [{ Locale: 'fr', Description: 'Carton rouge accordé' }] }] }
    let url = ''
    const fetchImpl = (async (u: string) => {
      url = u
      return new Response(JSON.stringify(payload), { status: 200 })
    }) as unknown as typeof fetch
    const provider = fifaProvider({ seasonId: '255711', competitionId: '17', fetchImpl, rateLimiter: noWait() })
    const events = await provider.getMatchTimeline!({ matchId: 'm1', language: 'fr' })
    expect(url).toContain('language=fr')
    expect(events[0]).toMatchObject({ kind: 'var', text: 'Carton rouge accordé' })
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
      playerNames: {},
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

  it('enriches goals with assists from the timeline', async () => {
    const detail = {
      MatchTime: "90'",
      HomeTeam: {
        IdTeam: 'H',
        Players: [
          { IdPlayer: 's1', PlayerName: [{ Locale: 'en', Description: 'SCORER ONE' }] },
          { IdPlayer: 'a1', PlayerName: [{ Locale: 'en', Description: 'ASSIST ONE' }] },
        ],
        Goals: [{ Type: 1, IdPlayer: 's1', Minute: "23'", IdTeam: 'H' }],
      },
      AwayTeam: { IdTeam: 'A', Players: [], Goals: [] },
    }
    const timeline = { Event: [{ Type: 0, IdPlayer: 's1', IdSubPlayer: 'a1', MatchMinute: "23'", IdTeam: 'H' }] }
    const fetchImpl = (async (url: string) =>
      new Response(JSON.stringify(url.includes('/timelines/') ? timeline : detail), { status: 200 })) as unknown as typeof fetch
    const provider = fifaProvider({ seasonId: '255711', competitionId: '17', fetchImpl, rateLimiter: noWait() })
    const d = await provider.getMatchDetail!({ stageId: 'st1', matchId: 'm1' })
    expect(d!.goals[0]).toMatchObject({ playerId: 's1', assistPlayerId: 'a1', assistPlayerName: 'ASSIST ONE' })
  })

  it('keeps goals unassisted when the timeline fetch fails', async () => {
    const detail = {
      MatchTime: "90'",
      HomeTeam: { IdTeam: 'H', Players: [{ IdPlayer: 's1' }], Goals: [{ Type: 1, IdPlayer: 's1', Minute: "23'", IdTeam: 'H' }] },
      AwayTeam: { IdTeam: 'A', Players: [], Goals: [] },
    }
    const fetchImpl = (async (url: string) =>
      url.includes('/timelines/') ? new Response('x', { status: 500 }) : new Response(JSON.stringify(detail), { status: 200 })) as unknown as typeof fetch
    const provider = fifaProvider({ seasonId: '255711', competitionId: '17', fetchImpl, rateLimiter: noWait() })
    const d = await provider.getMatchDetail!({ stageId: 'st1', matchId: 'm1' })
    expect(d!.goals[0]).toMatchObject({ playerId: 's1', assistPlayerId: null, assistPlayerName: null })
  })

  it('propagates a rate limit from the timeline fetch so the match retries later', async () => {
    const detail = {
      MatchTime: "90'",
      HomeTeam: { IdTeam: 'H', Players: [{ IdPlayer: 's1' }], Goals: [{ Type: 1, IdPlayer: 's1', Minute: "23'", IdTeam: 'H' }] },
      AwayTeam: { IdTeam: 'A', Players: [], Goals: [] },
    }
    const fetchImpl = (async (url: string) =>
      url.includes('/timelines/') ? new Response('', { status: 429 }) : new Response(JSON.stringify(detail), { status: 200 })) as unknown as typeof fetch
    const provider = fifaProvider({ seasonId: '255711', competitionId: '17', fetchImpl, rateLimiter: noWait() })
    await expect(provider.getMatchDetail!({ stageId: 'st1', matchId: 'm1' })).rejects.toThrow()
  })
})

describe('mergeTimelineAssists', () => {
  const goal = (over: Partial<import('../../../shared/types/match').NormalizedGoal>) => ({
    side: 'HOME' as const,
    teamId: 'H',
    teamName: 'Norway',
    teamCode: 'NOR',
    playerId: 's',
    playerName: 'Scorer',
    minute: "10'",
    goalType: null,
    ownGoal: false,
    assistPlayerId: null,
    assistPlayerName: null,
    ...over,
  })
  const names = { a1: 'Assister' }

  it('attaches an open-play assist, skips own goals, penalties, solo and self assists', () => {
    const goals = [
      goal({ playerId: 's1', minute: "10'" }),
      goal({ playerId: 's2', minute: "20'", ownGoal: true }),
      goal({ playerId: 's3', minute: "30'" }),
      goal({ playerId: 's4', minute: "40'" }),
      goal({ playerId: 's5', minute: "50'" }),
    ]
    const timeline = {
      Event: [
        { Type: 0, IdPlayer: 's1', IdSubPlayer: 'a1', MatchMinute: "10'" },
        { Type: 34, IdPlayer: 's2', IdSubPlayer: 'a1', MatchMinute: "20'" }, // own goal kind - ignored
        { Type: 41, IdPlayer: 's4', IdSubPlayer: 'a1', MatchMinute: "40'" }, // penalty - ignored
        { Type: 0, IdPlayer: 's5', IdSubPlayer: 's5', MatchMinute: "50'" }, // self assist - ignored
      ],
    }
    mergeTimelineAssists(goals, timeline, names)
    expect(goals.map((g) => [g.playerId, g.assistPlayerId, g.assistPlayerName])).toEqual([
      ['s1', 'a1', 'Assister'],
      ['s2', null, null],
      ['s3', null, null],
      ['s4', null, null],
      ['s5', null, null],
    ])
  })

  it('sets the assist id with a null name when the assister is off the roster', () => {
    const goals = [goal({ playerId: 's1', minute: "10'" })]
    mergeTimelineAssists(goals, { Event: [{ Type: 39, IdPlayer: 's1', IdSubPlayer: 'ghost', MatchMinute: "10'" }] }, names)
    expect(goals[0]).toMatchObject({ assistPlayerId: 'ghost', assistPlayerName: null })
  })

  it('matches added-time goals (both feeds share the minute format) and a stringified Type', () => {
    const goals = [goal({ playerId: 's1', minute: "45'+5'" })]
    // FIFA sometimes serialises numeric codes as strings; the goal-kind lookup
    // must still resolve "0" to a goal, or assists silently vanish again.
    mergeTimelineAssists(
      goals,
      { Event: [{ Type: '0' as unknown as number, IdPlayer: 's1', IdSubPlayer: 'a1', MatchMinute: "45'+5'" }] },
      names,
    )
    expect(goals[0]).toMatchObject({ assistPlayerId: 'a1', assistPlayerName: 'Assister' })
  })

  it('is a no-op on an empty timeline, a non-goal event, or a goal missing the assister id', () => {
    const goals = [goal({ playerId: 's1', minute: "10'" }), goal({ playerId: null, minute: "20'" })]
    mergeTimelineAssists(goals, { Event: [{ Type: 12, IdPlayer: 's1', IdSubPlayer: 'a1', MatchMinute: "10'" }, { Type: 0, IdPlayer: 's1', MatchMinute: "10'" }] }, names)
    mergeTimelineAssists([goal({ playerId: 's9', minute: "9'" })], {}, names)
    expect(goals.every((g) => g.assistPlayerId === null)).toBe(true)
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
  it('handles a stage with missing fields, and ignores the feed-level Winner', () => {
    const b = normalizeFifaBracket({ Winner: {}, KnockoutStages: [{ SequenceOrder: 1 }] })
    // The champion is read off the final's own result, never from data.Winner -
    // FIFA fills that one as soon as the last semi resolves the final's slot.
    expect(b.winner).toBeNull()
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
    expect(squad).toEqual([{ playerId: 'z', name: 'Away Guy', shirtNumber: null, position: 'DF', captain: false, pictureUrl: null }])
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

  it('keeps an empty-minute break sub as half-time when the match never reached extra time', async () => {
    const detail = {
      HomeTeam: {
        IdTeam: 't1', TeamName: [{ Locale: 'en', Description: 'France' }], Players: [], Bookings: [],
        Goals: [{ Minute: "30'", IdPlayer: 'g', IdTeam: 't1' }],
        Substitutions: [
          { Minute: "40'", IdPlayerOff: 'a', IdPlayerOn: 'b' },
          { Minute: '', IdPlayerOff: 'c', IdPlayerOn: 'd' }, // FIFA leaves a half-time sub blank
        ],
      },
      AwayTeam: { IdTeam: 't2', TeamName: [{ Locale: 'en', Description: 'Brazil' }], Players: [], Goals: [], Bookings: [], Substitutions: [] },
      Properties: {},
    }
    const provider = fifaProvider({ seasonId: '1', competitionId: '17', rateLimiter: noWait(), fetchImpl: okJson(detail) })
    const d = await provider.getMatchDetail!({ stageId: 's', matchId: 'm' })
    expect(d!.substitutions.map((x) => x.minute)).toEqual(["40'", '']) // break sub stays the half-time blank
  })

  it('marks a break sub as the extra-time interval once the match reaches extra time', async () => {
    const detail = {
      HomeTeam: {
        IdTeam: 't1', TeamName: [{ Locale: 'en', Description: 'France' }], Players: [], Bookings: [],
        Goals: [{ Minute: "100'", IdPlayer: 'g', IdTeam: 't1' }], // extra time was played
        Substitutions: [
          { Minute: '', IdPlayerOff: 'h1', IdPlayerOn: 'h2' }, // half-time: nothing past 45' precedes it
          { Minute: "70'", IdPlayerOff: 'a', IdPlayerOn: 'b' },
          { Minute: '', IdPlayerOff: 'e1', IdPlayerOn: 'e2' }, // extra-time interval: the 70' sub precedes it
        ],
      },
      AwayTeam: {
        IdTeam: 't2', TeamName: [{ Locale: 'en', Description: 'Brazil' }], Players: [], Goals: [], Bookings: [],
        Substitutions: [
          { Minute: '', IdPlayerOff: 'a1', IdPlayerOn: 'a2' }, // first sub untimed, the next one is in extra time
          { Minute: "100'", IdPlayerOff: 'a3', IdPlayerOn: 'a4' },
        ],
      },
      Properties: {},
    }
    const provider = fifaProvider({ seasonId: '1', competitionId: '17', rateLimiter: noWait(), fetchImpl: okJson(detail) })
    const d = await provider.getMatchDetail!({ stageId: 's', matchId: 'm' })
    const byOff = Object.fromEntries(d!.substitutions.map((x) => [x.playerOffId, x.minute]))
    expect(byOff.h1).toBe('') // half-time sub stays blank
    expect(byOff.e1).toBe(EXTRA_TIME_BREAK_MINUTE) // after the 70' sub -> extra-time interval
    expect(byOff.a1).toBe(EXTRA_TIME_BREAK_MINUTE) // no prior sub, next is the 100' sub -> extra-time
  })

  it('looks past an adjacent break sub to the nearest timed sub when classifying', async () => {
    const detail = {
      HomeTeam: {
        IdTeam: 't1', TeamName: [{ Locale: 'en', Description: 'France' }], Players: [], Bookings: [],
        Goals: [{ Minute: "100'", IdPlayer: 'g', IdTeam: 't1' }], // extra time was played
        Substitutions: [
          { Minute: '', IdPlayerOff: 'b1', IdPlayerOn: 'b2' }, // break sub; its nearest timed neighbour
          { Minute: '', IdPlayerOff: 'b3', IdPlayerOn: 'b4' }, // is two positions away - the scan must skip this null
          { Minute: "100'", IdPlayerOff: 'b5', IdPlayerOn: 'b6' },
        ],
      },
      AwayTeam: { IdTeam: 't2', TeamName: [{ Locale: 'en', Description: 'Brazil' }], Players: [], Goals: [], Bookings: [], Substitutions: [] },
      Properties: {},
    }
    const provider = fifaProvider({ seasonId: '1', competitionId: '17', rateLimiter: noWait(), fetchImpl: okJson(detail) })
    const d = await provider.getMatchDetail!({ stageId: 's', matchId: 'm' })
    const byOff = Object.fromEntries(d!.substitutions.map((x) => [x.playerOffId, x.minute]))
    // Both break subs resolve to the extra-time interval via the 100' sub two slots over.
    expect(byOff.b1).toBe(EXTRA_TIME_BREAK_MINUTE)
    expect(byOff.b3).toBe(EXTRA_TIME_BREAK_MINUTE)
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
          { IdPlayer: 's1', PlayerName: [{ Locale: 'en', Description: 'William SALIBA' }], JerseyNum: '17', Position: '1', PlayerPicture: { PictureUrl: 'https://digitalhub.fifa.com/transform/g/SALIBA_s1' } },
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
    // PlayerPicture carries the headshot; absent -> null.
    expect(out.squad.find((p) => p.playerId === 's1')?.pictureUrl).toBe('https://digitalhub.fifa.com/transform/g/SALIBA_s1')
    expect(out.squad.find((p) => p.playerId === 's3')?.pictureUrl).toBeNull()
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

describe('normalizeFifaMatchLineups', () => {
  const team = (over = {}) => ({
    IdTeam: 'H',
    Tactics: '4-3-3',
    Coaches: [{ Name: [{ Locale: 'en', Description: 'Rafael marquez' }], Role: 0 }],
    Players: [
      { IdPlayer: 'gk', PlayerName: [{ Locale: 'en', Description: 'KEEPER' }], ShirtNumber: 1, Position: 0, Status: 1, Captain: true, PlayerPicture: { PictureUrl: 'gk.png' } },
      { IdPlayer: 'd1', PlayerName: [{ Locale: 'en', Description: 'BACK' }], ShirtNumber: 4, Position: 1, Status: 1 },
      { IdPlayer: 'm1', PlayerName: [{ Locale: 'en', Description: 'MID' }], ShirtNumber: 8, Position: 2, Status: 1 },
      { IdPlayer: 'f1', PlayerName: [{ Locale: 'en', Description: 'FRONT' }], ShirtNumber: 9, Position: 3, Status: 1 },
      { IdPlayer: 'b1', PlayerName: [{ Locale: 'en', Description: 'SUB' }], ShirtNumber: 12, Position: 0, Status: 2 },
    ],
    ...over,
  })

  it('splits the XI from the bench and reads formation, captain, position and coach', () => {
    const res = normalizeFifaMatchLineups({ HomeTeam: team(), AwayTeam: team() } as never)
    expect(res.available).toBe(true)
    expect(res.home.formation).toBe('4-3-3')
    expect(res.home.coach).toBe('Rafael MARQUEZ')
    expect(res.home.startingXI.map((p) => p.playerId)).toEqual(['gk', 'd1', 'm1', 'f1'])
    expect(res.home.startingXI[0]).toMatchObject({ position: 'GK', captain: true, pictureUrl: 'gk.png', shirtNumber: 1 })
    expect(res.home.bench.map((p) => p.playerId)).toEqual(['b1'])
    expect(res.home.bench[0].captain).toBe(false)
  })

  it('is unavailable until both sides field an XI', () => {
    expect(normalizeFifaMatchLineups({ HomeTeam: team(), AwayTeam: null } as never).available).toBe(false)
    expect(normalizeFifaMatchLineups({} as never).available).toBe(false)
  })

  it('falls back to the first coach and tolerates missing fields', () => {
    const res = normalizeFifaMatchLineups({
      HomeTeam: { Coaches: [{ Alias: [{ Locale: 'en', Description: 'someone else' }] }], Players: [{ IdPlayer: 'x', Status: 1 }] },
      AwayTeam: { Players: [{ IdPlayer: 'y', Status: 1 }] },
    } as never)
    expect(res.home.coach).toBe('someone ELSE')
    expect(res.home.formation).toBeNull()
    expect(res.home.startingXI[0]).toMatchObject({ name: 'Unknown', shirtNumber: null, position: null, pictureUrl: null })
    expect(res.away.coach).toBeNull()
  })

  it('sorts unknown-position and number-less players last', () => {
    const res = normalizeFifaMatchLineups({
      HomeTeam: {
        Players: [
          { IdPlayer: 'a', Position: 3, ShirtNumber: 9, Status: 1 },
          { IdPlayer: 'np', Status: 1 },
          { IdPlayer: 'b1', ShirtNumber: 12, Status: 2 },
          { IdPlayer: 'b2', Status: 2 },
        ],
      },
      AwayTeam: { Players: [{ IdPlayer: 'z', Status: 1 }] },
    } as never)
    expect(res.home.startingXI.map((p) => p.playerId)).toEqual(['a', 'np'])
    expect(res.home.bench.map((p) => p.playerId)).toEqual(['b1', 'b2'])
  })

  it('covers the shirt tie-break, short-name fallback, string captain flag, and id-less filter', () => {
    const res = normalizeFifaMatchLineups({
      HomeTeam: {
        Players: [
          { IdPlayer: 'd-late', PlayerName: [{ Locale: 'en', Description: 'LATE' }], ShirtNumber: 5, Position: 1, Status: 1 },
          { IdPlayer: 'd-early', PlayerName: [{ Locale: 'en', Description: 'EARLY' }], ShirtNumber: 2, Position: 1, Status: 1, Captain: 'True' },
          { IdPlayer: 'sh', ShortName: [{ Locale: 'en', Description: 'SHORTY' }], Position: 2, Status: 1 },
          { Status: 1 }, // no IdPlayer -> filtered out
        ],
      },
      AwayTeam: { Players: [{ IdPlayer: 'z', Status: 1 }] },
    } as never)
    // same-position defenders order by shirt number (2 before 5)
    expect(res.home.startingXI.map((p) => p.playerId)).toEqual(['d-early', 'd-late', 'sh'])
    expect(res.home.startingXI.find((p) => p.playerId === 'd-early')!.captain).toBe(true)
    expect(res.home.startingXI.find((p) => p.playerId === 'sh')!.name).toBe('SHORTY')
    expect(res.home.startingXI).toHaveLength(3)
  })

  it('provider getMatchLineups fetches the detail doc (keyed and bare urls)', async () => {
    const urls: string[] = []
    const fetchImpl = (async (url: string) => {
      urls.push(url)
      return new Response(JSON.stringify({ HomeTeam: team(), AwayTeam: team() }))
    }) as unknown as typeof fetch
    const provider = fifaProvider({ seasonId: '285023', competitionId: '17', rateLimiter: new RateLimiter(0), fetchImpl })
    const keyed = await provider.getMatchLineups!({ stageId: 'st', matchId: 'm1' })
    expect(keyed!.available).toBe(true)
    expect(urls[0]).toContain('/live/football/17/285023/st/m1')
    await provider.getMatchLineups!({ matchId: 'm2' })
    expect(urls[1]).toContain('/live/football/m2')
    // Unplayed match: FIFA answers 200 with a null body -> null, not a crash.
    const provNull = fifaProvider({ seasonId: '285023', competitionId: '17', rateLimiter: new RateLimiter(0), fetchImpl: (async () => new Response('null')) as unknown as typeof fetch })
    expect(await provNull.getMatchLineups!({ matchId: 'pending' })).toBeNull()
  })
})
