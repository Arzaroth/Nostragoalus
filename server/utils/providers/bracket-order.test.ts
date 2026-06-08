import { describe, it, expect } from 'vitest'
import { orderBracketFeeders } from './bracket-order'
import type { BracketMatch, NormalizedBracket } from '../../../shared/types/match'

const bm = (id: string, home: string, away: string, winner: 'HOME' | 'AWAY' | null, kickoff = '2022-12-01'): BracketMatch => ({
  providerMatchId: id,
  homeTeam: home,
  homeCode: home,
  awayTeam: away,
  awayCode: away,
  homeScore: winner ? 1 : null,
  awayScore: winner ? 0 : null,
  homePens: null,
  awayPens: null,
  winner,
  status: winner ? 'FINISHED' : 'SCHEDULED',
  kickoffTime: kickoff,
})

describe('orderBracketFeeders', () => {
  it('aligns each round under its parents (WC2022 shape, scrambled input)', () => {
    const bracket: NormalizedBracket = {
      winner: { name: 'Argentina', code: 'ARG' },
      rounds: [
        // R16 deliberately scrambled
        { name: 'R16', sequence: 1, matches: [bm('r5', 'ENG', 'SEN', 'HOME'), bm('r1', 'NED', 'USA', 'HOME'), bm('r7', 'MAR', 'ESP', 'HOME'), bm('r3', 'JPN', 'CRO', 'AWAY'), bm('r2', 'ARG', 'AUS', 'HOME'), bm('r8', 'POR', 'SUI', 'HOME'), bm('r4', 'BRA', 'KOR', 'HOME'), bm('r6', 'FRA', 'POL', 'HOME')] },
        { name: 'QF', sequence: 2, matches: [bm('q3', 'MAR', 'POR', 'HOME'), bm('q1', 'CRO', 'BRA', 'HOME'), bm('q4', 'ENG', 'FRA', 'AWAY'), bm('q2', 'NED', 'ARG', 'AWAY')] },
        { name: 'SF', sequence: 3, matches: [bm('s2', 'FRA', 'MAR', 'HOME'), bm('s1', 'ARG', 'CRO', 'HOME')] },
        { name: '3rd', sequence: 4, matches: [bm('t', 'CRO', 'MAR', 'HOME')] },
        { name: 'Final', sequence: 5, matches: [bm('f', 'ARG', 'FRA', 'HOME')] },
      ],
    }
    const ordered = orderBracketFeeders(bracket)
    expect(ordered.rounds[2].matches.map((m) => m.providerMatchId)).toEqual(['s1', 's2'])
    expect(ordered.rounds[1].matches.map((m) => m.providerMatchId)).toEqual(['q2', 'q1', 'q4', 'q3'])
    // NED-ARG feeders (NED-USA, ARG-AUS) first, then CRO-BRA feeders (JPN-CRO, BRA-KOR)...
    expect(ordered.rounds[0].matches.map((m) => m.providerMatchId)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'])
    expect(ordered.rounds[3].matches[0].providerMatchId).toBe('t') // third place untouched
  })

  it('undecided feeders match by contained team; full TBD falls back to kickoff order', () => {
    const bracket: NormalizedBracket = {
      winner: null,
      rounds: [
        { name: 'SF', sequence: 1, matches: [bm('s2', 'GHA', 'DEN', null, '2026-07-08'), bm('s1', 'FRA', 'BRA', null, '2026-07-07')] },
        { name: 'Final', sequence: 2, matches: [{ ...bm('f', 'FRA', 'GHA', null), homeCode: 'FRA', awayCode: 'GHA' }] },
      ],
    }
    const ordered = orderBracketFeeders(bracket)
    expect(ordered.rounds[0].matches.map((m) => m.providerMatchId)).toEqual(['s1', 's2'])

    const tbd: NormalizedBracket = {
      winner: null,
      rounds: [
        { name: 'SF', sequence: 1, matches: [bm('b', 'TBD', 'TBD', null, '2026-07-09'), bm('a', 'TBD', 'TBD', null, '2026-07-08')] },
        { name: 'Final', sequence: 2, matches: [{ ...bm('f', 'TBD', 'TBD', null), homeCode: null, awayCode: null }] },
      ],
    }
    expect(orderBracketFeeders(tbd).rounds[0].matches.map((m) => m.providerMatchId)).toEqual(['a', 'b'])
  })
})

it('kickoff fallback tolerates missing dates', () => {
  const noDates: NormalizedBracket = {
    winner: null,
    rounds: [
      { name: 'SF', sequence: 1, matches: [{ ...bm('a', 'TBD', 'TBD', null), homeCode: null, awayCode: null, kickoffTime: undefined as unknown as string }, { ...bm('b', 'TBD', 'TBD', null), homeCode: null, awayCode: null, kickoffTime: undefined as unknown as string }] },
      { name: 'Final', sequence: 2, matches: [{ ...bm('f', 'TBD', 'TBD', null), homeCode: null, awayCode: null }] },
    ],
  }
  expect(orderBracketFeeders(noDates).rounds[0].matches).toHaveLength(2)
})
