import { describe, it, expect } from 'vitest'
import { scoringRulesSchema, saveScoringConfigSchema } from './schema'
import { DEFAULT_RULES } from './config'

describe('scoringRulesSchema', () => {
  it('accepts the shipped default rules', () => {
    expect(scoringRulesSchema.safeParse(DEFAULT_RULES).success).toBe(true)
  })

  it('accepts a null result layer and null odds tiers', () => {
    const parsed = scoringRulesSchema.safeParse({ ...DEFAULT_RULES, crowdOutcomeTiers: null, oddsTiers: null })
    expect(parsed.success).toBe(true)
  })

  it('rejects a crowd share above 1', () => {
    const bad = { ...DEFAULT_RULES, crowdTiers: [{ maxShareExclusive: 2, bonus: 1 }] }
    expect(scoringRulesSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a joker multiplier below 1', () => {
    expect(scoringRulesSchema.safeParse({ ...DEFAULT_RULES, jokerMultiplier: 0.5 }).success).toBe(false)
  })

  it('rejects a fractional base point', () => {
    const bad = { ...DEFAULT_RULES, base: { ...DEFAULT_RULES.base, exact: 1.5 } }
    expect(scoringRulesSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects an unknown bonus source', () => {
    expect(scoringRulesSchema.safeParse({ ...DEFAULT_RULES, bonusSource: 'MAGIC' }).success).toBe(false)
  })
})

describe('saveScoringConfigSchema', () => {
  it('accepts an omitted competition (default scope)', () => {
    expect(saveScoringConfigSchema.safeParse({ rules: DEFAULT_RULES }).success).toBe(true)
  })

  it('accepts a competition slug', () => {
    expect(saveScoringConfigSchema.safeParse({ competition: 'world-cup-2026', rules: DEFAULT_RULES }).success).toBe(true)
  })

  it('rejects a missing rules object', () => {
    expect(saveScoringConfigSchema.safeParse({ competition: 'x' }).success).toBe(false)
  })
})
