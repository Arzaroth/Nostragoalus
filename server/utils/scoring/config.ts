import type { CrowdTier, OddsTier } from '../../../shared/types/scoring'
import { DEFAULT_BASE_POINTS, type BasePoints } from './tiers'

export type BonusSource = 'NONE' | 'CROWD' | 'ODDS'
export type MatchBasis = 'EXACT' | 'OUTCOME'

export interface ScoringRules {
  base: BasePoints
  jokerMultiplier: number
  jokerAppliesToBonus: boolean
  bonusSource: BonusSource
  crowdTiers: CrowdTier[]
  crowdMatchBasis: MatchBasis
  crowdMinDenominator: number
  oddsTiers: OddsTier[] | null
  oddsAppliesTo: MatchBasis
}

export const DEFAULT_CROWD_TIERS: CrowdTier[] = [
  { maxShareExclusive: 0.005, bonus: 5 },
  { maxShareExclusive: 0.05, bonus: 3 },
  { maxShareExclusive: 0.15, bonus: 2 },
  { maxShareExclusive: 0.4, bonus: 1 },
]

export const DEFAULT_ODDS_TIERS: OddsTier[] = [
  { minDecimalOdds: 6, bonus: 5 },
  { minDecimalOdds: 3.5, bonus: 3 },
  { minDecimalOdds: 2.2, bonus: 2 },
]

export const DEFAULT_RULES: ScoringRules = {
  base: DEFAULT_BASE_POINTS,
  jokerMultiplier: 2,
  jokerAppliesToBonus: true,
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
    bonusSource: row.bonusSource,
    crowdTiers: row.crowdTiers,
    crowdMatchBasis: row.crowdMatchBasis,
    crowdMinDenominator: row.crowdMinDenominator,
    oddsTiers: row.oddsTiers,
    oddsAppliesTo: row.oddsAppliesTo ?? 'OUTCOME',
  }
}
