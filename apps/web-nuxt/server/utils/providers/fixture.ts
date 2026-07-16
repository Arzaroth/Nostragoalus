import type { NormalizedBracket, NormalizedMatch } from '../../../shared/types/match'
import type { ListFixturesOptions, MatchDataProvider } from './types'

/**
 * A canned, offline provider for the e2e stack. The real providers source the
 * bracket over HTTP from FIFA/UEFA, which leaves nothing for a spec to assert
 * against without live network; this returns a fixed 8-team tree instead.
 *
 * The tree models a real late-tournament state rather than a tidy finished one:
 * every tie is played except the final, which is scheduled with both sides
 * already official - the shape of a bracket on the morning of the last match,
 * and the only source of a genuinely undecided card for the specs. The
 * third-place tie is named "Bronze final" on purpose: that is what the live feed
 * calls it, and mis-reading that name is what 4.2.5 fixed.
 *
 * Nothing outside a competition row seeded with provider='fixture' reaches this,
 * and no route writes that column today - but that is an absence, not a guard,
 * so do not treat it as a security boundary.
 */

interface Tie {
  n: number
  home: [string, string]
  away: [string, string]
  score: [number, number] | null
}

const QUARTERS: Tie[] = [
  { n: 1, home: ['Brazil', 'BRA'], away: ['Croatia', 'CRO'], score: [2, 1] },
  { n: 2, home: ['Netherlands', 'NED'], away: ['Argentina', 'ARG'], score: [0, 2] },
  { n: 3, home: ['Morocco', 'MAR'], away: ['Portugal', 'POR'], score: [1, 0] },
  { n: 4, home: ['England', 'ENG'], away: ['France', 'FRA'], score: [1, 2] },
]
const SEMIS: Tie[] = [
  { n: 5, home: ['Brazil', 'BRA'], away: ['Argentina', 'ARG'], score: [0, 3] },
  { n: 6, home: ['Morocco', 'MAR'], away: ['France', 'FRA'], score: [0, 2] },
]
const THIRD: Tie[] = [{ n: 7, home: ['Brazil', 'BRA'], away: ['Morocco', 'MAR'], score: [2, 1] }]
// Both sides official (the semis are done), but not yet played.
const FINAL: Tie[] = [{ n: 8, home: ['Argentina', 'ARG'], away: ['France', 'FRA'], score: null }]

function tieToMatch(t: Tie) {
  const [hs, as] = t.score ?? [null, null]
  return {
    providerMatchId: `fx-m${t.n}`,
    matchNumber: t.n,
    homeTeam: t.home[0],
    homeCode: t.home[1],
    awayTeam: t.away[0],
    awayCode: t.away[1],
    homeScore: hs,
    awayScore: as,
    homePens: null,
    awayPens: null,
    winner: t.score ? ((hs! > as! ? 'HOME' : 'AWAY') as 'HOME' | 'AWAY') : null,
    status: t.score ? ('FINISHED' as const) : ('SCHEDULED' as const),
    kickoffTime: `2026-07-0${t.n}T18:00:00Z`,
  }
}

export function fixtureBracket(): NormalizedBracket {
  return {
    // No champion: the final has not been played. 4.2.5 shipped a fix for
    // crowning one early, so the canned tree must not hand it back for free.
    winner: null,
    rounds: [
      { name: 'Quarter-final', sequence: 1, matches: QUARTERS.map(tieToMatch) },
      { name: 'Semi-final', sequence: 2, matches: SEMIS.map(tieToMatch) },
      { name: 'Bronze final', sequence: 3, matches: THIRD.map(tieToMatch) },
      { name: 'Final', sequence: 4, matches: FINAL.map(tieToMatch) },
    ],
  }
}

export function fixtureProvider(): MatchDataProvider {
  return {
    meta: { name: 'fixture', rateLimitPerMin: 0, dailyCap: null },
    async listFixtures(_opts: ListFixturesOptions): Promise<NormalizedMatch[]> {
      return []
    },
    async getMatchesByDate(_date: string): Promise<NormalizedMatch[]> {
      return []
    },
    async getLiveMatches(): Promise<NormalizedMatch[]> {
      return []
    },
    async getBracket(): Promise<NormalizedBracket> {
      return fixtureBracket()
    },
  }
}
