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

export const FRIDGE_ITEM_TYPES = ['TROPHY', 'ACHIEVEMENT'] as const
export type FridgeItemType = (typeof FRIDGE_ITEM_TYPES)[number]

// How many items a user may pin to their fridge showcase, per competition.
export const FRIDGE_SLOT_COUNT = 6

// === Cabinet / fridge read DTOs (server -> client) ===

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
  hidden: boolean
  tiers: AchievementTierThresholdDto[]
  // null = not yet earned (a locked slot in the cabinet).
  earned: { tier: AchievementTier | null; progress: number; unlockedAt: string } | null
}

export type AchievementScope = 'COMPETITION' | 'GLOBAL'

export interface FridgePinDto {
  slot: number
  itemType: FridgeItemType
  itemKey: string
}

export interface CabinetDto {
  userId: string
  displayName: string
  isOwner: boolean
  trophies: TrophyDto[]
  achievements: AchievementDto[]
  fridge: FridgePinDto[]
}

// A single item the client asks to pin (order in the array = slot order).
export interface FridgePinInput {
  itemType: FridgeItemType
  itemKey: string
}
