import { scorePredictions, type PredictionInput } from '../scoring/engine'
import { outcomeOf, type Outcome, type Scoreline } from '../scoring/tiers'
import { minuteValue } from '../stats/insights'
import type { ScoringRules } from '../scoring/config'
import type { FergieMatch, FergieTime } from '#shared/types/analytics'

// minuteValue's sentinel for a null/unparseable minute; a real clock never
// reaches it (max ~130'), so >= this means the timeline order is unknown.
const UNKNOWN_MINUTE = 1e9

export interface FergieGoal {
  side: 'HOME' | 'AWAY'
  // Free-text upstream minute: "66'", "90'+5'", "45'+2'" (added time carries a "+").
  minute: string | null
}

// One picked, finished match fed to the Fergie replay: the user's pick plus the
// whole locked field for that match (so the rarity bonus can be re-priced at any
// hypothetical scoreline), the goal timeline, and how the match was scored.
export interface FergieMatchInput {
  home: string
  away: string
  homeCode: string | null
  awayCode: string | null
  // The user's own prediction id - it sits inside `field`, and its scored total
  // at the actual scoreline equals the stored prediction.totalPoints.
  predId: string
  // The user's pick, for the breakdown label (predId points at the same row in
  // `field`, but carrying it avoids a lookup and a can't-happen fallback).
  pred: Scoreline
  isJoker: boolean
  actual: Scoreline
  // Knockout stages force the joker multiplier on everyone (finalize's
  // countsDouble(stage)); mirror it so the replayed points match reality.
  forceJoker: boolean
  field: PredictionInput[]
  goals: FergieGoal[]
  // Closing odds of a given outcome, needed only when the config scores on ODDS.
  oddsForOutcome?: (outcome: Outcome) => number | null
}

export function emptyFergie(): FergieTime {
  return {
    matches: 0,
    goals: 0,
    netPoints: 0,
    pointsWon: 0,
    pointsLost: 0,
    biggestGain: null,
    biggestLoss: null,
    breakdown: [],
  }
}

// "Fergie time" is end-of-half stoppage from the second half on: an added-time
// goal (minute carries a "+") whose base minute is 90' or later (90'+, 105'+,
// 120'+). A first-half "45'+2'" is stoppage too, but its marginal value against a
// mid-match scoreline is not what the metric is about, so it does not count.
// minuteValue encodes base*100 + stoppage, so its hundreds are the base minute.
export function isAddedTime(minute: string | null): boolean {
  return !!minute && minute.includes('+') && Math.floor(minuteValue(minute) / 100) >= 90
}

function realPoints(m: FergieMatchInput, rules: ScoringRules, at: Scoreline): number {
  const scores = scorePredictions({
    actual: at,
    predictions: m.field,
    rules,
    actualOutcomeOdds: m.oddsForOutcome?.(outcomeOf(at)) ?? null,
    forceJoker: m.forceJoker,
  })
  return scores.find((s) => s.id === m.predId)?.totalPoints ?? 0
}

// Replay one match goal by goal, banking each added-time goal's real-points
// delta. Returns null when the timeline cannot be trusted - a goal with an
// unparseable/absent minute (so the order is unknown), or a set of goals that
// does not reconcile with the full-time score - or when no added-time goal fell.
// Bailing out here means an incomplete feed never invents a swing.
function replayMatch(m: FergieMatchInput, rules: ScoringRules): FergieMatch | null {
  const ordered = m.goals.map((g) => ({ g, order: minuteValue(g.minute) }))
  // One unorderable minute makes every added-time delta suspect (a real early
  // goal could be applied after a late one), even if the final still reconciles.
  if (ordered.some((o) => o.order >= UNKNOWN_MINUTE)) return null
  const sorted = ordered.sort((a, b) => a.order - b.order).map((o) => o.g)
  let home = 0
  let away = 0
  let gained = 0
  let lost = 0
  let added = 0
  for (const g of sorted) {
    const before: Scoreline = { home, away }
    if (g.side === 'HOME') home += 1
    else away += 1
    if (!isAddedTime(g.minute)) continue
    added += 1
    const delta = realPoints(m, rules, { home, away }) - realPoints(m, rules, before)
    if (delta > 0) gained += delta
    else if (delta < 0) lost += -delta
  }
  if (home !== m.actual.home || away !== m.actual.away) return null
  if (added === 0) return null
  return {
    home: m.home,
    away: m.away,
    homeCode: m.homeCode,
    awayCode: m.awayCode,
    predicted: `${m.pred.home}-${m.pred.away}`,
    actual: `${m.actual.home}-${m.actual.away}`,
    gained,
    lost,
    net: gained - lost,
    isJoker: m.isJoker,
  }
}

export function computeFergie(matches: FergieMatchInput[], rules: ScoringRules): FergieTime {
  const result = emptyFergie()
  for (const m of matches) {
    const replay = replayMatch(m, rules)
    if (!replay) continue
    result.matches += 1
    result.goals += m.goals.filter((g) => isAddedTime(g.minute)).length
    result.pointsWon += replay.gained
    result.pointsLost += replay.lost
    if (replay.gained > 0 && (!result.biggestGain || replay.gained > result.biggestGain.gained)) {
      result.biggestGain = replay
    }
    if (replay.lost > 0 && (!result.biggestLoss || replay.lost > result.biggestLoss.lost)) {
      result.biggestLoss = replay
    }
    // Only matches whose points actually moved make the breakdown; a match with
    // an added-time goal that changed nothing (net 0 and no intra-match swing)
    // would just be noise.
    if (replay.gained > 0 || replay.lost > 0) result.breakdown.push(replay)
  }
  result.netPoints = result.pointsWon - result.pointsLost
  // Most volatile first (biggest total point movement), losses breaking ties so
  // a painful match outranks a lucky one of equal size.
  result.breakdown.sort((a, b) => b.gained + b.lost - (a.gained + a.lost) || b.lost - a.lost)
  return result
}
