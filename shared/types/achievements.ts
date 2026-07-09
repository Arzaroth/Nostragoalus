// Shared vocabulary for the achievements / trophy-cabinet feature. Kept in
// #shared so the server (award computation), the API DTOs and the client
// (i18n keys, cabinet rendering) all name the same things. The DB enums in
// db/app-schema.ts mirror these literal lists.

// The five competition-end trophy categories. Ordered best-to-narrowest for
// display. See server/utils/awards/service.ts.
export const COMPETITION_AWARD_TYPES = [
  'OVERALL',
  'GROUP_PHASE',
  'KNOCKOUT_PHASE',
  'MADAME_IRMA',
  'TEAM_SPECIALIST',
] as const

export type CompetitionAwardType = (typeof COMPETITION_AWARD_TYPES)[number]

export const ACHIEVEMENT_TIERS = ['BRONZE', 'SILVER', 'GOLD'] as const
export type AchievementTier = (typeof ACHIEVEMENT_TIERS)[number]

// How many achievements a user may pin to their showcase, per competition.
export const SHOWCASE_SLOT_COUNT = 3

// === Cabinet / showcase read DTOs (server -> client) ===

export interface TrophyDto {
  type: CompetitionAwardType
  value: number
  teamCode: string | null
  awardedAt: string
}

export interface AchievementTierThresholdDto {
  tier: AchievementTier
  threshold: number
}

export interface AchievementDto {
  key: string
  category: string
  scope: AchievementScope
  // Per-key icon override (primeicons class), or null to fall back to the category
  // icon. Lets same-category badges read differently (e.g. the opener vs the final).
  icon: string | null
  hidden: boolean
  tiers: AchievementTierThresholdDto[]
  // null = not yet earned (a locked slot in the cabinet).
  earned: { tier: AchievementTier | null; progress: number; unlockedAt: string } | null
  // The user's live metric value, so the cabinet can draw a progress bar toward the
  // next tier - on locked badges too. null for event-granted secrets (no metric).
  current: number | null
  // For streak badges only: the current ongoing run, shown next to the best (which
  // is `current`). null when not a streak badge or the badge is already maxed out.
  currentStreak: number | null
}

export type AchievementScope = 'COMPETITION' | 'GLOBAL'

// One showcased achievement as it rides a leaderboard row (icon + tint next to the
// name). category drives the icon, tier the colour. Resolved server-side so the
// client needs no catalog.
export interface ShowcaseIconDto {
  key: string
  category: string
  tier: AchievementTier | null
}

export interface ShowcasePinDto {
  slot: number
  achievementKey: string
}

export interface CabinetDto {
  userId: string
  displayName: string
  isOwner: boolean
  trophies: TrophyDto[]
  achievements: AchievementDto[]
  showcase: ShowcasePinDto[]
}

// A single achievement the client asks to pin (order in the array = slot order).
export interface ShowcasePinInput {
  achievementKey: string
}
