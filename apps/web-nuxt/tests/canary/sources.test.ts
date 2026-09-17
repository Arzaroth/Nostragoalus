/**
 * Each source's key table and cross-checks, driven over a stub feed.
 *
 * A complete payload must come back green; the same payload missing a key, or
 * carrying one of the wrong type, must come back red AND name it; a payload with
 * nothing played in it must come back green with keys reported unchecked, not
 * red. That last case is the one that decides whether anybody still reads the
 * alarm in six months.
 */
import { describe, expect, it } from 'vitest'
import { espnSource } from '../../scripts/canary/sources/espn'
import { fifaSource } from '../../scripts/canary/sources/fifa'
import { uefaSource } from '../../scripts/canary/sources/uefa'
import { worldRugbySource } from '../../scripts/canary/sources/worldrugby'
import type { CanaryContext, CanarySource } from '../../scripts/canary/source'

const NOW = new Date('2026-03-01T12:00:00Z')

type Feed = (url: string) => unknown

async function visit(source: CanarySource, feed: Feed) {
  const notes: string[] = []
  const ctx: CanaryContext = {
    now: NOW,
    note: (line) => notes.push(line),
    getJson: async <T,>(url: string) => {
      const answer = feed(url)
      if (answer === undefined) throw new Error(`the stub feed has no answer for ${url}`)
      return answer as T
    },
  }
  const { ledger, problems } = await source.visit(ctx)
  return { ledger, problems, notes, failures: [...ledger.failures(), ...problems] }
}

/** Drops a key from a deep clone, so one fixture can be amputated many ways. */
function without<T>(doc: T, path: string): T {
  const clone = structuredClone(doc) as Record<string, unknown>
  const keys = path.split('.')
  const last = keys.pop()!
  let cursor: unknown = clone
  for (const key of keys) {
    cursor = Array.isArray(cursor) ? cursor[Number(key)] : (cursor as Record<string, unknown>)[key]
    if (cursor == null) return clone as T
  }
  if (Array.isArray(cursor)) delete cursor[Number(last)]
  else delete (cursor as Record<string, unknown>)[last]
  return clone as T
}

function replace<T>(doc: T, path: string, value: unknown): T {
  const clone = structuredClone(doc) as Record<string, unknown>
  const keys = path.split('.')
  const last = keys.pop()!
  let cursor: unknown = clone
  for (const key of keys) {
    cursor = Array.isArray(cursor) ? cursor[Number(key)] : (cursor as Record<string, unknown>)[key]
  }
  ;(cursor as Record<string, unknown>)[last] = value
  return clone as T
}

// --------------------------------------------------------------------- espn --

function espnEvent(id: string, opts: { state?: string; scores?: [number, number]; slug?: string } = {}) {
  const [home, away] = opts.scores ?? [2, 1]
  const state = opts.state ?? 'post'
  const side = (team: string, homeAway: string, score: number) => ({
    homeAway,
    score: String(score),
    winner: score === Math.max(home, away),
    team: {
      id: `t-${team}`,
      displayName: `${team} FC`,
      shortDisplayName: team,
      abbreviation: team.slice(0, 3).toUpperCase(),
      logo: `https://example.test/${team}.png`,
    },
  })
  return {
    id,
    date: '2026-02-20T20:00:00Z',
    season: { slug: opts.slug ?? 'regular-season' },
    competitions: [
      {
        date: '2026-02-20T20:00:00Z',
        status: {
          period: 2,
          type: { name: 'STATUS_FULL_TIME', state, completed: state === 'post' },
        },
        competitors: [side('alpha', 'home', home), side('beta', 'away', away)],
        details: [
          { scoringPlay: true, shootout: false, scoreValue: 1, clock: { displayValue: "23'" }, team: { id: 't-alpha' } },
          { scoringPlay: false, shootout: false, scoreValue: 0, clock: { displayValue: "61'" }, team: { id: 't-beta' } },
        ],
      },
    ],
  }
}

const ESPN_SUMMARY = {
  keyEvents: [
    {
      type: { id: '70', text: 'Goal' },
      clock: { displayValue: "23'" },
      period: { number: 1 },
      team: { id: 't-alpha' },
      scoringPlay: true,
      participants: [{ athlete: { id: 'p1', displayName: 'A Striker' } }],
    },
  ],
  rosters: [
    {
      homeAway: 'home',
      formation: '4-3-3',
      team: { id: 't-alpha', displayName: 'alpha FC', abbreviation: 'ALP' },
      roster: [
        {
          athlete: { id: 'p1', displayName: 'A Striker', shortName: 'A. Striker' },
          starter: true,
          jersey: '9',
          position: { abbreviation: 'F' },
        },
      ],
    },
    {
      homeAway: 'away',
      formation: '4-4-2',
      team: { id: 't-beta', displayName: 'beta FC', abbreviation: 'BET' },
      roster: [
        {
          athlete: { id: 'p2', displayName: 'B Keeper', shortName: 'B. Keeper' },
          starter: true,
          jersey: '1',
          position: { abbreviation: 'G' },
        },
      ],
    },
  ],
  boxscore: {
    teams: [
      { team: { id: 't-alpha' }, statistics: [{ name: 'possessionPct', displayValue: '55.1' }] },
      { team: { id: 't-beta' }, statistics: [{ name: 'possessionPct', displayValue: '44.9' }] },
    ],
  },
  gameInfo: { venue: { fullName: 'Example Park' }, attendance: 40000 },
  header: {
    competitions: [
      {
        competitors: [
          { homeAway: 'home', team: { id: 't-alpha', displayName: 'alpha FC', abbreviation: 'ALP' } },
          { homeAway: 'away', team: { id: 't-beta', displayName: 'beta FC', abbreviation: 'BET' } },
        ],
        status: { displayClock: "90'", type: { name: 'STATUS_FULL_TIME' } },
      },
    ],
  },
}

const ESPN_TEAMS = {
  sports: [{ leagues: [{ teams: [{ team: { id: 't-alpha', abbreviation: 'ALP' } }] }] }],
}

const ESPN_STANDINGS = {
  children: [
    { name: 'Group A', abbreviation: 'Grp A', standings: { entries: [{ team: { id: 't-alpha' } }] } },
  ],
}

function espnFeed(overrides: Partial<Record<'board' | 'summary' | 'teams' | 'standings', unknown>> = {}): Feed {
  const board = overrides.board ?? { events: [espnEvent('1'), espnEvent('2', { scores: [0, 0], state: 'pre' })] }
  return (url) => {
    if (url.includes('/scoreboard')) return board
    if (url.includes('/summary')) return overrides.summary ?? ESPN_SUMMARY
    if (url.includes('/teams')) return overrides.teams ?? ESPN_TEAMS
    if (url.includes('/standings')) return overrides.standings ?? ESPN_STANDINGS
    return undefined
  }
}

describe('espn source', () => {
  const source = espnSource(['eng.1'])

  it('is green on a complete board', async () => {
    const { failures } = await visit(source, espnFeed())
    expect(failures).toEqual([])
  })

  it('names a required key the feed stopped sending', async () => {
    const board = { events: [without(espnEvent('1'), 'competitions.0.competitors.0.homeAway')] }
    const { failures } = await visit(source, espnFeed({ board }))
    expect(failures).toContain('competitor.homeAway')
  })

  it('names a key whose value changed shape', async () => {
    const board = { events: [replace(espnEvent('1'), 'competitions.0.date', 'sometime soon')] }
    const { ledger } = await visit(source, espnFeed({ board }))
    expect(ledger.verdict('competition.date')).toBe('TYPE')
  })

  it('catches a status vocabulary that no longer reaches FINISHED', async () => {
    // The provider falls back to `completed` when it does not know the name, so
    // only losing BOTH parks a played match on SUSPENDED for ever - every key
    // still in place, and nothing ever scored again.
    const renamed = replace(espnEvent('1'), 'competitions.0.status.type.name', 'STATUS_CONCLUDED_DIFFERENTLY')
    const board = { events: [replace(renamed, 'competitions.0.status.type.completed', false)] }
    const { problems } = await visit(source, espnFeed({ board }))
    expect(problems.join(' ')).toContain('not one maps to FINISHED')
  })

  it('catches keyEvents that are present but no longer read as goals', async () => {
    const summary = replace(ESPN_SUMMARY, 'keyEvents.0.type.id', '129')
    const { problems } = await visit(source, espnFeed({ summary: replace(summary, 'keyEvents.0.scoringPlay', false) }))
    expect(problems.join(' ')).toContain('not one recognised as a goal')
  })

  it('catches a clock that changed shape under the reader', async () => {
    const summary = replace(ESPN_SUMMARY, 'keyEvents.0.clock.displayValue', 'twenty-three minutes')
    const { problems } = await visit(source, espnFeed({ summary }))
    expect(problems.join(' ')).toContain('is readable')
  })

  it('does not cry wolf on a board with nothing played on it', async () => {
    const board = { events: [espnEvent('1', { state: 'pre', scores: [0, 0] })] }
    const { failures, ledger } = await visit(source, espnFeed({ board }))
    expect(failures).toEqual([])
    expect(ledger.unchecked().some((key) => key.startsWith('summary.'))).toBe(true)
  })

  it('reports a board that is empty in every season probed', async () => {
    const { problems } = await visit(source, espnFeed({ board: { events: [] } }))
    expect(problems.join(' ')).toContain('no match for any of the seasons')
  })
})

// --------------------------------------------------------------------- fifa --

const FIFA_SEASONS = {
  Results: [
    {
      IdSeason: '400',
      Name: [{ Locale: 'en-GB', Description: 'Season 2026' }],
      StartDate: '2026-01-01T00:00:00Z',
      EndDate: '2026-12-31T00:00:00Z',
    },
  ],
}

function fifaMatch(id: string, opts: { status?: number; group?: string | null } = {}) {
  const group = opts.group === undefined ? 'g1' : opts.group
  return {
    IdMatch: id,
    IdStage: 's1',
    IdGroup: group,
    Date: '2026-06-11T19:00:00Z',
    MatchStatus: opts.status ?? 0,
    StageName: [{ Locale: 'en-GB', Description: 'First stage' }],
    GroupName: group ? [{ Locale: 'en-GB', Description: 'Group A' }] : [],
    PlaceHolderA: 'A1',
    PlaceHolderB: 'B2',
    HomeTeamScore: 2,
    AwayTeamScore: 1,
    HomeTeamPenaltyScore: null,
    AwayTeamPenaltyScore: null,
    Winner: 'th',
    Home: {
      IdTeam: 'th',
      Score: 2,
      TeamName: [{ Locale: 'en-GB', Description: 'Alpha' }],
      Abbreviation: 'ALP',
      IdCountry: 'ALP',
      PictureUrl: 'https://example.test/alp.png',
    },
    Away: {
      IdTeam: 'ta',
      Score: 1,
      TeamName: [{ Locale: 'en-GB', Description: 'Beta' }],
      Abbreviation: 'BET',
      IdCountry: 'BET',
      PictureUrl: 'https://example.test/bet.png',
    },
  }
}

const FIFA_TIMELINE = {
  Event: [
    {
      Type: 3,
      MatchMinute: "23'",
      Period: 3,
      IdTeam: 'th',
      IdPlayer: 'p1',
      IdSubPlayer: 'p2',
      HomeGoals: 1,
      AwayGoals: 0,
      EventDescription: [{ Locale: 'en-GB', Description: 'Goal' }],
    },
  ],
}

const fifaTeamDoc = (id: string) => ({
  IdTeam: id,
  TeamName: [{ Locale: 'en-GB', Description: 'Alpha' }],
  Abbreviation: 'ALP',
  Tactics: '4-3-3',
  Players: [
    {
      IdPlayer: 'p1',
      PlayerName: [{ Locale: 'en-GB', Description: 'A Striker' }],
      ShortName: [{ Locale: 'en-GB', Description: 'A. Striker' }],
      ShirtNumber: 9,
      Position: 4,
      Status: 1,
      PlayerPicture: { PictureUrl: 'https://example.test/p1.png' },
    },
  ],
  Goals: [{ Type: 0, Period: 3, IdPlayer: 'p1', Minute: "23'", IdTeam: id }],
  Bookings: [],
  Substitutions: [],
  Coaches: [{ Name: [{ Locale: 'en-GB', Description: 'A Coach' }], Role: 0 }],
})

const FIFA_DETAIL = {
  HomeTeam: fifaTeamDoc('th'),
  AwayTeam: fifaTeamDoc('ta'),
  MatchTime: "90'",
  Period: 10,
  BallPossession: { OverallHome: 55.1, OverallAway: 44.9 },
  Attendance: 40000,
  Stadium: { Name: [{ Locale: 'en-GB', Description: 'Example Park' }] },
  Properties: { IdIFES: '1234' },
}

const FIFA_BRACKET = {
  KnockoutStages: [
    {
      SequenceOrder: 1,
      Name: [{ Locale: 'en-GB', Description: 'Final' }],
      Matches: [
        {
          IdMatch: 'k1',
          MatchNumber: 64,
          MatchStatus: 0,
          Date: '2026-07-19T19:00:00Z',
          HomeTeam: { IdTeam: 'th', TeamName: [{ Locale: 'en-GB', Description: 'Alpha' }], Abbreviation: 'ALP' },
          AwayTeam: { IdTeam: 'ta', TeamName: [{ Locale: 'en-GB', Description: 'Beta' }], Abbreviation: 'BET' },
          HomeTeamScore: 1,
          AwayTeamScore: 0,
          HomeTeamPenaltyScore: null,
          AwayTeamPenaltyScore: null,
          Winner: 'th',
          PlaceHolderA: 'W61',
          PlaceHolderB: 'W62',
        },
      ],
    },
  ],
  Winner: { IdTeam: 'th', TeamName: [{ Locale: 'en-GB', Description: 'Alpha' }], Abbreviation: 'ALP' },
}

function fifaFeed(overrides: Partial<Record<'seasons' | 'calendar' | 'timeline' | 'detail' | 'bracket', unknown>> = {}): Feed {
  return (url) => {
    if (url.includes('/seasons?')) return overrides.seasons ?? FIFA_SEASONS
    if (url.includes('/calendar/matches')) {
      return overrides.calendar ?? { Results: [fifaMatch('m1'), fifaMatch('m2', { group: null, status: 1 })] }
    }
    if (url.includes('/timelines/')) return overrides.timeline ?? FIFA_TIMELINE
    if (url.includes('/live/football/')) return overrides.detail ?? FIFA_DETAIL
    if (url.includes('/seasonbracket/')) return overrides.bracket ?? FIFA_BRACKET
    return undefined
  }
}

describe('fifa source', () => {
  const source = fifaSource('17')

  it('is green on a complete season', async () => {
    const { failures } = await visit(source, fifaFeed())
    expect(failures).toEqual([])
  })

  it('names a required key the feed stopped sending', async () => {
    const calendar = { Results: [without(fifaMatch('m1'), 'IdStage')] }
    const { failures } = await visit(source, fifaFeed({ calendar }))
    expect(failures).toContain('match.IdStage')
  })

  it('accepts the nulls the feed is contractually allowed', async () => {
    const calendar = { Results: [replace(fifaMatch('m1', { group: null }), 'Winner', null)] }
    const { ledger } = await visit(source, fifaFeed({ calendar }))
    expect(ledger.verdict('match.IdGroup')).toBe('ok')
    expect(ledger.verdict('match.Winner')).toBe('ok')
  })

  it('rejects a null where the contract has no null', async () => {
    const calendar = { Results: [replace(fifaMatch('m1'), 'Date', null)] }
    const { ledger } = await visit(source, fifaFeed({ calendar }))
    expect(ledger.verdict('match.Date')).toBe('TYPE')
  })

  it('catches a group label that no longer yields a letter', async () => {
    const calendar = { Results: [replace(fifaMatch('m1'), 'GroupName', [{ Locale: 'en-GB', Description: 'Pool ???' }])] }
    const { problems } = await visit(source, fifaFeed({ calendar }))
    expect(problems.join(' ')).toContain('not one yields a group letter')
  })

  it('catches a timeline that stopped producing rows', async () => {
    const timeline = { Event: [{ ...FIFA_TIMELINE.Event[0], Type: 999 }] }
    const { problems } = await visit(source, fifaFeed({ timeline }))
    expect(problems.join(' ')).toContain('normalizeFifaTimeline() recognised none')
  })

  it('catches a bracket that renders nothing', async () => {
    const bracket = { KnockoutStages: [{ ...FIFA_BRACKET.KnockoutStages[0], Matches: [] }] }
    const { failures } = await visit(source, fifaFeed({ bracket }))
    expect(failures.length).toBeGreaterThan(0)
  })

  it('does not cry wolf when the season has not been played', async () => {
    const calendar = { Results: [fifaMatch('m1', { status: 1 })] }
    const { failures, ledger } = await visit(source, fifaFeed({ calendar }))
    expect(failures).toEqual([])
    expect(ledger.unchecked().some((key) => key.startsWith('timeline.'))).toBe(true)
  })
})

// --------------------------------------------------------------------- uefa --

function uefaMatch(id: string, opts: { played?: boolean; group?: boolean } = {}) {
  const played = opts.played ?? true
  return {
    id,
    status: played ? 'FINISHED' : 'UPCOMING',
    kickOffTime: { dateTime: '2026-02-20T20:00:00Z' },
    homeTeam: {
      id: 'u-home',
      internationalName: 'Alpha',
      countryCode: 'ALP',
      bigLogoUrl: 'https://example.test/alp.png',
    },
    awayTeam: {
      id: 'u-away',
      internationalName: 'Beta',
      countryCode: 'BET',
      bigLogoUrl: 'https://example.test/bet.png',
    },
    score: played ? { total: { home: 2, away: 1 }, penalty: { home: null, away: null } } : null,
    round: { id: 'r1', metaData: { name: 'League phase' } },
    group: opts.group === false ? null : { metaData: { groupName: 'Group A' } },
    matchday: { name: 'Matchday 1', phase: 'GROUP_STAGE' },
    winner: played ? { match: { team: { id: 'u-home' } } } : null,
    matchAttendance: 50000,
    stadium: { translations: { name: { EN: 'Example Park' } } },
  }
}

const UEFA_EVENTS = [
  {
    type: 'GOAL',
    subType: 'PENALTY',
    phase: 'FIRST_HALF',
    time: { minute: 23, injuryMinute: null },
    primaryActor: {
      type: 'PLAYER',
      team: { id: 'u-home' },
      person: { id: 'p1', internationalName: 'A Striker' },
    },
    secondaryActor: { person: { id: 'p2', internationalName: 'An Assister' } },
    freeText: null,
  },
]

const UEFA_LINEUPS = {
  lineupStatus: 'CONFIRMED',
  homeTeam: {
    field: [
      {
        jerseyNumber: 9,
        player: { id: 'p1', internationalName: 'A Striker', fieldPosition: 'FORWARD' },
        fieldCoordinate: { x: 500, y: 800 },
      },
    ],
    bench: [{ jerseyNumber: 12, player: { id: 'p3', internationalName: 'A Sub', fieldPosition: 'MIDFIELDER' } }],
  },
  awayTeam: {
    field: [{ jerseyNumber: 1, player: { id: 'p2', internationalName: 'B Keeper', fieldPosition: 'GOALKEEPER' } }],
    bench: [{ jerseyNumber: 13, player: { id: 'p4', internationalName: 'B Sub', fieldPosition: 'DEFENDER' } }],
  },
}

function uefaFeed(overrides: Partial<Record<'matches' | 'events' | 'lineups', unknown>> = {}): Feed {
  return (url) => {
    if (url.includes('/events?')) return overrides.events ?? UEFA_EVENTS
    if (url.includes('/lineups')) return overrides.lineups ?? UEFA_LINEUPS
    if (url.includes('/v5/matches?')) return overrides.matches ?? [uefaMatch('1'), uefaMatch('2', { played: false })]
    return undefined
  }
}

describe('uefa source', () => {
  const source = uefaSource('3')

  it('is green on a complete season', async () => {
    const { failures } = await visit(source, uefaFeed())
    expect(failures).toEqual([])
  })

  it('names a required key the feed stopped sending', async () => {
    const matches = [without(uefaMatch('1'), 'kickOffTime.dateTime')]
    const { failures } = await visit(source, uefaFeed({ matches }))
    expect(failures).toContain('match.kickOffTime.dateTime')
  })

  it('catches a group label that no longer yields a letter', async () => {
    const matches = [replace(uefaMatch('1'), 'group.metaData.groupName', 'Pool ???')]
    const { problems } = await visit(source, uefaFeed({ matches }))
    expect(problems.join(' ')).toContain('not one yields a group letter')
  })

  it('catches events that stopped producing timeline rows', async () => {
    const events = [{ ...UEFA_EVENTS[0], type: 'SOMETHING_NEW', subType: null }]
    const { problems } = await visit(source, uefaFeed({ events }))
    expect(problems.join(' ')).toContain('recognised none')
  })

  it('reports a competition empty in every season probed', async () => {
    const { problems } = await visit(source, uefaFeed({ matches: [] }))
    expect(problems.join(' ')).toContain('no fixture for any of the seasons')
  })

  it('does not fail on a rare key whose context did not occur', async () => {
    const events = [without(UEFA_EVENTS[0], 'subType')]
    const { failures, ledger } = await visit(source, uefaFeed({ events }))
    expect(failures).toEqual([])
    expect(ledger.verdict('events[].subType')).toBe('absent')
  })
})

// --------------------------------------------------------------- worldrugby --

const WR_CATALOG = {
  pageInfo: { numPages: 1 },
  content: [
    {
      id: '1893',
      altId: 'b7511d98-7be1-4ac3-9470-90c98e84c5f3',
      label: 'Example Cup 2026',
      sport: 'mru',
      start: { label: '2026-01-05T00:00:00Z' },
      end: { label: '2026-04-05T00:00:00Z' },
    },
  ],
}

function wrMatch(id: string, opts: { scores?: [number, number]; millis?: number | null } = {}) {
  const [home, away] = opts.scores ?? [24, 17]
  return {
    matchId: id,
    status: 'C',
    description: 'Example Cup - Round 1',
    eventPhase: 'Pool A',
    eventPhaseId: { type: 'POOL', subType: 'A' },
    time: { millis: opts.millis === undefined ? 1770000000000 : opts.millis, label: '20:00' },
    teams: [
      { id: 'w-home', name: 'Alpha', abbreviation: 'ALP', countryCode: 'ALP' },
      { id: 'w-away', name: 'Beta', abbreviation: 'BET', countryCode: 'BET' },
    ],
    scores: [home, away],
    venue: { name: 'Example Park' },
    attendance: 50000,
    sport: 'mru',
    competition: 'Example Cup',
  }
}

const WR_TIMELINE = {
  timeline: [
    { type: 'Try', typeLabel: 'Try', group: 'TRY', points: 5, teamIndex: 0, playerId: 'wp1', time: { secs: 600 }, link: null },
    { type: 'Con', typeLabel: 'Conversion', group: 'CON', points: 2, teamIndex: 0, playerId: 'wp2', time: { secs: 660 }, link: null },
    // Both halves of a substitution carry the same link id, which is the only
    // place that key appears.
    { type: 'Sub off', typeLabel: 'Substitution', group: null, points: 0, teamIndex: 0, playerId: 'wp1', time: { secs: 3000 }, link: 'sub-7' },
    { type: 'Sub on', typeLabel: 'Substitution', group: null, points: 0, teamIndex: 0, playerId: 'wp3', time: { secs: 3000 }, link: 'sub-7' },
  ],
}

const WR_SUMMARY = {
  teams: [
    {
      teamList: {
        captainIds: ['wp1'],
        list: [{ number: 1, player: { id: 'wp1', altId: 'wp1-uuid', name: { display: 'A Prop' } } }],
      },
    },
  ],
}

function wrFeed(overrides: Partial<Record<'catalog' | 'schedule' | 'timeline' | 'summary', unknown>> = {}): Feed {
  return (url) => {
    if (url.includes('/event?')) return overrides.catalog ?? WR_CATALOG
    if (url.includes('/schedule')) return overrides.schedule ?? { matches: [wrMatch('x1'), wrMatch('x2')] }
    if (url.includes('/timeline')) return overrides.timeline ?? WR_TIMELINE
    if (url.includes('/summary')) return overrides.summary ?? WR_SUMMARY
    return undefined
  }
}

describe('worldrugby source', () => {
  const source = worldRugbySource('mru')

  it('is green on a complete event', async () => {
    const { failures } = await visit(source, wrFeed())
    expect(failures).toEqual([])
  })

  it('names a required key the feed stopped sending', async () => {
    const schedule = { matches: [without(wrMatch('x1'), 'teams.0.name')] }
    const { failures } = await visit(source, wrFeed({ schedule }))
    expect(failures).toContain('match.teams[].name')
  })

  it('catches every fixture losing its kickoff time, which empties a competition in silence', async () => {
    const schedule = { matches: [wrMatch('x1', { millis: null }), wrMatch('x2', { millis: null })] }
    const { problems } = await visit(source, wrFeed({ schedule }))
    expect(problems.join(' ')).toContain('every one lost its kickoff time')
  })

  it('catches a timeline vocabulary that no longer maps to anything', async () => {
    const timeline = {
      timeline: WR_TIMELINE.timeline.map((e) => ({ ...e, type: 'ZZ', typeLabel: 'Mystery', group: null })),
    }
    const { problems } = await visit(source, wrFeed({ timeline }))
    expect(problems.join(' ')).toContain('not one maps to a known kind')
  })

  it('does not cry wolf when nothing in the event has been played', async () => {
    const schedule = { matches: [wrMatch('x1', { scores: [0, 0] })] }
    const { failures, ledger } = await visit(source, wrFeed({ schedule }))
    expect(failures).toEqual([])
    expect(ledger.unchecked().some((key) => key.startsWith('timeline.'))).toBe(true)
  })

  it('reports a catalog carrying no event of this sub-feed', async () => {
    const catalog = { pageInfo: { numPages: 1 }, content: [{ ...WR_CATALOG.content[0], sport: 'wru' }] }
    const { problems } = await visit(source, wrFeed({ catalog }))
    expect(problems.join(' ')).toContain('no mru event at all')
  })
})
