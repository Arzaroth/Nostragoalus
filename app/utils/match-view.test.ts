import { describe, it, expect } from 'vitest'
import { buildTimeline, h2hSummaryOf, minuteVal, HALFTIME_VAL, ET_HALFTIME_VAL, pbpIcon, isGoalKind, pbpTextSpec, pbpFlagCode } from './match-view'
import { EXTRA_TIME_BREAK_MINUTE } from '#shared/types/match'

describe('minuteVal', () => {
  it('orders regular and stoppage minutes; unknowns sort last', () => {
    expect(minuteVal("45'")).toBeLessThan(minuteVal("45'+2"))
    expect(minuteVal("45'+2")).toBeLessThan(minuteVal("46'"))
    expect(minuteVal(null)).toBe(Number.MAX_SAFE_INTEGER)
    expect(minuteVal('weird')).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('slots empty-minute halftime subs at the interval, not at the end', () => {
    // FIFA leaves halftime subs with an empty minute - they belong at the break.
    expect(minuteVal('')).toBe(HALFTIME_VAL)
    expect(minuteVal("45'+9")).toBeLessThan(minuteVal(''))
    expect(minuteVal('')).toBeLessThan(minuteVal("46'"))
    expect(minuteVal('')).toBeLessThan(minuteVal(null))
  })

  it('slots an extra-time-break sub near 105, after the half-time break', () => {
    expect(minuteVal(EXTRA_TIME_BREAK_MINUTE)).toBe(ET_HALFTIME_VAL)
    expect(minuteVal('')).toBeLessThan(minuteVal(EXTRA_TIME_BREAK_MINUTE))
    expect(minuteVal("105'+1")).toBeLessThan(minuteVal(EXTRA_TIME_BREAK_MINUTE))
    expect(minuteVal(EXTRA_TIME_BREAK_MINUTE)).toBeLessThan(minuteVal("106'"))
    expect(minuteVal(EXTRA_TIME_BREAK_MINUTE)).toBeLessThan(minuteVal(null))
  })
})

describe('buildTimeline', () => {
  const goals = [{ side: 'HOME', minute: "20'", playerName: 'A', ownGoal: false }]
  const bookings = [{ side: 'AWAY', minute: "10'", playerName: 'B', card: 'YELLOW', coach: false }]
  const substitutions = [{ side: 'HOME', minute: "60'", playerOnName: 'On', playerOffName: 'Off' }]
  const base = { goals, bookings, substitutions, homeCode: 'FRA', awayCode: 'BRA' }

  it('interleaves goals, cards and subs chronologically', () => {
    const t = buildTimeline({ ...base, showBookings: true, showSubs: true })
    expect(t.map((e) => e.kind)).toEqual(['card', 'goal', 'sub']) // 10', 20', 60'
    const card = t[0] as any
    expect(card).toMatchObject({ kind: 'card', teamCode: 'BRA' }) // away card -> away code
    const sub = t[2] as any
    expect(sub).toMatchObject({ kind: 'sub', playerName: 'On', offName: 'Off' })
  })

  it('places a halftime sub (empty minute) between first-half stoppage and the restart', () => {
    const t = buildTimeline({
      goals: [
        { side: 'HOME', minute: "45'+2", playerName: 'StoppageGoal', ownGoal: false },
        { side: 'AWAY', minute: "46'", playerName: 'RestartGoal', ownGoal: false },
      ],
      bookings: [],
      substitutions: [{ side: 'HOME', minute: '', playerOnName: 'On', playerOffName: 'Off' }],
      homeCode: 'FRA',
      awayCode: 'BRA',
      showBookings: true,
      showSubs: true,
    })
    expect(t.map((e) => e.playerName)).toEqual(['StoppageGoal', 'On', 'RestartGoal'])
  })

  it('places an extra-time-break sub at ~105, between the half-time sub and extra-time play', () => {
    const t = buildTimeline({
      goals: [
        { side: 'HOME', minute: "100'", playerName: 'Et1Goal', ownGoal: false },
        { side: 'AWAY', minute: "110'", playerName: 'Et2Goal', ownGoal: false },
      ],
      bookings: [],
      substitutions: [
        { side: 'HOME', minute: '', playerOnName: 'HtOn', playerOffName: 'HtOff' },
        { side: 'AWAY', minute: EXTRA_TIME_BREAK_MINUTE, playerOnName: 'EtOn', playerOffName: 'EtOff' },
      ],
      homeCode: 'FRA',
      awayCode: 'BRA',
      showBookings: true,
      showSubs: true,
    })
    expect(t.map((e) => e.playerName)).toEqual(['HtOn', 'Et1Goal', 'EtOn', 'Et2Goal'])
  })

  it('honors the visibility toggles', () => {
    expect(buildTimeline({ ...base, showBookings: false, showSubs: true }).some((e) => e.kind === 'card')).toBe(false)
    expect(buildTimeline({ ...base, showBookings: true, showSubs: false }).some((e) => e.kind === 'sub')).toBe(false)
    expect(buildTimeline({ ...base, showBookings: false, showSubs: false }).map((e) => e.kind)).toEqual(['goal'])
  })

  it('tolerates missing/undefined arrays', () => {
    expect(buildTimeline({ goals: [], bookings: [], substitutions: [], homeCode: null, awayCode: null, showBookings: true, showSubs: true })).toEqual([])
    // undefined inputs hit the `?? []` fallbacks
    expect(buildTimeline({ goals: undefined as never, bookings: undefined as never, substitutions: undefined as never, homeCode: null, awayCode: null, showBookings: true, showSubs: true })).toEqual([])
    expect(h2hSummaryOf(null, undefined, 'X')).toEqual({ homeWins: 0, draws: 0, awayWins: 0, goalsFor: 0, goalsAgainst: 0 })
  })
})

describe('h2hSummaryOf', () => {
  it('prefers the all-time tally when present', () => {
    const all = { wins: 5, draws: 1, losses: 0, goalsFor: 15, goalsAgainst: 6 }
    expect(h2hSummaryOf(all, [], 'Germany')).toEqual({ homeWins: 5, draws: 1, awayWins: 0, goalsFor: 15, goalsAgainst: 6 })
  })

  it('reduces our own meetings from the home team perspective', () => {
    const meetings = [
      { homeTeam: 'Spain', homeScore: 2, awayScore: 1, awayTeam: 'Germany' }, // Spain win
      { homeTeam: 'Germany', homeScore: 0, awayScore: 0, awayTeam: 'Spain' }, // draw
      { homeTeam: 'Germany', homeScore: 3, awayScore: 1, awayTeam: 'Spain' }, // Germany win
    ]
    // from Spain's perspective
    const s = h2hSummaryOf(null, meetings, 'Spain')
    expect(s).toEqual({ homeWins: 1, draws: 1, awayWins: 1, goalsFor: 2 + 0 + 1, goalsAgainst: 1 + 0 + 3 })
  })

  it('skips meetings without a result', () => {
    const s = h2hSummaryOf(null, [{ homeTeam: 'A', homeScore: null, awayScore: null, awayTeam: 'B' }], 'A')
    expect(s).toEqual({ homeWins: 0, draws: 0, awayWins: 0, goalsFor: 0, goalsAgainst: 0 })
  })
})

describe('match-view branch fill', () => {
  it('HOME card maps to the home code; away-winner meeting tallies a loss', () => {
    const t = buildTimeline({
      goals: [],
      bookings: [{ side: 'HOME', minute: "5'", playerName: 'H', card: 'RED', coach: false }],
      substitutions: [],
      homeCode: 'GER',
      awayCode: 'SCO',
      showBookings: true,
      showSubs: true,
    })
    expect((t[0] as any).teamCode).toBe('GER')

    // a meeting Spain lost (away team won)
    const s = h2hSummaryOf(null, [{ homeTeam: 'Spain', homeScore: 0, awayScore: 2, awayTeam: 'Italy' }], 'Spain')
    expect(s).toMatchObject({ homeWins: 0, awayWins: 1 })
  })
})

describe('pbpIcon', () => {
  it('maps known kinds to an emoji and unknown kinds to empty', () => {
    expect(pbpIcon('goal')).toBe('⚽')
    expect(pbpIcon('var')).toBe('📺')
    expect(pbpIcon('foul')).toBe('') // no whistle emoji - view draws the icon
    expect(pbpIcon('nonsense')).toBe('')
  })
})

describe('isGoalKind', () => {
  it('is true only for scoring kinds', () => {
    expect(isGoalKind('goal')).toBe(true)
    expect(isGoalKind('own-goal')).toBe(true)
    expect(isGoalKind('penalty-goal')).toBe(true)
    expect(isGoalKind('penalty-missed')).toBe(false)
    expect(isGoalKind('yellow')).toBe(false)
  })
})

describe('pbpTextSpec', () => {
  it('resolves period markers by key, and empty when the period is unknown/absent', () => {
    expect(pbpTextSpec({ kind: 'period', periodKind: 'half-time' })).toEqual({ key: 'match.pbp.period.halfTime' })
    // unknown periodKind still yields a (trailing-dot) key, matching prior behavior
    expect(pbpTextSpec({ kind: 'period', periodKind: 'mystery' })).toEqual({ key: 'match.pbp.period.' })
    expect(pbpTextSpec({ kind: 'period', periodKind: null })).toEqual({ key: '' })
  })

  it('renders VAR feed text as a literal, else the generic label', () => {
    expect(pbpTextSpec({ kind: 'var', text: 'Goal awarded after review' })).toEqual({ key: '', literal: 'Goal awarded after review' })
    expect(pbpTextSpec({ kind: 'var', text: '' })).toEqual({ key: 'match.pbpKind.var' })
    expect(pbpTextSpec({ kind: 'var' })).toEqual({ key: 'match.pbpKind.var' })
  })

  it('builds a sub line from both names (title-cased), else the generic label', () => {
    expect(pbpTextSpec({ kind: 'sub', playerInName: 'Kylian MBAPPÉ', playerOutName: 'Olivier GIROUD' })).toEqual({
      key: 'match.pbp.sub',
      params: { playerIn: 'Kylian Mbappé', playerOut: 'Olivier Giroud' },
    })
    expect(pbpTextSpec({ kind: 'sub', playerInName: 'A', playerOutName: null })).toEqual({ key: 'match.pbpKind.sub' })
  })

  it('templates a player-actor kind with the name, else falls back to the nameless label', () => {
    expect(pbpTextSpec({ kind: 'goal', playerName: 'Lionel MESSI' })).toEqual({ key: 'match.pbp.goal', params: { player: 'Lionel Messi' } })
    expect(pbpTextSpec({ kind: 'yellow', playerName: null })).toEqual({ key: 'match.pbpKind.yellow' })
    // a kind with a label but no player template (e.g. a penalty award)
    expect(pbpTextSpec({ kind: 'penalty-awarded' })).toEqual({ key: 'match.pbpKind.penaltyAwarded' })
    // a kind we don't recognize at all
    expect(pbpTextSpec({ kind: 'nonsense' })).toEqual({ key: '' })
  })
})

describe('pbpFlagCode', () => {
  it('picks the side code, null for neutral markers or missing codes', () => {
    expect(pbpFlagCode('HOME', 'FRA', 'ARG')).toBe('FRA')
    expect(pbpFlagCode('AWAY', 'FRA', 'ARG')).toBe('ARG')
    expect(pbpFlagCode(null, 'FRA', 'ARG')).toBeNull()
    expect(pbpFlagCode('HOME', null, 'ARG')).toBeNull()
    expect(pbpFlagCode('AWAY', 'FRA', undefined)).toBeNull()
  })
})
