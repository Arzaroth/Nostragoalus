import type { CompetitionAwardType } from './achievements'

// League rewards: an owner/moderator attaches a real-world prize to each of the
// five competition-end award criteria; the league's winner of that criterion
// (best among members, derived live from the leaderboard) earns it. See
// server/utils/rewards and brain/features/rewards.md.

// A configured prize for one criterion. imageUrl serves the stored image (or null).
export interface LeagueRewardDto {
  type: CompetitionAwardType
  label: string
  imageUrl: string | null
  note: string | null
  link: string | null
}

// What the config form submits per criterion. imageDataUrl: a data: URL to upload
// a new image, null to clear it, undefined to keep the current one.
export interface LeagueRewardInput {
  type: CompetitionAwardType
  label: string
  imageDataUrl?: string | null
  note?: string | null
  link?: string | null
}

// One criterion's prize + its current league standing, for the league prizes view.
// winners are the current league-leader(s) of the criterion (ties share); empty
// until someone has scored in that criterion.
export interface RewardStandingDto {
  type: CompetitionAwardType
  reward: LeagueRewardDto | null
  winners: { userId: string; displayName: string }[]
  value: number
  teamCode: string | null
  // TEAM_SPECIALIST is disabled until an admin configures the competition's
  // featured team: no prize can be earned and the criterion reads as inactive.
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
  type: CompetitionAwardType
  teamCode: string | null
  youHold: boolean
}

// How a criterion's ranking value reads: prediction points for most, EXACT-count
// for Madame IRMA.
export type RewardMetric = 'points' | 'exact'

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
  type: CompetitionAwardType
  teamCode: string | null
  reward: LeagueRewardDto | null
  metric: RewardMetric
  rows: RewardRankingRow[]
}
