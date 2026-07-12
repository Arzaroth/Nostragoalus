// League rewards: an owner/moderator attaches a real-world prize to a reward
// criterion; the league's winner of that criterion (derived live among members)
// earns it. Owners add/delete prizes freely, one per criterion. See
// server/utils/rewards and brain/features/rewards.md.

// The criteria a league can attach a prize to, in display order. Mirrors the
// leagueRewardCriterionEnum in db/app-schema.ts. A superset of the global trophy
// set: the original five plus phase/metric-scoped variants and the inverse
// WOODEN_SPOON. Each maps to a metric x match-filter x direction spec in
// server/utils/rewards/criteria.ts. TEAM_SPECIALIST tracks the LEAGUE's featured
// team (league.featuredTeamCode), picked by the owner/moderator.
export const LEAGUE_REWARD_CRITERIA = [
  'OVERALL',
  'WOODEN_SPOON',
  'GROUP_PHASE',
  'KNOCKOUT_PHASE',
  'FINALIST',
  'MADAME_IRMA',
  'GROUP_ORACLE',
  'KNOCKOUT_ORACLE',
  'SHARPSHOOTER',
  'GOAL_DIFF_GURU',
  'TEAM_SPECIALIST',
] as const

export type LeagueRewardCriterion = (typeof LEAGUE_REWARD_CRITERIA)[number]

// Criteria that need a team before they can be earned. TEAM_SPECIALIST is the
// only one: it is disabled until the league picks a featured team.
export const TEAM_SCOPED_CRITERIA = ['TEAM_SPECIALIST'] as const satisfies readonly LeagueRewardCriterion[]

export function isTeamScopedCriterion(type: LeagueRewardCriterion): boolean {
  return (TEAM_SCOPED_CRITERIA as readonly string[]).includes(type)
}

// How a criterion's ranking value reads: prediction points, EXACT-scoreline count,
// correct-outcome (win/draw/loss) count, or correct goal-difference count. Drives
// the unit label shown next to a member's value.
export type RewardMetric = 'points' | 'exact' | 'outcome' | 'goaldiff'

// The single source of truth (shared by server compute + client display) for which
// metric each criterion ranks on. Keep in sync with the spec in
// server/utils/rewards/criteria.ts.
const CRITERION_METRIC: Record<LeagueRewardCriterion, RewardMetric> = {
  OVERALL: 'points',
  WOODEN_SPOON: 'points',
  GROUP_PHASE: 'points',
  KNOCKOUT_PHASE: 'points',
  FINALIST: 'points',
  MADAME_IRMA: 'exact',
  GROUP_ORACLE: 'exact',
  KNOCKOUT_ORACLE: 'exact',
  SHARPSHOOTER: 'outcome',
  GOAL_DIFF_GURU: 'goaldiff',
  TEAM_SPECIALIST: 'exact',
}

export function rewardMetricFor(type: LeagueRewardCriterion): RewardMetric {
  return CRITERION_METRIC[type]
}

// A configured prize for one criterion. imageUrl serves the stored image (or null).
export interface LeagueRewardDto {
  type: LeagueRewardCriterion
  label: string
  imageUrl: string | null
  note: string | null
  link: string | null
}

// What the config form submits for one criterion. imageDataUrl: a data: URL to
// upload a new image, null to clear it, undefined to keep the current one. A blank
// label deletes the prize.
export interface LeagueRewardInput {
  type: LeagueRewardCriterion
  label: string
  imageDataUrl?: string | null
  note?: string | null
  link?: string | null
}

// One criterion's prize + its current league standing, for the league prizes view.
// winners are the current league-leader(s) of the criterion (ties share); empty
// until someone has scored in that criterion.
export interface RewardStandingDto {
  type: LeagueRewardCriterion
  reward: LeagueRewardDto | null
  winners: { userId: string; displayName: string }[]
  value: number
  metric: RewardMetric
  // The league's featured team (TEAM_SPECIALIST only), else null.
  teamCode: string | null
  // TEAM_SPECIALIST is disabled until the league picks a featured team: no prize
  // can be earned and the criterion reads as inactive.
  disabled: boolean
  youHold: boolean
}

// A configured prize in one of the viewer's leagues, for the cabinet strip
// (aggregated across leagues). youHold distinguishes prizes the viewer currently
// leads (lit) from ones they are chasing (tentative, greyed). type/teamCode link
// the tile to that criterion's ranking.
export interface MyRewardDto {
  leagueId: string
  leagueName: string
  reward: LeagueRewardDto
  type: LeagueRewardCriterion
  teamCode: string | null
  youHold: boolean
}

// One member's row in a criterion's live ranking (the prize leaderboard opened
// from a prize card). displayName is '' when the viewer isn't entitled to see it.
export interface RewardRankingRow {
  rank: number
  userId: string
  displayName: string
  image: string | null
  value: number
  isViewer: boolean
}

// A criterion's full live ranking among a league's members, for the prize-ranking
// dialog. reward is the configured prize (or null), teamCode names the featured
// team for TEAM_SPECIALIST.
export interface RewardRankingDto {
  type: LeagueRewardCriterion
  teamCode: string | null
  reward: LeagueRewardDto | null
  metric: RewardMetric
  rows: RewardRankingRow[]
}
