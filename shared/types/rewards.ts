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
  youHold: boolean
}

// A reward the viewer currently holds in one of their leagues, for the cabinet
// "prizes you hold" strip (aggregated across leagues).
export interface MyRewardDto {
  leagueId: string
  leagueName: string
  reward: LeagueRewardDto
}
