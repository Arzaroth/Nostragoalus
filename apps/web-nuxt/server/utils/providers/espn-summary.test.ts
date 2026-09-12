import { describe, it, expect } from 'vitest'
import {
  espnEventKind,
  espnPlayerNames,
  espnSummaryTeams,
  mapEspnPosition,
  parseEspnBookings,
  parseEspnGoals,
  parseEspnLineups,
  parseEspnMatchDetail,
  parseEspnMatchStats,
  parseEspnSubstitutions,
  parseEspnTimeline,
  type EspnKeyEvent,
  type EspnSummary,
} from './espn-summary'

const HOME = '164'
const AWAY = '202'

const TEAMS = {
  homeId: HOME,
  awayId: AWAY,
  homeName: 'Spain',
  homeCode: 'ESP',
  awayName: 'Argentina',
  awayCode: 'ARG',
}

function ev(type: string, text: string, over: Partial<EspnKeyEvent> = {}): EspnKeyEvent {
  return { type: { id: type, text }, clock: { displayValue: "10'" }, team: { id: HOME }, ...over }
}

function athlete(id: string, displayName: string) {
  return { athlete: { id, displayName } }
}

const summary: EspnSummary = {
  keyEvents: [
    ev('80', 'Kickoff', { clock: { displayValue: '' }, team: null }),
    ev('129', 'Start Delay'),
    ev('130', 'End Delay'),
    ev('94', 'Yellow Card', { clock: { displayValue: "41'" }, team: { id: AWAY }, participants: [athlete('1', 'Lisandro Martínez')] }),
    ev('76', 'Substitution', {
      clock: { displayValue: "44'" },
      team: { id: AWAY },
      participants: [athlete('2', 'Nicolás Otamendi'), athlete('1', 'Lisandro Martínez')],
    }),
    ev('81', 'Halftime', { clock: { displayValue: "45'+4'" }, team: null }),
    ev('82', 'Start 2nd Half', { clock: { displayValue: "45'" }, team: null }),
    ev('70', 'Goal', {
      clock: { displayValue: "60'" },
      scoringPlay: true,
      participants: [athlete('3', 'Ferran Torres'), athlete('4', 'Nico Williams')],
    }),
    ev('97', 'Own Goal', {
      clock: { displayValue: "70'" },
      scoringPlay: true,
      team: { id: HOME },
      participants: [athlete('5', 'Damián Bobadilla')],
    }),
    ev('98', 'Penalty - Scored', {
      clock: { displayValue: "80'" },
      scoringPlay: true,
      team: { id: AWAY },
      participants: [athlete('6', 'Lionel Messi')],
    }),
    ev('93', 'Red Card', { clock: { displayValue: "85'" }, team: { id: AWAY }, participants: [athlete('7', 'Sent Off')] }),
    ev('167', 'VAR - (Red) Card Upgrade', { clock: { displayValue: "86'" }, text: 'VAR Decision: Card Changed.' }),
    ev('104', 'Penalty - Scored', { clock: { displayValue: "120'" }, scoringPlay: true, shootout: true }),
    ev('83', 'End Regular Time', { clock: { displayValue: "90'+5'" }, team: null }),
  ],
  rosters: [
    {
      homeAway: 'home',
      formation: '4-2-3-1',
      team: { id: HOME, displayName: 'Spain', abbreviation: 'ESP' },
      coach: [{ firstName: 'Vincente', lastName: 'del Bosque' }],
      roster: [
        { starter: true, jersey: '23', position: { abbreviation: 'G' }, athlete: { id: '10', displayName: 'Unai Simón' } },
        { starter: true, jersey: '14', position: { abbreviation: 'CD-L' }, athlete: { id: '11', displayName: 'Aymeric Laporte' } },
        { starter: false, jersey: '7', position: { abbreviation: 'SUB' }, athlete: { id: '12', displayName: 'Bench Player', headshot: { href: 'shot.png' } } },
      ],
    },
    {
      homeAway: 'away',
      formation: '4-4-2',
      team: { id: AWAY, displayName: 'Argentina', abbreviation: 'ARG' },
      roster: [{ starter: true, jersey: '10', position: { abbreviation: 'AM' }, athlete: { id: '20', displayName: 'Lionel Messi' } }],
    },
  ],
  boxscore: {
    teams: [
      {
        team: { id: HOME },
        statistics: [
          { name: 'possessionPct', value: 65.1 },
          { name: 'totalShots', value: 20 },
          { name: 'shotsOnTarget', value: 12 },
          { name: 'totalPasses', value: 853 },
          { name: 'accuratePasses', value: 763 },
          { name: 'totalCrosses', value: 27 },
          { name: 'wonCorners', value: 9 },
          { name: 'foulsCommitted', value: 21 },
          { name: 'offsides', value: 4 },
          { name: 'yellowCards', value: 0 },
          { name: 'redCards', value: 0 },
        ],
      },
      {
        team: { id: AWAY },
        statistics: [
          { name: 'possessionPct', value: 34.9 },
          { name: 'yellowCards', value: 4 },
          { name: 'redCards', value: 1 },
        ],
      },
    ],
  },
  gameInfo: { venue: { fullName: 'MetLife Stadium' }, attendance: 80663 },
  header: {
    competitions: [
      {
        competitors: [
          { homeAway: 'home', team: { id: HOME } },
          { homeAway: 'away', team: { id: AWAY } },
        ],
        status: { displayClock: "90'", type: { name: 'STATUS_FULL_TIME' } },
      },
    ],
  },
}

describe('espnEventKind', () => {
  it.each([
    ['70', 'Goal', 'goal', { scoringPlay: true }],
    ['137', 'Goal - Header', 'goal', { scoringPlay: true }],
    ['97', 'Own Goal', 'own-goal', { scoringPlay: true }],
    ['98', 'Penalty - Scored', 'penalty-goal', {}],
    ['99', 'Penalty - Missed', 'penalty-missed', {}],
    ['94', 'Yellow Card', 'yellow', {}],
    ['95', 'Yellow Card 2', 'second-yellow', {}],
    ['93', 'Red Card', 'red', {}],
    ['76', 'Substitution', 'sub', {}],
    ['80', 'Kickoff', 'period', {}],
    ['167', 'VAR - (Red) Card Upgrade', 'var', {}],
  ])('maps type %s (%s) to %s', (type, text, expected, over) => {
    expect(espnEventKind(ev(type, text, over))).toBe(expected)
  })

  it.each([
    ['129', 'Start Delay'],
    ['130', 'End Delay'],
    ['85', 'Halftime Extra Time'],
    ['86', 'Start 2nd Half Extra Time'],
  ])('drops the noise type %s (%s)', (type, text) => {
    expect(espnEventKind(ev(type, text))).toBeNull()
  })

  it('drops a shootout penalty, which is not a goal in the match', () => {
    expect(espnEventKind(ev('104', 'Penalty - Scored', { scoringPlay: true, shootout: true }))).toBeNull()
  })

  it('drops an unknown type', () => {
    expect(espnEventKind(ev('999', 'Something New'))).toBeNull()
  })
})

describe('parseEspnTimeline', () => {
  const events = parseEspnTimeline(summary, { homeTeamId: HOME, awayTeamId: AWAY })

  it('keeps only the meaningful rows', () => {
    expect(events.map((e) => e.kind)).toEqual([
      'period', 'yellow', 'sub', 'period', 'period', 'goal', 'own-goal', 'penalty-goal', 'red', 'var', 'period',
    ])
  })

  it('runs the score forward, counting an own goal for the side it benefits', () => {
    const goals = events.filter((e) => ['goal', 'own-goal', 'penalty-goal'].includes(e.kind))
    expect(goals.map((g) => [g.kind, g.side, g.homeScore, g.awayScore])).toEqual([
      ['goal', 'HOME', 1, 0],
      ['own-goal', 'HOME', 2, 0],
      ['penalty-goal', 'AWAY', 2, 1],
    ])
  })

  it('names the substitute coming on and the player going off', () => {
    const sub = events.find((e) => e.kind === 'sub')!
    expect(sub).toMatchObject({
      side: 'AWAY',
      minute: "44'",
      playerName: null,
      playerInName: 'Nicolás Otamendi',
      playerOutName: 'Lisandro Martínez',
    })
  })

  it('keeps the provider text only for VAR, which we cannot phrase ourselves', () => {
    expect(events.find((e) => e.kind === 'var')!.text).toBe('VAR Decision: Card Changed.')
    expect(events.filter((e) => e.kind !== 'var').every((e) => e.text === null)).toBe(true)
  })

  it('labels the period markers and gives a period row no side', () => {
    const periods = events.filter((e) => e.kind === 'period')
    expect(periods.map((p) => p.periodKind)).toEqual(['kickoff', 'half-time', 'second-half', 'full-time'])
    expect(periods.every((p) => p.side === null)).toBe(true)
  })

  it('calls the end of regular time the second-half end when extra time follows', () => {
    const withEt = parseEspnTimeline(
      { keyEvents: [ev('83', 'End Regular Time', { team: null }), ev('84', 'Start Extra Time', { team: null })] },
      { homeTeamId: HOME, awayTeamId: AWAY },
    )
    expect(withEt.map((e) => e.periodKind)).toEqual(['second-half-end', 'extra-time'])
  })

  it('leaves the side null when the team matches neither', () => {
    const orphan = parseEspnTimeline({ keyEvents: [ev('94', 'Yellow Card', { team: { id: '999' } })] }, { homeTeamId: HOME, awayTeamId: AWAY })
    expect(orphan[0].side).toBeNull()
  })

  it('tolerates a document with no events', () => {
    expect(parseEspnTimeline({})).toEqual([])
  })
})

describe('parseEspnGoals', () => {
  const goals = parseEspnGoals(summary, TEAMS)

  it('credits an own goal to the benefiting side while naming the opposing scorer', () => {
    expect(goals.map((g) => [g.side, g.playerName, g.ownGoal, g.teamCode])).toEqual([
      ['HOME', 'Ferran Torres', false, 'ESP'],
      ['HOME', 'Damián Bobadilla', true, 'ESP'],
      ['AWAY', 'Lionel Messi', false, 'ARG'],
    ])
  })

  it('reads the assister off an open-play goal only', () => {
    expect(goals[0]).toMatchObject({ assistPlayerName: 'Nico Williams', assistPlayerId: '4', minute: "60'" })
    expect(goals[1].assistPlayerName).toBeNull()
    expect(goals[2].assistPlayerName).toBeNull()
  })

  it('drops a goal it cannot attribute to either side', () => {
    const orphan = parseEspnGoals({ keyEvents: [ev('70', 'Goal', { scoringPlay: true, team: { id: '999' } })] }, TEAMS)
    expect(orphan).toEqual([])
  })

  it('names an unknown scorer rather than dropping the goal', () => {
    const anon = parseEspnGoals({ keyEvents: [ev('70', 'Goal', { scoringPlay: true, participants: [] })] }, TEAMS)
    expect(anon[0]).toMatchObject({ playerName: 'Unknown', playerId: null })
  })
})

describe('parseEspnBookings', () => {
  it('reads both cards with their side', () => {
    expect(parseEspnBookings(summary, HOME)).toEqual([
      { side: 'AWAY', playerId: '1', playerName: 'Lisandro Martínez', minute: "41'", card: 'YELLOW' },
      { side: 'AWAY', playerId: '7', playerName: 'Sent Off', minute: "85'", card: 'RED' },
    ])
  })

  it('reads a second yellow as its own card', () => {
    const second = parseEspnBookings({ keyEvents: [ev('95', 'Yellow Card 2', { participants: [athlete('9', 'Booked')] })] }, HOME)
    expect(second[0].card).toBe('SECOND_YELLOW')
  })

  it('skips a booking with no team', () => {
    expect(parseEspnBookings({ keyEvents: [ev('94', 'Yellow Card', { team: null })] }, HOME)).toEqual([])
  })
})

describe('parseEspnSubstitutions', () => {
  it('reads the pair in the feed order, on first', () => {
    expect(parseEspnSubstitutions(summary, HOME)).toEqual([
      {
        side: 'AWAY',
        minute: "44'",
        playerOnId: '2',
        playerOnName: 'Nicolás Otamendi',
        playerOffId: '1',
        playerOffName: 'Lisandro Martínez',
      },
    ])
  })

  it('skips a substitution with no team', () => {
    expect(parseEspnSubstitutions({ keyEvents: [ev('76', 'Substitution', { team: null })] }, HOME)).toEqual([])
  })
})

describe('parseEspnMatchStats', () => {
  it('maps the boxscore names onto the app stat shape', () => {
    const stats = parseEspnMatchStats(summary)
    expect(stats[HOME]).toEqual({
      possession: 65.1,
      attempts: 20,
      onTarget: 12,
      passes: 853,
      passesCompleted: 763,
      crosses: 27,
      corners: 9,
      fouls: 21,
      offsides: 4,
      distanceKm: null,
      pressuresApplied: null,
      forcedTurnovers: null,
    })
  })

  it('leaves a stat ESPN does not publish as null', () => {
    expect(parseEspnMatchStats(summary)[AWAY]).toMatchObject({ attempts: null, passes: null, possession: 34.9 })
  })

  it('skips a boxscore team with no id, and tolerates an empty document', () => {
    expect(parseEspnMatchStats({ boxscore: { teams: [{ statistics: [] }] } })).toEqual({})
    expect(parseEspnMatchStats({})).toEqual({})
  })
})

describe('mapEspnPosition', () => {
  it.each([
    ['G', 'GK'],
    ['CD-L', 'DF'],
    ['CD', 'DF'],
    ['LB', 'DF'],
    ['RB', 'DF'],
    ['SW', 'DF'],
    ['DM', 'MF'],
    ['CM-R', 'MF'],
    ['AM', 'MF'],
    ['LM', 'MF'],
    ['M', 'MF'],
    ['F', 'FW'],
    ['CF-L', 'FW'],
    ['RF', 'FW'],
    ['RCF', 'FW'],
  ])('maps the played position %s to %s', (abbr, expected) => {
    expect(mapEspnPosition(abbr)).toBe(expected)
  })

  it('has no position for a bench slot or an unknown token', () => {
    expect(mapEspnPosition('SUB')).toBeNull()
    expect(mapEspnPosition('')).toBeNull()
    expect(mapEspnPosition(null)).toBeNull()
    expect(mapEspnPosition('ZZ')).toBeNull()
  })
})

describe('parseEspnLineups', () => {
  it('splits the XI from the bench and keeps the formation and coach', () => {
    const lineups = parseEspnLineups(summary)!
    expect(lineups.available).toBe(true)
    expect(lineups.home.formation).toBe('4-2-3-1')
    expect(lineups.home.coach).toBe('Vincente del Bosque')
    expect(lineups.home.startingXI.map((p) => [p.shirtNumber, p.name, p.position])).toEqual([
      [23, 'Unai Simón', 'GK'],
      [14, 'Aymeric Laporte', 'DF'],
    ])
    expect(lineups.home.bench[0]).toMatchObject({ name: 'Bench Player', position: null, pictureUrl: 'shot.png' })
  })

  it('has no coach when the feed ships none', () => {
    expect(parseEspnLineups(summary)!.away.coach).toBeNull()
  })

  it('is unavailable until both sides have a published XI', () => {
    const early: EspnSummary = {
      rosters: [
        { homeAway: 'home', team: { id: HOME }, roster: [] },
        { homeAway: 'away', team: { id: AWAY }, roster: [] },
      ],
    }
    expect(parseEspnLineups(early)!.available).toBe(false)
  })

  it('returns null when the document carries no rosters at all', () => {
    expect(parseEspnLineups({})).toBeNull()
  })
})

describe('espnSummaryTeams', () => {
  it('reads the sides off the rosters', () => {
    expect(espnSummaryTeams(summary)).toEqual(TEAMS)
  })

  it('falls back to the header competitors before a squad is published', () => {
    expect(espnSummaryTeams({ header: summary.header })).toEqual({
      homeId: HOME,
      awayId: AWAY,
      homeName: 'TBD',
      homeCode: null,
      awayName: 'TBD',
      awayCode: null,
    })
  })

  it('tolerates an empty document', () => {
    expect(espnSummaryTeams({})).toMatchObject({ homeId: null, awayId: null, homeName: 'TBD' })
  })
})

describe('espnPlayerNames', () => {
  it('indexes every rostered player by id', () => {
    expect(espnPlayerNames(summary)).toEqual({
      '10': 'Unai Simón',
      '11': 'Aymeric Laporte',
      '12': 'Bench Player',
      '20': 'Lionel Messi',
    })
  })

  it('skips an entry with no id or no name', () => {
    expect(espnPlayerNames({ rosters: [{ roster: [{ athlete: { displayName: 'No Id' } }, { athlete: { id: '1' } }] }] })).toEqual({})
  })
})

describe('malformed payloads', () => {
  it('survives an event with no type, no clock and no participants', () => {
    const bare: EspnSummary = {
      keyEvents: [
        { scoringPlay: true, team: { id: HOME } },
        { type: { id: '94' }, team: { id: HOME } },
        { type: { id: '76' }, team: { id: HOME } },
      ],
    }
    expect(parseEspnTimeline(bare, { homeTeamId: HOME, awayTeamId: AWAY })).toMatchObject([
      { kind: 'goal', minute: null, playerName: null },
      { kind: 'yellow', minute: null },
      { kind: 'sub', minute: null, playerInName: null, playerOutName: null },
    ])
    expect(parseEspnBookings(bare, HOME)).toEqual([{ side: 'HOME', playerId: null, playerName: 'Unknown', minute: null, card: 'YELLOW' }])
    expect(parseEspnSubstitutions(bare, HOME)).toEqual([
      { side: 'HOME', minute: null, playerOnId: null, playerOnName: 'Unknown', playerOffId: null, playerOffName: 'Unknown' },
    ])
  })

  it('ignores a participant carrying no name', () => {
    const events: EspnKeyEvent[] = [{ type: { id: '94' }, team: { id: AWAY }, participants: [{ athlete: { id: '1' } }, { athlete: null }] }]
    expect(parseEspnBookings({ keyEvents: events }, HOME)[0].playerName).toBe('Unknown')
  })

  it('treats a VAR event with no text as having none', () => {
    const events: EspnKeyEvent[] = [{ type: { id: '900', text: 'VAR - Goal Review' }, team: { id: HOME } }]
    expect(parseEspnTimeline({ keyEvents: events }, { homeTeamId: HOME })[0]).toMatchObject({ kind: 'var', text: null })
  })

  it('leaves the running score alone for a goal it cannot attribute', () => {
    const events: EspnKeyEvent[] = [{ type: { id: '70' }, scoringPlay: true, team: { id: '999' } }]
    expect(parseEspnTimeline({ keyEvents: events }, { homeTeamId: HOME, awayTeamId: AWAY })[0]).toMatchObject({
      side: null,
      homeScore: 0,
      awayScore: 0,
    })
  })

  it('reads a boxscore stat published only as a display value', () => {
    const doc: EspnSummary = { boxscore: { teams: [{ team: { id: HOME }, statistics: [{ name: 'possessionPct', displayValue: '55.5' }, { displayValue: '9' }] }] } }
    expect(parseEspnMatchStats(doc)[HOME].possession).toBe(55.5)
  })

  it('falls back through the player name fields and tolerates a missing id', () => {
    const doc: EspnSummary = {
      rosters: [
        { homeAway: 'home', team: { id: HOME }, roster: [{ starter: true, jersey: 'x', athlete: { shortName: 'Short' } }, { starter: true, athlete: {} }] },
        { homeAway: 'away', team: { id: AWAY }, roster: [] },
      ],
    }
    const xi = parseEspnLineups(doc)!.home.startingXI
    expect(xi.map((p) => [p.playerId, p.name, p.shirtNumber])).toEqual([
      ['', 'Short', null],
      ['', '?', null],
    ])
  })

  it('falls back to roster order when neither side is labelled', () => {
    const doc: EspnSummary = {
      rosters: [
        { team: { id: HOME, displayName: 'Spain', abbreviation: 'ESP' }, roster: [] },
        { team: { id: AWAY, displayName: 'Argentina', abbreviation: 'ARG' }, roster: [] },
      ],
    }
    expect(espnSummaryTeams(doc)).toMatchObject({ homeId: null, awayId: null })
    expect(parseEspnLineups(doc)).toMatchObject({ available: false })
  })

  it('treats a coach with blank names as none, and a roster with no players as empty', () => {
    const doc: EspnSummary = {
      rosters: [
        { homeAway: 'home', team: { id: HOME }, coach: [{ firstName: '', lastName: '' }] },
        { homeAway: 'away', team: { id: AWAY } },
      ],
    }
    const lineups = parseEspnLineups(doc)!
    expect(lineups.home.coach).toBeNull()
    expect(lineups.home.startingXI).toEqual([])
    expect(lineups.away.bench).toEqual([])
    expect(espnPlayerNames(doc)).toEqual({})
  })
})

describe('parseEspnMatchDetail', () => {
  const detail = parseEspnMatchDetail(summary, '760517', TEAMS)

  it('reads the venue, possession and cards', () => {
    expect(detail).toMatchObject({
      stadium: 'MetLife Stadium',
      attendance: 80663,
      possessionHome: 65.1,
      possessionAway: 34.9,
      minute: "90'",
      halfTime: false,
      homeTeamId: HOME,
      awayTeamId: AWAY,
    })
    expect(detail.cards).toEqual({ home: { yellow: 0, red: 0 }, away: { yellow: 4, red: 1 } })
  })

  it('carries the event id as the stats key so the summary is reused', () => {
    expect(detail.ifesId).toBe('760517')
  })

  it('flags half-time so the UI can say HT instead of a bare LIVE', () => {
    const atBreak = parseEspnMatchDetail(
      { ...summary, header: { competitions: [{ status: { displayClock: "45'", type: { name: 'STATUS_HALFTIME' } } }] } },
      '1',
      TEAMS,
    )
    expect(atBreak.halfTime).toBe(true)
  })

  it('tolerates a document with nothing in it', () => {
    const empty = parseEspnMatchDetail({}, '1', TEAMS)
    expect(empty).toMatchObject({ stadium: null, attendance: null, possessionHome: null, goals: [], bookings: [] })
    expect(empty.cards).toEqual({ home: { yellow: 0, red: 0 }, away: { yellow: 0, red: 0 } })
  })
})
