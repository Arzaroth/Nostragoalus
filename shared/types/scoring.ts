export interface CrowdTier {
  maxShareExclusive: number
  bonus: number
}

export interface OddsTier {
  minDecimalOdds: number
  bonus: number
}

// Champion-pick payout by FIFA rank at pick time. Tiers are checked in order;
// a null maxRank is the catch-all for everyone ranked below the last bound.
export interface ChampionTier {
  maxRank: number | null
  points: number
}
