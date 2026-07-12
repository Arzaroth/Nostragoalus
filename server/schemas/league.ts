import { z } from 'zod'
import { LEAGUE_REWARD_CRITERIA } from '#shared/types/rewards'

// Shared response schemas for the league routes (server/api/leagues/[id]/*).
// Mirror the service return types so the handler-return typecheck (see
// server/utils/validated-handler.ts) proves each route still matches its
// published contract. Lives under server/schemas (not server/utils) so it is out
// of the coverage gate; route files are thin and uncovered by design.

// league.role / membership.role (server/utils/leagues/permissions.ts LeagueRole).
export const leagueRoleSchema = z.enum(['OWNER', 'MODERATOR', 'MEMBER'])

// league.visibility (LeagueVisibility) and league.mode (LeagueMode).
export const leagueVisibilitySchema = z.enum(['PRIVATE', 'PUBLIC'])
export const leagueModeSchema = z.enum(['NORMAL', 'EASY', 'HARD', 'HARDCORE'])

// One invite as surfaced by the list + mint routes (server/utils/leagues/invites.ts).
export const inviteViewSchema = z.object({
  id: z.string(),
  token: z.string(),
  expiresAt: z.date().nullable(),
  maxUses: z.number().nullable(),
  uses: z.number(),
  createdAt: z.date(),
  status: z.enum(['VALID', 'EXPIRED', 'EXHAUSTED']),
})

// Reward criterion + metric (shared/types/rewards.ts).
export const rewardCriterionSchema = z.enum(LEAGUE_REWARD_CRITERIA)
export const rewardMetricSchema = z.enum(['points', 'exact', 'outcome', 'goaldiff'])

// LeagueRewardDto (shared/types/rewards.ts): one criterion's configured prize.
export const leagueRewardDtoSchema = z.object({
  type: rewardCriterionSchema,
  label: z.string(),
  imageUrl: z.string().nullable(),
  note: z.string().nullable(),
  link: z.string().nullable(),
})
