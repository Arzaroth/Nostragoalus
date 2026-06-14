import { z } from 'zod'

const crowdTierSchema = z.object({
  maxShareExclusive: z.number().min(0).max(1),
  bonus: z.number().int().min(0).max(100),
})

const oddsTierSchema = z.object({
  minDecimalOdds: z.number().min(1).max(1000),
  bonus: z.number().int().min(0).max(100),
})

const championTierSchema = z.object({
  maxRank: z.number().int().positive().nullable(),
  points: z.number().int().min(0).max(1000),
})

// Validates a full scoring ruleset coming from the admin UI. Bounds mirror the
// DB column widths (jokerMultiplier is numeric(4,2)) and keep a hand-built
// payload from poisoning the scoring engine. Output matches ScoringRules.
export const scoringRulesSchema = z.object({
  base: z.object({
    exact: z.number().int().min(0).max(100),
    diff: z.number().int().min(0).max(100),
    outcome: z.number().int().min(0).max(100),
    miss: z.number().int().min(0).max(100),
  }),
  jokerMultiplier: z.number().min(1).max(99.99),
  jokerAppliesToBonus: z.boolean(),
  championBonus: z.number().int().min(0).max(1000),
  championTiers: z.array(championTierSchema),
  bestScorerBonus: z.number().int().min(0).max(1000),
  bonusSource: z.enum(['NONE', 'CROWD', 'ODDS']),
  crowdTiers: z.array(crowdTierSchema),
  crowdOutcomeTiers: z.array(crowdTierSchema).nullable(),
  crowdMatchBasis: z.enum(['EXACT', 'OUTCOME']),
  crowdMinDenominator: z.number().int().min(0).max(100000),
  oddsTiers: z.array(oddsTierSchema).nullable(),
  oddsAppliesTo: z.enum(['EXACT', 'OUTCOME']),
})

export const saveScoringConfigSchema = z.object({
  // Competition slug to override; null or omitted targets the default config.
  competition: z.string().min(1).nullable().optional(),
  rules: scoringRulesSchema,
})

export type SaveScoringConfigBody = z.infer<typeof saveScoringConfigSchema>
