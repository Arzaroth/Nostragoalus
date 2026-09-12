import { describe, expect, it, vi } from 'vitest'
import {
  mapWorldRugbyStage,
  mapWorldRugbyStatus,
  normalizeWorldRugbyMatch,
  parseWorldRugbyGroup,
  worldRugbyProvider,
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
