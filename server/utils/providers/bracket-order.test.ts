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

  it('orders TBD feeders by their "W{n}" references (WC2026 R32, 1I/2I on opposite halves)', () => {
    const und = (id: string, home: string, away: string, kickoff?: string): BracketMatch => ({
      ...bm(id, home, away, null, kickoff),
      homeCode: null,
      awayCode: null,
    })
    // R32 as the provider lists it (kickoff order); each R16 slot references its
    // R32 feeder by match number ("W73"). Group I's winner (1I) and runner-up
    // (2I) must land in opposite halves - they can only meet in the final.
    const bracket: NormalizedBracket = {
      winner: null,
      rounds: [
        {
          name: 'Round of 32',
          sequence: 2,
          matches: [
            und('400021518', '2A', '2B', '2026-06-28T19:00'),
            und('400021516', '1C', '2F', '2026-06-29T17:00'),
            und('400021513', 'Germany', '3ABCDF', '2026-06-29T20:30'),
            und('400021522', '1F', '2C', '2026-06-30T01:00'),
            und('400021514', '2E', '2I', '2026-06-30T17:00'),
            und('400021523', '1I', '3CDFGH', '2026-06-30T21:00'),
            und('400021520', 'Mexico', '3CEFHI', '2026-07-01T01:00'),
            und('400021512', '1L', '3EHIJK', '2026-07-01T16:00'),
            und('400021525', '1G', '3AEHIJ', '2026-07-01T20:00'),
            und('400021524', 'USA', '3BEFIJ', '2026-07-02T00:00'),
            und('400021519', '1H', '2J', '2026-07-02T19:00'),
            und('400021526', '2K', '2L', '2026-07-02T23:00'),
            und('400021527', '1B', '3EFGIJ', '2026-07-03T03:00'),
            und('400021515', '2D', '2G', '2026-07-03T18:00'),
            und('400021521', '1J', '2H', '2026-07-03T22:00'),
            und('400021517', '1K', '3DEIJL', '2026-07-04T01:30'),
          ],
        },
        {
          name: 'Round of 16',
          sequence: 3,
          matches: [
            und('400021530', 'W73', 'W75'),
            und('400021533', 'W74', 'W77'),
            und('400021532', 'W76', 'W78'),
            und('400021531', 'W79', 'W80'),
            und('400021529', 'W83', 'W84'),
            und('400021534', 'W81', 'W82'),
            und('400021528', 'W86', 'W88'),
            und('400021535', 'W85', 'W87'),
          ],
        },
      ],
    }
    const r32 = orderBracketFeeders(bracket).rounds[0].matches
    expect(r32.map((m) => m.providerMatchId)).toEqual([
      '400021512', '400021514', '400021513', '400021516',
      '400021515', '400021517', '400021518', '400021519',
      '400021522', '400021523', '400021520', '400021521',
      '400021525', '400021527', '400021524', '400021526',
    ])
    const half = (slot: string) => Math.floor(r32.findIndex((m) => m.homeTeam === slot || m.awayTeam === slot) / 8)
    expect(half('1I')).not.toBe(half('2I'))
  })

  it('maps "RU{n}" references the same as "W{n}"', () => {
    const und = (id: string, home: string, away: string): BracketMatch => ({
      ...bm(id, home, away, null),
      homeCode: null,
      awayCode: null,
    })
    const bracket: NormalizedBracket = {
      winner: null,
      rounds: [
        { name: 'feeders', sequence: 1, matches: [und('9', 'TBD', 'TBD'), und('5', 'TBD', 'TBD')] },
        { name: 'consolation', sequence: 2, matches: [und('99', 'RU1', 'RU2')] },
      ],
    }
    // refs [1,2] sorted onto feeders by id [5,9]: RU1 -> 5, RU2 -> 9.
    expect(orderBracketFeeders(bracket).rounds[0].matches.map((m) => m.providerMatchId)).toEqual(['5', '9'])
  })

  it('mixes decided feeders (matched by code) with undecided ones (matched by ref)', () => {
    const und = (id: string, kickoff: string): BracketMatch => ({
      ...bm(id, 'TBD', 'TBD', null, kickoff),
      homeCode: null,
      awayCode: null,
    })
    // Once a feeder is decided, the provider swaps its parent placeholder for the
    // winner's code (so that slot matches by code); the rest stay "W{n}". Both
    // signals coexist and the bijection still holds (refs == undecided feeders).
    const bracket: NormalizedBracket = {
      winner: null,
      rounds: [
        {
          name: 'feeders',
          sequence: 1,
          matches: [
            und('40', '2026-01-04'),
            bm('10', 'ARG', 'OPP', 'HOME', '2026-01-01'),
            und('30', '2026-01-03'),
            und('20', '2026-01-02'),
          ],
        },
        {
          name: 'parents',
          sequence: 2,
          matches: [
            { ...bm('p1', 'ARG', 'W20', null), homeCode: 'ARG', awayCode: null },
            { ...bm('p2', 'W30', 'W40', null), homeCode: null, awayCode: null },
          ],
        },
      ],
    }
    expect(orderBracketFeeders(bracket).rounds[0].matches.map((m) => m.providerMatchId)).toEqual([
      '10',
      '20',
      '30',
      '40',
    ])
  })

  it('falls back to kickoff order when refs and feeders are not a clean bijection', () => {
    const und = (id: string, kickoff: string): BracketMatch => ({
      ...bm(id, 'TBD', 'TBD', null, kickoff),
      homeCode: null,
      awayCode: null,
    })
    const bracket: NormalizedBracket = {
      winner: null,
      rounds: [
        // Three feeders but four parent references - the count mismatch bails the
        // ref map, so the feeders keep kickoff order.
        {
          name: 'feeders',
          sequence: 1,
          matches: [und('300', '2026-01-03'), und('100', '2026-01-01'), und('200', '2026-01-02')],
        },
        {
          name: 'parents',
          sequence: 2,
          matches: [
            { ...bm('p1', 'W1', 'W2', null), homeCode: null, awayCode: null },
            { ...bm('p2', 'W3', 'W4', null), homeCode: null, awayCode: null },
          ],
        },
      ],
    }
    expect(orderBracketFeeders(bracket).rounds[0].matches.map((m) => m.providerMatchId)).toEqual(['100', '200', '300'])
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
