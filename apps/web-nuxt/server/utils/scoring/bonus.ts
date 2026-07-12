import type { CrowdTier, OddsTier } from '../../../shared/types/scoring'

export function crowdBonus(
  hit: boolean,
  matchCount: number,
  total: number,
  tiers: CrowdTier[],
  minDenominator: number,
): { bonus: number; share: number | null } {
  if (!hit) return { bonus: 0, share: null }
  if (total <= 0 || total < minDenominator) return { bonus: 0, share: null }

  const share = matchCount / total
  const sorted = [...tiers].sort((a, b) => a.maxShareExclusive - b.maxShareExclusive)
  for (const tier of sorted) {
    if (share < tier.maxShareExclusive) return { bonus: tier.bonus, share }
  }
  return { bonus: 0, share }
}

export function oddsBonus(hit: boolean, decimalOdds: number | null, tiers: OddsTier[] | null): number {
  if (!hit || decimalOdds == null || !tiers || tiers.length === 0) return 0

  const sorted = [...tiers].sort((a, b) => b.minDecimalOdds - a.minDecimalOdds)
  for (const tier of sorted) {
    if (decimalOdds >= tier.minDecimalOdds) return tier.bonus
  }
  return 0
}
