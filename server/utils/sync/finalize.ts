import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { match, matchScoreEvent, prediction } from '../../../db/schema'
import { getActiveScoringConfig } from '../scoring/store'
import { scorePredictions } from '../scoring/engine'
import { awardChampionBonuses } from '../champion/service'
import { resultHashOf } from './upsert-matches'
import { lockDuePredictions, unlockFuturePredictions } from './live-window'

const POSTPONED_VOID_AFTER_MS = 3 * 24 * 60 * 60 * 1000

export type ScoreOutcome = 'scored' | 'unchanged' | 'skipped'

interface ScoringContext {
  version: number
  rules: Awaited<ReturnType<typeof getActiveScoringConfig>>['rules']
}

export async function scoreMatchRow(
  db: AppDatabase,
  matchId: string,
  context?: ScoringContext,
): Promise<ScoreOutcome> {
  const rows = await db.select().from(match).where(eq(match.id, matchId)).limit(1)
  if (rows.length === 0) return 'skipped'

  const m = rows[0]
  if (m.status !== 'FINISHED' || m.fullTimeHome === null || m.fullTimeAway === null) return 'skipped'

  const { version, rules } = context ?? (await getActiveScoringConfig(db))
  const hash = resultHashOf(m.status, m.fullTimeHome, m.fullTimeAway)
  if (m.scoringState === 'SCORED' && m.resultHash === hash && m.scoredAtVersion === version) {
    return 'unchanged'
  }

  const locked = await db
    .select()
    .from(prediction)
    .where(and(eq(prediction.matchId, matchId), isNotNull(prediction.lockedAt)))

  const scores = scorePredictions({
    actual: { home: m.fullTimeHome, away: m.fullTimeAway },
    rules,
    predictions: locked.map((p) => ({ id: p.id, home: p.homeGoals, away: p.awayGoals, isJoker: p.isJoker })),
  })
  const scoreById = new Map(scores.map((s) => [s.id, s]))

  await db.transaction(async (tx) => {
    for (const p of locked) {
      const s = scoreById.get(p.id)!
      await tx
        .update(prediction)
        .set({
          basePoints: s.basePoints,
          baseTier: s.baseTier,
          bonusPoints: s.bonusPoints,
          bonusSource: s.bonusSource,
          crowdShare: s.crowdShare === null ? null : String(s.crowdShare),
          jokerMultiplierApplied: String(s.jokerMultiplier),
          totalPoints: s.totalPoints,
          scoredAtVersion: version,
          scoredAt: new Date(),
        })
        .where(eq(prediction.id, p.id))
    }

    await tx
      .update(match)
      .set({ scoringState: 'SCORED', resultHash: hash, scoredAtVersion: version, scoredAt: new Date() })
      .where(eq(match.id, matchId))

    await tx.insert(matchScoreEvent).values({
      matchId,
      status: m.status,
      fullTimeHome: m.fullTimeHome,
      fullTimeAway: m.fullTimeAway,
      resultHash: hash,
    })
  })

  return 'scored'
}

export async function voidMatch(db: AppDatabase, matchId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(prediction)
      .set({
        basePoints: null,
        baseTier: null,
        bonusPoints: null,
        bonusSource: null,
        crowdShare: null,
        jokerMultiplierApplied: null,
        totalPoints: null,
        scoredAt: null,
        scoredAtVersion: null,
        isJoker: false,
      })
      .where(eq(prediction.matchId, matchId))

    await tx.update(match).set({ scoringState: 'VOID' }).where(eq(match.id, matchId))
  })
}

export interface FinalizeResult {
  locked: number
  unlocked: number
  scored: number
  voided: number
}

export async function finalizeMatches(db: AppDatabase, now: Date = new Date()): Promise<FinalizeResult> {
  const locked = await lockDuePredictions(db, now)
  const unlocked = await unlockFuturePredictions(db, now)
  const context = await getActiveScoringConfig(db)

  const finished = await db.select().from(match).where(eq(match.status, 'FINISHED'))
  let scored = 0
  for (const m of finished) {
    if (m.fullTimeHome === null || m.fullTimeAway === null) continue
    if ((await scoreMatchRow(db, m.id, context)) === 'scored') scored += 1
  }

  // Award champion-pick bonuses once a final is decided (idempotent per tick).
  for (const m of finished) {
    if (m.stage === 'FINAL' && (m.winner === 'HOME' || m.winner === 'AWAY')) {
      const winnerCode = m.winner === 'HOME' ? m.homeTeamCode : m.awayTeamCode
      await awardChampionBonuses(db, m.competitionId, winnerCode, context.rules.championBonus)
    }
  }

  const voidable = await db.select().from(match).where(inArray(match.status, ['CANCELLED', 'POSTPONED']))
  let voided = 0
  for (const m of voidable) {
    if (m.scoringState === 'VOID') continue
    if (m.status === 'POSTPONED' && m.kickoffTime > new Date(now.getTime() - POSTPONED_VOID_AFTER_MS)) continue
    await voidMatch(db, m.id)
    voided += 1
  }

  return { locked, unlocked, scored, voided }
}
