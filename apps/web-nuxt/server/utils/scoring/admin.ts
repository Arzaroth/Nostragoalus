import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { competition, match, scoringConfig } from '../../../db/schema'
import { listCompetitions } from '../competitions/store'
import { updateLeagueRankSnapshots, updateRankSnapshots } from '../leaderboard/snapshots'
import { scoreMatchRow } from '../sync/finalize'
import { rulesFromConfigRow, type ScoringRules } from './config'
import { getScoringConfigFor } from './store'
import { NotFoundError } from '../errors'

export interface ScoringConfigEntry {
  // null competitionId = the default config; otherwise a per-competition override.
  competitionId: string | null
  competition: { id: string; slug: string; name: string } | null
  version: number
  rules: ScoringRules
}

export interface ScoringConfigList {
  entries: ScoringConfigEntry[]
  competitions: { id: string; slug: string; name: string; hasOverride: boolean }[]
}

export async function listScoringConfigs(db: AppDatabase): Promise<ScoringConfigList> {
  const rows = await db.select().from(scoringConfig).where(eq(scoringConfig.isActive, true))
  const comps = await listCompetitions(db)
  const compById = new Map(comps.map((c) => [c.id, c]))

  const entries: ScoringConfigEntry[] = []
  const defaultRow = rows.find((r) => r.competitionId === null)
  if (defaultRow) {
    entries.push({ competitionId: null, competition: null, version: defaultRow.version, rules: rulesFromConfigRow(defaultRow) })
  }
  for (const r of rows) {
    if (r.competitionId === null) continue
    // The competition is guaranteed present: the override FK cascades with it.
    const c = compById.get(r.competitionId)!
    entries.push({
      competitionId: r.competitionId,
      competition: { id: c.id, slug: c.slug, name: c.name },
      version: r.version,
      rules: rulesFromConfigRow(r),
    })
  }

  const withOverride = new Set(rows.filter((r) => r.competitionId).map((r) => r.competitionId))
  const competitions = comps.map((c) => ({ id: c.id, slug: c.slug, name: c.name, hasOverride: withOverride.has(c.id) }))
  return { entries, competitions }
}

function rowValuesFromRules(rules: ScoringRules) {
  return {
    ptsExact: rules.base.exact,
    ptsDiff: rules.base.diff,
    ptsOutcome: rules.base.outcome,
    ptsMiss: rules.base.miss,
    jokerMultiplier: String(rules.jokerMultiplier),
    jokerAppliesToBonus: rules.jokerAppliesToBonus,
    championBonus: rules.championBonus,
    championTiers: rules.championTiers,
    bestScorerBonus: rules.bestScorerBonus,
    bonusSource: rules.bonusSource,
    crowdTiers: rules.crowdTiers,
    crowdOutcomeTiers: rules.crowdOutcomeTiers,
    crowdMatchBasis: rules.crowdMatchBasis,
    crowdMinDenominator: rules.crowdMinDenominator,
    oddsTiers: rules.oddsTiers,
    oddsAppliesTo: rules.oddsAppliesTo,
  }
}

async function nextVersion(db: AppDatabase): Promise<number> {
  // The aggregate always returns one row; coalesce makes max a number even when
  // the table is empty, so no optional fallbacks are needed here.
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${scoringConfig.version}), 0)` })
    .from(scoringConfig)
  return Number(row.max) + 1
}

// Re-score every finished match of a competition under its currently-resolved
// config and refresh its rank snapshots. scoreMatchRow rescores on a version
// mismatch, so bumping the config version (below) is what makes this a no-op-free
// recompute. Returns how many matches actually changed.
export async function recomputeCompetition(db: AppDatabase, competitionId: string): Promise<number> {
  const config = await getScoringConfigFor(db, competitionId)
  const finished = await db
    .select({ id: match.id, home: match.fullTimeHome, away: match.fullTimeAway })
    .from(match)
    .where(and(eq(match.competitionId, competitionId), eq(match.status, 'FINISHED')))

  let scored = 0
  for (const m of finished) {
    if (m.home === null || m.away === null) continue
    if ((await scoreMatchRow(db, m.id, config)) === 'scored') scored += 1
  }
  if (scored > 0) {
    await updateRankSnapshots(db, competitionId)
    await updateLeagueRankSnapshots(db, competitionId)
  }
  return scored
}

async function competitionsUsingDefault(db: AppDatabase): Promise<string[]> {
  const overrides = await db
    .select({ id: scoringConfig.competitionId })
    .from(scoringConfig)
    .where(and(eq(scoringConfig.isActive, true), isNotNull(scoringConfig.competitionId)))
  const withOverride = new Set(overrides.map((o) => o.id))
  const comps = await listCompetitions(db)
  return comps.filter((c) => !withOverride.has(c.id)).map((c) => c.id)
}

export interface SaveScoringResult {
  version: number
  recomputed: number
}

// Save the default config (competitionId null) or a competition override, then
// force a ladder recompute of every affected competition in the same
// transaction. The whole change - new rules + every rescored prediction +
// refreshed snapshots - commits or rolls back together.
export async function saveScoringConfig(
  db: AppDatabase,
  competitionId: string | null,
  rules: ScoringRules,
): Promise<SaveScoringResult> {
  return db.transaction(async (tx) => {
    if (competitionId) {
      const comp = await tx.select({ id: competition.id }).from(competition).where(eq(competition.id, competitionId)).limit(1)
      if (comp.length === 0) throw new NotFoundError('competition not found')
    }

    const version = await nextVersion(tx)
    const values = rowValuesFromRules(rules)

    const scopeFilter = competitionId
      ? eq(scoringConfig.competitionId, competitionId)
      : isNull(scoringConfig.competitionId)
    const existing = await tx
      .select({ id: scoringConfig.id })
      .from(scoringConfig)
      .where(and(eq(scoringConfig.isActive, true), scopeFilter))
      .limit(1)

    if (existing.length > 0) {
      await tx.update(scoringConfig).set({ ...values, version }).where(eq(scoringConfig.id, existing[0].id))
    } else {
      await tx.insert(scoringConfig).values({ ...values, version, isActive: true, competitionId })
    }

    const affected = competitionId ? [competitionId] : await competitionsUsingDefault(tx)
    let recomputed = 0
    for (const cid of affected) recomputed += await recomputeCompetition(tx, cid)
    return { version, recomputed }
  })
}

// Drop a competition's override so it falls back to the default, then recompute
// that competition under the default config.
export async function deleteScoringConfigOverride(db: AppDatabase, competitionId: string): Promise<{ recomputed: number }> {
  return db.transaction(async (tx) => {
    const deleted = await tx
      .delete(scoringConfig)
      .where(and(eq(scoringConfig.competitionId, competitionId), eq(scoringConfig.isActive, true)))
      .returning({ id: scoringConfig.id })
    if (deleted.length === 0) throw new NotFoundError('no override for competition')
    const recomputed = await recomputeCompetition(tx, competitionId)
    return { recomputed }
  })
}
