import { describe, expect, it, vi } from 'vitest'
import {
  mapWorldRugbyStage,
  mapWorldRugbyStatus,
  normalizeWorldRugbyMatch,
  parseWorldRugbyGroup,
  worldRugbyProvider,
  worldRugbyMinute,
  isTryEvent,
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

  it('records tries as the scoring plays, and nothing else', async () => {
    const d = await make(full().impl).getMatchDetail!({ matchId: '28766' })
    expect(d!.goals).toHaveLength(1)
    expect(d!.goals[0]).toMatchObject({
      side: 'AWAY',
      teamCode: 'NZL',
      playerName: "Mark Tele'a",
      minute: "2'",
      goalType: 5,
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

  it('survives a match whose stats call fails', async () => {
    const { impl } = stub({ '/timeline': TIMELINE, '/squads': SQUADS, '/match/28766': MATCH })
    const d = await make(impl).getMatchDetail!({ matchId: '28766' })
    expect(d).not.toBeNull()
    expect(d!.possessionHome).toBeNull()
    expect(d!.goals).toHaveLength(1)
  })

  it('runs the score through every kick, but gives a conversion no line of its own', async () => {
    const tl = await make(full().impl).getMatchTimeline!({ matchId: '28766' })
    expect(tl.map((e) => e.kind)).toEqual(['goal', 'penalty-goal', 'goal', 'yellow', 'sub'])
    // The try is 5; the conversion's 2 lands on the next entry's running score.
    expect(tl[0]).toMatchObject({ homeScore: 0, awayScore: 5, minute: "2'", playerName: "Mark Tele'a" })
    expect(tl[1]).toMatchObject({ kind: 'penalty-goal', homeScore: 3, awayScore: 7 })
    expect(tl[2]).toMatchObject({ kind: 'goal', homeScore: 6, awayScore: 7 })
  })

  it('drops the phases of play that are not events', async () => {
    const tl = await make(full().impl).getMatchTimeline!({ matchId: '28766' })
    expect(tl).toHaveLength(5)
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
    expect(d!.goals[0]!.playerName).toBe('')

    const events = await make(impl).getMatchTimeline!({ matchId: '28766' })
    expect(events.map((e) => e.kind)).toEqual(['red', 'goal'])
    expect(events[0]!.playerName).toBeNull()
  })

  it('survives a feed with every optional field missing', async () => {
    // Ragged documents: no teams on the match, events with no side, no clock,
    // no actor and no group. None of it should throw or invent a value.
    const ragged = {
      timeline: [
        { type: 'T5', group: 'Try', points: 5 },
        { type: 'Sub On' },
        { type: 'Sub Off' },
        {},
      ],
    }
    const { impl } = stub({ '/timeline': ragged, '/stats': {}, '/squads': {}, '/match/28766': {} })
    const p = make(impl)

    const d = await p.getMatchDetail!({ matchId: '28766' })
    expect(d!.goals[0]).toMatchObject({ side: 'HOME', teamName: '', teamCode: null, minute: null, playerId: null })
    expect(d!.homeTeamId).toBeNull()
    expect(d!.attendance).toBeNull()
    expect(d!.stadium).toBeNull()
    expect(d!.ifesId).toBe('28766')

    const tl = await p.getMatchTimeline!({ matchId: '28766' })
    expect(tl.map((e) => e.kind)).toEqual(['goal', 'sub'])
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
    expect(d!.goals[0]!.goalType).toBeNull()
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
    expect(d!.goals).toHaveLength(1)
    expect(d!.goals[0]!.playerName).toBe('')
  })
})
