import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES, type ScoringRules } from '../scoring/config'
import type { PredictionInput } from '../scoring/engine'
import { computeFergie, isAddedTime, type FergieGoal, type FergieMatchInput } from './fergie'

// The user is 'me'; everyone else fills the field so the crowd bonus can fire.
function me(home: number, away: number, isJoker = false): PredictionInput {
  return { id: 'me', home, away, isJoker }
}
function other(i: number, home: number, away: number): PredictionInput {
  return { id: `p${i}`, home, away, isJoker: false }
}

function match(over: Partial<FergieMatchInput>): FergieMatchInput {
  const field = over.field ?? [me(2, 1)]
  const own = field.find((p) => p.id === 'me')
  return {
    home: 'Home',
    away: 'Away',
    homeCode: 'HOM',
    awayCode: 'AWY',
    predId: 'me',
    // Mirror the user's own field entry so the label matches what is scored.
    pred: own ? { home: own.home, away: own.away } : { home: 2, away: 1 },
    isJoker: false,
    actual: { home: 2, away: 1 },
    forceJoker: false,
    isKnockout: false,
    field,
    goals: [],
    ...over,
  }
}

const RULES: ScoringRules = DEFAULT_RULES

describe('isAddedTime', () => {
  it('treats only 90-plus stoppage as Fergie added time, not first-half stoppage', () => {
    expect(isAddedTime("90'+3'")).toBe(true)
    expect(isAddedTime("120'+2'")).toBe(true)
    expect(isAddedTime("45'+2'")).toBe(false)
    expect(isAddedTime("92'")).toBe(false)
    expect(isAddedTime(null)).toBe(false)
  })

  it('orders two same-base stoppage goals by their added minute in the replay', () => {
    // 90'+2' away (2-1) then 90'+9' home (3-1): with correct ordering the pick
    // 2-1 hits its exact on the +2 (gain) then loses it on the +9 (loss). A
    // parser that ignored the added part would order them arbitrarily.
    const r = computeFergie(
      [
        match({
          actual: { home: 3, away: 1 },
          field: [me(2, 1)],
          goals: [
            { side: 'HOME', minute: "40'" },
            { side: 'HOME', minute: "80'" },
            { side: 'HOME', minute: "90'+9'" },
            { side: 'AWAY', minute: "90'+2'" },
          ],
        }),
      ],
      RULES,
    )
    // +2 first: 2-0 -> 2-1 nails the exact (gain); +9: 2-1 -> 3-1 breaks it (loss).
    expect(r.breakdown[0]).toMatchObject({ gained: 2, lost: 2, net: 0 })
  })
})

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
    // Only one recorded goal for a 2-1 result (all minutes parseable): the feed
    // is incomplete, so the replayed 1-0 never reaches 2-1 and the match drops.
    const r = computeFergie(
      [match({ actual: { home: 2, away: 1 }, goals: [{ side: 'HOME', minute: "90'+3'" }] })],
      RULES,
    )
    expect(r.matches).toBe(0)
    expect(r.breakdown).toHaveLength(0)
  })

  it('drops a match with an unorderable (null-minute) goal even if it reconciles', () => {
    // A null-minute goal could sit anywhere in the timeline, so an added-time
    // delta priced against a guessed order would be wrong: refuse to price it.
    const r = computeFergie(
      [
        match({
          actual: { home: 2, away: 1 },
          field: [me(2, 1)],
          goals: [{ side: 'HOME', minute: null }, { side: 'AWAY', minute: "60'" }, { side: 'HOME', minute: "90'+3'" }],
        }),
      ],
      RULES,
    )
    expect(r.matches).toBe(0)
    expect(r.breakdown).toHaveLength(0)
  })

  it('does not count a first-half stoppage goal as Fergie time', () => {
    // 45'+2' is stoppage, but not the end-of-match drama the metric is about.
    const r = computeFergie(
      [match({ actual: { home: 1, away: 0 }, field: [me(1, 0)], goals: [{ side: 'HOME', minute: "45'+2'" }] })],
      RULES,
    )
    expect(r.matches).toBe(0)
  })

  it('does not credit a bracket added-time goal struck from a draw', () => {
    // Knockout 1-1 at 90', then a 90'+3' home winner. The draw would have gone to
    // extra time, so the winner grants no Fergie points despite nailing the 2-1.
    const r = computeFergie(
      [
        match({
          isKnockout: true,
          actual: { home: 2, away: 1 },
          field: [me(2, 1)],
          goals: [
            { side: 'HOME', minute: "30'" },
            { side: 'AWAY', minute: "60'" },
            { side: 'HOME', minute: "90'+3'" },
          ],
        }),
      ],
      RULES,
    )
    expect(r).toMatchObject({ matches: 1, goals: 1, pointsWon: 0, pointsLost: 0, netPoints: 0 })
    expect(r.breakdown).toHaveLength(0)
  })

  it('still counts a bracket added-time goal struck from a decisive lead', () => {
    // Knockout 1-0 at 90', then a 90'+2' equalizer. The lead was a real would-be
    // result, so losing the exact 1-0 to the equalizer counts (even though the
    // 1-1 itself then goes to extra time).
    const r = computeFergie(
      [
        match({
          isKnockout: true,
          actual: { home: 1, away: 1 },
          field: [me(1, 0)],
          goals: [{ side: 'HOME', minute: "30'" }, { side: 'AWAY', minute: "90'+2'" }],
        }),
      ],
      RULES,
    )
    expect(r).toMatchObject({ matches: 1, goals: 1, pointsLost: 3, netPoints: -3 })
    expect(r.breakdown[0]).toMatchObject({ net: -3 })
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
