import { describe, it, expect } from 'vitest'
import { fifaProvider, normalizeFifaMatch, normalizeFifaMatchDetail, type FifaMatch } from './fifa'
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
        { Type: 1, IdPlayer: 'a1', Minute: "16'", IdAssistPlayer: 'a2', IdTeam: 'A' },
        { Type: 1, IdPlayer: 'a1', Minute: "31'", IdAssistPlayer: null, IdTeam: 'A' },
      ],
    },
  }

  it('maps goals with scorer/assist names and possession', () => {
    const d = normalizeFifaMatchDetail(detail)
    expect(d.possessionHome).toBeCloseTo(47.1)
    expect(d.goals).toHaveLength(2)
    expect(d.goals[0]).toMatchObject({
      side: 'AWAY',
      playerName: 'E. VALENCIA',
      teamCode: 'ECU',
      minute: "16'",
      ownGoal: false,
      assistPlayerName: 'ASSIST GUY',
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
