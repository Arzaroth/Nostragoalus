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

  it('orders TBD feeders by their real "W{n}" match numbers (WC2026), ignoring provider-id order', () => {
    const und = (id: string, num: number, home: string, away: string): BracketMatch => ({
      ...bm(id, home, away, null),
      matchNumber: num,
      homeCode: null,
      awayCode: null,
    })
    // The FIFA feed tags each match with its tournament number, and R16 slots
    // reference their R32 feeder by it ("W73"). The provider ids 512-527 are NOT
    // in match-number order (id 512 is match 80, id 518 is match 73...), so a
    // wiring that assumed id order mis-paired every R16. Resolve by number.
    const bracket: NormalizedBracket = {
      winner: null,
      rounds: [
        {
          name: 'Round of 32',
          sequence: 2,
          matches: [
            und('400021512', 80, 'ENG', 'COD'),
            und('400021513', 74, 'GER', 'PAR'),
            und('400021514', 78, 'CIV', 'NOR'),
            und('400021515', 88, 'AUS', 'EGY'),
            und('400021516', 76, 'BRA', 'JPN'),
            und('400021517', 87, 'COL', 'GHA'),
            und('400021518', 73, 'RSA', 'CAN'),
            und('400021519', 84, 'ESP', 'AUT'),
            und('400021520', 79, 'MEX', 'ECU'),
            und('400021521', 86, 'ARG', 'CPV'),
            und('400021522', 75, 'NED', 'MAR'),
            und('400021523', 77, 'FRA', 'SWE'),
            und('400021524', 81, 'USA', 'BIH'),
            und('400021525', 82, 'BEL', 'SEN'),
            und('400021526', 83, 'POR', 'CRO'),
            und('400021527', 85, 'SUI', 'ALG'),
          ],
        },
        {
          name: 'Round of 16',
          sequence: 3,
          matches: [
            und('400021533', 89, 'W74', 'W77'),
            und('400021530', 90, 'W73', 'W75'),
            und('400021532', 91, 'W76', 'W78'),
            und('400021531', 92, 'W79', 'W80'),
            und('400021529', 93, 'W83', 'W84'),
            und('400021534', 94, 'W81', 'W82'),
            und('400021528', 95, 'W86', 'W88'),
            und('400021535', 96, 'W85', 'W87'),
          ],
        },
      ],
    }
    const r32 = orderBracketFeeders(bracket).rounds[0].matches
    // Each R16 parent (in order) sits above its two feeders - the result must be
    // the official FIFA pairing, not the provider-id sort.
    expect(r32.map((m) => m.matchNumber)).toEqual([74, 77, 73, 75, 76, 78, 79, 80, 83, 84, 81, 82, 86, 88, 85, 87])
    const half = (code: string) => Math.floor(r32.findIndex((m) => m.homeTeam === code || m.awayTeam === code) / 8)
    // Brazil (W76, top half) and Argentina (W86, bottom half) can only meet in the final.
    expect(half('BRA')).not.toBe(half('ARG'))
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
