import { describe, it, expect } from 'vitest'
import { mapUefaStage, mapUefaStatus, normalizeUefaMatch, uefaProvider, type UefaMatch } from './uefa'
import { RateLimiter } from './rate-limiter'

const baseMatch = (over: Partial<UefaMatch> = {}): UefaMatch => ({
  id: 'm1',
  status: 'FINISHED',
  kickOffTime: { dateTime: '2024-07-14T19:00:00Z' },
  homeTeam: { id: '122', internationalName: 'Spain', countryCode: 'ESP', bigLogoUrl: 'esp.png' },
  awayTeam: { id: '39', internationalName: 'England', countryCode: 'ENG', bigLogoUrl: 'eng.png' },
  score: { total: { home: 2, away: 1 } },
  round: { id: 'r1', metaData: { name: 'Final' } },
  matchday: { name: 'MD7', phase: 'TOURNAMENT' },
  winner: { match: { team: { id: '122' } } },
  ...over,
})

describe('uefa mapping', () => {
  it('maps statuses and stages ("Final tournament" is the group stage)', () => {
    expect(mapUefaStatus('FINISHED')).toBe('FINISHED')
    expect(mapUefaStatus('LIVE')).toBe('LIVE')
    expect(mapUefaStatus('HALF_TIME_BREAK')).toBe('PAUSED')
    expect(mapUefaStatus('UPCOMING')).toBe('SCHEDULED')
    expect(mapUefaStage('Final tournament')).toBe('GROUP')
    expect(mapUefaStage('Final')).toBe('FINAL')
    expect(mapUefaStage('Round of 16')).toBe('R16')
    expect(mapUefaStage('Round of 32')).toBe('R32')
    expect(mapUefaStage('Quarter-finals')).toBe('QF')
    expect(mapUefaStage('Semi-finals')).toBe('SF')
    expect(mapUefaStage('Third place')).toBe('THIRD_PLACE')
    expect(mapUefaStage(undefined)).toBe('GROUP')
  })

  it('normalizes the final: total score, winner, no pens object without a shootout', () => {
    const n = normalizeUefaMatch(baseMatch())
    expect(n).toMatchObject({
      providerMatchId: 'm1',
      stage: 'FINAL',
      group: null,
      matchday: null,
      status: 'FINISHED',
      winner: 'HOME',
      kickoffTime: '2024-07-14T19:00:00Z',
    })
    expect(n.homeTeam).toMatchObject({ name: 'Spain', code: 'ESP', providerTeamId: '122' })
    expect(n.score.fullTime).toEqual({ home: 2, away: 1 })
    expect(n.score.penalties).toBeUndefined()
  })

  it('keeps real shootouts, parses group letters and matchdays, detects draws and away winners', () => {
    const pens = normalizeUefaMatch(baseMatch({
      score: { total: { home: 0, away: 0 }, penalty: { home: 3, away: 0 } },
      winner: { match: { team: { id: '39' } } },
      round: { id: 'r2', metaData: { name: 'Round of 16' } },
    }))
    expect(pens.score.penalties).toEqual({ home: 3, away: 0 })
    expect(pens.winner).toBe('AWAY')

    const grp = normalizeUefaMatch(baseMatch({
      round: { id: 'r3', metaData: { name: 'Final tournament' } },
      group: { metaData: { groupName: 'Group F' } },
      matchday: { name: 'MD3', phase: 'TOURNAMENT' },
      score: { total: { home: 1, away: 1 }, penalty: { home: 0, away: 0 } },
      winner: null,
    }))
    expect(grp).toMatchObject({ stage: 'GROUP', group: 'F', matchday: 3, winner: 'DRAW' })
    expect(grp.score.penalties).toBeUndefined() // 0-0 pens artifact suppressed at the source

    const tbd = normalizeUefaMatch(baseMatch({ homeTeam: null, score: null, winner: null, kickOffTime: null }))
    expect(tbd.homeTeam.name).toBe('TBD')
    expect(tbd.winner).toBeNull()
  })
})

describe('uefaProvider', () => {
  const noWait = () => new RateLimiter(0)

  it('pages through results and filters out qualifying play-offs', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) =>
      baseMatch({ id: `t${i}`, matchday: { name: 'MD1', phase: i % 2 ? 'TOURNAMENT' : 'QUALIFYING' } }))
    const page2 = [baseMatch({ id: 'last' })]
    const pages = [page1, page2]
    const urls: string[] = []
    const fetchImpl = (async (url: string) => {
      urls.push(String(url))
      return new Response(JSON.stringify(pages.shift() ?? []), { status: 200 })
    }) as unknown as typeof fetch
    const provider = uefaProvider({ seasonYear: '2024', rateLimiter: noWait(), fetchImpl })
    const fixtures = await provider.listFixtures({ season: '2024' })
    expect(fixtures).toHaveLength(51) // 50 tournament-phase from page1 + 1 from page2
    expect(urls[0]).toContain('competitionId=3')
    expect(urls[1]).toContain('offset=100')
  })

  it('getMatchesByDate and getLiveMatches filter the fixture list', async () => {
    const data = [
      baseMatch({ id: 'a', status: 'LIVE', kickOffTime: { dateTime: '2024-06-20T19:00:00Z' } }),
      baseMatch({ id: 'b', status: 'FINISHED' }),
    ]
    const fetchImpl = (async () => new Response(JSON.stringify(data), { status: 200 })) as unknown as typeof fetch
    const provider = uefaProvider({ seasonYear: '2024', rateLimiter: noWait(), fetchImpl })
    expect(await provider.getMatchesByDate('2024-06-20')).toHaveLength(1)
    expect((await provider.getLiveMatches()).map((m) => m.providerMatchId)).toEqual(['a'])
  })

  it('surfaces rate limits and upstream errors', async () => {
    const limited = uefaProvider({ seasonYear: '2024', rateLimiter: noWait(), fetchImpl: (async () => new Response('', { status: 429 })) as unknown as typeof fetch })
    await expect(limited.listFixtures({ season: '2024' })).rejects.toThrow()
    const broken = uefaProvider({ seasonYear: '2024', rateLimiter: noWait(), fetchImpl: (async () => new Response('x', { status: 500 })) as unknown as typeof fetch })
    await expect(broken.listFixtures({ season: '2024' })).rejects.toThrow()
  })
})

describe('uefa edge branches', () => {
  it('pens with one null side, malformed group name, winner id matching nobody', () => {
    const n = normalizeUefaMatch(baseMatch({
      score: { total: { home: 1, away: 0 }, penalty: { home: 4, away: null } },
      group: { metaData: { groupName: 'Mystery Zone 9' } },
      round: { id: 'rX', metaData: { name: 'Final tournament' } },
      matchday: { name: 'weird', phase: 'TOURNAMENT' },
      winner: { match: { team: { id: 'nobody' } } },
    }))
    expect(n.score.penalties).toEqual({ home: 4, away: null })
    expect(n.group).toBeNull() // no trailing letter
    expect(n.matchday).toBeNull() // unparsable MD name
    expect(n.winner).toBeNull() // unknown winner id, not a draw
  })

  it('explicit baseUrl and competitionId are honored', async () => {
    let url = ''
    const fetchImpl = (async (u: string) => {
      url = String(u)
      return new Response('[]', { status: 200 })
    }) as unknown as typeof fetch
    const provider = uefaProvider({ seasonYear: '2024', competitionId: '99', baseUrl: 'https://example.test', rateLimiter: new RateLimiter(0), fetchImpl })
    await provider.listFixtures({ season: '2024' })
    expect(url).toContain('https://example.test')
    expect(url).toContain('competitionId=99')
  })
})

it('covers null-side pens, missing matchday/round objects', () => {
  const n = normalizeUefaMatch(baseMatch({
    score: { total: { home: 0, away: 0 }, penalty: { home: null, away: 5 } },
    matchday: null,
    round: null,
    winner: null,
  }))
  expect(n.score.penalties).toEqual({ home: null, away: 5 })
  expect(n.providerStageId).toBeNull()
  expect(n.stage).toBe('GROUP')
  expect(n.winner).toBe('DRAW')
})

import { aggregateUefaEvents, eventMinute, mapUefaPosition, type UefaEvent } from './uefa'

const actor = (teamId: string, personId: string, name: string) => ({
  person: { id: personId, internationalName: name },
  team: { id: teamId },
})

const EVENTS: UefaEvent[] = [
  { type: 'GOAL', phase: 'FIRST_HALF', time: { minute: 23 }, primaryActor: actor('1', 'p1', 'Striker'), secondaryActor: { person: { id: 'p2', internationalName: 'Passer' } } },
  { type: 'OWN_GOAL', phase: 'SECOND_HALF', time: { minute: 55 }, primaryActor: actor('2', 'p9', 'Unlucky') },
  { type: 'GOAL', phase: 'PENALTY_SHOOTOUT', time: { minute: 120 }, primaryActor: actor('1', 'p1', 'Striker') },
  { type: 'YELLOW_CARD', phase: 'FIRST_HALF', time: { minute: 30 }, primaryActor: actor('2', 'p7', 'Hacker') },
  { type: 'YELLOW_CARD', phase: 'SECOND_HALF', time: { minute: 78, injuryMinute: undefined }, primaryActor: actor('2', 'p7', 'Hacker') },
  { type: 'RED_CARD', phase: 'SECOND_HALF', time: { minute: 90, injuryMinute: 2 }, primaryActor: actor('1', 'p4', 'Villain') },
  { type: 'SHOT_ON_GOAL', primaryActor: actor('1', 'p1', 'Striker') },
  { type: 'SHOT_WIDE', primaryActor: actor('1', 'p1', 'Striker') },
  { type: 'CORNER', primaryActor: actor('2', 'p8', 'Winger') },
  { type: 'FOUL', primaryActor: actor('2', 'p7', 'Hacker') },
  { type: 'OFFSIDE', primaryActor: actor('1', 'p1', 'Striker') },
  { type: 'SAVE', primaryActor: { team: { id: null } } },
]

const FULL_MATCH = {
  id: '900',
  status: 'FINISHED',
  kickOffTime: { dateTime: '2024-06-20T19:00:00Z' },
  homeTeam: { id: '1', internationalName: 'Alpha', countryCode: 'ALP' },
  awayTeam: { id: '2', internationalName: 'Beta', countryCode: 'BET' },
  score: { total: { home: 2, away: 0 } },
  round: { id: 'r', metaData: { name: 'Final tournament' } },
  matchday: { name: 'MD1', phase: 'TOURNAMENT' },
  matchAttendance: 51000,
  stadium: { translations: { name: { EN: 'Big Arena' } } },
}

function detailFetch(matchDoc: unknown, events: unknown) {
  return (async (url: string) => {
    if (String(url).includes('/events')) {
      if (events instanceof Error) return new Response('boom', { status: 500 })
      return new Response(JSON.stringify(events), { status: 200 })
    }
    return new Response(JSON.stringify(matchDoc), { status: 200 })
  }) as unknown as typeof fetch
}

describe('uefa match detail', () => {
  const noWait = () => new RateLimiter(0)

  it('builds goals (own-goal flip, shootout excluded), bookings (second yellow), cards, venue', async () => {
    const provider = uefaProvider({ seasonYear: '2024', rateLimiter: noWait(), fetchImpl: detailFetch(FULL_MATCH, EVENTS) })
    const d = await provider.getMatchDetail!({ matchId: '900' })
    expect(d).not.toBeNull()
    expect(d!.attendance).toBe(51000)
    expect(d!.stadium).toBe('Big Arena')
    expect(d!.ifesId).toBe('900')
    expect(d!.homeTeamId).toBe('1')
    expect(d!.goals).toHaveLength(2) // shootout goal excluded
    expect(d!.goals[0]).toMatchObject({ side: 'HOME', playerName: 'Striker', minute: "23'", assistPlayerName: 'Passer', ownGoal: false })
    expect(d!.goals[1]).toMatchObject({ side: 'HOME', teamName: 'Alpha', playerName: 'Unlucky', ownGoal: true }) // away player's own goal credits home
    expect(d!.bookings.map((b) => b.card)).toEqual(['YELLOW', 'SECOND_YELLOW', 'RED'])
    expect(d!.bookings[2].minute).toBe("90'+2")
    expect(d!.cards).toEqual({ home: { yellow: 0, red: 1 }, away: { yellow: 2, red: 1 } })
  })

  it('returns null on a null match doc and tolerates a failing events feed', async () => {
    const nullDoc = uefaProvider({ seasonYear: '2024', rateLimiter: noWait(), fetchImpl: detailFetch(null, []) })
    expect(await nullDoc.getMatchDetail!({ matchId: 'x' })).toBeNull()
    const noEvents = uefaProvider({ seasonYear: '2024', rateLimiter: noWait(), fetchImpl: detailFetch(FULL_MATCH, new Error('down')) })
    const d = await noEvents.getMatchDetail!({ matchId: '900' })
    expect(d!.goals).toEqual([])
    expect(d!.attendance).toBe(51000)
  })

  it('getMatchStats aggregates events per team id', async () => {
    const provider = uefaProvider({ seasonYear: '2024', rateLimiter: noWait(), fetchImpl: detailFetch(FULL_MATCH, EVENTS) })
    const stats = await provider.getMatchStats!({ ifesId: '900' })
    expect(stats!['1']).toMatchObject({ attempts: 3, onTarget: 2, offsides: 1, redCards: 1, yellowCards: 0 })
    expect(stats!['2']).toMatchObject({ attempts: 1, corners: 1, fouls: 1, yellowCards: 2 })
    const nullStats = uefaProvider({ seasonYear: '2024', rateLimiter: noWait(), fetchImpl: detailFetch(null, []) })
    expect(await nullStats.getMatchStats!({ ifesId: 'x' })).toBeNull()
  })

  it('eventMinute and position mapping edges', () => {
    expect(eventMinute({ time: null })).toBeNull()
    expect(eventMinute({ time: { minute: 45, injuryMinute: 3 } })).toBe("45'+3")
    expect(mapUefaPosition('GOALKEEPER')).toBe('GK')
    expect(mapUefaPosition('DEFENDER')).toBe('DF')
    expect(mapUefaPosition('MIDFIELDER')).toBe('MF')
    expect(mapUefaPosition('FORWARD')).toBe('FW')
    expect(mapUefaPosition('COACH')).toBeNull()
    expect(aggregateUefaEvents([], null).attempts).toBe(0)
  })
})

describe('uefa rankings + team tournament', () => {
  const noWait = () => new RateLimiter(0)

  const RANKING = [
    { player: { internationalName: 'Dani Olmo' }, team: { countryCode: 'ESP', internationalName: 'Spain' }, statistics: [{ name: 'goals', value: '3' }, { name: 'assists', value: '2' }] },
    { player: null, team: null, statistics: [{ name: 'goals', value: 'NaNish' }] },
  ]
  const TEAM_RANKING = [
    {
      team: { countryCode: 'ESP', internationalName: 'Spain' },
      statistics: [
        { name: 'goals', value: '15' }, { name: 'goals_conceded', value: '4' }, { name: 'attempts', value: '123' },
        { name: 'attempts_on_target', value: '42' }, { name: 'passes_attempted', value: '4088' }, { name: 'passes_completed', value: '3698' },
        { name: 'ball_possession', value: '58.15' }, { name: 'corners', value: '44' }, { name: 'offsides', value: '11' },
        { name: 'yellow_cards', value: '16' }, { name: 'red_cards', value: '1' },
      ],
    },
  ]
  const PLAYERS_P1 = Array.from({ length: 200 }, (_, i) => ({
    id: `pl${i}`,
    internationalName: i < 2 ? `Esp Player ${i}` : `Other ${i}`,
    countryCode: i < 2 ? 'ESP' : 'OTH',
    nationalFieldPosition: i === 0 ? 'GOALKEEPER' : 'FORWARD',
    nationalJerseyNumber: i === 0 ? '1' : '',
  }))
  const PLAYERS_P2 = [{ id: 'last', internationalName: 'Esp Last', countryCode: 'ESP', fieldPosition: 'MIDFIELDER', nationalJerseyNumber: '6' }]

  function rosterFetch(teamRankingFails = false) {
    return (async (url: string) => {
      const u = String(url)
      if (u.includes('player-ranking')) return new Response(JSON.stringify(RANKING), { status: 200 })
      if (u.includes('team-ranking')) return new Response(teamRankingFails ? 'down' : JSON.stringify(TEAM_RANKING), { status: teamRankingFails ? 500 : 200 })
      if (u.includes('/v2/players')) {
        const offset = Number(/offset=(\d+)/.exec(u)?.[1] ?? 0)
        return new Response(JSON.stringify(offset === 0 ? PLAYERS_P1 : PLAYERS_P2), { status: 200 })
      }
      return new Response('[]', { status: 200 })
    }) as unknown as typeof fetch
  }

  it('maps the scorer ranking for both getTopScorers and getPlayerStats', async () => {
    const provider = uefaProvider({ seasonYear: '2024', rateLimiter: noWait(), fetchImpl: rosterFetch() })
    const scorers = await provider.getTopScorers!({ season: '2024' })
    expect(scorers[0]).toMatchObject({ playerName: 'Dani Olmo', teamCode: 'ESP', goals: 3, assists: 2 })
    expect(scorers[1]).toMatchObject({ playerName: '?', teamCode: null, goals: 0, assists: null })
    expect(await provider.getPlayerStats!({ teamId: '' })).toHaveLength(2)
  })

  it('pages the squad, filters by team, maps positions/jerseys and season stats', async () => {
    const provider = uefaProvider({ seasonYear: '2024', rateLimiter: noWait(), fetchImpl: rosterFetch() })
    const t = await provider.getTeamTournament!({ teamRef: 'ESP', matches: [] })
    expect(t.squad).toHaveLength(3) // 2 from page 1 + 1 from page 2
    expect(t.squad[0]).toMatchObject({ position: 'GK', shirtNumber: 1 })
    expect(t.squad[1].shirtNumber).toBeNull() // empty jersey string
    expect(t.squad[2]).toMatchObject({ position: 'MF', shirtNumber: 6 })
    expect(t.coach).toBeNull()
    expect(t.stats).toMatchObject({ goals: 15, conceded: 4, possession: 58.15, passes: 4088, passAccuracy: 90.5, yellowCards: 16, redCards: 1, assists: null, crosses: null })
  })

  it('squad survives a failing team-ranking; unknown team yields null stats', async () => {
    const failing = uefaProvider({ seasonYear: '2024', rateLimiter: noWait(), fetchImpl: rosterFetch(true) })
    const t = await failing.getTeamTournament!({ teamRef: 'ESP', matches: [] })
    expect(t.squad.length).toBeGreaterThan(0)
    expect(t.stats).toBeNull()
    const ok = uefaProvider({ seasonYear: '2024', rateLimiter: noWait(), fetchImpl: rosterFetch() })
    const none = await ok.getTeamTournament!({ teamRef: 'XXX', matches: [] })
    expect(none.stats).toBeNull()
  })
})

describe('uefa edge coverage', () => {
  const noWait = () => new RateLimiter(0)

  it('anonymous actors, away events, missing venue fields, away own-goal flip', async () => {
    const SPARSE_MATCH = {
      id: '901',
      status: 'FINISHED',
      kickOffTime: { dateTime: '2024-06-21T19:00:00Z' },
      homeTeam: { id: '1', internationalName: 'Alpha', countryCode: 'ALP' },
      awayTeam: { id: '2', internationalName: 'Beta', countryCode: 'BET' },
      score: { total: { home: 0, away: 2 } },
      round: { id: 'r', metaData: { name: 'Final tournament' } },
      matchday: { name: 'MD2', phase: 'TOURNAMENT' },
    }
    const SPARSE_EVENTS: UefaEvent[] = [
      { type: 'GOAL', time: { minute: 10 }, primaryActor: { team: { id: '2' } } }, // away goal, anonymous scorer
      { type: 'OWN_GOAL', time: { minute: 20 }, primaryActor: { person: { id: 'h1', internationalName: 'Home Back' }, team: { id: '1' } } }, // home own goal credits away
      { type: 'GOAL', time: { minute: 30 }, primaryActor: { team: { id: 'ghost' } } }, // unknown team dropped
      { type: 'YELLOW_CARD', time: {}, primaryActor: { team: { id: '2' } } }, // no player id, no minute
      { type: 'YELLOW_CARD', time: { minute: 80 }, primaryActor: { team: { id: '2' } } }, // still YELLOW (no id to pair)
      { type: 'RED_CARD', time: { minute: 85 }, primaryActor: { team: { id: 'ghost' } } }, // unknown side dropped
    ]
    const provider = uefaProvider({ seasonYear: '2024', rateLimiter: noWait(), fetchImpl: detailFetch(SPARSE_MATCH, SPARSE_EVENTS) })
    const d = await provider.getMatchDetail!({ matchId: '901' })
    expect(d!.attendance).toBeNull()
    expect(d!.stadium).toBeNull()
    expect(d!.goals).toHaveLength(2)
    expect(d!.goals[0]).toMatchObject({ side: 'AWAY', playerName: '?', minute: "10'" })
    expect(d!.goals[1]).toMatchObject({ side: 'AWAY', teamName: 'Beta', ownGoal: true, playerName: 'Home Back' })
    expect(d!.bookings.map((b) => [b.side, b.card, b.minute])).toEqual([
      ['AWAY', 'YELLOW', null],
      ['AWAY', 'YELLOW', "80'"],
    ])
  })

  it('getJson error paths surface through detail calls', async () => {
    const limited = uefaProvider({ seasonYear: '2024', rateLimiter: noWait(), fetchImpl: (async () => new Response('', { status: 429 })) as unknown as typeof fetch })
    await expect(limited.getMatchDetail!({ matchId: 'x' })).rejects.toThrow()
    const broken = uefaProvider({ seasonYear: '2024', rateLimiter: noWait(), fetchImpl: (async () => new Response('x', { status: 500 })) as unknown as typeof fetch })
    await expect(broken.getTopScorers!({ season: '2024' })).rejects.toThrow()
  })

  it('season stats degrade per missing values', async () => {
    const RANKED = [{ team: { countryCode: 'ESP' }, statistics: [{ name: 'goals', value: '15' }, { name: 'passes_attempted', value: '' }, { name: 'ball_possession', value: 'not-a-number' }] }]
    const fetchImpl = (async (url: string) => {
      const u = String(url)
      if (u.includes('team-ranking')) return new Response(JSON.stringify(RANKED), { status: 200 })
      return new Response('[]', { status: 200 })
    }) as unknown as typeof fetch
    const provider = uefaProvider({ seasonYear: '2024', rateLimiter: noWait(), fetchImpl })
    const t = await provider.getTeamTournament!({ teamRef: 'ESP', matches: [] })
    expect(t.stats).toMatchObject({ goals: 15, passes: null, passAccuracy: null, possession: null, conceded: null })
    expect(t.squad).toEqual([])
  })

  it('detail without team ids drops sideless events but keeps the document', async () => {
    const NO_TEAMS = { ...FULL_MATCH, id: '902', homeTeam: null, awayTeam: null }
    const provider = uefaProvider({ seasonYear: '2024', rateLimiter: noWait(), fetchImpl: detailFetch(NO_TEAMS, EVENTS) })
    const d = await provider.getMatchDetail!({ matchId: '902' })
    expect(d!.goals).toEqual([])
    expect(d!.bookings).toEqual([])
    expect(d!.homeTeamId).toBeNull()
    const stats = await provider.getMatchStats!({ ifesId: '902' })
    expect(stats).toEqual({})
  })
})

it('final coverage tails: actorless events, missing away team, bare ranking and player rows', async () => {
  const HALF_MATCH = {
    id: '903', status: 'FINISHED', kickOffTime: { dateTime: '2024-06-22T19:00:00Z' },
    homeTeam: { id: '1', internationalName: 'Alpha', countryCode: 'ALP' }, awayTeam: null,
    score: { total: { home: 0, away: 1 } }, round: { id: 'r', metaData: { name: 'Final tournament' } },
    matchday: { name: 'MD3', phase: 'TOURNAMENT' },
  }
  const EVS: UefaEvent[] = [
    { type: 'GOAL', time: { minute: 5 } }, // no actor at all
    { type: 'OWN_GOAL', time: { minute: 9 }, primaryActor: { person: { id: 'h', internationalName: 'Home Back' }, team: { id: '1' } } }, // credits the missing away side
  ]
  const provider = uefaProvider({ seasonYear: '2024', rateLimiter: new RateLimiter(0), fetchImpl: detailFetch(HALF_MATCH, EVS) })
  const d = await provider.getMatchDetail!({ matchId: '903' })
  expect(d!.goals).toHaveLength(1)
  expect(d!.goals[0]).toMatchObject({ side: 'AWAY', teamId: null, teamName: '?', teamCode: null, ownGoal: true })

  const fetchImpl = (async (url: string) => {
    const u = String(url)
    if (u.includes('team-ranking')) return new Response(JSON.stringify([{ team: { countryCode: 'ESP' } }]), { status: 200 })
    if (u.includes('/v2/players')) return new Response(JSON.stringify([{ countryCode: 'ESP' }]), { status: 200 })
    return new Response('[]', { status: 200 })
  }) as unknown as typeof fetch
  const bare = uefaProvider({ seasonYear: '2024', rateLimiter: new RateLimiter(0), fetchImpl })
  const t = await bare.getTeamTournament!({ teamRef: 'ESP', matches: [] })
  expect(t.squad[0]).toMatchObject({ playerId: '', name: '?', shirtNumber: null, position: null })
  expect(t.stats).toMatchObject({ goals: null, passes: null })
})
