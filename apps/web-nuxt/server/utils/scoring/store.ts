import { and, eq, isNull } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { scoringConfig } from '../../../db/schema'
import { DEFAULT_RULES, rulesFromConfigRow, type ScoringRules } from './config'

export async function ensureDefaultScoringConfig(db: AppDatabase): Promise<void> {
  const existing = await db
    .select({ id: scoringConfig.id })
    .from(scoringConfig)
    .where(and(eq(scoringConfig.isActive, true), isNull(scoringConfig.competitionId)))
    .limit(1)
  if (existing.length > 0) return

  await db.insert(scoringConfig).values({
    version: 1,
    isActive: true,
    competitionId: null,
    ptsExact: DEFAULT_RULES.base.exact,
    ptsDiff: DEFAULT_RULES.base.diff,
    ptsOutcome: DEFAULT_RULES.base.outcome,
    ptsMiss: DEFAULT_RULES.base.miss,
    jokerMultiplier: String(DEFAULT_RULES.jokerMultiplier),
    jokerAppliesToBonus: DEFAULT_RULES.jokerAppliesToBonus,
    championBonus: DEFAULT_RULES.championBonus,
    championTiers: DEFAULT_RULES.championTiers,
    bestScorerBonus: DEFAULT_RULES.bestScorerBonus,
    bonusSource: DEFAULT_RULES.bonusSource,
    crowdTiers: DEFAULT_RULES.crowdTiers,
    crowdOutcomeTiers: DEFAULT_RULES.crowdOutcomeTiers,
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

// The default config (the one with no competition attached). Every competition
// that has no override scores against this.
export async function getActiveScoringConfig(db: AppDatabase): Promise<ActiveScoringConfig> {
  const rows = await db
    .select()
    .from(scoringConfig)
    .where(and(eq(scoringConfig.isActive, true), isNull(scoringConfig.competitionId)))
    .limit(1)
  if (rows.length === 0) throw new Error('no active scoring config')
  return { version: rows[0].version, rules: rulesFromConfigRow(rows[0]) }
}

// Config that applies to one competition: its own active override if it has one,
// otherwise the default. Used everywhere a match/leaderboard is scored.
export async function getScoringConfigFor(
  db: AppDatabase,
  competitionId: string | null,
): Promise<ActiveScoringConfig> {
  if (competitionId) {
    const override = await db
      .select()
      .from(scoringConfig)
      .where(and(eq(scoringConfig.isActive, true), eq(scoringConfig.competitionId, competitionId)))
      .limit(1)
    if (override.length > 0) return { version: override[0].version, rules: rulesFromConfigRow(override[0]) }
  }
  return getActiveScoringConfig(db)
}
