import { describe, it, expect } from 'vitest'
import { matchLiveDetailSchema } from './match'

// A live-detail payload the way the FIFA adapter normalizes it. The route parses
// its own response, so a shape drift here is a 500 rather than a client guessing
// at an opaque blob - which makes this schema worth pinning.
const detail = {
  minute: "47'",
  halfTime: false,
  possessionHome: 61,
  possessionAway: 39,
  attendance: 68_000,
  stadium: 'Wembley',
  cards: { home: { yellow: 2, red: 0 }, away: { yellow: 1, red: 1 } },
  goals: [
    {
      side: 'HOME',
      teamId: 't1',
      teamName: 'England',
      teamCode: 'ENG',
      playerId: 'p1',
      playerName: 'KANE',
      minute: "23'",
      goalType: 1,
      ownGoal: false,
      assistPlayerId: null,
      assistPlayerName: null,
    },
  ],
  bookings: [
    { side: 'AWAY', playerId: 'p9', playerName: 'COACH', minute: "60'", card: 'YELLOW', coach: true },
  ],
  substitutions: [
    { side: 'HOME', minute: "70'", playerOffId: 'p1', playerOffName: 'KANE', playerOnId: 'p2', playerOnName: 'FODEN' },
  ],
  playerNames: { p1: 'KANE' },
  ifesId: '133016',
  homeTeamId: 't1',
  awayTeamId: 't2',
  stats: {
    home: {
      possession: 61, attempts: 14, onTarget: 5, passes: 500, passesCompleted: 450,
      crosses: 12, corners: 6, fouls: 8, offsides: 1, distanceKm: 110, pressuresApplied: 90, forcedTurnovers: 20,
    },
    away: null,
  },
}

describe('matchLiveDetailSchema', () => {
  it('accepts a full normalized detail payload', () => {
    expect(matchLiveDetailSchema.parse(detail)).toMatchObject({ stadium: 'Wembley', ifesId: '133016' })
  })

  it('accepts a bare payload: no clock, no stats, no events', () => {
    const bare = {
      possessionHome: null, possessionAway: null, attendance: null, stadium: null,
      cards: { home: { yellow: 0, red: 0 }, away: { yellow: 0, red: 0 } },
      goals: [], bookings: [], substitutions: [],
      ifesId: null, homeTeamId: null, awayTeamId: null, stats: null,
    }
    expect(matchLiveDetailSchema.parse(bare).stats).toBeNull()
  })

  it('rejects a side or card value outside the normalizer contract', () => {
    expect(() => matchLiveDetailSchema.parse({ ...detail, goals: [{ ...detail.goals[0], side: 'MIDDLE' }] })).toThrow()
    expect(() => matchLiveDetailSchema.parse({ ...detail, bookings: [{ ...detail.bookings[0], card: 'BLUE' }] })).toThrow()
  })

  it('rejects a missing required block rather than shipping a half payload', () => {
    const { cards, ...noCards } = detail
    expect(() => matchLiveDetailSchema.parse(noCards)).toThrow()
    expect(() => matchLiveDetailSchema.parse({ ...detail, stadium: 42 })).toThrow()
  })

  it('drops a stat key the contract does not carry instead of 500ing the route', () => {
    const home = { ...detail.stats.home, xg: 2.1 }
    const parsed = matchLiveDetailSchema.parse({ ...detail, stats: { home, away: null } })
    expect(parsed.stats!.home).not.toHaveProperty('xg')
    expect(parsed.stats!.home!.attempts).toBe(14)
  })
})
