import type { ChampionTier, CrowdTier, OddsTier } from '../../../shared/types/scoring'
import { DEFAULT_BASE_POINTS, type BasePoints, type MarginBands } from './tiers'

export type BonusSource = 'NONE' | 'CROWD' | 'ODDS'
export type MatchBasis = 'EXACT' | 'OUTCOME'

export interface ScoringRules {
  base: BasePoints
  // Null = football: DIFF means the exact goal difference. See tiers.ts.
  marginBands: MarginBands
  jokerMultiplier: number
  jokerAppliesToBonus: boolean
  championBonus: number
  championTiers: ChampionTier[]
  bestScorerBonus: number
  bonusSource: BonusSource
  crowdTiers: CrowdTier[]
  crowdOutcomeTiers: CrowdTier[] | null
  crowdMatchBasis: MatchBasis
  crowdMinDenominator: number
  oddsTiers: OddsTier[] | null
  oddsAppliesTo: MatchBasis
}

// Share = your exact score's count / players who got the correct RESULT. Only a
// clear minority of the right-result crowd earns anything, with a steep climb
// for genuinely rare calls; sharing your exact with a third+ of them pays 0.
export const DEFAULT_CROWD_TIERS: CrowdTier[] = [
  { maxShareExclusive: 0.01, bonus: 5 },
  { maxShareExclusive: 0.05, bonus: 4 },
  { maxShareExclusive: 0.12, bonus: 3 },
  { maxShareExclusive: 0.22, bonus: 2 },
  { maxShareExclusive: 0.35, bonus: 1 },
]

// Result-rarity layer (stacks on top of the exact-score crowd bonus when the
// crowd basis is EXACT). Share = players who called the correct RESULT / whole
// field. Deliberately small and shallow: a lone contrarian who reads an upset
// gets a nudge, never a jackpot - the exact-score tiers stay the main prize.
export const DEFAULT_CROWD_OUTCOME_TIERS: CrowdTier[] = [
  { maxShareExclusive: 0.1, bonus: 2 },
  { maxShareExclusive: 0.25, bonus: 1 },
]

export const DEFAULT_ODDS_TIERS: OddsTier[] = [
  { minDecimalOdds: 6, bonus: 5 },
  { minDecimalOdds: 3.5, bonus: 3 },
  { minDecimalOdds: 2.2, bonus: 2 },
]

// FIFA rank at pick time decides what a winning champion pick pays out.
// Favorites earn the old flat bonus; long shots pay up to 4x.
export const DEFAULT_CHAMPION_TIERS: ChampionTier[] = [
  { maxRank: 8, points: 10 },
  { maxRank: 20, points: 15 },
  { maxRank: 40, points: 25 },
  { maxRank: null, points: 40 },
]

// The points a champion pick is worth when ranks are known: first tier (by
// ascending bound) whose maxRank covers the rank. A null rank means the team is
// not in the FIFA table - a genuine long shot, so it gets the catch-all tier,
// NOT the flat bonus. (A failed ranking fetch is handled by the caller, which
// passes the flat championBonus directly rather than calling this.) Tiers are
// sorted defensively so a hand-edited, out-of-order config can't mis-tier.
export function championPointsForRank(rank: number | null | undefined, rules: ScoringRules): number {
  const tiers = [...rules.championTiers].sort((a, b) => (a.maxRank ?? Infinity) - (b.maxRank ?? Infinity))
  const effectiveRank = rank == null ? Infinity : rank
  for (const tier of tiers) {
    if (tier.maxRank == null || effectiveRank <= tier.maxRank) return tier.points
  }
  return rules.championBonus
}

export const DEFAULT_RULES: ScoringRules = {
  base: DEFAULT_BASE_POINTS,
  jokerMultiplier: 2,
  jokerAppliesToBonus: true,
  marginBands: null,
  championBonus: 10,
  championTiers: DEFAULT_CHAMPION_TIERS,
  bestScorerBonus: 10,
  bonusSource: 'CROWD',
  crowdTiers: DEFAULT_CROWD_TIERS,
  crowdOutcomeTiers: DEFAULT_CROWD_OUTCOME_TIERS,
  crowdMatchBasis: 'EXACT',
  crowdMinDenominator: 5,
  oddsTiers: DEFAULT_ODDS_TIERS,
  oddsAppliesTo: 'OUTCOME',
}

export interface ScoringConfigRow {
  ptsExact: number
  ptsDiff: number
  ptsOutcome: number
  ptsMiss: number
  jokerMultiplier: string | number
  jokerAppliesToBonus: boolean
  marginBands: number[] | null | undefined
  championBonus: number
  championTiers: ChampionTier[] | null
  bestScorerBonus: number
  bonusSource: BonusSource
  crowdTiers: CrowdTier[]
  crowdOutcomeTiers: CrowdTier[] | null | undefined
  crowdMatchBasis: MatchBasis
  crowdMinDenominator: number
  oddsTiers: OddsTier[] | null
  oddsAppliesTo: MatchBasis | null
}

export function rulesFromConfigRow(row: ScoringConfigRow): ScoringRules {
  return {
    base: { exact: row.ptsExact, diff: row.ptsDiff, outcome: row.ptsOutcome, miss: row.ptsMiss },
    jokerMultiplier: Number(row.jokerMultiplier),
    jokerAppliesToBonus: row.jokerAppliesToBonus,
    marginBands: row.marginBands ?? null,
    championBonus: row.championBonus,
    championTiers: row.championTiers ?? DEFAULT_CHAMPION_TIERS,
    bestScorerBonus: row.bestScorerBonus,
    bonusSource: row.bonusSource,
    crowdTiers: row.crowdTiers,
    crowdOutcomeTiers: row.crowdOutcomeTiers ?? null,
    crowdMatchBasis: row.crowdMatchBasis,
    crowdMinDenominator: row.crowdMinDenominator,
    oddsTiers: row.oddsTiers,
    oddsAppliesTo: row.oddsAppliesTo ?? 'OUTCOME',
  }
}

// Rugby union preset, applied as a per-competition override when a rugby
// competition is created. Three things differ from football, all forced by the
// shape of a rugby scoreline rather than by taste:
//
// 1. DIFF counts margin BANDS (1-7, 8-14, 15+) instead of the exact margin. A
//    seven-point band is one converted try, which is how the sport itself talks
//    about a result.
// 2. EXACT stays but stops being the headline. Nobody predicts 27-24 on
//    judgement, so it pays like a lottery line rather than like the skill tier -
//    DIFF is where reading the game actually shows.
// 3. The crowd bonus moves off EXACT basis. Exact rugby scores are nearly all
//    unique, so exactCount/outcomeCount is tiny for everyone and the top rarity
//    tier would pay out to the entire field: a flat top-up that discriminates
//    nothing. On OUTCOME basis the share is "how much of the field read this
//    result", which is the thing that is actually rare.
export const RUGBY_CROWD_TIERS: CrowdTier[] = [
  { maxShareExclusive: 0.15, bonus: 5 },
  { maxShareExclusive: 0.3, bonus: 3 },
  { maxShareExclusive: 0.45, bonus: 2 },
  { maxShareExclusive: 0.6, bonus: 1 },
]

// Flat until World Rugby rankings are wired: every side is absent from the FIFA
// table, so the rank tiers would hand every rugby champion pick the long-shot
// payout.
export const RUGBY_CHAMPION_TIERS: ChampionTier[] = [{ maxRank: null, points: 10 }]

export const RUGBY_UNION_RULES: ScoringRules = {
  ...DEFAULT_RULES,
  base: { exact: 5, diff: 3, outcome: 1, miss: 0 },
  marginBands: [7, 14],
  crowdMatchBasis: 'OUTCOME',
  crowdTiers: RUGBY_CROWD_TIERS,
  // Skipped by the engine on OUTCOME basis anyway; null says so out loud.
  crowdOutcomeTiers: null,
  championTiers: RUGBY_CHAMPION_TIERS,
}

export function rulesForSport(sport: string): ScoringRules {
  return sport === 'RUGBY_UNION' ? RUGBY_UNION_RULES : DEFAULT_RULES
}
