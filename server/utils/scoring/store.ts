import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { scoringConfig } from '../../../db/schema'
import { DEFAULT_RULES, rulesFromConfigRow, type ScoringRules } from './config'

export async function ensureDefaultScoringConfig(db: AppDatabase): Promise<void> {
  const existing = await db
    .select({ id: scoringConfig.id })
    .from(scoringConfig)
    .where(eq(scoringConfig.isActive, true))
    .limit(1)
  if (existing.length > 0) return

  await db.insert(scoringConfig).values({
    version: 1,
    isActive: true,
    ptsExact: DEFAULT_RULES.base.exact,
    ptsDiff: DEFAULT_RULES.base.diff,
    ptsOutcome: DEFAULT_RULES.base.outcome,
    ptsMiss: DEFAULT_RULES.base.miss,
    jokerMultiplier: String(DEFAULT_RULES.jokerMultiplier),
    jokerAppliesToBonus: DEFAULT_RULES.jokerAppliesToBonus,
    bonusSource: DEFAULT_RULES.bonusSource,
    crowdTiers: DEFAULT_RULES.crowdTiers,
    crowdMatchBasis: DEFAULT_RULES.crowdMatchBasis,
    crowdMinDenominator: DEFAULT_RULES.crowdMinDenominator,
    oddsTiers: DEFAULT_RULES.oddsTiers,
    oddsAppliesTo: DEFAULT_RULES.oddsAppliesTo,
  })
}

export interface ActiveScoringConfig {
  version: number
  rules: ScoringRules
}

export async function getActiveScoringConfig(db: AppDatabase): Promise<ActiveScoringConfig> {
  const rows = await db.select().from(scoringConfig).where(eq(scoringConfig.isActive, true)).limit(1)
  if (rows.length === 0) throw new Error('no active scoring config')
  return { version: rows[0].version, rules: rulesFromConfigRow(rows[0]) }
}
