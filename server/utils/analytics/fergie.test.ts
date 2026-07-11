import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES, type ScoringRules } from '../scoring/config'
import type { PredictionInput } from '../scoring/engine'
import { computeFergie, type FergieGoal, type FergieMatchInput } from './fergie'

// The user is 'me'; everyone else fills the field so the crowd bonus can fire.
function me(home: number, away: number, isJoker = false): PredictionInput {
  return { id: 'me', home, away, isJoker }
}
function other(i: number, home: number, away: number): PredictionInput {
  return { id: `p${i}`, home, away, isJoker: false }
}

function match(over: Partial<FergieMatchInput>): FergieMatchInput {
  return {
    home: 'Home',
    away: 'Away',
    homeCode: 'HOM',
    awayCode: 'AWY',
    predId: 'me',
    isJoker: false,
    actual: { home: 2, away: 1 },
    forceJoker: false,
    field: [me(2, 1)],
    goals: [],
    ...over,
  }
}

const RULES: ScoringRules = DEFAULT_RULES

describe('computeFergie', () => {
  it('is empty with no matches', () => {
    const r = computeFergie([], RULES)
    expect(r).toEqual({
      matches: 0,
      goals: 0,
      netPoints: 0,
      pointsWon: 0,
      pointsLost: 0,
      biggestGain: null,
      biggestLoss: null,
      breakdown: [],
    })
  })

  it('banks the real-points swing of a late winner (base only)', () => {
    // 1-0, 1-1, then a 90'+3' home winner: pick 2-1 goes MISS(0) -> EXACT(3).
    const r = computeFergie(
      [
        match({
          goals: [
            { side: 'HOME', minute: "30'" },
            { side: 'AWAY', minute: "60'" },
            { side: 'HOME', minute: "90'+3'" },
          ],
        }),
      ],
      RULES,
    )
    expect(r).toMatchObject({ matches: 1, goals: 1, pointsWon: 3, pointsLost: 0, netPoints: 3 })
    expect(r.biggestGain).toMatchObject({ predicted: '2-1', actual: '2-1', gained: 3, net: 3 })
    expect(r.breakdown).toHaveLength(1)
  })

  it('includes the crowd rarity bonus in the swing', () => {
    // At 2-1 only the user called the exact among 6 home-win backers: a rare
    // exact earns a crowd bonus on top of the base 3. At 1-1 the pick is a miss,
    // so the swing carries the whole base + bonus.
    const field: PredictionInput[] = [
      me(2, 1),
      other(1, 1, 0),
      other(2, 3, 1),
      other(3, 2, 0),
      other(4, 4, 2),
      other(5, 3, 2),
      other(6, 0, 0),
      other(7, 1, 1),
      other(8, 0, 1),
      other(9, 0, 2),
    ]
    const goals: FergieGoal[] = [
      { side: 'HOME', minute: "30'" },
      { side: 'AWAY', minute: "60'" },
      { side: 'HOME', minute: "90'+3'" },
    ]
    const r = computeFergie([match({ field, goals })], RULES)
    // Base 3 + a non-zero crowd bonus, so strictly more than the base-only 3.
    expect(r.netPoints).toBeGreaterThan(3)
    expect(r.biggestGain?.gained).toBe(r.netPoints)
  })

  it('doubles the swing for a joker pick', () => {
    const base = computeFergie(
      [match({ goals: [{ side: 'HOME', minute: "30'" }, { side: 'AWAY', minute: "60'" }, { side: 'HOME', minute: "90'+3'" }] })],
      RULES,
    )
    const joker = computeFergie(
      [
        match({
          isJoker: true,
          field: [me(2, 1, true)],
          goals: [{ side: 'HOME', minute: "30'" }, { side: 'AWAY', minute: "60'" }, { side: 'HOME', minute: "90'+3'" }],
        }),
      ],
      RULES,
    )
    expect(joker.netPoints).toBe(base.netPoints * RULES.jokerMultiplier)
  })

  it('splits a match nailed then lost within added time', () => {
    // 2-0 at 90', 90'+5' away makes it the exact 2-1, 90'+6' home breaks it to 3-1.
    const r = computeFergie(
      [
        match({
          actual: { home: 3, away: 1 },
          field: [me(2, 1)],
          goals: [
            { side: 'HOME', minute: "60'" },
            { side: 'HOME', minute: "82'" },
            { side: 'AWAY', minute: "90'+5'" },
            { side: 'HOME', minute: "90'+6'" },
          ],
        }),
      ],
      RULES,
    )
    expect(r).toMatchObject({ matches: 1, goals: 2, pointsWon: 2, pointsLost: 2, netPoints: 0 })
    expect(r.breakdown[0]).toMatchObject({ gained: 2, lost: 2, net: 0 })
  })

  it('skips a match whose goals do not reconcile with the full-time score', () => {
    const r = computeFergie(
      [
        match({
          actual: { home: 2, away: 1 },
          goals: [{ side: 'HOME', minute: "90'+3'" }, { side: 'AWAY', minute: null }],
        }),
      ],
      RULES,
    )
    expect(r.matches).toBe(0)
    expect(r.breakdown).toHaveLength(0)
  })

  it('skips a reconciled match with no added-time goal', () => {
    const r = computeFergie(
      [match({ actual: { home: 1, away: 0 }, field: [me(2, 1)], goals: [{ side: 'HOME', minute: "30'" }] })],
      RULES,
    )
    expect(r.matches).toBe(0)
  })

  it('counts a reconciled added-time match that moved no points and has no field entry', () => {
    // An added-time goal that changes the score but not the tier (0-0 pick, a
    // late 1-0) and a field the user is not in: match counts, nothing moves.
    const r = computeFergie(
      [match({ predId: 'me', field: [], actual: { home: 1, away: 0 }, goals: [{ side: 'HOME', minute: "90'+1'" }] })],
      RULES,
    )
    expect(r.matches).toBe(1)
    expect(r.pointsWon).toBe(0)
    expect(r.pointsLost).toBe(0)
    expect(r.breakdown).toHaveLength(0)
  })

  it('upgrades the biggest gain and loss only for a strictly larger swing', () => {
    // Gains fed +2, +3, +1 and losses fed -2, -3, -1: the middle one wins each,
    // exercising both the replace and the keep branch.
    const g2 = match({ home: 'g2', actual: { home: 2, away: 0 }, field: [me(2, 0)], goals: [{ side: 'HOME', minute: "30'" }, { side: 'HOME', minute: "90'+2'" }] })
    const g3 = match({ home: 'g3', actual: { home: 2, away: 1 }, field: [me(2, 1)], goals: [{ side: 'HOME', minute: "30'" }, { side: 'AWAY', minute: "60'" }, { side: 'HOME', minute: "90'+3'" }] })
    const g1 = match({ home: 'g1', actual: { home: 1, away: 0 }, field: [me(5, 0)], predId: 'me', goals: [{ side: 'HOME', minute: "90'+1'" }] })
    const l2 = match({ home: 'l2', actual: { home: 2, away: 1 }, field: [me(2, 0)], goals: [{ side: 'HOME', minute: "30'" }, { side: 'HOME', minute: "60'" }, { side: 'AWAY', minute: "90'+2'" }] })
    const l3 = match({ home: 'l3', actual: { home: 1, away: 2 }, field: [me(1, 1)], goals: [{ side: 'HOME', minute: "20'" }, { side: 'AWAY', minute: "55'" }, { side: 'AWAY', minute: "90'+4'" }] })
    const l1 = match({ home: 'l1', actual: { home: 1, away: 1 }, field: [me(3, 1)], goals: [{ side: 'HOME', minute: "30'" }, { side: 'AWAY', minute: "90'+1'" }] })
    const r = computeFergie([g2, g3, g1, l2, l3, l1], RULES)
    expect(r.biggestGain).toMatchObject({ home: 'g3', gained: 3 })
    expect(r.biggestLoss).toMatchObject({ home: 'l3', lost: 3 })
  })

  it('keeps the biggest gain and loss and sorts the breakdown by volatility', () => {
    const gainer = match({
      home: 'Gain',
      goals: [{ side: 'HOME', minute: "30'" }, { side: 'AWAY', minute: "60'" }, { side: 'HOME', minute: "90'+3'" }],
    }) // +3
    const loser = match({
      home: 'Loss',
      actual: { home: 1, away: 2 },
      field: [me(1, 1)],
      goals: [{ side: 'HOME', minute: "20'" }, { side: 'AWAY', minute: "55'" }, { side: 'AWAY', minute: "90'+4'" }],
    }) // 1-1 (exact 3) -> 1-2 (miss 0): -3
    const r = computeFergie([loser, gainer], RULES)
    expect(r.matches).toBe(2)
    expect(r.pointsWon).toBe(3)
    expect(r.pointsLost).toBe(3)
    expect(r.netPoints).toBe(0)
    expect(r.biggestGain?.home).toBe('Gain')
    expect(r.biggestLoss?.home).toBe('Loss')
    expect(r.breakdown).toHaveLength(2)
  })
})
