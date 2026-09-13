import { describe, expect, it, vi } from 'vitest'
import {
  mapWorldRugbyStage,
  mapWorldRugbyStatus,
  normalizeWorldRugbyMatch,
  parseWorldRugbyGroup,
  worldRugbyProvider,
  worldRugbyMinute,
  isTryEvent,
  mapWorldRugbyTimelineKind,
  type WrMatch,
} from './worldrugby'
import { ProviderRateLimitError, ProviderUpstreamError } from './types'
import { RateLimiter } from './rate-limiter'

const poolMatch: WrMatch = {
  matchId: '28766',
  description: 'Match 1',
  eventPhase: 'Pool A',
  eventPhaseId: { type: 'Pool', subType: 'A' },
  time: { millis: 1694200500000, label: '2023-09-08' },
  status: 'C',
  teams: [
    { id: '42', name: 'France', abbreviation: 'FRA' },
    { id: '37', name: 'New Zealand', abbreviation: 'NZL' },
  ],
  scores: [27, 13],
}

function stub(responses: Record<string, unknown>, status = 200) {
  const calls: string[] = []
  const impl = vi.fn(async (url: string | URL) => {
    const href = String(url)
    calls.push(href)
    const key = Object.keys(responses).find((k) => href.includes(k))
    if (!key) return new Response('not stubbed', { status: 404 })
    return new Response(JSON.stringify(responses[key]), { status, headers: { 'content-type': 'application/json' } })
  })
  return { impl: impl as unknown as typeof fetch, calls }
}

// A limiter that never actually waits, so the suite does not pay the real
// inter-request delay.
const nowait = () => new RateLimiter(0)

describe('mapWorldRugbyStatus', () => {
  it('maps the codes the live feed actually emits', () => {
    expect(mapWorldRugbyStatus('C')).toBe('FINISHED')
    expect(mapWorldRugbyStatus('U')).toBe('SCHEDULED')
    expect(mapWorldRugbyStatus('L')).toBe('LIVE')
    expect(mapWorldRugbyStatus('HT')).toBe('PAUSED')
    expect(mapWorldRugbyStatus('c')).toBe('FINISHED')
  })

  it('treats an unknown or missing code as scheduled, never finished', () => {
    // An unrecognised code reading as FINISHED would settle predictions on a
    // match that has not been played.
    expect(mapWorldRugbyStatus('WAT')).toBe('SCHEDULED')
    expect(mapWorldRugbyStatus(null)).toBe('SCHEDULED')
    expect(mapWorldRugbyStatus(undefined)).toBe('SCHEDULED')
  })
})

describe('mapWorldRugbyStage', () => {
  it('uses the typed phase when the feed provides one', () => {
    expect(mapWorldRugbyStage({ type: 'Pool', subType: 'A' }, 'Pool A')).toBe('GROUP')
    expect(mapWorldRugbyStage({ type: 'Quarter', subType: 'Final' }, 'Quarter-final 1')).toBe('QF')
    expect(mapWorldRugbyStage({ type: 'Semi', subType: 'Final' }, 'Semi-final 2')).toBe('SF')
    expect(mapWorldRugbyStage({ type: 'Final', subType: 'Final' }, 'Final')).toBe('FINAL')
  })

  it('separates the bronze final from the final', () => {
    expect(mapWorldRugbyStage({ type: 'Final', subType: 'Bronze' }, 'Bronze Final')).toBe('THIRD_PLACE')
  })

  it('falls back to the label for the 2027 round of 16, which carries no typed phase', () => {
    expect(mapWorldRugbyStage(null, 'Round of 16 (1)')).toBe('R16')
    expect(mapWorldRugbyStage({ type: null, subType: null }, 'Round of 32 (3)')).toBe('R32')
    expect(mapWorldRugbyStage(null, 'Bronze Final')).toBe('THIRD_PLACE')
    expect(mapWorldRugbyStage(null, 'Quarter-final 4')).toBe('QF')
    expect(mapWorldRugbyStage(null, 'Semi-final 1')).toBe('SF')
    expect(mapWorldRugbyStage(null, 'Final')).toBe('FINAL')
    expect(mapWorldRugbyStage(null, 'Pool C')).toBe('GROUP')
  })

  it('does not treat a placing match as the final', () => {
    // World Rugby's age-grade and sevens events carry "5th Place Final" and the
    // like; a second FINAL would be taken for the real one by the bracket and
    // by the final-counts-double rule.
    expect(mapWorldRugbyStage(null, '5th Place Final')).not.toBe('FINAL')
    expect(mapWorldRugbyStage(null, '7th Place Final')).not.toBe('FINAL')
    expect(mapWorldRugbyStage(null, 'Final')).toBe('FINAL')
  })

  it('defaults to the group stage when nothing identifies the phase', () => {
    expect(mapWorldRugbyStage(null, null)).toBe('GROUP')
  })
})

describe('parseWorldRugbyGroup', () => {
  it('reads the pool letter from the typed sub-phase', () => {
    expect(parseWorldRugbyGroup({ type: 'Pool', subType: 'A' }, 'Pool A')).toBe('A')
    expect(parseWorldRugbyGroup({ type: 'Pool', subType: 'f' }, 'Pool F')).toBe('F')
  })

  it('falls back to the label, because a null group drops the fixture at insert', () => {
    expect(parseWorldRugbyGroup(null, 'Pool D')).toBe('D')
    expect(parseWorldRugbyGroup({ type: 'Pool', subType: 'Group 1' }, 'Group B')).toBe('B')
  })

  it('is null for a phase that is not a pool', () => {
    expect(parseWorldRugbyGroup({ type: 'Semi', subType: 'Final' }, 'Semi-final 1')).toBeNull()
    expect(parseWorldRugbyGroup(null, null)).toBeNull()
  })
})

describe('normalizeWorldRugbyMatch', () => {
  it('normalizes a finished pool match', () => {
    const m = normalizeWorldRugbyMatch(poolMatch)
    expect(m).toMatchObject({
      providerMatchId: '28766',
      stage: 'GROUP',
      group: 'A',
      status: 'FINISHED',
      winner: 'HOME',
    })
    expect(m.homeTeam).toMatchObject({ name: 'France', code: 'FRA' })
    expect(m.awayTeam).toMatchObject({ name: 'New Zealand', code: 'NZL' })
    expect(m.score.fullTime).toEqual({ home: 27, away: 13 })
    // The feed's millis are absolute; the label and gmtOffset beside them are
    // local-time decoration and must not be used to shift it.
    expect(m.kickoffTime).toBe('2023-09-08T19:15:00.000Z')
  })

  it('does not read an unplayed match as a goalless draw', () => {
    // The feed sends [0, 0] for everything unplayed; taken at face value that
    // is a settled 0-0 with a DRAW winner.
    const m = normalizeWorldRugbyMatch({ ...poolMatch, status: 'U', scores: [0, 0] })
    expect(m.status).toBe('SCHEDULED')
    expect(m.score.fullTime).toEqual({ home: null, away: null })
    expect(m.winner).toBeNull()
  })

  it('carries a live score but no winner yet', () => {
    const m = normalizeWorldRugbyMatch({ ...poolMatch, status: 'L', scores: [7, 3] })
    expect(m.status).toBe('LIVE')
    expect(m.score.fullTime).toEqual({ home: 7, away: 3 })
    expect(m.winner).toBeNull()
  })

  it('reports a drawn and an away result', () => {
    expect(normalizeWorldRugbyMatch({ ...poolMatch, scores: [13, 13] }).winner).toBe('DRAW')
    expect(normalizeWorldRugbyMatch({ ...poolMatch, scores: [3, 13] }).winner).toBe('AWAY')
  })

  it('keeps a knockout placeholder tie rather than dropping it', () => {
    // The 2027 round of 16 ships with "Pool C Runner-Up" placeholders months
    // before the draw resolves them.
    const m = normalizeWorldRugbyMatch({
      matchId: '99',
      eventPhase: 'Round of 16 (1)',
      eventPhaseId: null,
      status: 'U',
      time: { millis: 1824000000000 },
      teams: [{ name: 'Pool C Runner-Up' }, { name: 'Pool F Runner-Up' }],
      scores: [0, 0],
    })
    expect(m.stage).toBe('R16')
    expect(m.group).toBeNull()
    expect(m.homeTeam).toMatchObject({ name: 'Pool C Runner-Up', code: null })
  })

  it('falls back to TBD when the feed has no team yet', () => {
    const m = normalizeWorldRugbyMatch({ matchId: '1', status: 'U', teams: [], scores: [0, 0] })
    expect(m.homeTeam.name).toBe('TBD')
    expect(m.awayTeam.name).toBe('TBD')
  })

  it('survives a match with no teams array at all', () => {
    const m = normalizeWorldRugbyMatch({ matchId: '1', status: 'U' })
    expect(m.homeTeam.name).toBe('TBD')
    expect(m.score.fullTime).toEqual({ home: null, away: null })
  })

  it('declares no winner for a finished match the feed gave no score', () => {
    const m = normalizeWorldRugbyMatch({ ...poolMatch, status: 'C', scores: [] })
    expect(m.status).toBe('FINISHED')
    expect(m.winner).toBeNull()
  })
})

describe('worldRugbyProvider', () => {
  const schedule = { matches: [poolMatch, { ...poolMatch, matchId: '28767', status: 'L', scores: [5, 0] }] }

  it('lists a tournament from its single schedule document', async () => {
    const { impl, calls } = stub({ '/schedule': schedule })
    const p = worldRugbyProvider({ eventId: '1893', fetchImpl: impl, rateLimiter: nowait() })
    const fixtures = await p.listFixtures({ season: 'ignored' })
    expect(fixtures).toHaveLength(2)
    expect(calls[0]).toContain('/rugby/v3/event/1893/schedule')
  })

  it('accepts the uuid event ids the feed uses from 2025 on', async () => {
    const { impl, calls } = stub({ '/schedule': schedule })
    const id = '14bc12d5-59bd-4c9e-b1cf-653ce66b72b7'
    const p = worldRugbyProvider({ eventId: id, fetchImpl: impl, rateLimiter: nowait() })
    await p.listFixtures({ season: '2027' })
    expect(calls[0]).toContain(`/event/${id}/schedule`)
  })

  it('escapes the event id into the path', async () => {
    const { impl, calls } = stub({ '/schedule': schedule })
    const p = worldRugbyProvider({ eventId: '../../evil?x=1', fetchImpl: impl, rateLimiter: nowait() })
    await p.listFixtures({ season: '2027' }).catch(() => {})
    expect(calls[0]).not.toContain('/evil?x=1')
    expect(calls[0]).toContain('..%2F..%2Fevil%3Fx%3D1')
  })

  it('returns only in-play matches as live', async () => {
    const { impl } = stub({ '/schedule': schedule })
    const p = worldRugbyProvider({ eventId: '1893', fetchImpl: impl, rateLimiter: nowait() })
    const live = await p.getLiveMatches()
    expect(live.map((m) => m.providerMatchId)).toEqual(['28767'])
  })

  it('queries a single day through the date-window endpoint', async () => {
    const { impl, calls } = stub({ '/match?': { content: [poolMatch] } })
    const p = worldRugbyProvider({ eventId: '1893', fetchImpl: impl, rateLimiter: nowait() })
    const matches = await p.getMatchesByDate('2023-09-08')
    expect(matches).toHaveLength(1)
    expect(calls[0]).toContain('startDate=2023-09-08&endDate=2023-09-08')
  })

  it('builds a bracket from the knockout half of the schedule', async () => {
    const ko = {
      matches: [
        poolMatch,
        { ...poolMatch, matchId: '1', eventPhaseId: { type: 'Semi', subType: 'Final' }, eventPhase: 'Semi-final 1' },
        { ...poolMatch, matchId: '2', eventPhaseId: { type: 'Semi', subType: 'Final' }, eventPhase: 'Semi-final 2' },
        { ...poolMatch, matchId: '3', eventPhaseId: { type: 'Final', subType: 'Bronze' }, eventPhase: 'Bronze Final' },
        { ...poolMatch, matchId: '4', eventPhaseId: { type: 'Final', subType: 'Final' }, eventPhase: 'Final' },
      ],
    }
    const { impl } = stub({ '/schedule': ko })
    const p = worldRugbyProvider({ eventId: '1893', fetchImpl: impl, rateLimiter: nowait() })
    const bracket = await p.getBracket!()
    expect(bracket).not.toBeNull()
    // Semi-finals then the final, and the pool match left out. The bronze final
    // is deliberately not a bracket round - KNOCKOUT_ORDER omits THIRD_PLACE,
    // and the UI renders it beside the final instead.
    expect(bracket!.rounds.map((r) => r.name)).toEqual(['Semi-finals', 'Final'])
    expect(bracket!.rounds.map((r) => r.matches.length)).toEqual([2, 1])
  })

  it('has no bracket before any knockout tie exists', async () => {
    const { impl } = stub({ '/schedule': { matches: [poolMatch] } })
    const p = worldRugbyProvider({ eventId: '1893', fetchImpl: impl, rateLimiter: nowait() })
    expect(await p.getBracket!()).toBeNull()
  })

  describe('discoverCompetitions', () => {
    const page = (entries: unknown[], numPages = 1) => ({ content: entries, pageInfo: { numPages } })

    it('lists the catalog filtered to the provider sport', async () => {
      const { impl } = stub({
        '/event?': page([
          { id: 'a', label: "Men's Rugby World Cup 2027", sport: 'mru', start: { label: '2027-10-01' } },
          { id: 'b', label: '2027 Womens Six Nations', sport: 'wru', start: { label: '2027-04-10' } },
        ]),
      })
      const p = worldRugbyProvider({ eventId: 'x', sport: 'mru', fetchImpl: impl, rateLimiter: nowait() })
      const found = await p.discoverCompetitions!()
      expect(found).toEqual([
        {
          externalCompetitionId: 'a',
          name: "Men's Rugby World Cup 2027",
          seasonHint: '2027',
          isTournament: null,
        },
      ])
    })

    it('never claims a shape - the dry-run probe decides that', async () => {
      const { impl } = stub({ '/event?': page([{ id: 'a', label: 'Anything', sport: 'mru' }]) })
      const p = worldRugbyProvider({ eventId: 'x', fetchImpl: impl, rateLimiter: nowait() })
      const [first] = await p.discoverCompetitions!()
      expect(first!.isTournament).toBeNull()
      expect(first!.seasonHint).toBeNull()
    })

    it('stops at the last page instead of walking the whole archive', async () => {
      const { impl, calls } = stub({ '/event?': page([{ id: 'a', label: 'One', sport: 'mru' }], 1) })
      const p = worldRugbyProvider({ eventId: 'x', fetchImpl: impl, rateLimiter: nowait() })
      await p.discoverCompetitions!()
      expect(calls).toHaveLength(1)
    })

    it('stops on an empty page', async () => {
      const { impl, calls } = stub({ '/event?': page([], 99) })
      const p = worldRugbyProvider({ eventId: 'x', fetchImpl: impl, rateLimiter: nowait() })
      expect(await p.discoverCompetitions!()).toEqual([])
      expect(calls).toHaveLength(1)
    })

    it('stops on a catalog page carrying neither content nor paging', async () => {
      const { impl, calls } = stub({ '/event?': {} })
      const p = worldRugbyProvider({ eventId: 'x', fetchImpl: impl, rateLimiter: nowait() })
      expect(await p.discoverCompetitions!()).toEqual([])
      expect(calls).toHaveLength(1)
    })

    it('keeps an event the feed left untagged', async () => {
      const { impl } = stub({ '/event?': page([{ id: 'a', label: 'Untagged' }]) })
      const p = worldRugbyProvider({ eventId: 'x', sport: 'mru', fetchImpl: impl, rateLimiter: nowait() })
      expect(await p.discoverCompetitions!()).toHaveLength(1)
    })
  })

  it('surfaces a rate limit as the shared error type', async () => {
    const { impl } = stub({ '/schedule': {} }, 429)
    const p = worldRugbyProvider({ eventId: '1893', fetchImpl: impl, rateLimiter: nowait() })
    await expect(p.listFixtures({ season: '2027' })).rejects.toBeInstanceOf(ProviderRateLimitError)
  })

  it('surfaces an upstream failure with its status', async () => {
    const { impl } = stub({ '/schedule': {} }, 503)
    const p = worldRugbyProvider({ eventId: '1893', fetchImpl: impl, rateLimiter: nowait() })
    await expect(p.listFixtures({ season: '2027' })).rejects.toBeInstanceOf(ProviderUpstreamError)
  })

  it('tolerates a schedule document with no matches array', async () => {
    const { impl } = stub({ '/schedule': {} })
    const p = worldRugbyProvider({ eventId: '1893', fetchImpl: impl, rateLimiter: nowait() })
    expect(await p.listFixtures({ season: '2027' })).toEqual([])
  })

  it('tolerates a date window with no content array', async () => {
    const { impl } = stub({ '/match?': {} })
    const p = worldRugbyProvider({ eventId: '1893', fetchImpl: impl, rateLimiter: nowait() })
    expect(await p.getMatchesByDate('2027-10-01')).toEqual([])
  })

  it('defaults to the real base url and the mens union feed', async () => {
    const { impl, calls } = stub({ '/event?': { content: [{ id: 'a', label: 'X', sport: 'wru' }], pageInfo: { numPages: 1 } } })
    const p = worldRugbyProvider({ eventId: '1893', fetchImpl: impl })
    // No sport given, so the womens entry is filtered out by the mru default.
    expect(await p.discoverCompetitions!()).toEqual([])
    expect(calls[0]).toContain('https://api.wr-rims-prod.pulselive.com/rugby/v3/event?')
  })

  it('treats an explicit null sport as the mens union default, not as unfiltered', async () => {
    const { impl } = stub({
      '/event?': {
        content: [
          { id: 'a', label: 'Mens', sport: 'mru' },
          { id: 'b', label: 'Womens', sport: 'wru' },
        ],
        pageInfo: { numPages: 1 },
      },
    })
    const p = worldRugbyProvider({ eventId: 'x', sport: null, fetchImpl: impl, rateLimiter: nowait() })
    expect((await p.discoverCompetitions!()).map((c) => c.externalCompetitionId)).toEqual(['a'])
  })

  it('walks past the first page of the catalog', async () => {
    let page = 0
    const impl = vi.fn(async () => {
      const body = { content: [{ id: `p${page}`, label: `Event ${page}`, sport: 'mru' }], pageInfo: { numPages: 3 } }
      page += 1
      return new Response(JSON.stringify(body), { status: 200 })
    }) as unknown as typeof fetch
    const p = worldRugbyProvider({ eventId: 'x', fetchImpl: impl, rateLimiter: nowait() })
    const found = await p.discoverCompetitions!()
    expect(found.map((c) => c.externalCompetitionId)).toEqual(['p0', 'p1', 'p2'])
  })

  it('stops at the hard page cap rather than walking the whole archive', async () => {
    // The catalog is ~2400 events deep; an admin picking a season to run should
    // never pay for all of it.
    const impl = vi.fn(
      async () =>
        new Response(JSON.stringify({ content: [{ id: 'x', label: 'E', sport: 'mru' }], pageInfo: { numPages: 99 } }), {
          status: 200,
        }),
    ) as unknown as typeof fetch
    const p = worldRugbyProvider({ eventId: 'x', fetchImpl: impl, rateLimiter: nowait() })
    expect(await p.discoverCompetitions!()).toHaveLength(5)
  })

  it('names an unlabelled event by its id', async () => {
    const { impl } = stub({ '/event?': { content: [{ id: 'bare', sport: 'mru' }], pageInfo: { numPages: 1 } } })
    const p = worldRugbyProvider({ eventId: 'x', fetchImpl: impl, rateLimiter: nowait() })
    expect((await p.discoverCompetitions!())[0]!.name).toBe('bare')
  })
})

describe('team codes', () => {
  it('falls back to the country code when the feed omits the abbreviation', () => {
    const m = normalizeWorldRugbyMatch({
      ...poolMatch,
      teams: [{ name: 'France', countryCode: 'FRA' }, { name: 'New Zealand', abbreviation: 'NZL' }],
    })
    expect(m.homeTeam.code).toBe('FRA')
    expect(m.awayTeam.code).toBe('NZL')
  })
})

describe('fixtures the app can actually ingest', () => {
  const pool = (id: string, group: string, millis: number): WrMatch => ({
    matchId: id,
    eventPhase: `Pool ${group}`,
    eventPhaseId: { type: 'Pool', subType: group },
    time: { millis },
    status: 'U',
    teams: [{ name: 'A', abbreviation: 'AAA' }, { name: 'B', abbreviation: 'BBB' }],
    scores: [0, 0],
  })

  it('numbers the pool matchdays, or the probe drops every pool fixture', () => {
    // isIngestible rejects GROUP with a null matchday, so without this the
    // admin probe reports fixtures_dropped and refuses to create the
    // competition at all.
    const day = 86_400_000
    const matches = [
      pool('1', 'A', day * 1),
      pool('2', 'A', day * 1),
      pool('3', 'A', day * 3),
      pool('4', 'A', day * 3),
    ]
    const { impl } = stub({ '/schedule': { matches } })
    return worldRugbyProvider({ eventId: '1893', fetchImpl: impl, rateLimiter: nowait() })
      .listFixtures({ season: '2027' })
      .then((fixtures) => {
        expect(fixtures.map((m) => m.matchday)).toEqual([1, 1, 2, 2])
      })
  })

  it('leaves out a fixture the feed has not timed yet', async () => {
    // `?? 0` would date it to 1970, which reads as long past - closing the
    // competition's champion window before it opened.
    const untimed = { ...pool('9', 'A', 0), time: null }
    const { impl } = stub({ '/schedule': { matches: [pool('1', 'A', 86_400_000), untimed] } })
    const fixtures = await worldRugbyProvider({ eventId: '1893', fetchImpl: impl, rateLimiter: nowait() })
      .listFixtures({ season: '2027' })
    expect(fixtures.map((m) => m.providerMatchId)).toEqual(['1'])
    expect(normalizeWorldRugbyMatch(untimed).kickoffTime).toBe('')
  })
})

describe('worldRugbyMinute', () => {
  it('reads seconds from kick-off as the minute being played', () => {
    // 92s is 1:32, which is during the second minute.
    expect(worldRugbyMinute(92)).toBe("2'")
    expect(worldRugbyMinute(0)).toBe("1'")
    expect(worldRugbyMinute(3371)).toBe("57'")
  })

  it('has no minute for a missing or nonsense time', () => {
    expect(worldRugbyMinute(null)).toBeNull()
    expect(worldRugbyMinute(undefined)).toBeNull()
    expect(worldRugbyMinute(-1)).toBeNull()
  })
})

describe('isTryEvent', () => {
  it('counts only tries, not the kicks', () => {
    // The scorers board counts goal_event rows, not points, so folding in
    // conversions and penalties would turn it into a kickers board.
    expect(isTryEvent({ group: 'Try', type: 'T5' })).toBe(true)
    expect(isTryEvent({ group: 'Con', type: 'C2' })).toBe(false)
    expect(isTryEvent({ group: 'Pen', type: 'P3' })).toBe(false)
    expect(isTryEvent({ group: 'DG', type: 'D3' })).toBe(false)
    expect(isTryEvent({})).toBe(false)
  })
})

describe('mapWorldRugbyTimelineKind', () => {
  it('names each rugby play rather than calling them all a goal', () => {
    expect(mapWorldRugbyTimelineKind({ group: 'Try', type: 'T5' })).toBe('try')
    expect(mapWorldRugbyTimelineKind({ group: 'Con', type: 'C2' })).toBe('conversion')
    expect(mapWorldRugbyTimelineKind({ group: 'Pen', type: 'P3' })).toBe('penalty-kick')
    expect(mapWorldRugbyTimelineKind({ group: 'DG', type: 'D3' })).toBe('drop-goal')
  })

  it('reports the misses, which decide matches at two and three points', () => {
    expect(mapWorldRugbyTimelineKind({ type: 'Miss Con' })).toBe('conversion-missed')
    expect(mapWorldRugbyTimelineKind({ type: 'Miss Pen' })).toBe('penalty-missed')
  })

  it('carries cards and the player coming on', () => {
    expect(mapWorldRugbyTimelineKind({ type: 'Yellow' })).toBe('yellow')
    expect(mapWorldRugbyTimelineKind({ type: 'Red' })).toBe('red')
    expect(mapWorldRugbyTimelineKind({ type: 'Sub On' })).toBe('sub')
  })

  it('ignores the phases of play', () => {
    expect(mapWorldRugbyTimelineKind({ type: 'Ruck' })).toBeNull()
    expect(mapWorldRugbyTimelineKind({ type: 'Sub Off' })).toBeNull()
    expect(mapWorldRugbyTimelineKind({})).toBeNull()
  })
})

describe('match detail, timeline and stats', () => {
  const MATCH = {
    matchId: '28766',
    attendance: 78690,
    venue: { name: 'Stade de France' },
    teams: [
      { id: '42', name: 'France', abbreviation: 'FRA' },
      { id: '37', name: 'New Zealand', abbreviation: 'NZL' },
    ],
  }
  const TIMELINE = {
    timeline: [
      { type: 'T5', group: 'Try', points: 5, teamIndex: 1, playerId: 'p1', time: { secs: 92 } },
      { type: 'C2', group: 'Con', points: 2, teamIndex: 1, playerId: 'p2', time: { secs: 150 } },
      { type: 'P3', group: 'Pen', points: 3, teamIndex: 0, playerId: 'p3', time: { secs: 285 } },
      { type: 'D3', group: 'DG', points: 3, teamIndex: 0, playerId: 'p3', time: { secs: 1595 } },
      { type: 'Yellow', teamIndex: 1, playerId: 'p1', time: { secs: 4000 } },
      { type: 'Sub On', teamIndex: 0, playerId: 'p4', link: 9947, time: { secs: 2910 } },
      { type: 'Sub Off', teamIndex: 0, playerId: 'p3', link: 9947, time: { secs: 2910 } },
      { type: 'Ruck', teamIndex: 0, time: { secs: 3000 } },
    ],
  }
  const SQUADS = {
    squads: [
      {
        team: { id: '42', abbreviation: 'FRA' },
        players: [
          { player: { id: 'p3', name: { display: 'Thomas Ramos' } } },
          { player: { id: 'p4', name: { display: 'Romain Taofifenua' } } },
          { player: { id: null, name: { display: 'No id' } } },
        ],
        management: [
          { name: { display: 'Someone Else' }, role: 'Head Strength & Conditioning Coach' },
          { name: { display: 'Fabien Galthie' }, role: 'Head Coach' },
        ],
      },
      { team: { id: '37', abbreviation: 'NZL' }, players: [{ player: { id: 'p1', name: { display: "Mark Tele'a" } } }] },
    ],
  }
  const STATS = {
    teamStats: [
      { stats: { Possession: 0.49, Passes: 108, PenaltiesConceded: 4, TurnoversWon: 8 } },
      { stats: { Possession: 0.51, Passes: 154 } },
    ],
  }

  const full = () => stub({ '/timeline': TIMELINE, '/stats': STATS, '/squads': SQUADS, '/match/28766': MATCH })
  const make = (impl: typeof fetch) => worldRugbyProvider({ eventId: '1893', fetchImpl: impl, rateLimiter: nowait() })

  it('records every scoring play with what it was worth', async () => {
    // All four scores are stored so the points board can sum them; the try
    // board counts only the ones worth a try (stats/scorers.ts TRY_POINTS).
    const d = await make(full().impl).getMatchDetail!({ matchId: '28766' })
    expect(d!.goals.map((g) => g.points)).toEqual([5, 2, 3, 3])
    expect(d!.goals[0]).toMatchObject({
      side: 'AWAY',
      teamCode: 'NZL',
      playerName: "Mark Tele'a",
      minute: "2'",
      points: 5,
      // goalType stays a football type code; points carry the value.
      goalType: null,
      ownGoal: false,
    })
  })

  it('carries possession, attendance, venue and cards', async () => {
    const d = await make(full().impl).getMatchDetail!({ matchId: '28766' })
    expect(d!.possessionHome).toBe(49)
    expect(d!.possessionAway).toBe(51)
    expect(d!.attendance).toBe(78690)
    expect(d!.stadium).toBe('Stade de France')
    expect(d!.cards).toEqual({ home: { yellow: 0, red: 0 }, away: { yellow: 1, red: 0 } })
    expect(d!.homeTeamId).toBe('42')
    expect(d!.awayTeamId).toBe('37')
  })

  it('reads the timeline document once, however many methods want it', async () => {
    // The timeline route asks for the detail then the timeline, and both read
    // this document; fetching it twice doubled the load on an upstream that
    // rate-limits, and a 429 there empties the whole play-by-play.
    const { impl, calls } = stub({ '/timeline': TIMELINE, '/stats': STATS, '/squads': SQUADS, '/match/28766': MATCH })
    const p = make(impl)
    await p.getMatchDetail!({ matchId: '28766' })
    await p.getMatchTimeline!({ matchId: '28766' })
    expect(calls.filter((u) => u.includes('/timeline')).length).toBe(1)
  })

  it('names a scorer who is not in the tournament squad list', async () => {
    // Squads are the initial selection: a mid-tournament call-up who then
    // scores is absent from it. Makazole Mapimpi scored three tries against
    // Romania and rendered as a blank row with a 5 beside it.
    const { impl, calls } = stub({
      '/timeline': TIMELINE,
      '/stats': STATS,
      '/squads': SQUADS,
      '/match/28766': MATCH,
      '/player/p2': { name: { display: 'Makazole Mapimpi' } },
    })
    const p = make(impl)
    const d = await p.getMatchDetail!({ matchId: '28766' })
    expect(d!.goals[1]!.playerName).toBe('Makazole Mapimpi')
    // Memoised across methods: one lookup per unknown player for the adapter's life.
    await p.getMatchTimeline!({ matchId: '28766' })
    expect(calls.filter((u) => u.includes('/player/p2')).length).toBe(1)
  })

  it('leaves a player the lookup cannot resolve unnamed rather than failing the detail', async () => {
    const d = await make(full().impl).getMatchDetail!({ matchId: '28766' })
    expect(d!.goals[1]!.playerName).toBe('')
    expect(d!.goals[0]!.playerName).toBe("Mark Tele'a")
  })

  it('re-arms the timeline fetch after a failure instead of caching the error', async () => {
    // A memo that keeps a rejected promise turns one transient upstream blip
    // into a permanently empty play-by-play for that match.
    let calls = 0
    const impl = vi.fn(async (url: string | URL) => {
      const href = String(url)
      if (href.includes('/timeline')) {
        calls += 1
        if (calls === 1) return new Response('nope', { status: 503 })
        return new Response(JSON.stringify(TIMELINE), { status: 200 })
      }
      if (href.includes('/squads')) return new Response(JSON.stringify(SQUADS), { status: 200 })
      return new Response(JSON.stringify(MATCH), { status: 200 })
    }) as unknown as typeof fetch
    const p = make(impl)
    await expect(p.getMatchTimeline!({ matchId: '28766' })).rejects.toBeTruthy()
    const events = await p.getMatchTimeline!({ matchId: '28766' })
    expect(events.length).toBeGreaterThan(0)
  })

  it('reports the cards, not just counts them', async () => {
    // cards{} feeds a summary badge; bookings[] is what the match view lists.
    // Leaving it empty hid every card in the game - including a red card, which
    // is usually the story of the match.
    const tl = {
      timeline: [
        { type: 'Yellow', teamIndex: 1, playerId: 'p1', time: { secs: 600 } },
        { type: 'Red', teamIndex: 0, playerId: 'p3', time: { secs: 1800 } },
      ],
    }
    const { impl } = stub({ '/timeline': tl, '/stats': STATS, '/squads': SQUADS, '/match/28766': MATCH })
    const d = await make(impl).getMatchDetail!({ matchId: '28766' })
    expect(d!.cards).toEqual({ home: { yellow: 0, red: 1 }, away: { yellow: 1, red: 0 } })
    expect(d!.bookings).toEqual([
      { side: 'AWAY', playerId: 'p1', playerName: "Mark Tele'a", minute: "11'", card: 'YELLOW' },
      { side: 'HOME', playerId: 'p3', playerName: 'Thomas Ramos', minute: "31'", card: 'RED' },
    ])
  })

  it('pairs a substitution on its link, not its timestamp', async () => {
    // Sub On is emitted before its Sub Off, so a running map never has the
    // partner yet; both halves share a link id.
    const d = await make(full().impl).getMatchDetail!({ matchId: '28766' })
    expect(d!.substitutions).toHaveLength(1)
    expect(d!.substitutions[0]).toMatchObject({
      side: 'HOME',
      minute: "49'",
      playerOffName: 'Thomas Ramos',
      playerOnName: 'Romain Taofifenua',
    })
  })

  it('still ships a substitution whose partner is missing', async () => {
    const lone = { timeline: [{ type: 'Sub On', teamIndex: 0, playerId: 'p4', link: 1, time: { secs: 600 } }] }
    const { impl } = stub({ '/timeline': lone, '/stats': STATS, '/squads': SQUADS, '/match/28766': MATCH })
    const d = await make(impl).getMatchDetail!({ matchId: '28766' })
    expect(d!.substitutions).toHaveLength(1)
    expect(d!.substitutions[0]!.playerOffName).toBe('')
  })

  it('ships a player who left the field with no replacement', async () => {
    // A red card or an injury with no cover leaves a Sub Off with no partner;
    // dropping it loses the fact that they went off at all.
    const tl = {
      timeline: [
        { type: 'Sub Off', teamIndex: 1, playerId: 'p1', link: 77, time: { secs: 600 } },
        { type: 'Sub On', teamIndex: 0, playerId: 'p4', link: 78, time: { secs: 900 } },
      ],
    }
    const { impl } = stub({ '/timeline': tl, '/stats': STATS, '/squads': SQUADS, '/match/28766': MATCH })
    const d = await make(impl).getMatchDetail!({ matchId: '28766' })
    const lone = d!.substitutions.find((x) => x.playerOnName === '')
    expect(lone).toMatchObject({ side: 'AWAY', minute: "11'", playerOnId: null })
    expect(lone!.playerOffName).toBe("Mark Tele'a")
  })

  it('leaves an unpaired sub-off unnamed when the squads do not carry the player', async () => {
    const tl = { timeline: [{ type: 'Sub Off', teamIndex: 0, link: 5, time: { secs: 600 } }] }
    const { impl } = stub({ '/timeline': tl, '/stats': STATS, '/squads': SQUADS, '/match/28766': MATCH })
    const d = await make(impl).getMatchDetail!({ matchId: '28766' })
    expect(d!.substitutions).toEqual([
      { side: 'HOME', minute: "11'", playerOffId: null, playerOffName: '', playerOnId: null, playerOnName: '' },
    ])
  })

  it('names the player coming on in the timeline, and nobody for a card', async () => {
    const tl = {
      timeline: [
        { type: 'Sub On', teamIndex: 0, playerId: 'p4', link: 1, time: { secs: 600 } },
        { type: 'Yellow', teamIndex: 0, time: { secs: 700 } },
      ],
    }
    const { impl } = stub({ '/timeline': tl, '/stats': STATS, '/squads': SQUADS, '/match/28766': MATCH })
    const events = await make(impl).getMatchTimeline!({ matchId: '28766' })
    expect(events[0]).toMatchObject({ kind: 'sub', playerInName: 'Romain Taofifenua' })
    expect(events[1]).toMatchObject({ kind: 'yellow', playerName: null, playerInName: null })
  })

  it('falls back to a side-and-second key when the feed omits the sub link', async () => {
    const tl = {
      timeline: [
        { type: 'Sub On', teamIndex: 0, playerId: 'p4', time: { secs: 600 } },
        { type: 'Sub Off', teamIndex: 0, playerId: 'p3', time: { secs: 600 } },
      ],
    }
    const { impl } = stub({ '/timeline': tl, '/stats': STATS, '/squads': SQUADS, '/match/28766': MATCH })
    const d = await make(impl).getMatchDetail!({ matchId: '28766' })
    expect(d!.substitutions).toHaveLength(1)
    expect(d!.substitutions[0]).toMatchObject({ playerOffName: 'Thomas Ramos', playerOnName: 'Romain Taofifenua' })
  })

  it('ignores substitution halves the feed did not attribute or time', async () => {
    const tl = {
      timeline: [
        // No side at all: cannot be credited to anyone.
        { type: 'Sub On', playerId: 'p4', link: 3 },
        // No clock: the fallback key still has to be a string.
        { type: 'Sub Off', teamIndex: 0, playerId: 'p3' },
        // No type at all.
        { teamIndex: 0, playerId: 'p3', time: { secs: 10 } },
      ],
    }
    const { impl } = stub({ '/timeline': tl, '/stats': STATS, '/squads': SQUADS, '/match/28766': MATCH })
    const p = make(impl)
    const d = await p.getMatchDetail!({ matchId: '28766' })
    // Only the timed, attributed Sub Off survives, as a player who left.
    expect(d!.substitutions).toEqual([
      { side: 'HOME', minute: null, playerOffId: 'p3', playerOffName: 'Thomas Ramos', playerOnId: null, playerOnName: '' },
    ])
    expect(await p.getMatchTimeline!({ matchId: '28766' })).toEqual([])
  })

  it('has no line-ups document to read', async () => {
    const { impl } = stub({ '/summary': {} })
    const l = await make(impl).getMatchLineups!({ matchId: '28766' })
    expect(l).toEqual({
      available: false,
      home: { formation: null, coach: null, startingXI: [], bench: [] },
      away: { formation: null, coach: null, startingXI: [], bench: [] },
    })
  })

  it('survives a match whose stats call fails', async () => {
    const { impl } = stub({ '/timeline': TIMELINE, '/squads': SQUADS, '/match/28766': MATCH })
    const d = await make(impl).getMatchDetail!({ matchId: '28766' })
    expect(d).not.toBeNull()
    expect(d!.possessionHome).toBeNull()
    expect(d!.goals).toHaveLength(4)
  })

  it('gives every rugby play its own kind and its own line', async () => {
    const tl = await make(full().impl).getMatchTimeline!({ matchId: '28766' })
    // Clock order, not feed order: the sub is at 49' and the yellow at 67',
    // and the fixture lists them the other way round on purpose. A conversion
    // is a play by a second player, so collapsing it into the try loses it.
    expect(tl.map((e) => e.kind)).toEqual(['try', 'conversion', 'penalty-kick', 'drop-goal', 'sub', 'yellow'])
    expect(tl[0]).toMatchObject({ kind: 'try', homeScore: 0, awayScore: 5, minute: "2'", playerName: "Mark Tele'a" })
    expect(tl[1]).toMatchObject({ kind: 'conversion', homeScore: 0, awayScore: 7 })
    expect(tl[2]).toMatchObject({ kind: 'penalty-kick', homeScore: 3, awayScore: 7 })
    expect(tl[3]).toMatchObject({ kind: 'drop-goal', homeScore: 6, awayScore: 7 })
  })

  it('drops the phases of play that are not events', async () => {
    // Six scoring/discipline/sub entries out of the fixture; the Ruck is not an
    // event the timeline reports.
    const tl = await make(full().impl).getMatchTimeline!({ matchId: '28766' })
    expect(tl).toHaveLength(6)
    expect(tl.some((e) => e.kind === undefined)).toBe(false)
  })

  it('keys match stats by team id and leaves the football-only fields null', async () => {
    const st = await make(full().impl).getMatchStats!({ ifesId: '28766' })
    // Sorted, not insertion-ordered: integer-like keys enumerate numerically.
    expect(Object.keys(st ?? {}).sort()).toEqual(['37', '42'])
    expect(st!['42']).toMatchObject({ possession: 49, passes: 108, fouls: 4, forcedTurnovers: 8 })
    expect(st!['42']!.corners).toBeNull()
    expect(st!['42']!.offsides).toBeNull()
  })

  it('has no match stats when the feed carries none', async () => {
    const { impl } = stub({ '/stats': { teamStats: [] }, '/match/28766': MATCH })
    expect(await make(impl).getMatchStats!({ ifesId: '28766' })).toBeNull()
  })

  it('skips a stats block it cannot attach to a team, and a missing figure', async () => {
    // More stat blocks than teams, and a block whose numbers are absent - both
    // would otherwise key the record on undefined or coerce a null to 0.
    const odd = {
      teamStats: [{ stats: { Possession: 0.6 } }, { stats: null }, { stats: { Possession: 0.4 } }],
    }
    const { impl } = stub({ '/stats': odd, '/match/28766': MATCH })
    const st = await make(impl).getMatchStats!({ ifesId: '28766' })
    expect(Object.keys(st ?? {}).sort()).toEqual(['37', '42'])
    expect(st!['37']).toMatchObject({ possession: null, passes: null })
  })

  it('has no squad when the team carries none and no coach when none is listed', async () => {
    const bare = { squads: [{ team: { id: '42', abbreviation: 'FRA' } }] }
    const { impl } = stub({ '/squads': bare, '/match/28766': MATCH })
    const t = await make(impl).getTeamTournament!({ teamRef: 'FRA', matches: [] })
    expect(t).toEqual({ squad: [], coach: null, stats: null })
  })

  it('builds a squad and names the head coach, not the other coaches', async () => {
    const t = await make(full().impl).getTeamTournament!({ teamRef: 'FRA', matches: [] })
    expect(t.coach).toBe('Fabien Galthie')
    expect(t.squad.map((p) => p.name)).toEqual(['Thomas Ramos', 'Romain Taofifenua'])
    // Squad numbers are handed out per match, so a tournament squad has none.
    expect(t.squad[0]!.shirtNumber).toBeNull()
    expect(t.squad[0]!.position).toBeNull()
  })

  it('has an empty squad for a team it does not carry', async () => {
    const t = await make(full().impl).getTeamTournament!({ teamRef: 'ZZZ', matches: [] })
    expect(t).toEqual({ squad: [], coach: null, stats: null })
  })

  it('reads a red card, and leaves an unknown actor unnamed', async () => {
    const tl = {
      timeline: [
        { type: 'Red', teamIndex: 1, playerId: 'nobody', time: { secs: 3000 } },
        { type: 'T5', group: 'Try', points: 5, teamIndex: 0, playerId: 'ghost', time: { secs: 100 } },
      ],
    }
    const { impl } = stub({ '/timeline': tl, '/stats': STATS, '/squads': SQUADS, '/match/28766': MATCH })
    const d = await make(impl).getMatchDetail!({ matchId: '28766' })
    expect(d!.cards.away.red).toBe(1)
    // A player id the squads do not carry must not become the literal id.
    expect(d!.goals).toHaveLength(1)
    expect(d!.goals[0]!.playerName).toBe('')

    const events = await make(impl).getMatchTimeline!({ matchId: '28766' })
    // The try is at 2' and the red at 50', so the try leads however the feed
    // ordered them.
    expect(events.map((e) => e.kind)).toEqual(['try', 'red'])
    expect(events[1]!.playerName).toBeNull()
  })

  it('survives a feed with every optional field missing', async () => {
    // Ragged documents: no teams on the match, events with no side, no clock,
    // no actor and no group. None of it should throw or invent a value.
    const ragged = {
      timeline: [
        // No teamIndex: the feed did not say whose it was.
        { type: 'T5', group: 'Try', points: 5 },
        { type: 'Sub On' },
        { type: 'Sub Off' },
        {},
        // Attributed, but missing everything else.
        { type: 'T5', group: 'Try', points: 5, teamIndex: 0 },
      ],
    }
    const { impl } = stub({ '/timeline': ragged, '/stats': {}, '/squads': {}, '/match/28766': {} })
    const p = make(impl)

    const d = await p.getMatchDetail!({ matchId: '28766' })
    // The unattributed try is dropped rather than charged to the home side;
    // only the one the feed actually attributed survives.
    expect(d!.goals).toHaveLength(1)
    expect(d!.goals[0]).toMatchObject({ side: 'HOME', teamName: '', teamCode: null, minute: null, playerId: null })
    expect(d!.homeTeamId).toBeNull()
    expect(d!.attendance).toBeNull()
    expect(d!.stadium).toBeNull()
    expect(d!.ifesId).toBe('28766')

    const tl = await p.getMatchTimeline!({ matchId: '28766' })
    expect(tl.map((e) => e.kind)).toEqual(['try'])
    expect(tl[0]).toMatchObject({ minute: null, playerName: null, homeScore: 5, awayScore: 0 })

    expect(await p.getMatchStats!({ ifesId: '28766' })).toBeNull()
    expect(await p.getTeamTournament!({ teamRef: 'FRA', matches: [] })).toEqual({ squad: [], coach: null, stats: null })
  })

  it('reads the other side of every paired branch', async () => {
    // Home red card, away substitution, and a try the feed gave no point value.
    const tl = {
      timeline: [
        { type: 'Red', teamIndex: 0, playerId: 'p3', time: { secs: 100 } },
        { type: 'T5', group: 'Try', teamIndex: 1, playerId: 'p1', time: { secs: 200 } },
        { type: 'Sub On', teamIndex: 1, playerId: 'p1', link: 5, time: { secs: 300 } },
        { type: 'Sub Off', teamIndex: 1, playerId: 'p2', link: 5, time: { secs: 300 } },
      ],
    }
    const { impl } = stub({ '/timeline': tl, '/stats': STATS, '/squads': SQUADS, '/match/28766': MATCH })
    const d = await make(impl).getMatchDetail!({ matchId: '28766' })
    expect(d!.cards.home.red).toBe(1)
    // A try the feed gave no point value is still a score; it just adds
    // nothing to the points board.
    expect(d!.goals).toHaveLength(1)
    expect(d!.goals[0]!.points).toBeNull()
    expect(d!.substitutions[0]!.side).toBe('AWAY')
  })

  it('has no stats when no block can be attached to a team', async () => {
    const { impl } = stub({ '/stats': STATS, '/match/28766': { matchId: '28766' } })
    expect(await make(impl).getMatchStats!({ ifesId: '28766' })).toBeNull()
  })

  it('skips a squad entry with no player behind it', async () => {
    const ragged = { squads: [{ team: { abbreviation: 'FRA' }, players: [{}, { player: { id: 'x' } }], management: [{}] }] }
    const { impl } = stub({ '/squads': ragged, '/match/28766': MATCH })
    const t = await make(impl).getTeamTournament!({ teamRef: 'FRA', matches: [] })
    expect(t.squad).toEqual([])
    expect(t.coach).toBeNull()
  })

  describe('line-ups', () => {
    const sheet = (nums: (string | null)[], captainAltId: string) => ({
      teamList: {
        captainIds: [captainAltId],
        list: nums.map((n, i) => ({
          player: { id: `id${i}`, altId: `alt${i}`, name: { display: n === null ? 'The Coach' : `Player ${n}` } },
          number: n,
        })),
      },
    })
    // 23 numbered shirts plus the coach, which is the entry with no number.
    const NUMS = [...Array.from({ length: 23 }, (_, i) => String(i + 1)), null]
    const SUMMARY = { teams: [sheet(NUMS, 'alt6'), sheet(NUMS, 'alt0')] }

    it('splits the sheet at 15 and names the coach', async () => {
      const { impl } = stub({ '/summary': SUMMARY })
      const l = await make(impl).getMatchLineups!({ matchId: '28766' })
      expect(l!.available).toBe(true)
      expect(l!.home.startingXI).toHaveLength(15)
      expect(l!.home.bench).toHaveLength(8)
      expect(l!.home.coach).toBe('The Coach')
      // Rugby numbering is the position, so 1-15 start and 16-23 are the bench.
      expect(l!.home.startingXI.map((p) => p.shirtNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
      expect(l!.home.bench.map((p) => p.shirtNumber)).toEqual([16, 17, 18, 19, 20, 21, 22, 23])
    })

    it('reads the captain off altId, not player id', async () => {
      // captainIds carry altIds; matching them against player.id finds nobody.
      const { impl } = stub({ '/summary': SUMMARY })
      const l = await make(impl).getMatchLineups!({ matchId: '28766' })
      expect(l!.home.startingXI.filter((p) => p.captain).map((p) => p.shirtNumber)).toEqual([7])
      expect(l!.away.startingXI.filter((p) => p.captain).map((p) => p.shirtNumber)).toEqual([1])
    })

    it('sorts by shirt number whatever order the feed used', async () => {
      const shuffled = { teams: [sheet(['3', '1', '2'], 'alt0'), sheet(['2', '1'], 'alt0')] }
      const { impl } = stub({ '/summary': shuffled })
      const l = await make(impl).getMatchLineups!({ matchId: '28766' })
      expect(l!.home.startingXI.map((p) => p.shirtNumber)).toEqual([1, 2, 3])
    })

    it('is unavailable until both team sheets drop', async () => {
      // They are published shortly before kickoff; half a side must show as
      // nothing rather than as a line-up.
      const oneSide = { teams: [sheet(['1', '2'], 'alt0'), { teamList: { list: [] } }] }
      const { impl } = stub({ '/summary': oneSide })
      const l = await make(impl).getMatchLineups!({ matchId: '28766' })
      expect(l!.available).toBe(false)
      expect(l!.away.startingXI).toEqual([])
    })

    it('drops an entry with no player, and a number that is not one', async () => {
      const ragged = {
        teams: [
          { teamList: { list: [{ number: '1' }, { player: { id: 'x' }, number: '2' }, { player: { id: 'y', name: { display: 'Odd' } }, number: 'SR' }] } },
          {},
        ],
      }
      const { impl } = stub({ '/summary': ragged })
      const l = await make(impl).getMatchLineups!({ matchId: '28766' })
      expect(l!.home.startingXI).toEqual([])
      expect(l!.away.coach).toBeNull()
      expect(l!.available).toBe(false)
    })

    it('leaves the rugby position out rather than forcing it into a football slot', async () => {
      const { impl } = stub({ '/summary': SUMMARY })
      const l = await make(impl).getMatchLineups!({ matchId: '28766' })
      expect(l!.home.startingXI[0]!.position).toBeNull()
      expect(l!.home.formation).toBeNull()
    })
  })

  it('does not take the detail sync down when squads are unavailable', async () => {
    // A tournament whose squads are not named yet, or a failing call.
    const { impl } = stub({ '/timeline': TIMELINE, '/stats': STATS, '/match/28766': MATCH })
    const d = await make(impl).getMatchDetail!({ matchId: '28766' })
    expect(d!.goals).toHaveLength(4)
    expect(d!.goals[0]!.playerName).toBe('')
  })
})
