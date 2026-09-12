import { describe, it, expect, vi } from 'vitest'
import {
  espnMinute,
  espnProvider,
  mapEspnStage,
  mapEspnStatus,
  normalizeEspnEvent,
  parseEspnGroupName,
  type EspnEvent,
} from './espn'
import { RateLimiter } from './rate-limiter'
import { ProviderRateLimitError, ProviderUpstreamError } from './types'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

function noWait() {
  return new RateLimiter(0, () => 0, async () => {})
}

const finishedGroupMatch: EspnEvent = {
  id: '633843',
  date: '2026-06-11T19:00Z',
  season: { slug: 'group-stage' },
  competitions: [
    {
      date: '2026-06-11T19:00Z',
      status: { period: 2, type: { name: 'STATUS_FULL_TIME', state: 'post', completed: true } },
      competitors: [
        { homeAway: 'home', score: '2', winner: true, team: { id: '203', displayName: 'Mexico', abbreviation: 'MEX', logo: 'mex.png' } },
        { homeAway: 'away', score: '1', winner: false, team: { id: '467', displayName: 'South Africa', abbreviation: 'RSA', logo: 'rsa.png' } },
      ],
      details: [
        { scoringPlay: true, scoreValue: 1, clock: { displayValue: "23'" }, team: { id: '203' } },
        { scoringPlay: true, scoreValue: 1, clock: { displayValue: "67'" }, team: { id: '203' } },
        { scoringPlay: true, scoreValue: 1, clock: { displayValue: "81'" }, team: { id: '467' } },
        { scoringPlay: false, clock: { displayValue: "30'" }, team: { id: '467' } },
      ],
    },
  ],
}

describe('mapEspnStatus', () => {
  it('maps the pre state to SCHEDULED', () => {
    expect(mapEspnStatus({ type: { name: 'STATUS_SCHEDULED', state: 'pre', completed: false } })).toBe('SCHEDULED')
  })

  it('maps a running in state to LIVE', () => {
    expect(mapEspnStatus({ type: { name: 'STATUS_FIRST_HALF', state: 'in' } })).toBe('LIVE')
  })

  it('treats an unknown in-state name as LIVE rather than final', () => {
    expect(mapEspnStatus({ type: { name: 'STATUS_SOMETHING_NEW', state: 'in' } })).toBe('LIVE')
  })

  it.each([
    'STATUS_HALFTIME',
    'STATUS_EXTRA_TIME_HALFTIME',
    'STATUS_END_PERIOD',
    'STATUS_END_OF_PERIOD',
    'STATUS_INTERMISSION',
  ])('maps the stopped-clock name %s to PAUSED', (name) => {
    expect(mapEspnStatus({ type: { name, state: 'in' } })).toBe('PAUSED')
  })

  it.each([
    ['STATUS_FULL_TIME', 'FINISHED'],
    ['STATUS_FINAL_AET', 'FINISHED'],
    ['STATUS_FINAL_PEN', 'FINISHED'],
  ])('maps the completed post name %s to %s', (name, expected) => {
    expect(mapEspnStatus({ type: { name, state: 'post', completed: true } })).toBe(expected)
  })

  it.each([
    ['STATUS_POSTPONED', 'POSTPONED'],
    ['STATUS_CANCELED', 'CANCELLED'],
    ['STATUS_CANCELLED', 'CANCELLED'],
    ['STATUS_ABANDONED', 'CANCELLED'],
    ['STATUS_SUSPENDED', 'SUSPENDED'],
    ['STATUS_FORFEIT', 'AWARDED'],
  ])('does not read the post-state name %s as finished', (name, expected) => {
    expect(mapEspnStatus({ type: { name, state: 'post', completed: false } })).toBe(expected)
  })

  it('falls back to SUSPENDED for an unknown, incomplete post state', () => {
    expect(mapEspnStatus({ type: { name: 'STATUS_MYSTERY', state: 'post', completed: false } })).toBe('SUSPENDED')
  })

  it('falls back to SCHEDULED when the status is missing', () => {
    expect(mapEspnStatus(null)).toBe('SCHEDULED')
    expect(mapEspnStatus({})).toBe('SCHEDULED')
  })
})

describe('mapEspnStage', () => {
  it.each([
    ['group-stage', 'GROUP'],
    ['round-of-32', 'R32'],
    ['round-of-16', 'R16'],
    ['quarterfinals', 'QF'],
    ['semifinals', 'SF'],
    ['3rd-place-match', 'THIRD_PLACE'],
    ['final', 'FINAL'],
  ])('maps the season slug %s to %s', (slug, expected) => {
    expect(mapEspnStage(slug)).toBe(expected)
  })

  it('falls back to GROUP for a league-shaped slug', () => {
    expect(mapEspnStage('2026-27-english-premier-league')).toBe('GROUP')
    expect(mapEspnStage('league-phase')).toBe('GROUP')
    expect(mapEspnStage(null)).toBe('GROUP')
  })
})

describe('parseEspnGroupName', () => {
  it('reads the letter of a real group', () => {
    expect(parseEspnGroupName('Group A')).toBe('A')
    expect(parseEspnGroupName('group l')).toBe('L')
  })

  it('does not read a league name as a group letter', () => {
    expect(parseEspnGroupName('Premier League')).toBeNull()
    expect(parseEspnGroupName('Bundesliga')).toBeNull()
    expect(parseEspnGroupName(null)).toBeNull()
  })
})

describe('espnMinute', () => {
  it('reads the minute, stoppage time included', () => {
    expect(espnMinute("23'")).toBe(23)
    expect(espnMinute("45'+2'")).toBe(45)
    expect(espnMinute("90'+6'")).toBe(90)
  })

  it('returns null when there is no number', () => {
    expect(espnMinute(null)).toBeNull()
    expect(espnMinute("'")).toBeNull()
  })
})

describe('normalizeEspnEvent', () => {
  it('normalizes a finished group match', () => {
    const m = normalizeEspnEvent(finishedGroupMatch)!
    expect(m).toMatchObject({
      providerMatchId: '633843',
      stage: 'GROUP',
      group: null,
      matchday: null,
      status: 'FINISHED',
      winner: 'HOME',
      kickoffTime: '2026-06-11T19:00Z',
    })
    expect(m.homeTeam).toEqual({ name: 'Mexico', code: 'MEX', crest: 'mex.png', providerTeamId: '203' })
    expect(m.awayTeam).toEqual({ name: 'South Africa', code: 'RSA', crest: 'rsa.png', providerTeamId: '467' })
    expect(m.score.fullTime).toEqual({ home: 2, away: 1 })
  })

  it('derives the half-time score from the goal details', () => {
    // 23' home only; the 67'/81' goals and the non-scoring play are excluded.
    expect(normalizeEspnEvent(finishedGroupMatch)!.score.halfTime).toEqual({ home: 1, away: 0 })
  })

  it('attaches the group letter from the standings map', () => {
    const m = normalizeEspnEvent(finishedGroupMatch, new Map([['203', 'A'], ['467', 'A']]))!
    expect(m.group).toBe('A')
  })

  it('nulls the score of a scheduled match instead of writing 0-0', () => {
    const m = normalizeEspnEvent({
      id: '1',
      date: '2026-10-10T11:30Z',
      season: { slug: '2026-27-english-premier-league' },
      competitions: [
        {
          date: '2026-10-10T11:30Z',
          status: { period: 0, type: { name: 'STATUS_SCHEDULED', state: 'pre', completed: false } },
          competitors: [
            { homeAway: 'home', score: '0', winner: false, team: { id: '359', displayName: 'Arsenal', abbreviation: 'ARS' } },
            { homeAway: 'away', score: '0', winner: false, team: { id: '357', displayName: 'Leeds United', abbreviation: 'LEE' } },
          ],
          details: [],
        },
      ],
    })!
    expect(m.status).toBe('SCHEDULED')
    expect(m.score.fullTime).toEqual({ home: null, away: null })
    expect(m.score.halfTime).toBeUndefined()
    expect(m.winner).toBeNull()
  })

  it('reads a shootout as penalties, keeping the 120-minute score as full time', () => {
    const m = normalizeEspnEvent({
      id: '2',
      season: { slug: 'final' },
      competitions: [
        {
          date: '2026-07-19T19:00Z',
          status: { period: 5, type: { name: 'STATUS_FINAL_PEN', state: 'post', completed: true } },
          competitors: [
            { homeAway: 'home', score: '3', winner: true, shootoutScore: 4, team: { id: '202', displayName: 'Argentina', abbreviation: 'ARG' } },
            { homeAway: 'away', score: '3', winner: false, shootoutScore: 2, team: { id: '478', displayName: 'France', abbreviation: 'FRA' } },
          ],
          details: [
            { scoringPlay: true, scoreValue: 1, clock: { displayValue: "23'" }, team: { id: '202' } },
            { scoringPlay: true, scoreValue: 1, clock: { displayValue: "36'" }, team: { id: '202' } },
            { scoringPlay: true, scoreValue: 1, clock: { displayValue: "80'" }, team: { id: '478' } },
            { scoringPlay: true, scoreValue: 1, clock: { displayValue: "81'" }, team: { id: '478' } },
            { scoringPlay: true, scoreValue: 1, clock: { displayValue: "108'" }, team: { id: '202' } },
            { scoringPlay: true, scoreValue: 1, clock: { displayValue: "118'" }, team: { id: '478' } },
            { scoringPlay: true, shootout: true, scoreValue: 1, clock: { displayValue: "120'" }, team: { id: '202' } },
          ],
        },
      ],
    })!
    expect(m.stage).toBe('FINAL')
    expect(m.score.fullTime).toEqual({ home: 3, away: 3 })
    expect(m.score.penalties).toEqual({ home: 4, away: 2 })
    expect(m.score.halfTime).toEqual({ home: 2, away: 0 })
    expect(m.winner).toBe('HOME')
  })

  it('reads a finished level match as a draw', () => {
    const m = normalizeEspnEvent({
      id: '3',
      season: { slug: 'group-stage' },
      competitions: [
        {
          date: '2026-06-12T19:00Z',
          status: { period: 2, type: { name: 'STATUS_FULL_TIME', state: 'post', completed: true } },
          competitors: [
            { homeAway: 'home', score: '1', winner: false, team: { id: '1', displayName: 'A' } },
            { homeAway: 'away', score: '1', winner: false, team: { id: '2', displayName: 'B' } },
          ],
          details: [],
        },
      ],
    })!
    expect(m.winner).toBe('DRAW')
    expect(m.score.halfTime).toEqual({ home: 0, away: 0 })
  })

  it('marks the away side as the winner', () => {
    const m = normalizeEspnEvent({
      id: '4',
      season: { slug: 'semifinals' },
      competitions: [
        {
          date: '2026-07-14T19:00Z',
          status: { period: 2, type: { name: 'STATUS_FULL_TIME', state: 'post', completed: true } },
          competitors: [
            { homeAway: 'home', score: '0', winner: false, team: { id: '1', displayName: 'A' } },
            { homeAway: 'away', score: '2', winner: true, team: { id: '2', displayName: 'B' } },
          ],
        },
      ],
    })!
    expect(m.winner).toBe('AWAY')
    expect(m.stage).toBe('SF')
  })

  it('falls back to competitor order when homeAway is absent', () => {
    const m = normalizeEspnEvent({
      id: '5',
      date: '2026-06-20T19:00Z',
      competitions: [
        {
          status: { type: { name: 'STATUS_FULL_TIME', state: 'post', completed: true } },
          competitors: [
            { score: '1', team: { shortDisplayName: 'First' } },
            { score: '0', team: {} },
          ],
        },
      ],
    })!
    expect(m.homeTeam.name).toBe('First')
    expect(m.awayTeam.name).toBe('TBD')
    expect(m.kickoffTime).toBe('2026-06-20T19:00Z')
  })

  it('leaves half-time unset when the sides cannot be told apart', () => {
    const m = normalizeEspnEvent({
      id: '9',
      season: { slug: 'group-stage' },
      competitions: [
        {
          date: '2026-06-11T19:00Z',
          status: { period: 2, type: { name: 'STATUS_FULL_TIME', state: 'post', completed: true } },
          competitors: [
            { homeAway: 'home', score: '1', team: { displayName: 'A' } },
            { homeAway: 'away', score: '0', team: { displayName: 'B' } },
          ],
          details: [{ scoringPlay: true, clock: { displayValue: "12'" }, team: { id: '1' } }],
        },
      ],
    })!
    expect(m.score.halfTime).toBeUndefined()
  })

  it('counts a goal with no scoreValue as one', () => {
    const m = normalizeEspnEvent({
      id: '10',
      season: { slug: 'group-stage' },
      competitions: [
        {
          date: '2026-06-11T19:00Z',
          status: { period: 2, type: { name: 'STATUS_FULL_TIME', state: 'post', completed: true } },
          competitors: [
            { homeAway: 'home', score: '1', winner: true, team: { id: '1', displayName: 'A' } },
            { homeAway: 'away', score: '0', team: { id: '2', displayName: 'B' } },
          ],
          details: [{ scoringPlay: true, clock: { displayValue: "12'" }, team: { id: '1' } }],
        },
      ],
    })!
    expect(m.score.halfTime).toEqual({ home: 1, away: 0 })
  })

  it.each([
    [3, undefined, { home: 3, away: null }],
    [undefined, 5, { home: null, away: 5 }],
  ])('records a one-sided shootout score (%s-%s)', (homePens, awayPens, expected) => {
    const m = normalizeEspnEvent({
      id: '11',
      season: { slug: 'quarterfinals' },
      competitions: [
        {
          date: '2026-07-10T19:00Z',
          status: { period: 5, type: { name: 'STATUS_FINAL_PEN', state: 'post', completed: true } },
          competitors: [
            { homeAway: 'home', score: '1', winner: true, shootoutScore: homePens, team: { id: '1', displayName: 'A' } },
            { homeAway: 'away', score: '1', shootoutScore: awayPens, team: { id: '2', displayName: 'B' } },
          ],
        },
      ],
    })!
    expect(m.score.penalties).toEqual(expected)
  })

  it('credits a first-half away goal to the away side', () => {
    const m = normalizeEspnEvent({
      id: '12',
      season: { slug: 'group-stage' },
      competitions: [
        {
          date: '2026-06-11T19:00Z',
          status: { period: 2, type: { name: 'STATUS_FULL_TIME', state: 'post', completed: true } },
          competitors: [
            { homeAway: 'home', score: '1', team: { id: '1', displayName: 'A' } },
            { homeAway: 'away', score: '2', winner: true, team: { id: '2', displayName: 'B' } },
          ],
          details: [
            { scoringPlay: true, scoreValue: 1, clock: { displayValue: "10'" }, team: { id: '2' } },
            { scoringPlay: true, scoreValue: 1, clock: { displayValue: "45'+2'" }, team: { id: '1' } },
            { scoringPlay: true, scoreValue: 1, clock: { displayValue: "70'" }, team: { id: '2' } },
          ],
        },
      ],
    })!
    expect(m.score.halfTime).toEqual({ home: 1, away: 1 })
  })

  it('returns null for an event with no usable competition', () => {
    expect(normalizeEspnEvent({ id: '6' })).toBeNull()
    expect(normalizeEspnEvent({ id: '7', competitions: [{ competitors: [{ homeAway: 'home' }] }] })).toBeNull()
  })

  it('tolerates a missing kickoff time and an unparseable score', () => {
    const m = normalizeEspnEvent({
      id: '8',
      competitions: [
        {
          status: { period: 2, type: { name: 'STATUS_FULL_TIME', state: 'post', completed: true } },
          competitors: [
            { homeAway: 'home', score: 'x', team: { id: '1' } },
            { homeAway: 'away', score: '', team: { id: '2' } },
          ],
        },
      ],
    })!
    expect(m.kickoffTime).toBe('')
    expect(m.score.fullTime).toEqual({ home: null, away: null })
  })
})

describe('espnProvider', () => {
  const scoreboard = { events: [finishedGroupMatch] }
  const standings = {
    children: [
      { abbreviation: 'Group A', standings: { entries: [{ team: { id: '203' } }, { team: { id: '467' } }] } },
      { abbreviation: 'Premier League', standings: { entries: [{ team: { id: '999' } }] } },
      { name: 'Group B', standings: { entries: [{ team: { id: '500' } }] } },
      { abbreviation: 'Group C' },
    ],
  }

  function stubFetch(routes: { scoreboard?: unknown; standings?: unknown } = {}) {
    return vi.fn(async (url: string) => {
      if (url.includes('/standings')) return jsonResponse(routes.standings ?? standings)
      return jsonResponse(routes.scoreboard ?? scoreboard)
    }) as unknown as typeof fetch
  }

  it('lists a whole season in one scoreboard call and attaches group letters', async () => {
    const fetchImpl = stubFetch()
    const provider = espnProvider({ league: 'fifa.world', season: '2026', fetchImpl, rateLimiter: noWait() })
    const matches = await provider.listFixtures({ season: '2026' })

    expect(provider.meta.name).toBe('espn')
    expect(matches).toHaveLength(1)
    expect(matches[0].group).toBe('A')

    const urls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string)
    expect(urls[0]).toContain('/soccer/fifa.world/scoreboard?')
    expect(urls[0]).toContain('dates=2026')
    expect(urls[0]).toContain('limit=500')
    expect(urls[1]).toContain('/apis/v2/sports/soccer/fifa.world/standings?season=2026')
  })

  it('sends a user-agent the Akamai filter accepts', async () => {
    const fetchImpl = stubFetch()
    const provider = espnProvider({ league: 'fifa.world', fetchImpl, rateLimiter: noWait() })
    await provider.listFixtures({ season: '2026' })
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>)['user-agent']).toBe('curl/8.0')
  })

  it('prefers the configured season over the requested one', async () => {
    const fetchImpl = stubFetch()
    const provider = espnProvider({ league: 'fifa.world', season: '2022', fetchImpl, rateLimiter: noWait() })
    await provider.listFixtures({ season: '2026' })
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('dates=2022')
  })

  it('omits dates when no season is known', async () => {
    const fetchImpl = stubFetch()
    const provider = espnProvider({ league: 'eng.1', fetchImpl, rateLimiter: noWait() })
    await provider.listFixtures({ season: '' })
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).not.toContain('dates=')
  })

  it('fetches the standings once across calls', async () => {
    const fetchImpl = stubFetch()
    const provider = espnProvider({ league: 'fifa.world', season: '2026', fetchImpl, rateLimiter: noWait() })
    await provider.listFixtures({ season: '2026' })
    await provider.listFixtures({ season: '2026' })
    const standingsCalls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((c) =>
      (c[0] as string).includes('/standings'),
    )
    expect(standingsCalls).toHaveLength(1)
  })

  it('skips the standings call when nothing is at the group stage', async () => {
    const knockoutOnly = { events: [{ ...finishedGroupMatch, season: { slug: 'final' } }] }
    const fetchImpl = stubFetch({ scoreboard: knockoutOnly })
    const provider = espnProvider({ league: 'fifa.world', season: '2026', fetchImpl, rateLimiter: noWait() })
    await provider.listFixtures({ season: '2026' })
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1)
  })

  it('returns matches ungrouped when the standings carry no group letters', async () => {
    const fetchImpl = stubFetch({ standings: { children: [{ abbreviation: 'Premier League' }] } })
    const provider = espnProvider({ league: 'eng.1', fetchImpl, rateLimiter: noWait() })
    const matches = await provider.listFixtures({ season: '2026' })
    expect(matches[0].group).toBeNull()
  })

  it('tolerates an empty standings tree and entries without a team', async () => {
    const fetchImpl = stubFetch({ standings: {} })
    const provider = espnProvider({ league: 'fifa.world', fetchImpl, rateLimiter: noWait() })
    expect((await provider.listFixtures({ season: '2026' }))[0].group).toBeNull()

    const sparse = { children: [{ abbreviation: 'Group A', standings: { entries: [{}, { team: {} }] } }] }
    const other = espnProvider({ league: 'fifa.world', fetchImpl: stubFetch({ standings: sparse }), rateLimiter: noWait() })
    expect((await other.listFixtures({ season: '2026' }))[0].group).toBeNull()
  })

  it('falls back to the requested season when none is configured', async () => {
    const fetchImpl = stubFetch()
    const provider = espnProvider({ league: 'fifa.world', fetchImpl, rateLimiter: noWait() })
    await provider.listFixtures({ season: '2022' })
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('dates=2022')
  })

  it('builds with the global fetch when no implementation is injected', () => {
    expect(espnProvider({ league: 'fifa.world' }).meta).toEqual({ name: 'espn', rateLimitPerMin: 60, dailyCap: null })
  })

  it('keeps the fixtures when the standings call fails', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/standings')) return new Response('boom', { status: 500 })
      return jsonResponse(scoreboard)
    }) as unknown as typeof fetch
    const provider = espnProvider({ league: 'fifa.world', season: '2026', fetchImpl, rateLimiter: noWait() })
    const matches = await provider.listFixtures({ season: '2026' })
    expect(matches).toHaveLength(1)
    expect(matches[0].group).toBeNull()
  })

  it('retries the standings after a failure instead of caching the miss', async () => {
    let standingsCalls = 0
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/standings')) {
        standingsCalls += 1
        if (standingsCalls === 1) return new Response('boom', { status: 500 })
        return jsonResponse(standings)
      }
      return jsonResponse(scoreboard)
    }) as unknown as typeof fetch
    const provider = espnProvider({ league: 'fifa.world', season: '2026', fetchImpl, rateLimiter: noWait() })
    expect((await provider.listFixtures({ season: '2026' }))[0].group).toBeNull()
    expect((await provider.listFixtures({ season: '2026' }))[0].group).toBe('A')
  })

  it('queries a single day in the compact date format', async () => {
    const fetchImpl = stubFetch()
    const provider = espnProvider({ league: 'fifa.world', fetchImpl, rateLimiter: noWait() })
    await provider.getMatchesByDate('2026-06-11')
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('dates=20260611')
  })

  it('keeps only in-play matches for the live poll', async () => {
    const live = {
      events: [
        finishedGroupMatch,
        { ...finishedGroupMatch, id: '10', competitions: [{ ...finishedGroupMatch.competitions![0], status: { period: 1, type: { name: 'STATUS_FIRST_HALF', state: 'in' } } }] },
        { ...finishedGroupMatch, id: '11', competitions: [{ ...finishedGroupMatch.competitions![0], status: { period: 1, type: { name: 'STATUS_HALFTIME', state: 'in' } } }] },
      ],
    }
    const fetchImpl = stubFetch({ scoreboard: live })
    const provider = espnProvider({ league: 'fifa.world', fetchImpl, rateLimiter: noWait() })
    const matches = await provider.getLiveMatches()
    expect(matches.map((m) => m.providerMatchId)).toEqual(['10', '11'])
    // No `dates`: the scoreboard already serves the current day.
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).not.toContain('dates=')
  })

  it('returns an empty array when the payload has no events', async () => {
    const fetchImpl = stubFetch({ scoreboard: {} })
    const provider = espnProvider({ league: 'fifa.world', fetchImpl, rateLimiter: noWait() })
    expect(await provider.listFixtures({ season: '2026' })).toEqual([])
  })

  it('throws ProviderRateLimitError on HTTP 429', async () => {
    const fetchImpl = (async () => new Response('', { status: 429 })) as unknown as typeof fetch
    const provider = espnProvider({ league: 'fifa.world', fetchImpl, rateLimiter: noWait() })
    await expect(provider.listFixtures({ season: '2026' })).rejects.toBeInstanceOf(ProviderRateLimitError)
  })

  it('throws ProviderUpstreamError on other HTTP errors, including the HTML 403', async () => {
    const fetchImpl = (async () => new Response('<TITLE>Access Denied</TITLE>', { status: 403 })) as unknown as typeof fetch
    const provider = espnProvider({ league: 'fifa.world', fetchImpl, rateLimiter: noWait() })
    await expect(provider.listFixtures({ season: '2026' })).rejects.toMatchObject({
      name: 'ProviderUpstreamError',
      status: 403,
    })
  })

  it('uses default endpoints and a default rate limiter when none are supplied', async () => {
    const fetchImpl = stubFetch({ scoreboard: {} })
    const provider = espnProvider({ league: 'fifa.world', fetchImpl })
    expect(await provider.listFixtures({ season: '2026' })).toEqual([])
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain(
      'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?',
    )
  })

  it('honours overridden base urls', async () => {
    const fetchImpl = stubFetch()
    const provider = espnProvider({
      league: 'fifa.world',
      season: '2026',
      baseUrl: 'https://stub/site',
      standingsBaseUrl: 'https://stub/v2',
      fetchImpl,
      rateLimiter: noWait(),
    })
    await provider.listFixtures({ season: '2026' })
    const urls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string)
    expect(urls[0].startsWith('https://stub/site/fifa.world/scoreboard?')).toBe(true)
    expect(urls[1].startsWith('https://stub/v2/fifa.world/standings?')).toBe(true)
  })
})
