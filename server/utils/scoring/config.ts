import type { ChampionTier, CrowdTier, OddsTier } from '../../../shared/types/scoring'
import { DEFAULT_BASE_POINTS, type BasePoints } from './tiers'

export type BonusSource = 'NONE' | 'CROWD' | 'ODDS'
export type MatchBasis = 'EXACT' | 'OUTCOME'

export interface ScoringRules {
  base: BasePoints
  jokerMultiplier: number
  jokerAppliesToBonus: boolean
  championBonus: number
  championTiers: ChampionTier[]
  bestScorerBonus: number
  bonusSource: BonusSource
  crowdTiers: CrowdTier[]
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
  championBonus: 10,
  championTiers: DEFAULT_CHAMPION_TIERS,
  bestScorerBonus: 10,
  bonusSource: 'CROWD',
  crowdTiers: DEFAULT_CROWD_TIERS,
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
  championBonus: number
  championTiers: ChampionTier[] | null
  bestScorerBonus: number
  bonusSource: BonusSource
  crowdTiers: CrowdTier[]
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
    championBonus: row.championBonus,
    championTiers: row.championTiers ?? DEFAULT_CHAMPION_TIERS,
    bestScorerBonus: row.bestScorerBonus,
    bonusSource: row.bonusSource,
    crowdTiers: row.crowdTiers,
    crowdMatchBasis: row.crowdMatchBasis,
    crowdMinDenominator: row.crowdMinDenominator,
    oddsTiers: row.oddsTiers,
    oddsAppliesTo: row.oddsAppliesTo ?? 'OUTCOME',
  }
}
