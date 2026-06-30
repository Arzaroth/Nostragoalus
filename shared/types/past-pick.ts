// The result of replaying a user's OWN earlier (swapped-off) score picks for one
// match. Shared so the owner-only endpoint, its composable and the hint
// component all agree on the shape. The logic lives in
// server/utils/past-pick/service.ts.

// 'none' = nothing to surface (pre-kickoff, no earlier pick, or a suppressed
// case). 'live' = provisional against the current scoreline (volatile, resolves
// at full-time). 'final' = the finished result.
export type PastPickScope = 'none' | 'live' | 'final'

// Mirrors the scoring engine's BaseTier; kept as a local union so this shared
// type pulls in nothing from server/.
export type PastPickTier = 'EXACT' | 'DIFF' | 'OUTCOME' | 'MISS'

export interface PastPickAlternative {
  home: number
  away: number
  points: number
  tier: PastPickTier
}

export interface PastPickCounterfactual {
  scope: PastPickScope
  // The best earlier pick and the kept pick are present only when scope is not
  // 'none' (an earlier pick out-scored the one the user kept).
  earlier?: PastPickAlternative
  kept?: PastPickAlternative
  // The winning earlier pick is 0-0: show the comedy line instead of the regret.
  cheeky?: boolean
}
