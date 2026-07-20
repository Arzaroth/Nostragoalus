// Vectors for the Fergie-time replay (points gained/lost from goals in added
// time). Uses NONE/CROWD rules only: ODDS needs an oddsForOutcome function,
// which cannot cross the JSON boundary, and the other paths cover the replay.
import { DEFAULT_RULES, type ScoringRules } from '../../../server/utils/scoring/config'
import type { FergieMatchInput } from '../../../server/utils/analytics/fergie'

interface RawCase {
  fn: string
  args: unknown[]
}

const NO_BONUS: ScoringRules = { ...DEFAULT_RULES, bonusSource: 'NONE' }
const CROWD: ScoringRules = { ...DEFAULT_RULES, bonusSource: 'CROWD', crowdMatchBasis: 'EXACT', crowdMinDenominator: 1 }

const match: FergieMatchInput = {
  home: 'France',
  away: 'Brazil',
  homeCode: 'FRA',
  awayCode: 'BRA',
  predId: 'me',
  pred: { home: 2, away: 1 },
  isJoker: false,
  actual: { home: 3, away: 2 },
  forceJoker: false,
  isKnockout: false,
  field: [
    { id: 'me', home: 2, away: 1, isJoker: false },
    { id: 'o1', home: 1, away: 0, isJoker: false },
    { id: 'o2', home: 3, away: 2, isJoker: false },
  ],
  // Two added-time goals (90'+) swing the scoreline after 90'.
  goals: [
    { side: 'HOME', minute: "40'" },
    { side: 'HOME', minute: "80'" },
    { side: 'AWAY', minute: "88'" },
    { side: 'HOME', minute: "90'+9'" },
    { side: 'AWAY', minute: "90'+2'" },
  ],
}

// A drawn-at-90 knockout: an added-time goal off a draw is discounted (goes to ET).
const knockout: FergieMatchInput = {
  ...match,
  isKnockout: true,
  actual: { home: 1, away: 0 },
  pred: { home: 1, away: 0 },
  field: [{ id: 'me', home: 1, away: 0, isJoker: false }],
  goals: [{ side: 'HOME', minute: "90'+3'" }],
}

// Same swing as `match` under different colours: its breakdown entry ties on both
// sort keys, so only the insertion order separates the two.
const twin: FergieMatchInput = { ...match, home: 'Spain', away: 'Italy', homeCode: 'ESP', awayCode: 'ITA' }

// A different swing (the user is exact at full time, not at 90'), so it sorts
// against the other two on the movement key rather than tying.
const bigger: FergieMatchInput = {
  ...match,
  home: 'Japan',
  away: 'Ghana',
  homeCode: 'JPN',
  awayCode: 'GHA',
  pred: { home: 3, away: 2 },
  field: [
    { id: 'me', home: 3, away: 2, isJoker: false },
    { id: 'o1', home: 1, away: 0, isJoker: false },
    { id: 'o2', home: 2, away: 1, isJoker: false },
  ],
}

// One goal with an unparseable minute: the timeline order is unknown, bail out.
const unparseable: FergieMatchInput = {
  ...match,
  goals: [
    { side: 'HOME', minute: null },
    { side: 'HOME', minute: "80'" },
    { side: 'AWAY', minute: "88'" },
    { side: 'HOME', minute: "90'+9'" },
    { side: 'AWAY', minute: "90'+2'" },
  ],
}

// The goals do not add up to the full-time score: bail out rather than invent a swing.
const mismatched: FergieMatchInput = {
  ...match,
  goals: [
    { side: 'HOME', minute: "40'" },
    { side: 'HOME', minute: "90'+9'" },
  ],
}

export async function buildCases(): Promise<RawCase[]> {
  return [
    { fn: 'isAddedTime', args: ["90'+5'"] },
    { fn: 'isAddedTime', args: ["66'"] },
    { fn: 'isAddedTime', args: ["45'+2'"] },
    { fn: 'isAddedTime', args: [null] },
    { fn: 'computeFergie', args: [[match], NO_BONUS] },
    { fn: 'computeFergie', args: [[match], CROWD] },
    { fn: 'computeFergie', args: [[knockout], NO_BONUS] },
    { fn: 'computeFergie', args: [[], NO_BONUS] },
    // several matches -> a multi-entry breakdown, with a pair tied on both sort keys
    { fn: 'computeFergie', args: [[match, twin, bigger], NO_BONUS] },
    { fn: 'computeFergie', args: [[match, twin, bigger], CROWD] },
    // both bail-outs, alone and mixed with a match that does replay
    { fn: 'computeFergie', args: [[unparseable], NO_BONUS] },
    { fn: 'computeFergie', args: [[mismatched], NO_BONUS] },
    { fn: 'computeFergie', args: [[unparseable, mismatched, match], NO_BONUS] },
  ]
}
