import { describe, it, expect, vi } from 'vitest'
import {
  espnMinute,
  espnProvider,
  mapEspnStage,
  mapEspnStatus,
  normalizeEspnEvent,
  type EspnCompetitor,
  type EspnDetail,
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

interface EventSpec {
  id: string
  slug?: string
  date?: string
  status?: { period?: number; name: string; state: string; completed?: boolean }
  home?: Partial<EspnCompetitor> & { id?: string; name?: string }
  away?: Partial<EspnCompetitor> & { id?: string; name?: string }
  details?: EspnDetail[]
}

function event(spec: EventSpec): EspnEvent {
  const { period, name, state, completed } = spec.status ?? {
    period: 2,
    name: 'STATUS_FULL_TIME',
    state: 'post',
    completed: true,
  }
  const side = (s: EventSpec['home'], fallbackId: string, homeAway: string): EspnCompetitor => {
    const id = s?.id ?? fallbackId
    return {
      homeAway,
      score: s?.score ?? '0',
      winner: s?.winner,
      shootoutScore: s?.shootoutScore,
      team: { id, displayName: s?.name ?? 'Team ' + id, abbreviation: 'T' + id },
    }
  }
  return {
    id: spec.id,
    date: spec.date ?? '2026-06-11T19:00Z',
    season: { slug: spec.slug ?? 'group-stage' },
    competitions: [
      {
        date: spec.date ?? '2026-06-11T19:00Z',
        status: { period, type: { name, state, completed } },
        competitors: [side(spec.home, '1', 'home'), side(spec.away, '2', 'away')],
        details: spec.details ?? [],
      },
    ],
  }
}

function goal(minute: string, team: string, extra: Partial<EspnDetail> = {}): EspnDetail {
  return { scoringPlay: true, scoreValue: 1, clock: { displayValue: minute }, team: { id: team }, ...extra }
}

const finishedGroupMatch: EspnEvent = event({
  id: '633843',
  home: { id: '203', name: 'Mexico', score: '2', winner: true },
  away: { id: '467', name: 'South Africa', score: '1' },
  details: [goal("23'", '203'), goal("67'", '203'), goal("81'", '467'), { scoringPlay: false, team: { id: '467' } }],
})

describe('mapEspnStatus', () => {
  it('maps the pre state to SCHEDULED', () => {
    expect(mapEspnStatus({ type: { name: 'STATUS_SCHEDULED', state: 'pre', completed: false } })).toBe('SCHEDULED')
  })

  it('maps a running in state to LIVE, including an unknown name', () => {
    expect(mapEspnStatus({ type: { name: 'STATUS_FIRST_HALF', state: 'in' } })).toBe('LIVE')
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

  it.each(['STATUS_FULL_TIME', 'STATUS_FINAL_AET', 'STATUS_FINAL_PEN'])(
    'maps the completed post name %s to FINISHED',
    (name) => {
      expect(mapEspnStatus({ type: { name, state: 'post', completed: true } })).toBe('FINISHED')
    },
  )

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

  it.each(['constructor', 'toString', 'valueOf', '__proto__'])(
    'does not resolve the prototype member %s to a status',
    (name) => {
      expect(mapEspnStatus({ type: { name, state: 'post', completed: true } })).toBe('FINISHED')
    },
  )

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

describe('espnMinute', () => {
  it('reads the leading minute, stoppage time included', () => {
    expect(espnMinute("23'")).toBe(23)
    expect(espnMinute("45'+2'")).toBe(45)
    expect(espnMinute("90'+6'")).toBe(90)
  })

  it('refuses a clock that does not start with the minute', () => {
    expect(espnMinute(null)).toBeNull()
    expect(espnMinute("'")).toBeNull()
    expect(espnMinute("ET 105'")).toBeNull()
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
    expect(m.homeTeam).toEqual({ name: 'Mexico', code: 'T203', crest: null, providerTeamId: '203' })
    expect(m.score.fullTime).toEqual({ home: 2, away: 1 })
    expect(m.score.halfTime).toEqual({ home: 1, away: 0 })
    // No shootout: the penalties key must be absent, not a zero pair.
    expect(m.score.penalties).toBeUndefined()
    expect(m.score.extraTime).toBeUndefined()
  })

  it('attaches the group letter only to group-stage matches', () => {
    const groups = new Map([['203', 'A'], ['467', 'A']])
    expect(normalizeEspnEvent(finishedGroupMatch, groups)!.group).toBe('A')

    // The same teams meet again in the knockouts; stamping "Group A" there would
    // pull a Round of 16 result into the group table.
    const knockout = { ...finishedGroupMatch, id: '9', season: { slug: 'round-of-16' } }
    expect(normalizeEspnEvent(knockout, groups)!.group).toBeNull()
  })

  it('nulls the score of a scheduled match instead of writing 0-0', () => {
    const m = normalizeEspnEvent(
      event({ id: '1', status: { period: 0, name: 'STATUS_SCHEDULED', state: 'pre', completed: false } }),
    )!
    expect(m.status).toBe('SCHEDULED')
    expect(m.score.fullTime).toEqual({ home: null, away: null })
    expect(m.score.halfTime).toBeUndefined()
    expect(m.winner).toBeNull()
  })

  it.each([
    ['STATUS_POSTPONED', 'POSTPONED'],
    ['STATUS_ABANDONED', 'CANCELLED'],
    ['STATUS_FORFEIT', 'AWARDED'],
  ])('nulls the placeholder score of a %s match', (name, expected) => {
    const m = normalizeEspnEvent(
      event({ id: '2', status: { period: 0, name, state: 'post', completed: false } }),
    )!
    expect(m.status).toBe(expected)
    expect(m.score.fullTime).toEqual({ home: null, away: null })
  })

  it('reads a shootout as penalties, keeping the 120-minute score as full time', () => {
    const m = normalizeEspnEvent(
      event({
        id: '3',
        slug: 'final',
        status: { period: 5, name: 'STATUS_FINAL_PEN', state: 'post', completed: true },
        home: { id: '202', name: 'Argentina', score: '3', winner: true, shootoutScore: 4 },
        away: { id: '478', name: 'France', score: '3', shootoutScore: 2 },
        details: [
          goal("23'", '202'),
          goal("36'", '202'),
          goal("80'", '478'),
          goal("108'", '202'),
          goal("120'", '202', { shootout: true }),
        ],
      }),
    )!
    expect(m.stage).toBe('FINAL')
    expect(m.score.fullTime).toEqual({ home: 3, away: 3 })
    expect(m.score.penalties).toEqual({ home: 4, away: 2 })
    expect(m.score.halfTime).toEqual({ home: 2, away: 0 })
    expect(m.winner).toBe('HOME')
  })

  it('ignores a 0-0 shootoutScore rather than marking a normal match as decided on penalties', () => {
    const m = normalizeEspnEvent(
      event({
        id: '4',
        home: { score: '2', winner: true, shootoutScore: 0 },
        away: { score: '1', shootoutScore: 0 },
      }),
    )!
    expect(m.score.penalties).toBeUndefined()
  })

  it('records a one-sided shootout score', () => {
    const m = normalizeEspnEvent(
      event({
        id: '5',
        slug: 'quarterfinals',
        status: { period: 5, name: 'STATUS_FINAL_PEN', state: 'post', completed: true },
        home: { score: '1', winner: true, shootoutScore: 3 },
        away: { score: '1', shootoutScore: 0 },
      }),
    )!
    expect(m.score.penalties).toEqual({ home: 3, away: 0 })
  })

  it('reads a finished level match as a draw', () => {
    const m = normalizeEspnEvent(event({ id: '6', home: { score: '1' }, away: { score: '1' } }))!
    expect(m.winner).toBe('DRAW')
  })

  it('does not call a decided match a draw when ESPN omits the winner flag', () => {
    const m = normalizeEspnEvent(event({ id: '7', home: { score: '2' }, away: { score: '1' } }))!
    expect(m.winner).toBeNull()
  })

  it('marks the away side as the winner', () => {
    const m = normalizeEspnEvent(
      event({ id: '8', slug: 'semifinals', home: { score: '0' }, away: { score: '2', winner: true } }),
    )!
    expect(m.winner).toBe('AWAY')
    expect(m.stage).toBe('SF')
  })

  describe('half time', () => {
    it('is left unset when ESPN publishes no play-by-play', () => {
      const m = normalizeEspnEvent(event({ id: '10', home: { score: '3' }, away: { score: '1' }, details: [] }))!
      expect(m.status).toBe('FINISHED')
      expect(m.score.halfTime).toBeUndefined()
    })

    it('is derived for a live match already past the break', () => {
      const m = normalizeEspnEvent(
        event({
          id: '11',
          status: { period: 2, name: 'STATUS_SECOND_HALF', state: 'in' },
          home: { score: '2' },
          away: { score: '1' },
          details: [goal("10'", '1'), goal("44'", '2'), goal("70'", '1')],
        }),
      )!
      expect(m.status).toBe('LIVE')
      expect(m.score.halfTime).toEqual({ home: 1, away: 1 })
    })

    it('is left unset during the first half', () => {
      const m = normalizeEspnEvent(
        event({
          id: '12',
          status: { period: 1, name: 'STATUS_FIRST_HALF', state: 'in' },
          home: { score: '1' },
          details: [goal("10'", '1')],
        }),
      )!
      expect(m.score.halfTime).toBeUndefined()
    })

    it('counts a goal with no scoreValue as one, and credits each side correctly', () => {
      const m = normalizeEspnEvent(
        event({
          id: '13',
          home: { score: '1' },
          away: { score: '2', winner: true },
          details: [
            { scoringPlay: true, clock: { displayValue: "10'" }, team: { id: '2' } },
            goal("45'+2'", '1'),
            goal("70'", '2'),
          ],
        }),
      )!
      expect(m.score.halfTime).toEqual({ home: 1, away: 1 })
    })

    it('declines to answer when a goal cannot be placed on either side', () => {
      const teamless = normalizeEspnEvent(
        event({ id: '14', home: { score: '1' }, details: [{ scoringPlay: true, clock: { displayValue: "10'" } }] }),
      )!
      expect(teamless.score.halfTime).toBeUndefined()

      const unknownTeam = normalizeEspnEvent(event({ id: '15', home: { score: '1' }, details: [goal("10'", '999')] }))!
      expect(unknownTeam.score.halfTime).toBeUndefined()

      const noMinute = normalizeEspnEvent(
        event({ id: '16', home: { score: '1' }, details: [{ scoringPlay: true, team: { id: '1' } }] }),
      )!
      expect(noMinute.score.halfTime).toBeUndefined()
    })

    it('matches a numeric team id against a string one', () => {
      const m = normalizeEspnEvent(
        event({ id: '17', home: { score: '1' }, details: [{ ...goal("10'", '1'), team: { id: 1 } }] }),
      )!
      expect(m.score.halfTime).toEqual({ home: 1, away: 0 })
    })

    it('is left unset when a side carries no team id', () => {
      const e = event({ id: '18', home: { score: '1' }, details: [goal("10'", '1')] })
      e.competitions![0].competitors![0].team = { displayName: 'A' }
      expect(normalizeEspnEvent(e)!.score.halfTime).toBeUndefined()
    })
  })

  describe('rejected events', () => {
    it('returns null with no usable competition', () => {
      expect(normalizeEspnEvent({ id: '20' })).toBeNull()
      expect(normalizeEspnEvent({ id: '21', competitions: [{ competitors: [{ homeAway: 'home' }] }] })).toBeNull()
    })

    it('returns null when the event carries no kickoff time', () => {
      const e = event({ id: '22' })
      e.date = null
      e.competitions![0].date = null
      expect(normalizeEspnEvent(e)).toBeNull()
    })

    it('prefers the event date when the competition date is blank', () => {
      const e = event({ id: '23' })
      e.competitions![0].date = ''
      e.date = '2026-06-20T19:00Z'
      expect(normalizeEspnEvent(e)!.kickoffTime).toBe('2026-06-20T19:00Z')
    })

    it('returns null rather than mirroring a half-labelled payload', () => {
      const e = event({ id: '24' })
      e.competitions![0].competitors![0].homeAway = 'away'
      e.competitions![0].competitors![1].homeAway = 'away'
      expect(normalizeEspnEvent(e)).toBeNull()
    })

    it('falls back to competitor order only when neither side is labelled', () => {
      const e = event({ id: '25' })
      delete e.competitions![0].competitors![0].homeAway
      delete e.competitions![0].competitors![1].homeAway
      const m = normalizeEspnEvent(e)!
      expect(m.homeTeam.providerTeamId).toBe('1')
      expect(m.awayTeam.providerTeamId).toBe('2')
    })
  })

  it('falls back to the short name, then TBD, treating blanks as absent', () => {
    const e = event({ id: '26' })
    e.competitions![0].competitors![0].team = { displayName: '', shortDisplayName: 'Short', abbreviation: '' }
    e.competitions![0].competitors![1].team = {}
    const m = normalizeEspnEvent(e)!
    expect(m.homeTeam).toMatchObject({ name: 'Short', code: null })
    expect(m.awayTeam).toMatchObject({ name: 'TBD', code: null, providerTeamId: null })
  })

  it.each(['x', '2-1', '  ', '2.5'])('reads the unusable score %s as unknown', (score) => {
    const m = normalizeEspnEvent(event({ id: '27', home: { score }, away: { score } }))!
    expect(m.score.fullTime).toEqual({ home: null, away: null })
  })
})

describe('espnProvider', () => {
  const groupEvents = [
    finishedGroupMatch,
    event({ id: 'g2', date: '2026-06-12T19:00Z', home: { id: '449' }, away: { id: '654' } }),
    event({ id: 'g3', date: '2026-06-17T19:00Z', home: { id: '203' }, away: { id: '449' } }),
    event({ id: 'g4', date: '2026-06-18T19:00Z', home: { id: '467' }, away: { id: '654' } }),
  ]
  const scoreboard = { events: groupEvents }
  const standings = {
    children: [
      {
        abbreviation: 'Group A',
        standings: { entries: [{ team: { id: '203' } }, { team: { id: '467' } }, { team: { id: 449 } }, { team: { id: '654' } }] },
      },
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

  const urlsOf = (fetchImpl: typeof fetch) =>
    (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string)

  it('lists a whole season in one scoreboard call and attaches group letters', async () => {
    const fetchImpl = stubFetch()
    const provider = espnProvider({ league: 'fifa.world', season: '2026', fetchImpl, rateLimiter: noWait() })
    const matches = await provider.listFixtures({ season: '2026' })

    expect(provider.meta.name).toBe('espn')
    expect(matches).toHaveLength(4)
    expect(matches.every((m) => m.group === 'A')).toBe(true)

    const urls = urlsOf(fetchImpl)
    expect(urls[0]).toContain('/soccer/fifa.world/scoreboard?')
    expect(urls[0]).toContain('dates=2026')
    expect(urls[0]).toContain('limit=500')
    expect(urls[1]).toContain('/apis/v2/sports/soccer/fifa.world/standings?season=2026')
  })

  it('derives a group matchday so the round lookup can place the match', async () => {
    const provider = espnProvider({ league: 'fifa.world', season: '2026', fetchImpl: stubFetch(), rateLimiter: noWait() })
    const matches = await provider.listFixtures({ season: '2026' })
    // Four group-A fixtures ordered by kickoff, two per matchday.
    expect(matches.map((m) => [m.providerMatchId, m.matchday])).toEqual([
      ['633843', 1],
      ['g2', 1],
      ['g3', 2],
      ['g4', 2],
    ])
  })

  it('leaves a knockout matchday null', async () => {
    const knockout = { events: [{ ...finishedGroupMatch, id: 'ko', season: { slug: 'final' } }] }
    const fetchImpl = stubFetch({ scoreboard: knockout })
    const provider = espnProvider({ league: 'fifa.world', season: '2026', fetchImpl, rateLimiter: noWait() })
    const matches = await provider.listFixtures({ season: '2026' })
    expect(matches[0]).toMatchObject({ stage: 'FINAL', matchday: null, group: null })
    // Nothing is at the group stage, so the standings are never fetched.
    expect(urlsOf(fetchImpl)).toHaveLength(1)
  })

  it('sends a user-agent the Akamai filter accepts, and a timeout', async () => {
    const fetchImpl = stubFetch()
    const provider = espnProvider({ league: 'fifa.world', fetchImpl, rateLimiter: noWait() })
    await provider.listFixtures({ season: '2026' })
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>)['user-agent']).toBe('curl/8.0')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('encodes the league so a stored value cannot escape the path', async () => {
    const fetchImpl = stubFetch({ scoreboard: {} })
    const provider = espnProvider({ league: '../../evil?x=1', fetchImpl, rateLimiter: noWait() })
    await provider.listFixtures({ season: '2026' })
    expect(urlsOf(fetchImpl)[0]).toContain('/soccer/..%2F..%2Fevil%3Fx%3D1/scoreboard?')
  })

  it.each([
    ['2022', '2026', 'dates=2022'],
    [null, '2026', 'dates=2026'],
    ['', '2026', 'dates=2026'],
  ])('resolves the season from the config %s and the request %s', async (configured, requested, expected) => {
    const fetchImpl = stubFetch({ scoreboard: {} })
    const provider = espnProvider({ league: 'fifa.world', season: configured, fetchImpl, rateLimiter: noWait() })
    await provider.listFixtures({ season: requested })
    expect(urlsOf(fetchImpl)[0]).toContain(expected)
  })

  it('omits dates when no season is known at all', async () => {
    const fetchImpl = stubFetch({ scoreboard: {} })
    const provider = espnProvider({ league: 'eng.1', fetchImpl, rateLimiter: noWait() })
    await provider.listFixtures({ season: '' })
    expect(urlsOf(fetchImpl)[0]).not.toContain('dates=')
  })

  it('asks the standings for the same season as the scoreboard', async () => {
    const fetchImpl = stubFetch()
    const provider = espnProvider({ league: 'fifa.world', fetchImpl, rateLimiter: noWait() })
    await provider.listFixtures({ season: '2022' })
    const urls = urlsOf(fetchImpl)
    expect(urls[0]).toContain('dates=2022')
    expect(urls[1]).toContain('standings?season=2022')
  })

  it('fetches the standings once across calls', async () => {
    const fetchImpl = stubFetch()
    const provider = espnProvider({ league: 'fifa.world', season: '2026', fetchImpl, rateLimiter: noWait() })
    await provider.listFixtures({ season: '2026' })
    await provider.listFixtures({ season: '2026' })
    expect(urlsOf(fetchImpl).filter((u) => u.includes('/standings'))).toHaveLength(1)
  })

  it('fails the run rather than blanking stored group letters when the standings are unavailable', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/standings')) return new Response('boom', { status: 500 })
      return jsonResponse(scoreboard)
    }) as unknown as typeof fetch
    const provider = espnProvider({ league: 'fifa.world', season: '2026', fetchImpl, rateLimiter: noWait() })
    await expect(provider.listFixtures({ season: '2026' })).rejects.toBeInstanceOf(ProviderUpstreamError)
  })

  it.each([
    ['a failure', () => new Response('boom', { status: 500 })],
    ['an empty tree', () => jsonResponse({})],
  ])('retries the standings after %s instead of caching the miss', async (_label, firstReply) => {
    let standingsCalls = 0
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('/standings')) {
        standingsCalls += 1
        return standingsCalls === 1 ? firstReply() : jsonResponse(standings)
      }
      return jsonResponse(scoreboard)
    }) as unknown as typeof fetch
    const provider = espnProvider({ league: 'fifa.world', season: '2026', fetchImpl, rateLimiter: noWait() })
    await provider.listFixtures({ season: '2026' }).catch(() => [])
    expect((await provider.listFixtures({ season: '2026' }))[0].group).toBe('A')
    expect(standingsCalls).toBe(2)
  })

  it('leaves a league ungrouped when the standings carry no group letters', async () => {
    const fetchImpl = stubFetch({ standings: { children: [{ abbreviation: 'Premier League' }] } })
    const provider = espnProvider({ league: 'eng.1', fetchImpl, rateLimiter: noWait() })
    const matches = await provider.listFixtures({ season: '2026' })
    expect(matches[0].group).toBeNull()
    expect(matches[0].matchday).toBeNull()
  })

  it('ignores a standings entry with no team id', async () => {
    const sparse = { children: [{ abbreviation: 'Group A', standings: { entries: [{}, { team: {} }] } }] }
    const provider = espnProvider({ league: 'fifa.world', fetchImpl: stubFetch({ standings: sparse }), rateLimiter: noWait() })
    expect((await provider.listFixtures({ season: '2026' }))[0].group).toBeNull()
  })

  it('filters a single day out of the season, tolerating a full timestamp', async () => {
    const fetchImpl = stubFetch()
    const provider = espnProvider({ league: 'fifa.world', season: '2026', fetchImpl, rateLimiter: noWait() })
    expect((await provider.getMatchesByDate('2026-06-12')).map((m) => m.providerMatchId)).toEqual(['g2'])
    expect((await provider.getMatchesByDate('2026-06-17T19:00Z')).map((m) => m.providerMatchId)).toEqual(['g3'])
  })

  it('keeps in-play matches and the ones that just finished', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-11T21:00Z'))
    try {
      const live = {
        events: [
          // Finished within the 4h window: carries the final whistle.
          finishedGroupMatch,
          // Finished long ago: already settled, no need to re-poll.
          event({ id: 'old', date: '2026-06-01T19:00Z' }),
          event({ id: 'in', status: { period: 1, name: 'STATUS_FIRST_HALF', state: 'in' } }),
          event({ id: 'ht', status: { period: 1, name: 'STATUS_HALFTIME', state: 'in' } }),
          event({ id: 'sched', status: { period: 0, name: 'STATUS_SCHEDULED', state: 'pre', completed: false } }),
        ],
      }
      const provider = espnProvider({
        league: 'fifa.world',
        season: '2026',
        fetchImpl: stubFetch({ scoreboard: live }),
        rateLimiter: noWait(),
      })
      const matches = await provider.getLiveMatches()
      expect(matches.map((m) => m.providerMatchId).sort()).toEqual(['633843', 'ht', 'in'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns an empty array when the payload has no events', async () => {
    const provider = espnProvider({ league: 'fifa.world', fetchImpl: stubFetch({ scoreboard: {} }), rateLimiter: noWait() })
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
    expect(urlsOf(fetchImpl)[0]).toContain('https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?')
  })

  it('builds with the global fetch when no implementation is injected', () => {
    expect(espnProvider({ league: 'fifa.world' }).meta).toEqual({ name: 'espn', rateLimitPerMin: 60, dailyCap: null })
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
    const urls = urlsOf(fetchImpl)
    expect(urls[0].startsWith('https://stub/site/fifa.world/scoreboard?')).toBe(true)
    expect(urls[1].startsWith('https://stub/v2/fifa.world/standings?')).toBe(true)
  })
})
