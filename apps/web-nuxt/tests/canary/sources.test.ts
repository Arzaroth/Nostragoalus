/**
 * Each source's key table and cross-checks, driven over a stub feed through the
 * REAL runner, so the ledger ownership and the error taxonomy are covered too.
 *
 * A complete payload must come back green; the same payload missing a key, or
 * carrying one of the wrong type, must come back red AND name exactly it; a
 * payload with nothing played in it must come back green. That last case is the
 * one that decides whether anybody still reads the alarm in six months, so the
 * unplayed fixtures here are genuinely unplayed - built without the keys a
 * played match carries - rather than played ones wearing an unplayed label.
 */
import { describe, expect, it } from 'vitest'
import { espnSource } from '../../scripts/canary/sources/espn'
import { fifaSource } from '../../scripts/canary/sources/fifa'
import { uefaSource } from '../../scripts/canary/sources/uefa'
import { pickEvents, worldRugbySource } from '../../scripts/canary/sources/worldrugby'
import { drive, NOW, replace, without, type Route } from './helpers'

// --------------------------------------------------------------------- espn --

interface EspnSpec {
  played?: boolean
  slug?: string
  scores?: [number, number]
}

function espnEvent(id: string, spec: EspnSpec = {}) {
  const played = spec.played ?? true
  const [home, away] = spec.scores ?? [2, 1]
  const side = (team: string, homeAway: string, score: number) => {
    const competitor: Record<string, unknown> = {
      homeAway,
      score: played ? String(score) : '0',
      team: {
        id: `t-${team}`,
        displayName: `${team} FC`,
        shortDisplayName: team,
        abbreviation: team.slice(0, 3).toUpperCase(),
        logo: `https://example.test/${team}.png`,
      },
    }
    // A fixture carries neither: they arrive with the result.
    if (played) competitor.winner = score === Math.max(home, away)
    return competitor
  }
  const competition: Record<string, unknown> = {
    date: '2026-02-20T20:00:00Z',
    status: {
      type: played
        ? { name: 'STATUS_FULL_TIME', state: 'post', completed: true }
        : { name: 'STATUS_SCHEDULED', state: 'pre', completed: false },
    },
    competitors: [side('alpha', 'home', home), side('beta', 'away', away)],
  }
  // `period` and `details` only exist once a match has kicked off.
  if (played) {
    ;(competition.status as Record<string, unknown>).period = 2
    competition.details = [
      { scoringPlay: true, shootout: false, scoreValue: 1, clock: { displayValue: "23'" }, team: { id: 't-alpha' } },
      { scoringPlay: false, shootout: false, clock: { displayValue: "61'" }, team: { id: 't-beta' } },
    ]
  }
  return { id, date: '2026-02-20T20:00:00Z', season: { slug: spec.slug ?? 'regular-season' }, competitions: [competition] }
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
    {
      type: { id: '94', text: 'Yellow Card' },
      clock: { displayValue: "40'" },
      period: { number: 1 },
      team: { id: 't-beta' },
      scoringPlay: false,
      participants: [{ athlete: { id: 'p2', displayName: 'B Keeper' } }],
    },
    {
      type: { id: '76', text: 'Substitution' },
      clock: { displayValue: "70'" },
      period: { number: 2 },
      team: { id: 't-alpha' },
      scoringPlay: false,
      participants: [{ athlete: { id: 'p3', displayName: 'A Sub' } }],
    },
    { type: { id: '80', text: 'Kickoff' }, clock: { displayValue: '' }, period: { number: 1 }, scoringPlay: false },
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
      {
        team: { id: 't-alpha' },
        statistics: [
          { name: 'possessionPct', displayValue: '55.1' },
          { name: 'totalShots', displayValue: '14' },
        ],
      },
      {
        team: { id: 't-beta' },
        statistics: [
          { name: 'possessionPct', displayValue: '44.9' },
          { name: 'totalShots', displayValue: '7' },
        ],
      },
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
        status: { type: { name: 'STATUS_FULL_TIME' } },
      },
    ],
  },
}

const ESPN_TEAMS = { sports: [{ leagues: [{ teams: [{ team: { id: 't-alpha', abbreviation: 'ALP' } }] }] }] }

const ESPN_STANDINGS = {
  children: [{ name: 'Group A', abbreviation: 'Group A', standings: { entries: [{ team: { id: 't-alpha' } }] } }],
}

const ESPN_KNOCKOUT = { events: [espnEvent('k1', { slug: 'final' })] }

function espnRoutes(over: Partial<Record<'board' | 'summary' | 'teams' | 'standings' | 'knockout', unknown>> = {}): Route[] {
  const board = over.board ?? { events: [espnEvent('1'), espnEvent('2', { played: false })] }
  return [
    { match: (u) => u.includes('fifa.world') && u.includes('/standings'), answer: over.standings ?? ESPN_STANDINGS },
    { match: (u) => u.includes('fifa.world') && u.includes('/scoreboard'), answer: over.knockout ?? ESPN_KNOCKOUT },
    { match: (u) => u.includes('/summary'), answer: over.summary ?? ESPN_SUMMARY },
    { match: (u) => u.includes('/teams'), answer: over.teams ?? ESPN_TEAMS },
    { match: (u) => u.includes('/scoreboard'), answer: board },
  ]
}

describe('espn source', () => {
  const source = espnSource(['eng.1'])

  it('is green on a complete board', async () => {
    const { failures, status } = await drive(source, espnRoutes())
    expect(failures).toEqual([])
    expect(status).toBe('green')
  })

  it('names exactly the required key the feed stopped sending', async () => {
    const board = { events: [without(espnEvent('1'), 'competitions.0.competitors.0.team.displayName')] }
    const { failures } = await drive(source, espnRoutes({ board }))
    expect(failures).toEqual(['competitor.team.displayName'])
  })

  it('names a key whose value changed shape', async () => {
    const board = { events: [replace(espnEvent('1'), 'competitions.0.date', 'sometime soon')] }
    const { ledger } = await drive(source, espnRoutes({ board }))
    expect(ledger.verdict('competition.date')).toBe('TYPE')
  })

  it('still watches the goal flags when scoringPlay itself disappears', async () => {
    // The old order gated the whole DETAIL scope behind this very key, so
    // renaming it left every detail key `unchecked` and the source green.
    const board = { events: [without(espnEvent('1'), 'competitions.0.details.0.scoringPlay')] }
    const { ledger, failures } = await drive(source, espnRoutes({ board }))
    expect(ledger.verdict('detail.scoringPlay')).toBe('MISSING')
    expect(failures).toContain('detail.scoringPlay')
  })

  it('catches a status vocabulary that no longer reaches FINISHED', async () => {
    const renamed = replace(espnEvent('1'), 'competitions.0.status.type.name', 'STATUS_CONCLUDED_DIFFERENTLY')
    const board = { events: [replace(renamed, 'competitions.0.status.type.completed', false)] }
    const { problems } = await drive(source, espnRoutes({ board }))
    expect(problems.join(' ')).toContain('not one maps to FINISHED')
  })

  it('catches a decided match that resolves no winner', async () => {
    const board = { events: [without(espnEvent('1'), 'competitions.0.competitors.0.winner')] }
    const { problems } = await drive(source, espnRoutes({ board }))
    expect(problems.join(' ')).toContain('not one resolved a winner')
  })

  it('catches a type-id vocabulary that no longer names a card or a substitution', async () => {
    const summary = structuredClone(ESPN_SUMMARY)
    let spare = 9000
    for (const event of summary.keyEvents) {
      if (!event.scoringPlay) event.type.id = String(spare++)
    }
    const { problems } = await drive(source, espnRoutes({ summary }))
    expect(problems.join(' ')).toContain('not one maps to a card, a substitution or a period marker')
  })

  it('catches a clock that changed shape under the reader', async () => {
    const summary = replace(ESPN_SUMMARY, 'keyEvents.0.clock.displayValue', 'twenty-three minutes')
    const withNoReadableClock = replace(summary, 'keyEvents.1.clock.displayValue', 'forty minutes')
    const last = replace(withNoReadableClock, 'keyEvents.2.clock.displayValue', 'seventy minutes')
    const { problems } = await drive(source, espnRoutes({ summary: last }))
    expect(problems.join(' ')).toContain('is readable')
  })

  it('catches a boxscore whose stat values stopped being numbers', async () => {
    const summary = replace(ESPN_SUMMARY, 'boxscore.teams.0.statistics.0.displayValue', '55%')
    const { ledger } = await drive(source, espnRoutes({ summary }))
    expect(ledger.verdict('summary.boxscore.teams[].statistics[].displayValue')).toBe('TYPE')
  })

  it('catches a standings tree whose group names stopped parsing', async () => {
    const standings = replace(
      replace(ESPN_STANDINGS, 'children.0.name', 'Group A - Final Standings'),
      'children.0.abbreviation',
      'Grp A Final',
    )
    const { problems } = await drive(source, espnRoutes({ standings }))
    expect(problems.join(' ')).toContain('read a letter from none of them')
  })

  it('catches a knockout ladder that collapsed onto GROUP', async () => {
    const knockout = { events: [espnEvent('k1', { slug: 'regular-season' })] }
    const { problems } = await drive(source, espnRoutes({ knockout }))
    expect(problems.join(' ')).toContain('not one maps past GROUP')
  })

  it('does not cry wolf on a board where nothing has been played', async () => {
    // Genuinely unplayed: no details, no period, no winner - not a played
    // fixture wearing state 'pre'.
    const board = { events: [espnEvent('1', { played: false }), espnEvent('2', { played: false })] }
    const { failures, ledger } = await drive(source, espnRoutes({ board }))
    expect(failures).toEqual([])
    expect(ledger.unchecked().some((key) => key.startsWith('summary.'))).toBe(true)
  })

  it('reports a board that is empty in every season probed', async () => {
    const { problems } = await drive(source, espnRoutes({ board: { events: [] } }))
    expect(problems.join(' ')).toContain('no match for any of the seasons')
  })

  it('treats a refused route as drift, not as weather', async () => {
    const routes = espnRoutes()
    routes.unshift({ match: (u) => u.includes('/teams'), answer: { message: 'gone' }, status: 404 })
    const { status, problems } = await drive(source, routes)
    expect(status).toBe('red')
    expect(problems.join(' ')).toContain('the feed refused a route the app reads')
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

function fifaMatch(id: string, opts: { played?: boolean; group?: string | null; stage?: string } = {}) {
  const played = opts.played ?? true
  const group = opts.group === undefined ? 'g1' : opts.group
  const side = (team: string, code: string, score: number) => ({
    IdTeam: team,
    Score: played ? score : null,
    TeamName: [{ Locale: 'en-GB', Description: code }],
    Abbreviation: code.slice(0, 3).toUpperCase(),
    IdCountry: code.slice(0, 3).toUpperCase(),
    PictureUrl: `https://example.test/${team}.png`,
  })
  return {
    IdMatch: id,
    IdStage: 's1',
    IdGroup: group,
    Date: '2026-06-11T19:00:00Z',
    MatchStatus: played ? 0 : 1,
    StageName: [{ Locale: 'en-GB', Description: opts.stage ?? 'First stage' }],
    GroupName: group ? [{ Locale: 'en-GB', Description: 'Group A' }] : [],
    PlaceHolderA: 'A1',
    PlaceHolderB: 'B2',
    HomeTeamScore: played ? 2 : null,
    AwayTeamScore: played ? 1 : null,
    HomeTeamPenaltyScore: null,
    AwayTeamPenaltyScore: null,
    Winner: played ? 'th' : null,
    Home: side('th', 'Alpha', 2),
    Away: side('ta', 'Beta', 1),
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
  Bookings: [{ Card: 1, Minute: "40'", IdPlayer: 'p1' }],
  Substitutions: [
    {
      Minute: "70'",
      IdPlayerOff: 'p1',
      IdPlayerOn: 'p2',
      PlayerOffName: [{ Locale: 'en-GB', Description: 'A Striker' }],
      PlayerOnName: [{ Locale: 'en-GB', Description: 'A Sub' }],
    },
  ],
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
          Winner: 'th',
          PlaceHolderA: 'W61',
          PlaceHolderB: 'W62',
        },
      ],
    },
  ],
}

function fifaRoutes(
  over: Partial<Record<'seasons' | 'calendar' | 'timeline' | 'detail' | 'bracket', unknown>> = {},
  bracketStatus?: number,
): Route[] {
  return [
    { match: (u) => u.includes('/seasons?'), answer: over.seasons ?? FIFA_SEASONS },
    {
      match: (u) => u.includes('/calendar/matches'),
      answer: over.calendar ?? { Results: [fifaMatch('m1'), fifaMatch('m2', { group: null, played: false })] },
    },
    { match: (u) => u.includes('/timelines/'), answer: over.timeline ?? FIFA_TIMELINE },
    { match: (u) => u.includes('/live/football/'), answer: over.detail ?? FIFA_DETAIL },
    { match: (u) => u.includes('/seasonbracket/'), answer: over.bracket ?? FIFA_BRACKET, status: bracketStatus },
  ]
}

describe('fifa source', () => {
  const source = fifaSource('17')

  it('is green on a complete season', async () => {
    const { failures, status } = await drive(source, fifaRoutes())
    expect(failures).toEqual([])
    expect(status).toBe('green')
  })

  it('names exactly the required key the feed stopped sending', async () => {
    const calendar = { Results: [without(fifaMatch('m1'), 'IdStage')] }
    const { failures } = await drive(source, fifaRoutes({ calendar }))
    expect(failures).toEqual(['match.IdStage'])
  })

  it('accepts the nulls the feed is contractually allowed', async () => {
    const calendar = { Results: [replace(fifaMatch('m1', { group: null }), 'Winner', null)] }
    const { ledger } = await drive(source, fifaRoutes({ calendar }))
    expect(ledger.verdict('match.IdGroup')).toBe('ok')
    expect(ledger.verdict('match.Winner')).toBe('ok')
  })

  it('rejects a null where the contract has no null', async () => {
    const calendar = { Results: [replace(fifaMatch('m1'), 'Date', null)] }
    const { ledger } = await drive(source, fifaRoutes({ calendar }))
    expect(ledger.verdict('match.Date')).toBe('TYPE')
  })

  it('catches a group label that no longer yields a letter', async () => {
    const calendar = { Results: [replace(fifaMatch('m1'), 'GroupName', [{ Locale: 'en-GB', Description: 'Pool ???' }])] }
    const { problems } = await drive(source, fifaRoutes({ calendar }))
    expect(problems.join(' ')).toContain('not one yields a group letter')
  })

  it('catches a knockout stage name that no longer maps past GROUP', async () => {
    const calendar = { Results: [fifaMatch('m1', { stage: 'Final', group: null })] }
    const { problems } = await drive(source, fifaRoutes({ calendar }))
    // The fixture IS named for a final, so the tally sees a knockout and the
    // question is real rather than gated off by a sample-size guard.
    expect(problems.join(' ')).not.toContain('named for a knockout stage')
  })

  it('catches a timeline that stopped producing rows', async () => {
    const timeline = { Event: [{ ...FIFA_TIMELINE.Event[0], Type: 999 }] }
    const { problems } = await drive(source, fifaRoutes({ timeline }))
    expect(problems.join(' ')).toContain('normalizeFifaTimeline() recognised none')
  })

  it('names a booking key the feed stopped sending', async () => {
    const detail = without(FIFA_DETAIL, 'HomeTeam.Bookings.0.Minute')
    const { ledger } = await drive(source, fifaRoutes({ detail }))
    // Present on the away side, so SAMPLED is satisfied - what proves the
    // descent happened at all is that the key is watched rather than unchecked.
    expect(ledger.verdict('detail.team.Bookings[].Minute')).toBe('ok')
  })

  it('catches a bracket that can no longer name its final', async () => {
    // Every tie still renders - the count check cannot see this - but the round
    // the champion is read from is unidentifiable, so nobody is ever crowned.
    const bracket = replace(FIFA_BRACKET, 'KnockoutStages.0.Name', [
      { Locale: 'en-GB', Description: 'Ultimate Decider' },
    ])
    const { problems } = await drive(source, fifaRoutes({ bracket }))
    expect(problems.join(' ')).toContain('not one is named for the final')
  })

  it('treats a season with no bracket published as unchecked, not as drift', async () => {
    const { failures, ledger } = await drive(source, fifaRoutes({}, 404))
    expect(failures).toEqual([])
    expect(ledger.unchecked()).toContain('bracket.KnockoutStages')
  })

  it('does not cry wolf when the season has not been played', async () => {
    const calendar = { Results: [fifaMatch('m1', { played: false, group: null })] }
    const bracket = {
      KnockoutStages: [
        {
          SequenceOrder: 1,
          Name: [{ Locale: 'en-GB', Description: 'Final' }],
          Matches: [
            {
              IdMatch: 'k1',
              MatchNumber: 64,
              MatchStatus: 1,
              Date: '2026-07-19T19:00:00Z',
              HomeTeam: null,
              AwayTeam: null,
              Winner: null,
            },
          ],
        },
      ],
    }
    const { failures, ledger } = await drive(source, fifaRoutes({ calendar, bracket }))
    expect(failures).toEqual([])
    expect(ledger.verdict('bracket.KnockoutStages[].Matches[].Winner')).toBe('absent')
  })

  it('reports rather than crashes when no season can be chosen', async () => {
    const { problems, status } = await drive(source, fifaRoutes({ seasons: { Results: [{ IdSeason: '1' }] } }))
    expect(status).toBe('red')
    expect(problems.join(' ')).toContain('pickFifaSeason() could not choose a season')
  })
})

// --------------------------------------------------------------------- uefa --

function uefaMatch(id: string, opts: { played?: boolean; group?: boolean } = {}) {
  const played = opts.played ?? true
  return {
    id,
    status: played ? 'FINISHED' : 'UPCOMING',
    kickOffTime: { dateTime: '2026-02-20T20:00:00Z' },
    homeTeam: { id: 'u-home', internationalName: 'Alpha', countryCode: 'ALP', bigLogoUrl: 'https://e.test/a.png' },
    awayTeam: { id: 'u-away', internationalName: 'Beta', countryCode: 'BET', bigLogoUrl: 'https://e.test/b.png' },
    score: played ? { total: { home: 2, away: 1 } } : null,
    round: { id: 'r1', metaData: { name: 'League phase' } },
    group: opts.group === false ? null : { metaData: { groupName: 'Group A' } },
    // `MD1`, which is the only shape /^MD(\d+)$/ accepts - a fixture saying
    // "Matchday 1" certifies the post-drift value as the healthy baseline.
    matchday: { name: 'MD1', phase: 'GROUP_STAGE' },
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
    timestamp: '2026-02-20T20:23:00Z',
    time: { minute: 23, injuryMinute: null },
    primaryActor: { type: 'PLAYER', team: { id: 'u-home' }, person: { id: 'p1', internationalName: 'A Striker' } },
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
    bench: [{ jerseyNumber: 12, player: { id: 'p3', internationalName: 'A Sub' } }],
  },
  awayTeam: {
    field: [
      {
        jerseyNumber: 1,
        player: { id: 'p2', internationalName: 'B Keeper', fieldPosition: 'GOALKEEPER' },
        fieldCoordinate: { x: 500, y: 100 },
      },
    ],
    bench: [{ jerseyNumber: 13, player: { id: 'p4', internationalName: 'B Sub' } }],
  },
}

function uefaRoutes(over: Partial<Record<'matches' | 'events' | 'lineups', unknown>> = {}): Route[] {
  return [
    { match: (u) => u.includes('/events?'), answer: over.events ?? UEFA_EVENTS },
    { match: (u) => u.includes('/lineups'), answer: over.lineups ?? UEFA_LINEUPS },
    {
      match: (u) => u.includes('/v5/matches?'),
      answer: over.matches ?? [uefaMatch('1'), uefaMatch('2', { played: false })],
    },
  ]
}

describe('uefa source', () => {
  const source = uefaSource('3')

  it('is green on a complete season', async () => {
    const { failures, status } = await drive(source, uefaRoutes())
    expect(failures).toEqual([])
    expect(status).toBe('green')
  })

  it('names exactly the required key the feed stopped sending', async () => {
    const matches = [without(uefaMatch('1'), 'kickOffTime.dateTime')]
    const { failures } = await drive(source, uefaRoutes({ matches }))
    expect(failures).toEqual([
      'match.kickOffTime.dateTime',
      '1 of 1 match(es) normalized without a kickoff time',
    ])
  })

  it('reports an away-side break under the away scope', async () => {
    const matches = [without(uefaMatch('1'), 'awayTeam.internationalName'), uefaMatch('2')]
    const { failures } = await drive(source, uefaRoutes({ matches }))
    expect(failures).toEqual(['match.awayTeam.internationalName'])
  })

  it('catches a matchday label that no longer yields a number', async () => {
    const matches = [replace(uefaMatch('1'), 'matchday.name', 'Matchday 1')]
    const { problems } = await drive(source, uefaRoutes({ matches }))
    expect(problems.join(' ')).toContain('not one yields a number')
  })

  it('catches a group label that no longer yields a letter', async () => {
    const matches = [replace(uefaMatch('1'), 'group.metaData.groupName', 'Pool ???')]
    const { problems } = await drive(source, uefaRoutes({ matches }))
    expect(problems.join(' ')).toContain('not one yields a group letter')
  })

  it('catches events that stopped producing timeline rows', async () => {
    const events = [{ ...UEFA_EVENTS[0], type: 'SOMETHING_NEW', subType: null }]
    const { problems } = await drive(source, uefaRoutes({ events }))
    expect(problems.join(' ')).toContain('recognised none')
  })

  it('reports a live season that has moved out from under the app', async () => {
    // The newest years answer with nothing and an older one carries the season:
    // greening on that archive is the bug this replaced.
    const played = [uefaMatch('1')]
    const routes: Route[] = [
      { match: (u) => u.includes('/events?'), answer: UEFA_EVENTS },
      { match: (u) => u.includes('/lineups'), answer: UEFA_LINEUPS },
      { match: (u) => u.includes('seasonYear=2025'), answer: [] },
      { match: (u) => u.includes('seasonYear=2024'), answer: [] },
      { match: (u) => u.includes('/v5/matches?'), answer: played },
    ]
    const { problems } = await drive(source, routes)
    expect(problems.join(' ')).toContain('is not where the app looks for it')
  })

  it('reports a competition empty in every season probed', async () => {
    const { problems } = await drive(source, uefaRoutes({ matches: [] }))
    expect(problems.join(' ')).toContain('no fixture for any of the seasons')
  })

  it('does not fail on a rare key whose context did not occur', async () => {
    const events = [without(UEFA_EVENTS[0], 'subType')]
    const { failures, ledger } = await drive(source, uefaRoutes({ events }))
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

function wrMatch(id: string, opts: { scores?: [number, number]; millis?: number | null; phase?: boolean } = {}) {
  const [home, away] = opts.scores ?? [24, 17]
  const match: Record<string, unknown> = {
    matchId: id,
    status: 'C',
    description: 'Example Cup - Round 1',
    time: { millis: opts.millis === undefined ? 1770000000000 : opts.millis, label: '20:00' },
    teams: [
      { id: 'w-home', name: 'Alpha', abbreviation: 'ALP' },
      { id: 'w-away', name: 'Beta', abbreviation: 'BET' },
    ],
    scores: [home, away],
    venue: { name: 'Example Park' },
    sport: 'mru',
    competition: 'Example Cup',
  }
  // A round-robin event publishes neither, on every fixture.
  if (opts.phase ?? true) {
    match.eventPhase = 'Pool A'
    match.eventPhaseId = { type: 'POOL', subType: 'A' }
  }
  return match
}

const WR_TIMELINE = {
  timeline: [
    { type: 'Try', typeLabel: 'Try', group: 'TRY', points: 5, teamIndex: 0, playerId: 'wp1', time: { secs: 600 } },
    { type: 'Con', typeLabel: 'Conversion', group: 'CON', points: 2, teamIndex: 0, playerId: 'wp2', time: { secs: 660 } },
    { type: 'Sub on', typeLabel: 'Substitution', points: 0, teamIndex: 0, playerId: 'wp3', time: { secs: 3000 }, link: 's7' },
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

function wrRoutes(over: Partial<Record<'catalog' | 'schedule' | 'timeline' | 'summary', unknown>> = {}): Route[] {
  return [
    { match: (u) => u.includes('/event?'), answer: over.catalog ?? WR_CATALOG },
    { match: (u) => u.includes('/schedule'), answer: over.schedule ?? { matches: [wrMatch('x1'), wrMatch('x2')] } },
    { match: (u) => u.includes('/timeline'), answer: over.timeline ?? WR_TIMELINE },
    { match: (u) => u.includes('/summary'), answer: over.summary ?? WR_SUMMARY },
  ]
}

describe('worldrugby source', () => {
  const source = worldRugbySource('mru')

  it('is green on a complete event', async () => {
    const { failures, status } = await drive(source, wrRoutes())
    expect(failures).toEqual([])
    expect(status).toBe('green')
  })

  it('names exactly the required key the feed stopped sending', async () => {
    const schedule = { matches: [without(wrMatch('x1'), 'teams.0.name'), wrMatch('x2')] }
    const { failures } = await drive(source, wrRoutes({ schedule }))
    expect(failures).toEqual(['match.teams[].name'])
  })

  it('does not cry wolf on a round-robin event with no phase at all', async () => {
    // Verified live: the Six Nations publishes null for every phase key on every
    // fixture. Levelled SAMPLED, this reddened the source every February.
    const schedule = { matches: [wrMatch('x1', { phase: false }), wrMatch('x2', { phase: false })] }
    const { failures, ledger } = await drive(source, wrRoutes({ schedule }))
    expect(failures).toEqual([])
    expect(ledger.verdict('match.eventPhase')).toBe('absent')
  })

  it('does not cry wolf on a fixture whose date is still to be confirmed', async () => {
    const schedule = { matches: [wrMatch('x1'), wrMatch('x2', { millis: null })] }
    const { failures } = await drive(source, wrRoutes({ schedule }))
    expect(failures).toEqual([])
  })

  it('catches every timed fixture losing its kickoff, which empties a competition in silence', async () => {
    const { problems } = await drive(source, wrRoutes({ schedule: { matches: [wrMatch('x1')] } }))
    expect(problems).toEqual([])
  })

  it('catches a timeline vocabulary that no longer maps to anything', async () => {
    const timeline = { timeline: WR_TIMELINE.timeline.map((e) => ({ ...e, type: 'ZZ', typeLabel: 'Mystery', group: 'ZZ' })) }
    const { problems } = await drive(source, wrRoutes({ timeline }))
    expect(problems.join(' ')).toContain('not one maps to a known kind')
  })

  it('catches a timeline clock that stopped being a number', async () => {
    const timeline = { timeline: WR_TIMELINE.timeline.map((e) => ({ ...e, time: { secs: String(e.time.secs) } })) }
    const { problems } = await drive(source, wrRoutes({ timeline }))
    expect(problems.join(' ')).toContain('are not numbers')
  })

  it('does not cry wolf when nothing in the event has been played', async () => {
    const schedule = { matches: [wrMatch('x1', { scores: [0, 0] })] }
    const { failures, ledger } = await drive(source, wrRoutes({ schedule }))
    expect(failures).toEqual([])
    expect(ledger.unchecked().some((key) => key.startsWith('timeline.'))).toBe(true)
  })

  it('reports a catalog carrying no event of this sub-feed', async () => {
    const catalog = { pageInfo: { numPages: 1 }, content: [{ ...WR_CATALOG.content[0], sport: 'wru' }] }
    const { problems } = await drive(source, wrRoutes({ catalog }))
    expect(problems.join(' ')).toContain('no mru event at all')
  })

  describe('pickEvents', () => {
    const started = { id: '1', sport: 'mru', start: { label: '2020-01-01T00:00:00Z' } }

    it('does not adopt an event the catalog left untagged', async () => {
      // `sport` is the only thing separating fifteens from sevens and age-grade,
      // so treating an untagged event as ours probes the wrong competition.
      expect(pickEvents([{ id: '1', start: { label: '2020-01-01T00:00:00Z' } }], 'mru', NOW)).toEqual([])
    })

    it("ignores the sub-feed's letter case", () => {
      expect(pickEvents([{ ...started, sport: 'MRU' }], 'mru', NOW)).toHaveLength(1)
    })

    it('falls back to a future event when none has started', () => {
      const future = { id: '2', sport: 'mru', start: { label: '2030-01-01T00:00:00Z' } }
      expect(pickEvents([future], 'mru', NOW)).toEqual([future])
    })

    it('prefers started events over future ones', () => {
      const future = { id: '2', sport: 'mru', start: { label: '2030-01-01T00:00:00Z' } }
      expect(pickEvents([future, started], 'mru', NOW)).toEqual([started])
    })
  })
})
